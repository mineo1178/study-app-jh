export const BOSS_CATALOG_VERSION = 2;
export const BOSS_CATALOG = Object.freeze({
  orc_chief: { id: 'orc_chief', name: 'オークチーフ', element: 'fire', weaknesses: ['water'], resistances: ['fire'], maxHp: 58, attack: 5, energyCost: 3, expReward: 120, actionPattern: ['normal_attack', 'normal_attack', 'orc_heavy_strike'], firstClearReward: { gold: 150, materials: { iron: 5, wisdom_scroll: 2 } } },
  ancient_golem: { id: 'ancient_golem', name: 'エンシェントゴーレム', element: 'earth', weaknesses: ['water'], resistances: ['lightning'], maxHp: 90, attack: 7, energyCost: 4, expReward: 180, actionPattern: ['normal_attack', 'golem_rock_crush', 'normal_attack', 'golem_earthquake'], firstClearReward: { gold: 250, materials: { mineral: 5, logic_core: 3 } } },
});
export const getBoss = (id) => BOSS_CATALOG[id] || null;
