import { describe, expect, it } from 'vitest';
import { ALCHEMY_ITEMS, calculateRarity, GACHA_RATES, MEMBER_RATES } from './gachaCatalog.js';
import { ALCHEMY_RECIPES, validateAlchemyCatalog } from './alchemyCatalog.js';
describe('gacha catalog', () => {
  it('has complete rate tables and valid recipes', () => { Object.values(GACHA_RATES).forEach((rates) => expect(Object.values(rates).reduce((sum, value) => sum + value, 0)).toBe(100)); Object.values(MEMBER_RATES).forEach((rate) => expect(rate).toBeGreaterThanOrEqual(0)); expect(ALCHEMY_RECIPES).toHaveLength(12); expect(validateAlchemyCatalog()).toBe(true); });
  it('prioritizes SSR pity then SR pity', () => { expect(calculateRarity({ ticketType: 'normal', drawsSinceSrPlus: 9, drawsSinceSsr: 19, rarityRoll: 99 })).toBe('SSR'); expect(['SR', 'SSR']).toContain(calculateRarity({ ticketType: 'normal', drawsSinceSrPlus: 9, drawsSinceSsr: 0, rarityRoll: 0 })); expect(Object.keys(ALCHEMY_ITEMS)).toHaveLength(16); });
});
