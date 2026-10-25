import { describe, expect, it } from 'vitest';
import { BALANCE_PLAYERS, measureBalance, simulateBattle } from '../../scripts/simulateBattleBalance.js';
import { createPartyBattle, preparePartyBattleAction } from './partyBattleEngine.js';
import { buildTowerPartySnapshot } from './partyMemberCatalog.js';
import { calculateEnemyActionDamage } from './battleCalculator.js';
import { prepareBattleAttack, prepareBattleStart, prepareWeeklyBossStart } from '../data/rpgBattleRepository.js';
import { BOSS_CATALOG } from './bossCatalog.js';
import { buildTowerEncounter } from './towerCatalog.js';
import { getWeeklyBossDefinition } from './weeklyBossCatalog.js';

import beforeEnemies from '../../test/fixtures/rpg-v2.9.6-enemies.json';
const BALANCE_SCENARIOS = beforeEnemies.scenarios;
const scenario = id => BALANCE_SCENARIOS.find(row => row.id === id);
const simulate = (player, id, policy = 'strategy') => simulateBattle(BALANCE_PLAYERS[player], scenario(id), policy);
const encounter = { rulesVersion: 1, energyCost: 1, expReward: 20, enemies: [1,2,3].map(id => ({ id: `enemy-${id}`, enemyInstanceId: `enemy-${id}`, maxHp: 1000, attack: 20, actionPattern: ['normal_attack'], weaknesses: [], resistances: [] })) };
const members = [{ memberId: 'hero', maxHp: 200, attack: 5, defense: 0, skills: [{ id: 'guard', kind: 'guard', targetType: 'self', damageReductionPercent: 50, maxUses: 2 }] }];

describe('party enemy phase correctness', () => {
  it('does not let an enemy killed by the final party actor retaliate', () => {
    const initial = createPartyBattle({ battleId: 'kill', encounter, members, now: 1 });
    const battle = { ...initial, enemyStates: initial.enemyStates.map((state, index) => index === 0 ? { ...state, hp: 1 } : state) };
    const result = preparePartyBattleAction({ battle, action: { actionId: 'kill', targetEnemyInstanceId: 'enemy-1' }, now: 2 });
    expect(result.battle.enemyStates[0].status).toBe('defeated');
    expect(result.enemyEvents.map(event => event.enemyInstanceId)).toEqual(['enemy-2', 'enemy-3']);
  });
  it('keeps guard for the entire enemy phase and clears it before the next round', () => {
    const battle = createPartyBattle({ battleId: 'guard', encounter, members, now: 1 });
    const guarded = preparePartyBattleAction({ battle, action: { actionId: 'guard', skillId: 'guard' }, now: 2 });
    expect(guarded.enemyEvents.map(event => event.damage)).toEqual([10,10,10]);
    expect(guarded.battle.partyStates[0]).toMatchObject({ hp: 170, guardPercent: 0 });
    const next = preparePartyBattleAction({ battle: guarded.battle, action: { actionId: 'attack', targetEnemyInstanceId: 'enemy-1' }, now: 3 });
    expect(next.enemyEvents.map(event => event.damage)).toEqual([20,20,20]);
  });
  it('retains string action IDs in legacy Tower snapshots and executes their special attacks', () => {
    const legacy = createPartyBattle({ battleId: 'legacy', encounter: { ...encounter, enemies: [{ ...encounter.enemies[0], maxHp: 58, attack: 5 }] }, members, now: 1 });
    legacy.enemySnapshots[0].actionPattern = ['normal_attack', 'orc_heavy_strike'];
    legacy.roundNumber = 2;
    const before = structuredClone(legacy);
    const result = preparePartyBattleAction({ battle: legacy, action: { actionId: 'legacy', targetEnemyInstanceId: 'enemy-1' }, now: 2 });
    expect(result.enemyEvents[0]).toMatchObject({ actionId: 'orc_heavy_strike', damage: 7 });
    expect(result.battle.enemySnapshots).toEqual(before.enemySnapshots);
    expect(result.battle.partySnapshot).toEqual(before.partySnapshot);
    expect(result.battle.enemyStates[0].hp).toBe(53);
    expect(legacy).toEqual(before);
  });
});

