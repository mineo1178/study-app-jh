import { describe, expect, it } from 'vitest';
import { prepareBattleAttack, prepareBattleStart, preparePartyTowerStart, preparePartyBattleResult } from './rpgBattleRepository.js';
import { buildTowerEncounter, buildTowerEnemy } from '../rpg/towerCatalog.js';

const profile = { battleEnergy: 10, totalExp: 0, level: 1, equipped: {} };
describe('tower battle progress', () => {
  it('snapshots a floor and advances EXP and tower progress exactly once on victory', () => {
    const start = prepareBattleStart({ profile, enemy: buildTowerEnemy({ floor: 10 }), battleId: 'tower-10', now: 1, battleKind: 'boss', battleMode: 'tower', towerFloor: 10 });
    const win = prepareBattleAttack({ battle: { ...start.battle, enemyHp: 1 }, profile: start.profile, towerProgress: { currentFloor: 10, highestFloor: 9, totalWins: 9 }, actionId: 'tower-win', now: 2 });
    expect(start.battle).toMatchObject({ battleMode: 'tower', towerFloor: 10, towerRulesVersion: 3 });
    expect(win.profile.totalExp).toBeGreaterThan(0); expect(win.towerProgress).toMatchObject({ currentFloor: 11, highestFloor: 10, totalWins: 10, bossWins: 1 });
    expect(() => prepareBattleAttack({ battle: win.battle, profile: win.profile, towerProgress: win.towerProgress, actionId: 'again', now: 3 })).toThrow('BATTLE_ALREADY_COMPLETED');
  });
  it('does not advance a floor after defeat', () => {
    const start = prepareBattleStart({ profile, enemy: buildTowerEnemy({ floor: 1 }), battleId: 'tower-loss', now: 1, battleMode: 'tower', towerFloor: 1 });
    const lost = prepareBattleAttack({ battle: { ...start.battle, playerHp: 1 }, profile: start.profile, towerProgress: { currentFloor: 1 }, actionId: 'tower-loss-hit', now: 2 });
    expect(lost.battle.status).toBe('lost'); expect(lost.profile).toMatchObject({ totalExp: 0, activeBattleId: null }); expect(lost.defeatLedger).toMatchObject({ expGranted: 0 }); expect(lost.towerProgress).toBeUndefined();
  });
});

describe('Tower rules version compatibility', () => {
  it('captures rules 3, Energy and EXP in new party encounters and start ledgers', () => {
    const encounter = buildTowerEncounter({ floor: 10 });
    const start = preparePartyTowerStart({ profile, encounter, battleId: 'new-party', now: 1 });
    expect(encounter.rulesVersion).toBe(3);
    expect(start.battle).toMatchObject({ towerRulesVersion: 3, encounterSnapshot: { rulesVersion: 3, energyCost: 3, expReward: 155 } });
    expect(start.profile.battleEnergy).toBe(7);
    expect(start.ledger.energySpent).toBe(3);
    expect(start.ledger.encounterSnapshot).toEqual(start.battle.encounterSnapshot);
  });
  it('resumes a saved rules 2 party battle without regenerating stats, costs or rewards', () => {
    const current = buildTowerEncounter({ floor: 10 });
    const encounter = { ...current, rulesVersion: 2, enemies: current.enemies.map((enemy, index) => ({ ...enemy, ...(index === 0 ? { maxHp: 99, attack: 13 } : {}), tower: { ...enemy.tower, rulesVersion: 2 } })) };
    const start = preparePartyTowerStart({ profile: { ...profile, partyMemberIds: ['hero'] }, encounter, battleId: 'old-party', now: 1 });
    const saved = JSON.parse(JSON.stringify(start.battle));
    const before = structuredClone(saved);
    const next = preparePartyBattleResult({ battle: saved, profile: start.profile, towerProgress: { currentFloor: 10 }, action: { targetEnemyInstanceId: saved.enemyStates[0].enemyInstanceId }, actionId: 'resume', now: 2 });
    expect(next.battle.towerRulesVersion).toBe(2);
    expect(next.battle.encounterSnapshot).toEqual(before.encounterSnapshot);
    expect(next.battle.enemySnapshots).toEqual(before.enemySnapshots);
    expect(next.battle.partySnapshot).toEqual(before.partySnapshot);
    expect(next.result.enemyEvents[0].damage).toBe(13 - before.partySnapshot.members[0].defense);
    expect(saved).toEqual(before);
    const finalBattle = { ...next.battle, enemyStates: next.battle.enemyStates.map((enemy, index) => ({ ...enemy, hp: index === 0 ? 1 : 0, status: index === 0 ? 'active' : 'defeated' })) };
    const win = preparePartyBattleResult({ battle: finalBattle, profile: start.profile, towerProgress: { currentFloor: 10 }, action: { targetEnemyInstanceId: saved.enemyStates[0].enemyInstanceId }, actionId: 'finish', now: 3 });
    expect(win.victoryLedger.expGranted).toBe(before.encounterSnapshot.expReward);
    expect(win.profile).toMatchObject({ totalExp: 155, battleEnergy: 7 });
    expect(win.towerProgress.currentFloor).toBe(11);
    expect(() => preparePartyBattleResult({ battle: win.battle, profile: win.profile, action: {}, actionId: 'retry', now: 4 })).toThrow('BATTLE_ALREADY_COMPLETED');
  });
});
