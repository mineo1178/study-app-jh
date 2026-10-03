import { describe, expect, it } from 'vitest';
import { deriveRewardProgress, studySecondsForGold } from './rewardProgress.js';
import { TICKET_PRICES } from './gachaCatalog.js';
import { EQUIPMENT_CATALOG } from './equipmentCatalog.js';
import { calculateStudyReward } from './rewardCalculator.js';

describe('confirmed reward progress', () => {
  const price = TICKET_PRICES.normal;
  it.each([0, price - 1, price, price + 1])('uses the ticket price boundary with %s GOLD', (gold) => {
    const goal = deriveRewardProgress({ gold }).goals[0];
    expect(goal.requirements[0]).toMatchObject({ current: gold, target: price, remaining: Math.max(0, price - gold), unit: 'GOLD' });
    expect(goal.available).toBe(gold >= price);
    expect(goal.progress).toBe(Math.min(1, gold / price));
  });
  it('inverts the existing study reward calculator at the exact boundary', () => {
    const seconds = studySecondsForGold(15);
    expect(calculateStudyReward({ recordedSeconds: seconds }).gold).toBe(15);
    expect(calculateStudyReward({ recordedSeconds: seconds - 1 }).gold).toBe(14);
  });
  it('handles zero and unsupported extreme gold without an unbounded search', () => {
    expect(studySecondsForGold(0)).toBe(0);
    expect(studySecondsForGold(Number.MAX_VALUE)).toBeNull();
  });
  it('shows an existing ticket as available without needing GOLD', () => {
    const goal = deriveRewardProgress({ gold: 0, gacha: { ticketBalances: { silver: 1 } } }).goals[0];
    expect(goal).toMatchObject({ hasTicket: true, available: true, progress: 1, name: 'SILVER ガチャ' });
  });
  it('uses existing equipment costs and all material conditions', () => {
    const item = EQUIPMENT_CATALOG.iron_sword;
    const ready = { gold: item.cost.gold, materials: item.cost.materials };
    const goal = deriveRewardProgress(ready).goals[1];
    expect(goal).toMatchObject({ id: item.id, available: true, progress: 1 });
    expect(deriveRewardProgress({ ...ready, materials: { iron: 4 } }).goals[1].available).toBe(false);
  });
  it('selects the next unowned shop equipment, with no goal after all are owned', () => {
    const ownedEquipment = Object.fromEntries(Object.keys(EQUIPMENT_CATALOG).map((id) => [id, {}]));
    expect(deriveRewardProgress({ ownedEquipment }).goals).toHaveLength(1);
    delete ownedEquipment.history_charm;
    expect(deriveRewardProgress({ ownedEquipment }).goals[1].id).toBe('history_charm');
  });
  it('handles loading and missing nested state', () => {
    expect(deriveRewardProgress(null)).toEqual({ status: 'loading', goals: [] });
    expect(deriveRewardProgress({}).goals[0].requirements[0].current).toBe(0);
  });
  it.each([NaN, Infinity, -20, 'bad'])('sanitizes invalid balances %s', (gold) => {
    const result = deriveRewardProgress({ gold, materials: { iron: gold } });
    expect(JSON.stringify(result)).not.toContain('null');
    expect(result.goals[0].requirements[0].current).toBe(0);
  });
  it('does not count live, invalid or unclaimed rewards as confirmed currency', () => {
    const profile = { gold: 0, liveTimer: { recordedSeconds: 7200 }, sessions: [{ recordedSeconds: 7200, validation: { status: 'invalid' } }], unclaimedQuestGold: 120 };
    expect(deriveRewardProgress(profile).goals[0].available).toBe(false);
    expect(deriveRewardProgress(profile).goals[0].remainingMinutes).toBe(price);
  });
  it('keeps locked purchases unavailable while corrections are pending', () => {
    const result = deriveRewardProgress({ gold: price, gacha: { ticketBalances: { normal: 1 } } }, { blocked: true });
    expect(result.status).toBe('blocked'); expect(result.goals[0].available).toBe(false);
  });
});
