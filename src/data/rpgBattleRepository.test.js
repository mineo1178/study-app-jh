import { describe, expect, it } from 'vitest';
import { ENEMY_CATALOG } from '../rpg/enemyCatalog.js';
import { prepareBattleAttack, prepareBattleStart } from './rpgBattleRepository.js';

const now = 1000;
const profile = { battleEnergy: 3, totalExp: 90, level: 1, ownedEquipment: { iron_sword: {} }, equipped: { weapon: 'iron_sword' } };
describe('battle transaction logic', () => {
  it('starts a battle once with a snapshot and charges energy once', () => {
    const start = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'battle-a', now });
    expect(start.profile).toMatchObject({ battleEnergy: 2, activeBattleId: 'battle-a' });
    expect(start.battle).toMatchObject({ enemyHp: 20, status: 'active', attackCount: 0, playerSnapshot: { attack: 10 } });
    expect(start.ledger).toMatchObject({ type: 'battle_start', energySpent: 1 });
    expect(() => prepareBattleStart({ profile: start.profile, enemy: ENEMY_CATALOG.slime, battleId: 'battle-b', now })).toThrow('ACTIVE_BATTLE_EXISTS');
    expect(() => prepareBattleStart({ profile: { battleEnergy: 0 }, enemy: ENEMY_CATALOG.slime, battleId: 'battle-b', now })).toThrow('INSUFFICIENT_BATTLE_ENERGY');
  });
  it('updates HP and writes a regular attack ledger from the battle snapshot', () => {
    const start = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'battle-a', now });
    const attack = prepareBattleAttack({ battle: start.battle, profile: start.profile, actionId: 'attack-a', now: now + 1 });
    expect(attack.battle).toMatchObject({ enemyHp: 10, attackCount: 1, status: 'active' });
    expect(attack.attackLedger).toMatchObject({ damage: 10, hpBefore: 20, hpAfter: 10, victory: false });
    expect(attack.profile).toBeNull();
  });
  it('makes victory atomic: hp floor, EXP once, level update, and active battle clear', () => {
    const start = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'battle-a', now });
    const final = prepareBattleAttack({ battle: { ...start.battle, enemyHp: 5 }, profile: start.profile, actionId: 'attack-final', now: now + 2 });
    expect(final.battle).toMatchObject({ enemyHp: 0, status: 'won', attackCount: 1 });
    expect(final.profile).toMatchObject({ totalExp: 110, level: 2, activeBattleId: null });
    expect(final.victoryLedger).toMatchObject({ type: 'victory', expGranted: 20, totalExpBefore: 90, totalExpAfter: 110, levelAfter: 2 });
    expect(() => prepareBattleAttack({ battle: final.battle, profile: final.profile, actionId: 'later', now })).toThrow('BATTLE_ALREADY_COMPLETED');
  });
});
