import { MATERIAL_DEFS, MATERIAL_KEYS } from './rewardConfig.js';
import { ALCHEMY_ITEMS } from './gachaCatalog.js';

export const MATERIAL_TRADE_CATALOG_VERSION = 1;
export const MATERIAL_EXCHANGE_GIVE = 3;
export const MATERIAL_EXCHANGE_RECEIVE = 1;
export const materialSwapId = (source, target) => 'swap_' + source + '_to_' + target;
const alchemyCosts = {
  alchemy_dust: { general_essence: 3, wisdom_scroll: 2 },
  hard_stone: { mineral: 3, iron: 2 },
  magic_herb: { mana_rune: 3, vitality: 2 },
  tough_thread: { craft_cloth: 3, resonance: 2 },
  silver_ore: { iron: 6, mineral: 6 },
  magic_crystal: { mana_rune: 6, logic_core: 6 },
  spirit_thread: { craft_cloth: 6, resonance: 6 },
  beast_hide: { vitality: 6, history_seal: 6 },
};
export const MATERIAL_TRADE_CATALOG = Object.freeze(Object.fromEntries([
  ...MATERIAL_KEYS.flatMap(source => MATERIAL_KEYS.filter(target => target !== source).map(target => ({ id: materialSwapId(source, target), category: 'materials', name: MATERIAL_DEFS[target].label, cost: { gold: 0, materials: { [source]: MATERIAL_EXCHANGE_GIVE } }, receive: { gold: 0, materials: { [target]: MATERIAL_EXCHANGE_RECEIVE }, alchemyItems: {} } }))),
  ...MATERIAL_KEYS.map(key => ({ id: 'gold_' + key, category: 'gold', name: MATERIAL_DEFS[key].label + ' → 15 GOLD', cost: { gold: 0, materials: { [key]: 3 } }, receive: { gold: 15, materials: {}, alchemyItems: {} } })),
  ...Object.entries(alchemyCosts).map(([key, materials]) => ({ id: 'trade_' + key, category: 'alchemy', name: ALCHEMY_ITEMS[key].name, cost: { gold: 0, materials }, receive: { gold: 0, materials: {}, alchemyItems: { [key]: 1 } } })),
].map(item => [item.id, item])));
export const getMaterialTrade = id => Object.hasOwn(MATERIAL_TRADE_CATALOG, id) ? MATERIAL_TRADE_CATALOG[id] : null;
