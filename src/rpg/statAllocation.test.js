import { describe, it, expect } from 'vitest';
import { earnedStatPoints, validateStatAllocation, statAllocationStats, readStatAllocation, statAllocationCost } from './statAllocation.js';
import { totalExpForLevel } from './levelSystem.js';
import { normalizePlayerProfile } from './playerProfile.js';
import { buildTowerPartySnapshot } from './partyMemberCatalog.js';
import { prepareBattleStart, prepareBattleAttack, preparePartyTowerStart, prepareWeeklyBossStart } from '../data/rpgBattleRepository.js';
import { ENEMY_CATALOG } from './enemyCatalog.js';
import { buildTowerEncounter } from './towerCatalog.js';
import { getWeeklyBossDefinition } from './weeklyBossCatalog.js';
import { preparePartyBattleAction } from './partyBattleEngine.js';
import { normalizeBattle } from './battleState.js';
import { findUndefinedPaths } from '../test/findUndefinedPaths.js';
const player = () => normalizePlayerProfile({ totalExp: totalExpForLevel(10), battleEnergy: 100, statAllocation: { hp: 6, mp: 3 } });
const start = () => prepareBattleStart({ profile: player(), enemy: ENEMY_CATALOG.slime, battleId: 'mp', now: 1 });
const skillAction = (battle, id) => ({ kind: 'skill', damage: 1, skill: { ...battle.playerSnapshot.skills[id], useNumber: (battle.skillUses[id] || 0) + 1 } });
describe('stat allocation derivation', () => {
  it.each([[1,0],[5,4],[10,9],[20,19],[31,30],[99,30]])('Lv%s derives %s points from EXP', (level, points) => expect(earnedStatPoints(totalExpForLevel(level))).toBe(points));
  it('defaults only absent legacy allocation and preserves corrupt data without writing', () => {
    expect(readStatAllocation({})).toEqual({ hp: 0, mp: 0 });
    expect(normalizePlayerProfile({ totalExp: 0, statAllocation: { hp: -1, mp: 0 }, custom: 42 })).toMatchObject({ statAllocation: { hp: -1, mp: 0 }, custom: 42 });
    expect(() => readStatAllocation({ statAllocation: null })).toThrow('INVALID_STAT_ALLOCATION');
  });
  it('derives HP, MP and unused points without trusting stored level', () => expect(statAllocationStats({ ...player(), level: 999 })).toMatchObject({ earned: 9, used: 9, remaining: 0, maxHp: 58, maxMp: 14 }));
  it.each([{ hp: -1, mp: 0 }, { hp: .5, mp: 0 }, { hp: NaN, mp: 0 }, { hp: Infinity, mp: 0 }, { hp: '1', mp: 0 }, { hp: 31, mp: 0 }, { hp: 1, mp: 0, attack: 1 }, { hp: 1 }, [], null])('rejects invalid allocation %j', allocation => expect(() => validateStatAllocation(allocation, totalExpForLevel(31))).toThrow('INVALID_STAT_ALLOCATION'));
  it('rejects total overspend', () => expect(() => validateStatAllocation({ hp: 6, mp: 4 }, totalExpForLevel(10))).toThrow('STAT_POINTS_EXCEEDED'));
  it('charges whenever either existing allocation decreases', () => {
    expect(statAllocationCost({ hp: 3, mp: 2 }, { hp: 5, mp: 3 })).toBe(0);
    expect(statAllocationCost({ hp: 8, mp: 2 }, { hp: 4, mp: 6 })).toBe(120);
    expect(statAllocationCost({ hp: 8, mp: 2 }, { hp: 0, mp: 0 })).toBe(120);
  });
});
describe('new battle HP/MP snapshots', () => {
  it('keeps zero allocation party stats and adds HP only to hero', () => {
    const p = player(), base = buildTowerPartySnapshot({ ...p, statAllocation: { hp: 0, mp: 0 } }), grown = buildTowerPartySnapshot(p);
    expect(grown[0]).toMatchObject({ maxHp: base[0].maxHp + 18, maxMp: 14, attack: base[0].attack, defense: base[0].defense });
    expect(grown.slice(1)).toEqual(base.slice(1));
    expect(base[0].maxHp).toBe(40 + 2 * 9);
  });
  it('captures HP and MP on all three starts with no undefined fields', () => {
    const p = player();
    const changes = [start(), preparePartyTowerStart({ profile: p, encounter: buildTowerEncounter({ floor: 10 }), battleId: 'tower', now: 1 }), prepareWeeklyBossStart({ profile: p, boss: getWeeklyBossDefinition('2026-W01'), battleId: 'weekly', now: 1 })];
    for (const change of changes) { expect(change.battle).toMatchObject({ mpRulesVersion: 1, playerMp: 14 }); expect(findUndefinedPaths(change)).toEqual([]); }
    expect(changes[0].battle.playerSnapshot.maxHp).toBe(58);
    expect(changes[1].battle.partySnapshot.members[0].maxHp).toBe(76);
  });
  it.each(['flame_slash','aqua_edge','thunder_strike','healing_light','guard_stance'])('consumes captured MP once for %s and retains it through reload', id => {
    const initial = start(); const battle = { ...initial.battle, playerHp: 20, enemyHp: 1000 };
    const next = prepareBattleAttack({ battle, profile: player(), actionId: 'a', now: 2, action: skillAction(battle, id) });
    expect(next.battle.playerMp).toBe(14 - (id === 'healing_light' ? 3 : 2));
    expect(normalizeBattle(JSON.parse(JSON.stringify(next.battle))).playerMp).toBe(next.battle.playerMp);
    expect(next.battle.playerSnapshot).toEqual(battle.playerSnapshot);
    expect(next.battle.skillUses[id]).toBe(1);
    expect(battle.playerMp).toBe(14);
  });
  it('rejects MP shortage and exhausted uses, and does not spend MP on a normal attack or full heal', () => {
    const { battle } = start(), args = { profile: player(), actionId: 'a', now: 2 };
    expect(() => prepareBattleAttack({ ...args, battle: { ...battle, playerMp: 1 }, action: skillAction(battle, 'aqua_edge') })).toThrow('INSUFFICIENT_MP');
    expect(() => prepareBattleAttack({ ...args, battle: { ...battle, skillRulesVersion: 1, skillUses: { aqua_edge: 2 } }, action: skillAction(battle, 'aqua_edge') })).toThrow('SKILL_NO_USES');
    expect(() => prepareBattleAttack({ ...args, battle, action: skillAction(battle, 'healing_light') })).toThrow('HEAL_NOT_NEEDED');
    expect(prepareBattleAttack({ ...args, battle }).battle.playerMp).toBe(14);
    expect(battle.playerMp).toBe(14);
  });
  it('consumes hero MP in party actions and never spends hero MP on allies', () => {
    const { battle } = preparePartyTowerStart({ profile: player(), encounter: buildTowerEncounter({ floor: 10 }), battleId: 'party', now: 1 });
    const next = preparePartyBattleAction({ battle, action: { skillId: 'guard_stance', actionId: 'g' }, now: 2 }).battle;
    expect(next.playerMp).toBe(12);
    const ally = preparePartyBattleAction({ battle: { ...next, playerMp: 0 }, action: { skillId: 'guardian_wall', actionId: 'ally' }, now: 3 }).battle;
    expect(ally.playerMp).toBe(0);
    expect(ally.skillUses['guardian:guardian_wall']).toBe(1);
    expect(() => preparePartyBattleAction({ battle, action: { skillId: 'aqua_edge', targetEnemyInstanceId: 'missing' }, now: 2 })).toThrow('INVALID_BATTLE_TARGET');
    expect(battle.playerMp).toBe(14);
  });
  it.each([1,3,7,8,9])('does not introduce MP into saved schema %s', schemaVersion => {
    const { battle } = start(); delete battle.skillRulesVersion; delete battle.mpRulesVersion; delete battle.playerMp;
    battle.schemaVersion = schemaVersion;
    const next = prepareBattleAttack({ battle, profile: player(), actionId: 'a', now: 2, action: skillAction(battle, 'aqua_edge') }).battle;
    expect(next).not.toHaveProperty('playerMp'); expect(next).not.toHaveProperty('mpRulesVersion');
  });
  it.each([8,9])('keeps old party snapshot and skills usable at schema %s without MP', schemaVersion => {
    const { battle } = preparePartyTowerStart({ profile: player(), encounter: buildTowerEncounter({ floor: 10 }), battleId: 'old', now: 1 });
    delete battle.mpRulesVersion; delete battle.playerMp; battle.schemaVersion = schemaVersion;
    const next = preparePartyBattleAction({ battle, action: { skillId: 'guard_stance', actionId: 'old' }, now: 2 }).battle;
    expect(next).not.toHaveProperty('playerMp'); expect(next.partySnapshot).toEqual(battle.partySnapshot);
  });
});
