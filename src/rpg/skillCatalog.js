export const SKILL_CATALOG_VERSION = 2;
export const SKILL_CATALOG = Object.freeze({
  flame_slash: { id: 'flame_slash', name: '炎斬り', description: '炎属性の一撃。', kind: 'attack', element: 'fire', powerPercent: 125, maxUses: 2 },
  aqua_edge: { id: 'aqua_edge', name: '水刃', description: '水属性の一撃。', kind: 'attack', element: 'water', powerPercent: 125, maxUses: 2 },
  thunder_strike: { id: 'thunder_strike', name: '雷撃', description: '雷属性の一撃。', kind: 'attack', element: 'lightning', powerPercent: 125, maxUses: 2 },
  healing_light: { id: 'healing_light', name: 'ヒール', description: 'HPを回復する。', kind: 'heal', element: 'neutral', healPercent: 35, maxUses: 2 },
  guard_stance: { id: 'guard_stance', name: 'ガード', description: 'このターンの敵から受けるダメージを50%軽減する。', kind: 'guard', element: 'neutral', damageReductionPercent: 50, maxUses: 2 },
});