describe('measured balance acceptance', () => {
  it.each(['campaign-slime', 'campaign-goblin'])('keeps unarmed beginner progression possible: %s', id => {
    expect(simulate('beginner', id).status).toBe('won');
  });
  it('makes Chapter 1 boss require more turns than its normal enemies with common equipment', () => {
    const boss = simulate('intermediate', 'campaign-orc_chief');
    expect(boss.status).toBe('won');
    expect(boss.turns).toBeGreaterThan(simulate('intermediate', 'campaign-goblin').turns);
    expect(boss.turns).toBeGreaterThanOrEqual(4);
    expect(boss.turns).toBeLessThanOrEqual(7);
    expect(boss.hpPercent).toBeLessThan(80);
  });
  it('lets preparation and recovery change the final Campaign boss outcome', () => {
    expect(simulate('intermediate', 'campaign-ancient_golem')).toMatchObject({ status: 'won', turns: 9 });
    expect(simulate('intermediate', 'campaign-ancient_golem', 'normal').status).toBe('lost');
    expect(simulate('prepared', 'campaign-ancient_golem', 'normal').hp).toBeLessThan(simulate('prepared', 'campaign-ancient_golem').hp);
    const strategy = simulate('prepared', 'campaign-ancient_golem');
    expect(strategy.status).toBe('won');
    expect(strategy.heals).toBeGreaterThan(0);
    expect(strategy.turns).toBeLessThanOrEqual(10);
  });
  it('increases Tower pressure with progression, enemy count and boss floors', () => {
    expect(simulate('intermediate', 'tower-1').status).toBe('won');
    expect(simulate('intermediate', 'tower-24').turns).toBeGreaterThan(simulate('intermediate', 'tower-1').turns);
    expect(simulate('intermediate', 'tower-27').status).toBe('lost');
    expect(simulate('prepared', 'tower-27').status).toBe('won');
    expect(simulate('prepared', 'tower-30').turns).toBeGreaterThan(simulate('prepared', 'tower-24').turns);
    expect(simulate('trained', 'tower-60', 'normal').hp).toBeLessThan(simulate('trained', 'tower-60').hp);
    const strategy = simulate('trained', 'tower-60');
    expect(strategy.status).toBe('won');
    expect(strategy.turns).toBeGreaterThanOrEqual(5);
    expect(strategy.turns).toBeLessThanOrEqual(10);
    expect(strategy.heals).toBeGreaterThan(0);
  });
  it.each(['weekly_ignis', 'weekly_leviathan', 'weekly_volt', 'weekly_gaia'])('makes %s accessible at level 12 with recovery still valuable', id => {
    const result = simulate('prepared', id);
    expect(result.status).toBe('won');
    expect(result.turns).toBeGreaterThanOrEqual(8);
    expect(result.turns).toBeLessThanOrEqual(9);
    expect(result.hp).toBeGreaterThan(simulate('prepared', id, 'normal').hp);
    expect(result.damage).toBeGreaterThan(0);
    expect(result.enemyActions).toBeGreaterThanOrEqual(4);
    expect(result.heals).toBeGreaterThan(0);
    expect(simulate('intermediate', id).status).toBe('lost');
  });
  it('gives equipment, party composition and level independent effects', () => {
    const full = BALANCE_PLAYERS.trained;
    const bare = { ...full, equipped: {}, ownedEquipment: {} };
    const solo = { ...full, partyMemberIds: ['hero'] };
    const younger = { ...full, level: 7 };
    const reference = buildTowerPartySnapshot(full);
    expect(buildTowerPartySnapshot(bare)[0].attack).toBeLessThan(reference[0].attack);
    expect(buildTowerPartySnapshot(bare)[0].defense).toBeLessThan(reference[0].defense);
    expect(buildTowerPartySnapshot(younger)[0].maxHp).toBeLessThan(reference[0].maxHp);
    expect(buildTowerPartySnapshot(younger)[0].attack).toBeLessThan(reference[0].attack);
    expect(simulateBattle(bare, scenario('tower-60')).status).toBe('lost');
    expect(simulateBattle(solo, scenario('tower-60')).status).toBe('lost');
  });
  it('finishes the full deterministic matrix without infinite combat and repeats identical results', () => {
    const rows = measureBalance();
    expect(rows).toHaveLength(Object.keys(BALANCE_PLAYERS).length * BALANCE_SCENARIOS.length * 2);
    expect(rows.every(row => row.status !== 'active' && row.actions < 300)).toBe(true);
    expect(simulate('trained', 'tower-60')).toEqual(simulate('trained', 'tower-60'));
  });
});

