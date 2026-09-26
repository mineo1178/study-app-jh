import { describe, expect, it } from 'vitest';
import { getWeeklyBossDefinition, getWeeklyBossWeekId, WEEKLY_BOSSES } from './weeklyBossCatalog.js';
describe('weekly boss calendar', () => {
  it('uses JST ISO weeks across boundaries', () => { expect(getWeeklyBossWeekId(Date.UTC(2026, 8, 27, 14, 59))).toBe('2026-W39'); expect(getWeeklyBossWeekId(Date.UTC(2026, 8, 27, 15))).toBe('2026-W40'); expect(getWeeklyBossWeekId(Date.UTC(2027, 0, 1))).toBe('2026-W53'); expect(getWeeklyBossWeekId(Date.UTC(2027, 0, 4))).toBe('2027-W01'); });
  it('rotates deterministically with snapshots', () => { const bosses = [1, 2, 3, 4].map((week) => getWeeklyBossDefinition(`2026-W${String(week).padStart(2, '0')}`)); expect(new Set(bosses.map((boss) => boss.id)).size).toBe(4); expect(getWeeklyBossDefinition('2026-W01')).toEqual(getWeeklyBossDefinition('2026-W01')); });
  it('advances exactly one boss across 52- and 53-week ISO year boundaries', () => { const next = (weekId) => (WEEKLY_BOSSES.findIndex((boss) => boss.id === getWeeklyBossDefinition(weekId).id) + 1) % 4; expect(getWeeklyBossDefinition('2022-W01').id).toBe(WEEKLY_BOSSES[next('2021-W52')].id); expect(getWeeklyBossDefinition('2027-W01').id).toBe(WEEKLY_BOSSES[next('2026-W53')].id); });
  it('keeps four consecutive weeks unique across a year boundary', () => { const weeks = ['2021-W51', '2021-W52', '2022-W01', '2022-W02']; expect(new Set(weeks.map((weekId) => getWeeklyBossDefinition(weekId).id)).size).toBe(4); });
});
