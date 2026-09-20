import { describe, expect, it } from 'vitest';
import { ENEMY_CATALOG } from '../rpg/enemyCatalog.js';
import { prepareBattleAttack, prepareBattleStart } from './rpgBattleRepository.js';
import { calculateSkillDamage, getElementMultiplier } from '../rpg/battleCalculator.js';

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
    expect(attack.attackLedger).toMatchObject({ playerAttack: { damage: 10, enemyHpBefore: 20, enemyHpAfter: 10 }, enemyCounter: { damage: 3, playerHpBefore: 40, playerHpAfter: 37 }, outcome: 'active' });
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
  it('snapshots starter skills and applies weak skill damage atomically', () => {
    const start = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'battle-skill', now });
    expect(start.battle).toMatchObject({ schemaVersion: 4, skillUses: { flame_slash: 0, aqua_edge: 0, thunder_strike: 0, healing_light: 0, guard_stance: 0 } });
    const skill = start.battle.playerSnapshot.skills.flame_slash;
    const elementResult = getElementMultiplier({ attackElement: skill.element, weaknesses: start.battle.enemySnapshot.weaknesses, resistances: start.battle.enemySnapshot.resistances });
    const damage = calculateSkillDamage({ playerAttack: 10, powerPercent: skill.powerPercent, elementPercent: elementResult.percent });
    expect(damage).toEqual({ poweredDamage: 12, damage: 18 });
    const result = prepareBattleAttack({ battle: start.battle, profile: start.profile, actionId: 'skill-1', now, action: { kind: 'skill', damage: damage.damage, poweredDamage: damage.poweredDamage, elementResult, skill: { ...skill, useNumber: 1 } } });
    expect(result.battle).toMatchObject({ enemyHp: 2, skillUses: { flame_slash: 1 } });
    expect(result.attackLedger).toMatchObject({ actionKind: 'skill', elementResult: { type: 'weak', percent: 150 }, skill: { id: 'flame_slash', useNumber: 1 } });
  });
  it('snapshots five v4 skills and applies heal and guard through the shared action path', () => {
    const start = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'battle-v4', now });
    expect(start.battle).toMatchObject({ schemaVersion: 4, skillUses: { flame_slash: 0, aqua_edge: 0, thunder_strike: 0, healing_light: 0, guard_stance: 0 } });
    const heal = prepareBattleAttack({ battle: { ...start.battle, playerHp: 20 }, profile: start.profile, actionId: 'heal-1', now, action: { kind: 'skill', healing: { playerHpBefore: 20, calculatedHeal: 14, actualHeal: 14, playerHpAfterHeal: 34 }, skill: { ...start.battle.playerSnapshot.skills.healing_light, useNumber: 1 } } });
    expect(heal.battle).toMatchObject({ enemyHp: 20, playerHp: 31, skillUses: { healing_light: 1 }, attackCount: 1 });
    expect(heal.attackLedger).toMatchObject({ healing: { actualHeal: 14 }, playerAttack: null, enemyCounter: { damage: 3, playerHpBefore: 34, playerHpAfter: 31 } });
    const guard = prepareBattleAttack({ battle: { ...start.battle, playerHp: 10 }, profile: start.profile, actionId: 'guard-1', now, action: { kind: 'skill', skill: { ...start.battle.playerSnapshot.skills.guard_stance, useNumber: 1 } } });
    expect(guard.battle).toMatchObject({ enemyHp: 20, playerHp: 9, skillUses: { guard_stance: 1 } });
    expect(guard.attackLedger).toMatchObject({ guard: { baseDamage: 3, reductionPercent: 50, finalDamage: 1 }, enemyCounter: { damage: 1 } });
  });
  it('keeps v3 skill snapshots attack-only while supplying their missing kind', () => {
    const legacy = { schemaVersion: 3, battleId: 'legacy', enemyId: 'slime', enemyHp: 20, status: 'active', playerHp: 40, playerSnapshot: { attack: 5, maxHp: 40, skills: { flame_slash: { id: 'flame_slash', maxUses: 2 } } }, enemySnapshot: { maxHp: 20, attack: 1 } };
    const turn = prepareBattleAttack({ battle: legacy, profile, actionId: 'legacy-a', now });
    expect(turn.battle.playerSnapshot.skills).toEqual({ flame_slash: { id: 'flame_slash', maxUses: 2, kind: 'attack' } });
    expect(turn.battle.playerSnapshot.skills.healing_light).toBeUndefined();
  });
});
