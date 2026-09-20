export const ENEMY_CATALOG_VERSION = 1;
export const ENEMY_CATALOG = Object.freeze({
  slime: { id: 'slime', name: 'スライム', maxHp: 20, energyCost: 1, expReward: 20 },
  goblin: { id: 'goblin', name: 'ゴブリン', maxHp: 40, energyCost: 1, expReward: 35 },
  stone_golem: { id: 'stone_golem', name: 'ストーンゴーレム', maxHp: 80, energyCost: 2, expReward: 70 },
});
export const getEnemyCatalogItem = (enemyId) => ENEMY_CATALOG[enemyId] || null;
