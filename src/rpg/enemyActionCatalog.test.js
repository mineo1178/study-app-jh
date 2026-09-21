import { describe, expect, it } from 'vitest';
import { BOSS_CATALOG } from './bossCatalog.js';
import { ENEMY_ACTION_CATALOG, ENEMY_ACTION_CATALOG_VERSION, enemyActionForTurn, snapshotEnemyActionPattern } from './enemyActionCatalog.js';

describe('enemy action catalog', () => {
  it('uses unique direct-damage actions and valid boss patterns', () => {
    const actions = Object.values(ENEMY_ACTION_CATALOG);
    expect(ENEMY_ACTION_CATALOG_VERSION).toBe(1);
    expect(new Set(actions.map((action) => action.id)).size).toBe(actions.length);
    actions.forEach((action) => expect(action.powerPercent).toBeGreaterThanOrEqual(100));
    Object.values(BOSS_CATALOG).forEach((boss) => {
      expect(boss.actionPattern.length).toBeGreaterThan(0);
      boss.actionPattern.forEach((actionId) => expect(ENEMY_ACTION_CATALOG[actionId]).toBeDefined());
    });
  });

  it('selects deterministic repeating Orc and Ancient Golem patterns', () => {
    const orc = snapshotEnemyActionPattern(BOSS_CATALOG.orc_chief.actionPattern);
    const golem = snapshotEnemyActionPattern(BOSS_CATALOG.ancient_golem.actionPattern);
    expect([1, 2, 3, 4].map((turn) => enemyActionForTurn(orc, turn).id)).toEqual(['normal_attack', 'normal_attack', 'orc_heavy_strike', 'normal_attack']);
    expect([1, 2, 3, 4, 5].map((turn) => enemyActionForTurn(golem, turn).id)).toEqual(['normal_attack', 'golem_rock_crush', 'normal_attack', 'golem_earthquake', 'normal_attack']);
  });
});
