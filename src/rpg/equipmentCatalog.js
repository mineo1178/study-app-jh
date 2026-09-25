export const EQUIPMENT_CATALOG_VERSION = 2;
export const EQUIPMENT_SLOTS = Object.freeze(['weapon', 'armor', 'accessory']);

export const EQUIPMENT_CATALOG = Object.freeze({
  iron_sword: { id: 'iron_sword', name: '鉄の剣', slot: 'weapon', rarity: 'common', description: '冒険の基本となる武器。', stats: { attack: 5, defense: 0 }, cost: { gold: 80, materials: { iron: 5 } } },
  scholar_blade: { id: 'scholar_blade', name: '賢者の剣', slot: 'weapon', rarity: 'rare', description: '知識を力に変える剣。', stats: { attack: 8, defense: 0 }, cost: { gold: 150, materials: { wisdom_scroll: 3, mana_rune: 3 } } },
  mineral_armor: { id: 'mineral_armor', name: '鉱石の鎧', slot: 'armor', rarity: 'common', description: '鉱石を鍛えて作った堅牢な鎧。', stats: { attack: 1, defense: 3 }, cost: { gold: 100, materials: { mineral: 5 } } },
  balanced_robe: { id: 'balanced_robe', name: '調和のローブ', slot: 'armor', rarity: 'rare', description: '多様な学びを織り込んだ魔法の衣。', stats: { attack: 2, defense: 5 }, cost: { gold: 180, materials: { craft_cloth: 3, vitality: 3, resonance: 2 } } },
  history_charm: { id: 'history_charm', name: '歴史の護符', slot: 'accessory', rarity: 'common', description: '積み重ねた知識を守る護符。', stats: { attack: 1, defense: 1 }, cost: { gold: 70, materials: { history_seal: 4 } } },
  logic_badge: { id: 'logic_badge', name: '論理のバッジ', slot: 'accessory', rarity: 'rare', description: 'ひらめきと論理を結びつける徽章。', stats: { attack: 2, defense: 1 }, cost: { gold: 120, materials: { logic_core: 4, mana_rune: 2 } } },
  silver_iron_blade: { id: 'silver_iron_blade', name: '銀鉄の剣', slot: 'weapon', rarity: 'R', description: '銀鉱石で鍛えた剣。', stats: { attack: 10, defense: 0 } },
  arcane_staff: { id: 'arcane_staff', name: '魔導の杖', slot: 'weapon', rarity: 'R', description: '魔力を導く杖。', stats: { attack: 9, defense: 1 } },
  beast_armor: { id: 'beast_armor', name: '魔獣皮の鎧', slot: 'armor', rarity: 'R', description: '魔獣の皮を使った鎧。', stats: { attack: 0, defense: 7 } },
  spirit_robe: { id: 'spirit_robe', name: '精霊糸のローブ', slot: 'armor', rarity: 'R', description: '精霊糸を編んだローブ。', stats: { attack: 1, defense: 6 } },
  mythril_blade: { id: 'mythril_blade', name: 'ミスリルブレード', slot: 'weapon', rarity: 'SR', description: '軽く鋭いミスリルの剣。', stats: { attack: 13, defense: 0 } },
  spirit_staff: { id: 'spirit_staff', name: '精霊の杖', slot: 'weapon', rarity: 'SR', description: '精霊核を宿す杖。', stats: { attack: 12, defense: 1 } },
  dragon_bone_armor: { id: 'dragon_bone_armor', name: '竜骨の鎧', slot: 'armor', rarity: 'SR', description: '竜骨で補強した鎧。', stats: { attack: 0, defense: 9 } },
  moon_robe: { id: 'moon_robe', name: '月光の法衣', slot: 'armor', rarity: 'SR', description: '月光布の法衣。', stats: { attack: 2, defense: 8 } },
  dragon_star_blade: { id: 'dragon_star_blade', name: '竜星剣', slot: 'weapon', rarity: 'SSR', description: '竜の力が宿る名剣。', stats: { attack: 16, defense: 0 } },
  sage_staff: { id: 'sage_staff', name: '賢者の杖', slot: 'weapon', rarity: 'SSR', description: '賢者の石を冠した杖。', stats: { attack: 14, defense: 2 } },
  dragon_scale_armor: { id: 'dragon_scale_armor', name: '竜鱗の鎧', slot: 'armor', rarity: 'SSR', description: '竜鱗の堅牢な鎧。', stats: { attack: 0, defense: 12 } },
  celestial_robe: { id: 'celestial_robe', name: '天空の法衣', slot: 'armor', rarity: 'SSR', description: '天空布で仕立てた法衣。', stats: { attack: 3, defense: 10 } },
});

export const getEquipmentCatalogItem = (itemId) => EQUIPMENT_CATALOG[itemId] || null;
