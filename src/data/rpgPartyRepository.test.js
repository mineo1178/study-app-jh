import { describe, expect, it } from 'vitest';
import { preparePartyBattleResult, preparePartyTowerStart } from './rpgBattleRepository.js';
import { buildTowerEncounter } from '../rpg/towerCatalog.js';

describe('party tower repository logic', () => {
  it('charges energy once, snapshots party/encounter, grants summed EXP once, and advances the tower once', () => {
    const start = preparePartyTowerStart({ profile: { battleEnergy: 10, partyMemberIds: ['hero'], level: 1 }, encounter: buildTowerEncounter({ floor: 1 }), battleId: 'party-start', now: 1 });
    expect(start).toMatchObject({ profile: { battleEnergy: 9, activeBattleId: 'party-start' }, battle: { schemaVersion: 8, battleMode: 'tower', partySnapshot: { members: [{ memberId: 'hero' }] } } });
    const win = preparePartyBattleResult({ battle: { ...start.battle, enemyStates: start.battle.enemyStates.map((state) => ({ ...state, hp: 1 })) }, profile: start.profile, towerProgress: { currentFloor: 1 }, action: { targetEnemyInstanceId: start.battle.enemyStates[0].enemyInstanceId }, actionId: 'win', now: 2 });
    expect(win).toMatchObject({ battle: { status: 'won' }, profile: { activeBattleId: null }, towerProgress: { currentFloor: 2 }, victoryLedger: { type: 'victory' } });
    expect(() => preparePartyBattleResult({ battle: win.battle, profile: win.profile, towerProgress: win.towerProgress, action: {}, actionId: 'again', now: 3 })).toThrow('BATTLE_ALREADY_COMPLETED');
  });
});
