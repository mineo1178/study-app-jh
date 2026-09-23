import { describe, expect, it } from 'vitest';
import { prepareBattleAttack, prepareBattleStart } from './rpgBattleRepository.js';
import { buildTowerEnemy } from '../rpg/towerCatalog.js';

const profile = { battleEnergy: 10, totalExp: 0, level: 1, equipped: {} };
describe('tower battle progress', () => {
  it('snapshots a floor and advances EXP and tower progress exactly once on victory', () => {
    const start = prepareBattleStart({ profile, enemy: buildTowerEnemy({ floor: 10 }), battleId: 'tower-10', now: 1, battleKind: 'boss', battleMode: 'tower', towerFloor: 10 });
    const win = prepareBattleAttack({ battle: { ...start.battle, enemyHp: 1 }, profile: start.profile, towerProgress: { currentFloor: 10, highestFloor: 9, totalWins: 9 }, actionId: 'tower-win', now: 2 });
    expect(start.battle).toMatchObject({ battleMode: 'tower', towerFloor: 10, towerRulesVersion: 1 });
    expect(win.profile.totalExp).toBeGreaterThan(0); expect(win.towerProgress).toMatchObject({ currentFloor: 11, highestFloor: 10, totalWins: 10, bossWins: 1 });
    expect(() => prepareBattleAttack({ battle: win.battle, profile: win.profile, towerProgress: win.towerProgress, actionId: 'again', now: 3 })).toThrow('BATTLE_ALREADY_COMPLETED');
  });
  it('does not advance a floor after defeat', () => {
    const start = prepareBattleStart({ profile, enemy: buildTowerEnemy({ floor: 1 }), battleId: 'tower-loss', now: 1, battleMode: 'tower', towerFloor: 1 });
    const lost = prepareBattleAttack({ battle: { ...start.battle, playerHp: 1 }, profile: start.profile, towerProgress: { currentFloor: 1 }, actionId: 'tower-loss-hit', now: 2 });
    expect(lost.battle.status).toBe('lost'); expect(lost.profile).toMatchObject({ totalExp: 0, activeBattleId: null }); expect(lost.defeatLedger).toMatchObject({ expGranted: 0 }); expect(lost.towerProgress).toBeUndefined();
  });
});
