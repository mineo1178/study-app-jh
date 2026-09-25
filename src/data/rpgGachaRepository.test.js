import { describe, expect, it } from 'vitest';
import { prepareDraw, prepareFragmentExchange, prepareTicketPurchase, validateGachaRates } from './rpgGachaRepository.js';
const now = 100; const base = { gold: 2000, gacha: { ticketBalances: { normal: 1 }, starFragments: 100, drawsSinceSrPlus: 0, drawsSinceSsr: 0, alchemyItems: {}, recentDraws: [] } };
describe('gacha state transitions', () => {
  it('buys a ticket and validates rates', () => { const result = prepareTicketPurchase({ profile: base, ticketType: 'silver', actionId: 'a', now }); expect(result.profile.gold).toBe(1700); expect(result.profile.gacha.ticketBalances.silver).toBe(1); expect(validateGachaRates()).toBe(true); });
  it('draws an N item and keeps inventory bounded', () => { const result = prepareDraw({ profile: base, ticketType: 'normal', actionId: 'd', now, rolls: { rarityRoll: 0, categoryRoll: 0, poolRoll: 0 } }); expect(result.ledger).toMatchObject({ type: 'gacha_draw', rarity: 'N', resultType: 'item' }); expect(result.profile.gacha.ticketBalances.normal).toBe(0); expect(result.profile.gacha.recentDraws).toHaveLength(1); });
  it('exchanges fragments exactly once at preparation level', () => { const result = prepareFragmentExchange({ profile: base, kind: 'ticket', targetId: 'silver', actionId: 'e', now }); expect(result.profile.gacha.starFragments).toBe(20); expect(result.profile.gacha.ticketBalances.silver).toBe(1); });
});
