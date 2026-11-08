import { describe, expect, it } from 'vitest';
import { prepareDraw, prepareFragmentExchange, prepareTicketPurchase, validateGachaRates } from './rpgGachaRepository.js';
const now = 100; const base = { gold: 15000, gacha: { ticketBalances: { normal: 1 }, starFragments: 100, drawsSinceSrPlus: 0, drawsSinceSsr: 0, alchemyItems: {}, recentDraws: [] } };
describe('gacha state transitions', () => {
  it('buys a ticket and validates rates', () => { const result = prepareTicketPurchase({ profile: base, ticketType: 'silver', actionId: 'a', now }); expect(result.profile.gold).toBe(3000); expect(result.profile.gacha.ticketBalances.silver).toBe(1); expect(validateGachaRates()).toBe(true); });
  it.each(['weapon', 'armor', 'accessory', 'skill'])('buys and draws the %s ticket without changing mixed pity', ticketType => {
    const profile = { ...base, gacha: { ...base.gacha, drawsSinceSsr: 19 } };
    const bought = prepareTicketPurchase({ profile, ticketType, actionId: 'buy', now });
    const draw = current => prepareDraw({ profile: current, ticketType, actionId: 'draw', now, rolls: { rarityRoll: 0, categoryRoll: 0, poolRoll: 0 } });
    const result = draw(bought.profile);
    expect(result.profile.gacha.ticketBalances).toMatchObject({ normal: 1, [ticketType]: 0 });
    expect(result.profile.gacha.drawsSinceSsr).toBe(19);
    expect(result.ledger.pityApplied).toBe('none');
    if (ticketType === 'skill') expect(result.profile.unlockedPartyMemberIds).toContain(result.ledger.memberId);
    else expect(result.profile.ownedEquipment).toHaveProperty(result.ledger.equipmentId);
    const repeat = draw(prepareTicketPurchase({ profile: { ...result.profile, gold: base.gold }, ticketType, actionId: 'buy2', now }).profile);
    expect(repeat.ledger.duplicate).toBe(true);
    expect(repeat.profile.gacha.starFragments).toBeGreaterThan(result.profile.gacha.starFragments);
    expect(repeat.profile.ownedEquipment).toEqual(result.profile.ownedEquipment);
  });
  it('draws an N item and keeps inventory bounded', () => { const result = prepareDraw({ profile: base, ticketType: 'normal', actionId: 'd', now, rolls: { rarityRoll: 0, categoryRoll: 0, poolRoll: 0 } }); expect(result.ledger).toMatchObject({ type: 'gacha_draw', rarity: 'N', resultType: 'item' }); expect(result.profile.gacha.ticketBalances.normal).toBe(0); expect(result.profile.gacha.recentDraws).toHaveLength(1); });
  it('records explicit none, sr, and ssr pity ledger states', () => { const draw = (gacha, rarityRoll = 0) => prepareDraw({ profile: { ...base, gacha: { ...base.gacha, ...gacha, ticketBalances: { normal: 1 } } }, ticketType: 'normal', actionId: 'd', now, rolls: { rarityRoll, categoryRoll: 0, poolRoll: 0 } }); expect(draw({ drawsSinceSrPlus: 0, drawsSinceSsr: 0 }).ledger.pityApplied).toBe('none'); expect(draw({ drawsSinceSrPlus: 9, drawsSinceSsr: 0 }).ledger.pityApplied).toBe('sr'); expect(draw({ drawsSinceSrPlus: 9, drawsSinceSsr: 19 }, 0).ledger.pityApplied).toBe('ssr'); });
  it('exchanges fragments exactly once at preparation level', () => { const result = prepareFragmentExchange({ profile: base, kind: 'ticket', targetId: 'silver', actionId: 'e', now }); expect(result.profile.gacha.starFragments).toBe(20); expect(result.profile.gacha.ticketBalances.silver).toBe(1); });
});
