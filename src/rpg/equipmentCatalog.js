export const EQUIPMENT_CATALOG_VERSION = 1;
export const EQUIPMENT_SLOTS = Object.freeze(['weapon', 'armor', 'accessory']);

export const EQUIPMENT_CATALOG = Object.freeze({
  iron_sword: { id: 'iron_sword', name: '鉄の剣', slot: 'weapon', rarity: 'common', description: '冒険の基本となる武器。', cost: { gold: 80, materials: { iron: 5 } } },
  scholar_blade: { id: 'scholar_blade', name: '賢者の剣', slot: 'weapon', rarity: 'rare', description: '知識を力に変える剣。', cost: { gold: 150, materials: { wisdom_scroll: 3, mana_rune: 3 } } },
  mineral_armor: { id: 'mineral_armor', name: '鉱石の鎧', slot: 'armor', rarity: 'common', description: '鉱石を鍛えて作った堅牢な鎧。', cost: { gold: 100, materials: { mineral: 5 } } },
  balanced_robe: { id: 'balanced_robe', name: '調和のローブ', slot: 'armor', rarity: 'rare', description: '多様な学びを織り込んだ魔法の衣。', cost: { gold: 180, materials: { craft_cloth: 3, vitality: 3, resonance: 2 } } },
  history_charm: { id: 'history_charm', name: '歴史の護符', slot: 'accessory', rarity: 'common', description: '積み重ねた知識を守る護符。', cost: { gold: 70, materials: { history_seal: 4 } } },
  logic_badge: { id: 'logic_badge', name: '論理のバッジ', slot: 'accessory', rarity: 'rare', description: 'ひらめきと論理を結びつける徽章。', cost: { gold: 120, materials: { logic_core: 4, mana_rune: 2 } } },
});

export const getEquipmentCatalogItem = (itemId) => EQUIPMENT_CATALOG[itemId] || null;
