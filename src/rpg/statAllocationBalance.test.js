import { describe, expect, it } from 'vitest';
import { measureStatAllocationBalance } from '../../scripts/measureStatAllocationBalance.js';
import { BALANCE_PLAYERS, BALANCE_SCENARIOS, simulateBattle } from '../../scripts/simulateBattleBalance.js';
const rows = measureStatAllocationBalance();
describe('allocation balance acceptance', () => {
  it('measures every required level, allocation, boss and healer condition', () => {
    expect(rows).toHaveLength(180);
    for (const level of [7,12,20]) for (const allocation of ['hp','mp','balanced']) expect(rows.filter(row => row.level === level && row.allocation === allocation)).toHaveLength(18);
    expect(rows.every(row => row.after.status !== 'active' && row.after.actions < 300)).toBe(true);
  });
  it('retains all four Weekly wins at Lv12 for every allocation and healer choice', () => {
    const weekly = rows.filter(row => row.level === 12 && row.target.startsWith('weekly_'));
    expect(weekly).toHaveLength(24);
    for (const row of weekly) { expect(row.before.status).toBe('won'); expect(row.after.status).toBe('won'); }
  });
  it('keeps unallocated beginners able to beat early normal enemies', () => {
    for (const id of ['campaign-slime','campaign-goblin']) expect(simulateBattle(BALANCE_PLAYERS.beginner, BALANCE_SCENARIOS.find(row => row.id === id), 'strategy', { mpRules: true }).status).toBe('won');
  });
  it('keeps HP-heavy builds vulnerable and MP-heavy builds bounded by skill uses', () => {
    const hpRows = rows.filter(row => row.allocation === 'hp');
    expect(hpRows.some(row => row.after.status === 'lost')).toBe(true);
    expect(hpRows.every(row => row.after.damage > 0)).toBe(true);
    expect(rows.every(row => row.after.mpRemaining >= 0 && row.after.mpRemaining <= row.after.maxMp && row.after.heroSkillUses <= 10)).toBe(true);
    const hp = rows.find(row => row.level === 7 && row.allocation === 'hp' && row.target === 'weekly_ignis' && row.healer);
    const mp = rows.find(row => row.level === 7 && row.allocation === 'mp' && row.target === 'weekly_ignis' && row.healer);
    expect(mp.after.heroSkillUses).toBeGreaterThan(hp.after.heroSkillUses);
  });
  it('keeps unallocated normal-attack combat identical to the pre-MP policy', () => {
    for (const profile of Object.values(BALANCE_PLAYERS)) for (const scenario of BALANCE_SCENARIOS) {
      const before = simulateBattle(profile, scenario, 'normal');
      const after = simulateBattle(profile, scenario, 'normal', { mpRules: true });
      const { mpRemaining, maxMp, heroSkillUses, ...combat } = after;
      expect(combat).toEqual(before); expect(mpRemaining).toBe(maxMp); expect(heroSkillUses).toBe(0);
    }
  });
});
