export const TICKET_TYPES = Object.freeze(['normal', 'silver', 'gold', 'premium']);
export const TICKET_PRICES = Object.freeze({ normal: 120, silver: 300, gold: 600, premium: 1200 });
export const GACHA_RATES = Object.freeze({ normal: { N: 75, R: 22, SR: 3, SSR: 0 }, silver: { N: 45, R: 40, SR: 14, SSR: 1 }, gold: { N: 15, R: 45, SR: 32, SSR: 8 }, premium: { N: 0, R: 30, SR: 50, SSR: 20 } });
export const MEMBER_RATES = Object.freeze({ N: 0, R: 60, SR: 70, SSR: 80 });
export const FRAGMENTS_BY_RARITY = Object.freeze({ R: 10, SR: 30, SSR: 100 });
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
export const rollByPercentages = (rates, roll) => { let total = 0; for (const [key, rate] of Object.entries(rates)) { total += rate; if (roll < total) return key; } return Object.keys(rates).at(-1); };
export const calculateRarity = ({ ticketType, drawsSinceSrPlus, drawsSinceSsr, rarityRoll }) => drawsSinceSsr >= 19 ? 'SSR' : drawsSinceSrPlus >= 9 ? (rollByPercentages({ SR: GACHA_RATES[ticketType].SR, SSR: GACHA_RATES[ticketType].SSR }, rarityRoll) === 'SSR' ? 'SSR' : 'SR') : rollByPercentages(GACHA_RATES[ticketType], rarityRoll);
