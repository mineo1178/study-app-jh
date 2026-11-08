import { EQUIPMENT_CATALOG } from './equipmentCatalog.js';

export const FOCUSED_GACHA = Object.freeze({
  weapon: { name: '武器', contents: '武器装備', price: 6500, rates: { N: 74, R: 24, SR: 1.8, SSR: 0.2 } },
  armor: { name: '防具', contents: '防具装備', price: 6500, rates: { N: 74, R: 24, SR: 1.8, SSR: 0.2 } },
  accessory: { name: 'アクセサリー', contents: 'アクセサリー装備', price: 4500, rates: { N: 75, R: 25, SR: 0, SSR: 0 } },
  skill: { name: '回復・防御スキル', contents: '回復・防御スキルを使う仲間', price: 10000, rates: { N: 0, R: 94, SR: 5.5, SSR: 0.5 } },
});
const focusedEntries = Object.entries(FOCUSED_GACHA);
export const TICKET_TYPES = Object.freeze(['normal', 'silver', 'gold', 'premium', ...Object.keys(FOCUSED_GACHA)]);
export const TICKET_PRICES = Object.freeze({ normal: 3000, silver: 12000, gold: 24000, premium: 42000, ...Object.fromEntries(focusedEntries.map(([id, entry]) => [id, entry.price])) });
export const GACHA_RATES = Object.freeze({ normal: { N: 73, R: 24, SR: 2.5, SSR: 0.5 }, silver: { N: 43, R: 40, SR: 15, SSR: 2 }, gold: { N: 15, R: 45, SR: 32, SSR: 8 }, premium: { N: 0, R: 30, SR: 50, SSR: 20 }, ...Object.fromEntries(focusedEntries.map(([id, entry]) => [id, entry.rates])) });
export const MEMBER_RATES = Object.freeze({ N: 0, R: 60, SR: 70, SSR: 80 });
export const FRAGMENTS_BY_RARITY = Object.freeze({ R: 12, SR: 36, SSR: 120 });
export const ALCHEMY_ITEMS = Object.freeze({
  alchemy_dust: { id: 'alchemy_dust', name: '錬金粉', rarity: 'N' }, hard_stone: { id: 'hard_stone', name: '硬化石', rarity: 'N' }, magic_herb: { id: 'magic_herb', name: '魔力草', rarity: 'N' }, tough_thread: { id: 'tough_thread', name: '強化糸', rarity: 'N' },
  silver_ore: { id: 'silver_ore', name: '銀鉱石', rarity: 'R' }, magic_crystal: { id: 'magic_crystal', name: '魔晶石', rarity: 'R' }, spirit_thread: { id: 'spirit_thread', name: '精霊糸', rarity: 'R' }, beast_hide: { id: 'beast_hide', name: '魔獣皮', rarity: 'R' },
  mythril_fragment: { id: 'mythril_fragment', name: 'ミスリル片', rarity: 'SR' }, spirit_core: { id: 'spirit_core', name: '精霊核', rarity: 'SR' }, moon_cloth: { id: 'moon_cloth', name: '月光布', rarity: 'SR' }, dragon_bone: { id: 'dragon_bone', name: '竜骨', rarity: 'SR' },
  dragon_scale: { id: 'dragon_scale', name: '竜鱗', rarity: 'SSR' }, sage_stone: { id: 'sage_stone', name: '賢者の石', rarity: 'SSR' }, celestial_cloth: { id: 'celestial_cloth', name: '天空布', rarity: 'SSR' }, ancient_core: { id: 'ancient_core', name: '古代核', rarity: 'SSR' },
});
export const GACHA_MEMBERS = Object.freeze({
  akane: { id: 'akane', name: 'アカネ', rarity: 'R', element: '火', role: 'Attacker', skillIds: ['flame_slash'], multiplier: 1.02 }, minato: { id: 'minato', name: 'ミナト', rarity: 'R', element: '水', role: 'Healer', skillIds: ['healing_light'], multiplier: 1.02 }, raika: { id: 'raika', name: 'ライカ', rarity: 'R', element: '雷', role: 'Mage', skillIds: ['firestorm'], multiplier: 1.02 }, gaku: { id: 'gaku', name: 'ガク', rarity: 'R', element: '地', role: 'Guardian', skillIds: ['guardian_wall'], multiplier: 1.02 },
  kaede: { id: 'kaede', name: 'カエデ', rarity: 'SR', element: '火', role: 'Attacker', skillIds: ['flame_slash'], multiplier: 1.10 }, seria: { id: 'seria', name: 'セリア', rarity: 'SR', element: '水', role: 'Healer', skillIds: ['healing_prayer'], multiplier: 1.10 }, leon: { id: 'leon', name: 'レオン', rarity: 'SR', element: '雷', role: 'Mage', skillIds: ['firestorm'], multiplier: 1.10 }, noa: { id: 'noa', name: 'ノア', rarity: 'SR', element: '地', role: 'Guardian', skillIds: ['guardian_wall'], multiplier: 1.10 },
  homura: { id: 'homura', name: 'ホムラ', rarity: 'SSR', element: '火', role: 'Attacker', skillIds: ['flame_slash'], multiplier: 1.20 }, shizuku: { id: 'shizuku', name: 'シズク', rarity: 'SSR', element: '水', role: 'Healer', skillIds: ['healing_prayer'], multiplier: 1.20 }, raiden: { id: 'raiden', name: 'ライデン', rarity: 'SSR', element: '雷', role: 'Mage', skillIds: ['firestorm'], multiplier: 1.20 }, terra: { id: 'terra', name: 'テラ', rarity: 'SSR', element: '地', role: 'Guardian', skillIds: ['guardian_wall'], multiplier: 1.20 },
});
export const itemsForRarity = (rarity) => Object.values(ALCHEMY_ITEMS).filter((item) => item.rarity === rarity);
export const membersForRarity = (rarity) => Object.values(GACHA_MEMBERS).filter((member) => member.rarity === rarity);
export const rollByPercentages = (rates, roll) => { let total = 0; for (const [key, rate] of Object.entries(rates)) { total += rate; if (roll < total) return key; } return Object.keys(rates).findLast(key => rates[key] > 0); };
export const calculateRarity = ({ ticketType, drawsSinceSrPlus, drawsSinceSsr, rarityRoll }) => Object.hasOwn(FOCUSED_GACHA, ticketType) ? rollByPercentages(GACHA_RATES[ticketType], rarityRoll) : drawsSinceSsr >= 19 ? 'SSR' : drawsSinceSrPlus >= 9 ? (rarityRoll < 50 ? 'SR' : 'SSR') : rollByPercentages(GACHA_RATES[ticketType], rarityRoll);
const equipmentRarity = item => ({ common: 'N', rare: 'R' }[item.rarity] || item.rarity);
export function focusedPrizePool(ticketType, rarity) {
  if (ticketType === 'skill') return membersForRarity(rarity).filter(member => ['Healer', 'Guardian'].includes(member.role));
  return Object.values(EQUIPMENT_CATALOG).filter(item => item.slot === ticketType && equipmentRarity(item) === rarity);
}
const resultCatalogs = { member: GACHA_MEMBERS, item: ALCHEMY_ITEMS, equipment: EQUIPMENT_CATALOG };
export const getGachaResultName = ({ resultType, resultId }) => resultCatalogs[resultType]?.[resultId]?.name || '不明な結果';
