export const BOSS_CATALOG_VERSION = 1;
export const BOSS_CATALOG = Object.freeze({
  orc_chief: { id: 'orc_chief', name: 'オークチーフ', element: 'fire', weaknesses: ['water'], resistances: ['fire'], maxHp: 60, attack: 5, energyCost: 3, expReward: 120, firstClearReward: { gold: 150, materials: { iron: 5, wisdom_scroll: 2 } } },
  ancient_golem: { id: 'ancient_golem', name: 'エンシェントゴーレム', element: 'earth', weaknesses: ['water'], resistances: ['lightning'], maxHp: 90, attack: 7, energyCost: 4, expReward: 180, firstClearReward: { gold: 250, materials: { mineral: 5, logic_core: 3 } } },
});
export const getBoss = (id) => BOSS_CATALOG[id] || null;
