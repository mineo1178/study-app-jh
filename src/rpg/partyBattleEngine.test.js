import { describe, expect, it } from 'vitest';
import { buildTowerEncounter } from './towerCatalog.js';
import { buildTowerPartySnapshot, validatePartyMemberIds } from './partyMemberCatalog.js';
import { createPartyBattle, preparePartyBattleAction } from './partyBattleEngine.js';
import { normalizePlayerProfile } from './playerProfile.js';
import { resolvePartyBattleSelection } from './battleUiLogic.js';
import { preparePartyBattleResult } from '../data/rpgBattleRepository.js';
import { findUndefinedPaths } from '../test/findUndefinedPaths.js';

const party = buildTowerPartySnapshot({ partyMemberIds: ['hero', 'guardian', 'mage'], level: 4, equipped: {}, ownedEquipment: {} });
const battleAt = (floor) => createPartyBattle({ battleId: `tower-${floor}`, floor, encounter: buildTowerEncounter({ floor }), members: party, now: 1, battleKind: 'normal' });

describe('party battle engine', () => {
  it('normalizes legacy profiles to the safe default party and validates party composition', () => {
    expect(normalizePlayerProfile({ schemaVersion: 3 }).partyMemberIds).toEqual(['hero', 'guardian', 'mage']);
    expect(() => validatePartyMemberIds(['guardian'])).toThrow('HERO_REQUIRED');
    expect(() => validatePartyMemberIds(['hero', 'hero'])).toThrow('DUPLICATE_PARTY_MEMBER');
    expect(() => validatePartyMemberIds(['hero', 'unknown'])).toThrow('UNKNOWN_PARTY_MEMBER');
    expect(() => validatePartyMemberIds(['hero', 'guardian', 'mage', 'healer'])).toThrow('INVALID_PARTY_SIZE');
  });
  it('builds deterministic multi-enemy encounters and unique instance ids', () => {
    expect(buildTowerEncounter({ floor: 1 }).enemies).toHaveLength(1);
    expect(buildTowerEncounter({ floor: 4 }).enemies).toHaveLength(2);
    expect(buildTowerEncounter({ floor: 7 }).enemies).toHaveLength(3);
    expect(buildTowerEncounter({ floor: 10 })).toMatchObject({ energyCost: 3, enemies: expect.any(Array) });
    expect(buildTowerEncounter({ floor: 20 }).enemies).toHaveLength(3);
    const ids = buildTowerEncounter({ floor: 7 }).enemies.map((enemy) => enemy.enemyInstanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('gives each role its intended Tower stats and applies gacha rarity multipliers', () => {
    const members = buildTowerPartySnapshot({ partyMemberIds: ['hero', 'akane', 'raika'], unlockedPartyMemberIds: ['hero', 'akane', 'raika'], level: 4, equipped: {}, ownedEquipment: {} });
    const all = buildTowerPartySnapshot({ partyMemberIds: ['hero', 'guardian', 'mage'], unlockedPartyMemberIds: ['hero', 'guardian', 'mage', 'healer', 'akane', 'kaede', 'homura', 'raika'], level: 4, equipped: {}, ownedEquipment: {} });
    const hero = members.find((member) => member.memberId === 'hero'); const attacker = members.find((member) => member.memberId === 'akane'); const mage = members.find((member) => member.memberId === 'raika'); const guardian = all.find((member) => member.memberId === 'guardian');
    const healer = buildTowerPartySnapshot({ partyMemberIds: ['hero', 'healer'], unlockedPartyMemberIds: ['hero', 'healer'], level: 4, equipped: {}, ownedEquipment: {} }).find((member) => member.memberId === 'healer');
    const rarities = ['akane', 'kaede', 'homura'].map((memberId) => buildTowerPartySnapshot({ partyMemberIds: ['hero', memberId], unlockedPartyMemberIds: ['hero', memberId], level: 4, equipped: {}, ownedEquipment: {} })[1]);
    expect(attacker.attack).toBeGreaterThan(hero.attack); expect(mage.attack).toBeGreaterThan(healer.attack); expect(guardian.defense).toBeGreaterThan(attacker.defense); expect(healer.maxHp).toBeGreaterThan(mage.maxHp); expect(rarities[0].attack).toBeLessThan(rarities[1].attack); expect(rarities[1].attack).toBeLessThan(rarities[2].attack);
  });
  it('moves party turns in order, rejects invalid targets, and runs an enemy phase after all actors', () => {
    let battle = battleAt(4);
    const enemy = battle.enemyStates[0].enemyInstanceId;
    expect(() => preparePartyBattleAction({ battle, action: { actionId: 'bad', targetEnemyInstanceId: 'missing' }, now: 2 })).toThrow('INVALID_BATTLE_TARGET');
    battle = preparePartyBattleAction({ battle, action: { actionId: 'hero', targetEnemyInstanceId: enemy }, now: 2 }).battle;
    expect(battle.activePartyMemberId).toBe('guardian');
    battle = preparePartyBattleAction({ battle, action: { actionId: 'guardian', skillId: 'guardian_wall' }, now: 3 }).battle;
    expect(battle.activePartyMemberId).toBe('mage');
    battle = preparePartyBattleAction({ battle, action: { actionId: 'mage', skillId: 'firestorm' }, now: 4 }).battle;
    expect(battle.roundNumber).toBe(2);
    expect(battle.activePartyMemberId).toBe('hero');
  });
  it('supports ally targeting, all-allies healing, guard and AoE victory', () => {
    let battle = battleAt(1);
    battle = { ...battle, partyStates: battle.partyStates.map((state) => state.memberId === 'guardian' ? { ...state, hp: 1 } : state) };
    battle = preparePartyBattleAction({ battle, action: { actionId: 'heal', skillId: 'healing_light', targetMemberId: 'guardian' }, now: 2 }).battle;
    expect(battle.partyStates.find((state) => state.memberId === 'guardian').hp).toBeGreaterThan(1);
    const mageBattle = { ...battleAt(4), activePartyMemberId: 'mage', actedMemberIds: ['hero', 'guardian'], enemyStates: battleAt(4).enemyStates.map((state) => ({ ...state, hp: 1 })) };
    const won = preparePartyBattleAction({ battle: mageBattle, action: { actionId: 'aoe', skillId: 'firestorm' }, now: 3 }).battle;
    expect(won.status).toBe('won');
    expect(won.enemyStates.every((state) => state.status === 'defeated')).toBe(true);
  });
  it('completes the reproduced floor 10 Mage normal attack and persists valid enemy actions', () => {
    const encounter = buildTowerEncounter({ floor: 10 });
    const members = buildTowerPartySnapshot({ partyMemberIds: ['hero', 'guardian', 'mage'], unlockedPartyMemberIds: ['hero', 'guardian', 'mage'], level: 7, equipped: {}, ownedEquipment: {} });
    const mage = members.find((member) => member.memberId === 'mage');
    let battle = createPartyBattle({ battleId: 'tower-10-reproduction', floor: 10, encounter, members, now: 1, battleKind: 'boss' });
    expect(battle.enemySnapshots[0].actionPattern[0]).toEqual({ id: 'normal_attack', name: '通常攻撃', powerPercent: 100 });
    battle = {
      ...battle,
      // v1.93.1 battles stored Tower Boss action IDs as strings.
      enemySnapshots: encounter.enemies.map((enemy) => ({ ...enemy })),
      activePartyMemberId: 'mage',
      actedMemberIds: ['hero', 'guardian'],
      partyStates: battle.partyStates.map((state) => state.memberId === 'mage' ? { ...state, hp: 44 } : state),
      enemyStates: battle.enemyStates.map((state, index) => ({ ...state, hp: index === 0 ? 21 : 40 })),
    };
    const selectedEnemyId = battle.enemyStates[0].enemyInstanceId;
    const result = preparePartyBattleResult({
      battle,
      profile: { totalExp: 0, level: 7, partyMemberIds: ['hero', 'guardian', 'mage'] },
      towerProgress: { currentFloor: 10, highestFloor: 9, totalWins: 9 },
      action: { targetEnemyInstanceId: selectedEnemyId },
      actionId: 'tower-10-mage-normal',
      now: 2,
    });

    expect(mage.maxHp).toBe(44);
    expect(result.attackLedger.action).toMatchObject({ actorId: 'mage', actionKind: 'normal_attack', targetEnemyInstanceId: 'tower-10-e1-orc_chief' });
    expect(result.battle.enemyStates[0].hp).toBe(21 - mage.attack);
    expect(result.battle).toMatchObject({ status: 'active', roundNumber: 2, activePartyMemberId: 'hero' });
    expect(result.attackLedger.enemyEvents).toEqual(expect.arrayContaining([expect.objectContaining({ enemyInstanceId: 'tower-10-e1-orc_chief', actionId: 'normal_attack' })]));
    expect(findUndefinedPaths(result.attackLedger)).toEqual([]);
  });
  it('attacks a live first target, falls forward from a defeated target, and keeps single-target skills valid', () => {
    const active = battleAt(10);
    const firstId = active.enemyStates[0].enemyInstanceId;
    const secondId = active.enemyStates[1].enemyInstanceId;
    const firstSelection = resolvePartyBattleSelection(active, firstId, 'hero');
    const firstAttack = preparePartyBattleAction({ battle: active, action: { actionId: 'first-live', targetEnemyInstanceId: firstSelection.enemyId }, now: 2 });
    expect(firstAttack.event).toMatchObject({ actorId: 'hero', targetEnemyInstanceId: firstId, actionKind: 'normal_attack' });

    const defeatedFirst = { ...active, enemyStates: active.enemyStates.map((state, index) => index === 0 ? { ...state, hp: 0, status: 'defeated' } : state) };
    const fallbackSelection = resolvePartyBattleSelection(defeatedFirst, firstId, 'hero');
    const fallbackAttack = preparePartyBattleAction({ battle: defeatedFirst, action: { actionId: 'fallback-live', targetEnemyInstanceId: fallbackSelection.enemyId }, now: 2 });
    expect(fallbackSelection.enemyId).toBe(secondId);
    expect(fallbackAttack.event).toMatchObject({ targetEnemyInstanceId: secondId, actionKind: 'normal_attack' });

    const skill = preparePartyBattleAction({ battle: active, action: { actionId: 'single-skill', skillId: 'aqua_edge', targetEnemyInstanceId: firstSelection.enemyId }, now: 2 });
    expect(skill.event).toMatchObject({ actorId: 'hero', skillId: 'aqua_edge', targetEnemyInstanceId: firstId, actionKind: 'skill' });
  });
});
