import { describe, expect, it } from 'vitest';
import { COMPANION_GROWTH_CATALOG, COMPANION_POINT_CAPS } from './companionGrowthCatalog.js';
import { readCompanionGrowth, earnedCompanionPoints, companionNodeState } from './companionGrowthSelectors.js';
import { normalizePlayerProfile } from './playerProfile.js';
import { totalExpForLevel } from './levelSystem.js';
import { buildTowerPartySnapshot } from './partyMemberCatalog.js';
import { prepareCompanionGrowthAction } from '../data/rpgCompanionGrowthRepository.js';
import { preparePartyTowerStart, prepareWeeklyBossStart } from '../data/rpgBattleRepository.js';
import { buildTowerEncounter } from './towerCatalog.js';
import { getWeeklyBossDefinition } from './weeklyBossCatalog.js';
import { preparePartyBattleAction } from './partyBattleEngine.js';
const ids = Object.keys(COMPANION_GROWTH_CATALOG), zero = { hp: 0, mp: 0, attack: 0, defense: 0 };
const base = (level = 20) => normalizePlayerProfile({ totalExp: totalExpForLevel(level), gold: 500, battleEnergy: 100, unlockedPartyMemberIds: ids });
const request = (memberId = 'guardian', patch = {}) => ({ profile: base(), memberId, allocation: { ...zero, hp: 5 }, unlockedNodeIds: ['vitality'], expectedRevision: 0, actionId: 'test', now: 1, ...patch });
const rules = { skillRulesVersion: 2, jobRulesVersion: 1, companionGrowthRulesVersion: 1 };
describe('independent companion growth', () => {
  it('defines exactly 15 unique specializations, six connected nodes and bounded allocations', () => {
    expect(ids).toHaveLength(15); expect(ids).not.toContain('hero');
    expect(new Set(Object.values(COMPANION_GROWTH_CATALOG).map(c => JSON.stringify(c.nodes.map(n => n.effects)))).size).toBe(15);
    expect(COMPANION_POINT_CAPS).toEqual({ hp: 12, mp: 12, attack: 6, defense: 6 });
  });
  it.each([1, 2, 7, 12, 20, 21, 50])('derives points and SP only from EXP at Lv%i', level => {
    const p = { ...base(level), level: 999 };
    expect(earnedCompanionPoints(p)).toBe(Math.min(20, level - 1));
    expect(readCompanionGrowth(p, 'guardian')).toMatchObject({ remaining: Math.min(20, level - 1), remainingSp: Math.min(20, level - 1) });
  });
  it.each(ids)('saves and snapshots %s independently with real MP costs', memberId => {
    const catalog = COMPANION_GROWTH_CATALOG[memberId]; expect(catalog.nodes).toHaveLength(6);
    const profile = { ...base(), partyMemberIds: ['hero', memberId] }, original = structuredClone(profile);
    const changed = prepareCompanionGrowthAction(request(memberId, { profile, allocation: { hp: 5, mp: 5, attack: 4, defense: 5 }, unlockedNodeIds: catalog.nodes.map(n => n.id).reverse() }));
    expect(profile).toEqual(original);
    const old = buildTowerPartySnapshot(profile, rules), grown = buildTowerPartySnapshot(changed.profile, rules);
    expect(grown[0]).toEqual(old[0]);
    expect(grown[1].maxHp).toBeGreaterThanOrEqual(old[1].maxHp + 15);
    expect(grown[1].maxMp).toBeGreaterThanOrEqual(old[1].maxMp + 10);
    expect(grown[1].attack).toBeGreaterThanOrEqual(old[1].attack + 4);
    expect(grown[1].defense).toBeGreaterThanOrEqual(old[1].defense + 5);
    expect(grown[1].companionGrowthSnapshot).toMatchObject({ memberId, rulesVersion: 1, baseStats: { maxHp: old[1].maxHp }, revision: 1 });
    for (const skill of grown[1].skills) { expect(skill.mpCost).toBeGreaterThanOrEqual(1); if (skill.kind === 'heal') expect(skill.healPercent).toBeLessThanOrEqual(60); if (skill.kind === 'guard') expect(skill.damageReductionPercent).toBeLessThanOrEqual(80); }
    expect(buildTowerPartySnapshot(changed.profile, { skillRulesVersion: 2, jobRulesVersion: 1 })).toEqual(buildTowerPartySnapshot(profile, { skillRulesVersion: 2, jobRulesVersion: 1 }));
    const other = memberId === 'guardian' ? 'mage' : 'guardian'; expect(readCompanionGrowth(changed.profile, other).remaining).toBe(19);
  });
  it.each([
    { memberId: 'hero' }, { memberId: '__proto__' }, { memberId: 'monster' }, { expectedRevision: 1 }, { kind: 'invalid' },
    { profile: { ...base(), activeBattleId: 'battle' } }, { memberId: 'homura', profile: normalizePlayerProfile({ totalExp: totalExpForLevel(20) }) },
    { allocation: { ...zero, attack: 7 } }, { allocation: { ...zero, defense: 7 } }, { allocation: { ...zero, hp: 13 } }, { allocation: { ...zero, mp: 13 } },
    { allocation: { ...zero, hp: -1 } }, { allocation: { ...zero, hp: 1.5 } }, { allocation: { ...zero, hp: '1' } }, { allocation: { hp: 1 } },
    { allocation: { ...zero, hp: 1, extra: 0 } }, { allocation: { hp: 12, mp: 12, attack: 0, defense: 0 } },
    { unlockedNodeIds: ['signature'] }, { unlockedNodeIds: ['focus', 'focus'] }, { unlockedNodeIds: ['unknown'] },
    { profile: base(7), unlockedNodeIds: ['focus', 'offense', 'aptitude'] }, { profile: base(1) },
  ])('rejects invalid request %# without mutating input', patch => { const r = request('guardian', patch), before = structuredClone(r); expect(() => prepareCompanionGrowthAction(r)).toThrow(); expect(r).toEqual(before); });
  it.each([null, [], { guardian: null }, { guardian: { allocation: zero, unlockedNodeIds: [], revision: -1 } }, { unknown: {} }, { guardian: { allocation: zero, unlockedNodeIds: ['signature'], revision: 0 } }])('never silently resets corrupt growth %#', companionGrowth => expect(() => readCompanionGrowth({ ...base(), companionGrowth }, 'guardian')).toThrow());
  it('supports missing legacy data and validates pure node availability', () => {
    const p = base(); delete p.companionGrowth; expect(readCompanionGrowth(p, 'guardian').revision).toBe(0);
    expect(companionNodeState(p, 'guardian', 'vitality').unlockable).toBe(true);
    expect(companionNodeState(p, 'guardian', 'signature').unlockable).toBe(false);
    expect(companionNodeState({ ...p, activeBattleId: 'active' }, 'guardian', 'focus').unlockable).toBe(false);
  });
  it('preserves other members, requires revision and charges redistribution/reset only once per applied action', () => {
    const first = prepareCompanionGrowthAction(request());
    const second = prepareCompanionGrowthAction(request('mage', { profile: first.profile }));
    expect(second.profile.companionGrowth.guardian).toEqual(first.profile.companionGrowth.guardian);
    expect(() => prepareCompanionGrowthAction(request('guardian', { profile: second.profile }))).toThrow('COMPANION_PROFILE_CHANGED');
    const reset = prepareCompanionGrowthAction(request('guardian', { profile: second.profile, kind: 'reset', expectedRevision: 1 }));
    expect(reset.profile.gold).toBe(400); expect(reset.profile.companionGrowth.mage).toEqual(second.profile.companionGrowth.mage);
    expect(readCompanionGrowth(reset.profile, 'guardian')).toMatchObject({ used: 0, usedSp: 0, revision: 2 });
    const redistribute = prepareCompanionGrowthAction(request('guardian', { profile: first.profile, allocation: { ...zero, mp: 5 }, expectedRevision: 1 }));
    expect(redistribute.ledger.cost.gold).toBe(100);
    expect(() => prepareCompanionGrowthAction(request('guardian', { profile: { ...first.profile, gold: 99 }, kind: 'reset', expectedRevision: 1 }))).toThrow('INSUFFICIENT_GOLD');
    expect(() => prepareCompanionGrowthAction(request('guardian', { profile: first.profile, unlockedNodeIds: [], expectedRevision: 1 }))).toThrow('COMPANION_RESET_REQUIRED');
    expect(() => prepareCompanionGrowthAction(request('guardian', { profile: first.profile, expectedRevision: 1 }))).toThrow('COMPANION_NO_CHANGES');
  });
  it('freezes new Tower/Weekly stats and skills and keeps old snapshot actions unchanged', () => {
    const before = { ...base(), partyMemberIds: ['hero', 'mage'] };
    const profile = prepareCompanionGrowthAction(request('mage', { profile: before })).profile;
    const encounter = buildTowerEncounter({ floor: 20 });
    const tower = preparePartyTowerStart({ profile, encounter, battleId: 'tower', now: 1 }).battle;
    const weekly = prepareWeeklyBossStart({ profile, boss: getWeeklyBossDefinition('2026-W01'), battleId: 'weekly', now: 1 }).battle;
    expect(tower.partySnapshot.members[1]).toEqual(weekly.partySnapshot.members[1]);
    const snapshot = JSON.stringify(tower.partySnapshot);
    const action = { targetEnemyInstanceId: tower.enemyStates[0].enemyInstanceId, actionId: 'one' };
    const result = preparePartyBattleAction({ battle: JSON.parse(JSON.stringify(tower)), action, now: 2 });
    expect(JSON.stringify(result.battle.partySnapshot)).toBe(snapshot);
    expect(JSON.stringify(tower.partySnapshot)).toBe(snapshot);
  });
});

it.each(Object.keys(COMPANION_GROWTH_CATALOG))('consumes frozen positive MP for trained %s skills', memberId => {
  const profile = prepareCompanionGrowthAction(request(memberId, { profile: { ...base(), partyMemberIds: ['hero',memberId] }, unlockedNodeIds: COMPANION_GROWTH_CATALOG[memberId].nodes.map(n=>n.id) })).profile;
  let battle = preparePartyTowerStart({ profile, encounter: buildTowerEncounter({floor:80}), battleId:'mp',now:1 }).battle;
  const member = battle.partySnapshot.members[1], skill = member.skills[0];
  battle = { ...battle, activePartyMemberId:memberId, actedMemberIds:['hero'], partyStates:battle.partyStates.map(m=>({...m,hp:m.hp-20})) };
  const result = preparePartyBattleAction({ battle, action:{skillId:skill.id,targetEnemyInstanceId:battle.enemyStates[0].enemyInstanceId,targetMemberId:'hero',actionId:'cast'},now:2 });
  expect(result.battle.memberMp[memberId]).toBe(member.maxMp-skill.mpCost);
  expect(result.event.mp.cost).toBeGreaterThanOrEqual(1);
  expect(result.battle.partySnapshot).toEqual(battle.partySnapshot);
});
