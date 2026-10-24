import { MATERIAL_DEFS, MATERIAL_KEYS } from './rewardConfig.js';
import { ALCHEMY_ITEMS } from './gachaCatalog.js';

export const RESOURCE_SHOP_CATALOG_VERSION = 1;
export const hasEquipmentPrice = item => Number.isSafeInteger(item?.cost?.gold) && item.cost.gold > 0;
export const RESOURCE_SHOP_CATALOG = Object.freeze(Object.fromEntries([
  ...MATERIAL_KEYS.map(key => ({ id: 'material_' + key, category: 'materials', name: MATERIAL_DEFS[key].label, description: MATERIAL_DEFS[key].description, cost: { gold: 30, materials: {} }, receive: { gold: 0, materials: { [key]: 1 }, alchemyItems: {} } })),
  ...Object.values(ALCHEMY_ITEMS).filter(item => ['N', 'R'].includes(item.rarity)).map(item => ({ id: 'alchemy_' + item.id, category: 'alchemy', name: item.name, description: item.rarity + 'ランクの錬金素材。錬金で装備を作るときに使います。', cost: { gold: item.rarity === 'N' ? 90 : 240, materials: {} }, receive: { gold: 0, materials: {}, alchemyItems: { [item.id]: 1 } } })),
].map(item => [item.id, item])));
export const getResourceShopItem = id => Object.hasOwn(RESOURCE_SHOP_CATALOG, id) ? RESOURCE_SHOP_CATALOG[id] : null;
