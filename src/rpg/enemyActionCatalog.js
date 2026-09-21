export const ENEMY_ACTION_CATALOG_VERSION = 1;

export const ENEMY_ACTION_CATALOG = Object.freeze({
  normal_attack: Object.freeze({ id: 'normal_attack', name: '通常攻撃', powerPercent: 100 }),
  orc_heavy_strike: Object.freeze({ id: 'orc_heavy_strike', name: '豪腕撃', powerPercent: 150 }),
  golem_rock_crush: Object.freeze({ id: 'golem_rock_crush', name: '岩砕き', powerPercent: 150 }),
  golem_earthquake: Object.freeze({ id: 'golem_earthquake', name: '大地震', powerPercent: 175 }),
});

export const getEnemyAction = (actionId) => ENEMY_ACTION_CATALOG[actionId] || null;

export const snapshotEnemyActionPattern = (actionIds) => {
  const ids = Array.isArray(actionIds) && actionIds.length > 0 ? actionIds : ['normal_attack'];
  return ids.map((actionId) => {
    const action = getEnemyAction(actionId);
    if (!action) throw Object.assign(new Error('ENEMY_ACTION_NOT_FOUND'), { code: 'ENEMY_ACTION_NOT_FOUND' });
    return { id: action.id, name: action.name, powerPercent: action.powerPercent };
  });
};

export const enemyActionForTurn = (pattern, enemyTurnNumber) => {
  const safePattern = Array.isArray(pattern) && pattern.length > 0 ? pattern : snapshotEnemyActionPattern();
  const turn = Math.max(1, Math.floor(Number(enemyTurnNumber) || 1));
  return safePattern[(turn - 1) % safePattern.length];
};
