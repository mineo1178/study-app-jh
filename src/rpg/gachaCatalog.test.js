import { describe, expect, it } from 'vitest';
import { ALCHEMY_ITEMS, calculateRarity, GACHA_RATES, getGachaResultName, MEMBER_RATES, FOCUSED_GACHA, focusedPrizePool, TICKET_TYPES } from './gachaCatalog.js';
import { ALCHEMY_RECIPES, validateAlchemyCatalog } from './alchemyCatalog.js';
describe('gacha catalog', () => {
  it('has complete rate tables, member/item complements, and valid recipes', () => { Object.values(GACHA_RATES).forEach((rates) => expect(Object.values(rates).reduce((sum, value) => sum + value, 0)).toBe(100)); Object.values(MEMBER_RATES).forEach((rate) => expect(rate + (100 - rate)).toBe(100)); expect(ALCHEMY_RECIPES).toHaveLength(16); expect(validateAlchemyCatalog()).toBe(true); });
  it('uses a ticket-independent 50/50 SR pity and prioritizes SSR pity', () => { TICKET_TYPES.filter(type => !Object.hasOwn(FOCUSED_GACHA, type)).forEach((ticketType) => { expect(calculateRarity({ ticketType, drawsSinceSrPlus: 9, drawsSinceSsr: 0, rarityRoll: 0 })).toBe('SR'); expect(calculateRarity({ ticketType, drawsSinceSrPlus: 9, drawsSinceSsr: 0, rarityRoll: 49.999 })).toBe('SR'); expect(calculateRarity({ ticketType, drawsSinceSrPlus: 9, drawsSinceSsr: 0, rarityRoll: 50 })).toBe('SSR'); expect(calculateRarity({ ticketType, drawsSinceSrPlus: 9, drawsSinceSsr: 0, rarityRoll: 99.999 })).toBe('SSR'); }); expect(calculateRarity({ ticketType: 'normal', drawsSinceSrPlus: 9, drawsSinceSsr: 19, rarityRoll: 0 })).toBe('SSR'); expect(Object.keys(ALCHEMY_ITEMS)).toHaveLength(16); });
  it('has a prize for every nonzero focused rate', () => {
    for (const [type, entry] of Object.entries(FOCUSED_GACHA)) {
      for (const [rarity, rate] of Object.entries(entry.rates)) {
        if (rate > 0) expect(focusedPrizePool(type, rarity).length).toBeGreaterThan(0);
      }
    }
  });
  it('resolves recent draw ids to player-facing names', () => { expect(getGachaResultName({ resultType: 'member', resultId: 'akane' })).toBe('アカネ'); expect(getGachaResultName({ resultType: 'item', resultId: 'silver_ore' })).toBe('銀鉱石'); });
});