describe('new-start balance and existing snapshot compatibility', () => {
  it('keeps the solo damage formula and makes boss specials stronger than normal attacks', () => {
    const boss = BOSS_CATALOG.ancient_golem;
    const normal = calculateEnemyActionDamage({ enemyAttack: boss.attack, playerDefense: 4 });
    const special = calculateEnemyActionDamage({ enemyAttack: boss.attack, powerPercent: 175, playerDefense: 4 });
    expect(normal.damage).toBe(4);
    expect(special.damage).toBe(10);
  });
  it('continues a saved Campaign battle using captured HP, attack, skills and rewards', () => {
    const oldEnemy = { ...BOSS_CATALOG.orc_chief, maxHp: 58, attack: 5 };
    const start = prepareBattleStart({ profile: BALANCE_PLAYERS.intermediate, enemy: oldEnemy, battleId: 'saved', battleKind: 'boss', now: 1 });
    const before = structuredClone(start.battle);
    const next = prepareBattleAttack({ battle: start.battle, profile: start.profile, actionId: 'next', now: 2 });
    expect(next.battle.enemySnapshot).toEqual(before.enemySnapshot);
    expect(next.battle.playerSnapshot).toEqual(before.playerSnapshot);
    expect(next.battle.enemyHp).toBe(58 - before.playerSnapshot.attack);
    expect(next.result.enemyCounter.damage).toBe(1);
    expect(prepareBattleStart({ profile: BALANCE_PLAYERS.intermediate, enemy: BOSS_CATALOG.orc_chief, battleId: 'new', now: 1 }).battle.enemyHp).toBe(74);
  });
  it.each([{ rulesVersion: 1, maxHp: 220, attack: 11 }, { rulesVersion: 2, maxHp: 850, attack: 52 }])('keeps Weekly rules $rulesVersion rewards and stats captured at start when resuming', legacyStats => {
    const boss = getWeeklyBossDefinition('2026-W01');
    const oldBoss = { ...boss, ...legacyStats };
    const start = prepareWeeklyBossStart({ profile: BALANCE_PLAYERS.trained, boss: oldBoss, battleId: 'saved-week', now: 1 });
    const snapshots = structuredClone(start.battle);
    const next = preparePartyBattleAction({ battle: start.battle, action: { actionId: 'next', targetEnemyInstanceId: start.battle.enemyStates[0].enemyInstanceId }, now: 2 });
    expect(next.battle.weeklyBossSnapshot).toEqual(snapshots.weeklyBossSnapshot);
    expect(next.battle.enemySnapshots).toEqual(snapshots.enemySnapshots);
    expect(next.battle.partySnapshot).toEqual(snapshots.partySnapshot);
    expect(start.battle.enemyStates[0].hp).toBe(legacyStats.maxHp);
    expect(boss.rulesVersion).toBe(4);
    expect(boss.reward).toEqual(oldBoss.reward);
  });
  it('preserves costs and XP scaling while generating new Tower encounters', () => {
    const tenth = buildTowerEncounter({ floor: 10 });
    expect(tenth.energyCost).toBe(3);
    expect(tenth.expReward).toBe(tenth.enemies.reduce((sum, enemy) => sum + enemy.expReward, 0));
    expect(tenth.rulesVersion).toBe(4);
    expect(buildTowerEncounter({ floor: 60 }).enemies[0].attack).toBeGreaterThan(tenth.enemies[0].attack);
  });
});
