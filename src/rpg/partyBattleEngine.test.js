import { describe, expect, it } from 'vitest';
import { buildTowerEncounter } from './towerCatalog.js';
import { buildTowerPartySnapshot, validatePartyMemberIds } from './partyMemberCatalog.js';
import { createPartyBattle, preparePartyBattleAction } from './partyBattleEngine.js';
import { normalizePlayerProfile } from './playerProfile.js';

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
});
