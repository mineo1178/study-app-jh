import { describe, expect, it } from 'vitest';
import { deriveWeeklyReport, moveReportWeek, reportDuration } from './weeklyReportSelectors.js';
import { deriveDashboardSummary } from './dashboardSelectors.js';
import { deriveAchievements, deriveWeeklyGoalProgress } from '../rpg/achievementSelectors.js';
import { DAILY_TARGET_SECONDS } from '../studyTargets.js';
import { getWeeklyBossWeekId } from '../rpg/weeklyBossCatalog.js';

const now = Date.parse('2026-01-04T23:59:59+09:00');
const subjectDefinitions = { school: [{ id: 'math', label: '数学', hex: '#123456' }, { id: 'english', label: '英語' }, { id: 'science', label: '理科' }] };
let sequence = 0;
const record = (date = '2026-01-04', recordedSeconds = 60, subjectId = 'math', extra = {}) => ({ id: `record-${sequence++}`, date, recordedSeconds, taskSnapshot: { subjectId }, validation: { status: 'valid' }, ...extra });
const derive = extra => deriveWeeklyReport({ now, ready: true, subjectDefinitions, ...extra });
const selected = sessions => derive({ sessions }).weeks[0];

describe('weekly aggregation', () => {
  it('does not show zero metrics while loading', () => {
    expect(deriveWeeklyReport()).toEqual({ status: 'loading', weeks: [] });
    expect(derive({ ready: false }).weeks).toEqual([]);
  });
  it('provides all four empty weeks and seven days per week', () => {
    const report = derive();
    expect(report.weeks).toHaveLength(4);
    for (const week of report.weeks) {
      expect(week.days).toHaveLength(7);
      expect(week.days.map(day => day.seconds)).toEqual([0,0,0,0,0,0,0]);
      expect(week.subjects).toEqual([]); expect(week.count).toBe(0);
      expect(week.comparison).toBeNull(); expect(week.highlights).toEqual([]);
    }
  });
  it('aggregates one record, multiple days and multiple subjects', () => {
    expect(selected([record()])).toMatchObject({ seconds: 60, count: 1, learningDays: 1, subjectCount: 1 });
    expect(selected([record('2025-12-29', 1800), record('2026-01-04', 3600, 'english'), record('2026-01-04', 60)])).toMatchObject({ seconds: 5460, count: 3, learningDays: 2, subjectCount: 2 });
  });
  it.each(['invalid', 'pending_review'])('excludes %s records', status => {
    expect(selected([record(undefined, 900, 'math', { validation: { status } })]).count).toBe(0);
  });
  it.each([{ isStale: true }, { isLive: true }])('excludes stale/live records: %j', extra => {
    expect(selected([record(undefined, 900, 'math', extra)]).seconds).toBe(0);
  });
  it('uses recorded study duration rather than wall-clock pause intervals', () => {
    expect(selected([record(undefined, 120, 'math', { segments: [{ startedAt: 1, endedAt: 60001 }, { startedAt: 3600001, endedAt: 3660001 }] })]).seconds).toBe(120);
  });
  it('deduplicates timer IDs consistently with dashboard', () => {
    const sessions = [record(undefined, 60, 'math', { timerId: 'same' }), record(undefined, 60, 'math', { timerId: 'same' })];
    expect(selected(sessions).count).toBe(1);
    expect(selected(sessions).seconds).toBe(deriveDashboardSummary({ sessions, now, ready: true }).weekSeconds);
  });
  it('ignores malformed date and nonfinite seconds and preserves selector defaults', () => {
    expect(selected([record('bad'), record('2026-02-30'), record(undefined, NaN), record(undefined, Infinity), record(undefined, -1)]).count).toBe(0);
    expect(selected([record(undefined, 60, 'math', { validation: {} })]).count).toBe(1);
    expect(reportDuration(Infinity)).toBe('0分');
  });
});

describe('comparison and history', () => {
  it.each([[600,300,300], [300,600,-300], [300,300,0]])('compares time %s versus %s', (current, previous, difference) => {
    const week = selected([record(undefined,current), record('2025-12-28',previous)]);
    expect(week.comparison.seconds).toBe(difference);
  });
  it('compares days, subjects and records as factual differences', () => {
    const week = selected([record('2025-12-29'), record(undefined,60,'english'), record('2025-12-28')]);
    expect(week.comparison).toEqual({ seconds: 60, learningDays: 1, subjectCount: 1, count: 1 });
  });
  it('suppresses differences for no previous records, including excluded records', () => {
    expect(selected([record()]).comparison).toBeNull();
    expect(selected([record(),record('2025-12-28',100,'math',{validation:{status:'invalid'}})]).comparison).toBeNull();
  });
  it('distinguishes a zero-second valid record from no records', () => {
    const week = selected([record(),record('2025-12-28',0)]);
    expect(week.previous.count).toBe(1); expect(week.comparison.seconds).toBe(60);
  });
  it('aggregates four weeks once and retains fifth-week comparison', () => {
    const report = derive({sessions:['2026-01-04','2025-12-28','2025-12-21','2025-12-14','2025-12-07'].map((date,index)=>record(date,60*(index+1)))});
    expect(report.weeks.map(w=>w.seconds)).toEqual([60,120,180,240]);
    expect(report.weeks[3].previous.seconds).toBe(300);
  });
  it('fills missing weeks with empty data without shifting history', () => {
    expect(derive({sessions:[record(),record('2025-12-14',180)]}).weeks.map(w=>w.seconds)).toEqual([60,0,0,180]);
  });
});

describe('daily goals, subjects and hints', () => {
  it.each([[7199,false], [7200,true], [7201,true]])('daily goal boundary %s seconds', (seconds, achieved) => {
    expect(selected([record(undefined,seconds)]).days[6].achieved).toBe(achieved);
  });
  it('reuses the existing daily target', () => {
    const week = selected([record(undefined, DAILY_TARGET_SECONDS - 45*60)]);
    expect(week.hints.at(-1).text).toContain('あと45分');
    expect(selected([record(undefined,DAILY_TARGET_SECONDS)]).hints.at(-1).text).toContain('目標達成');
  });
  it('calculates subject percentages and groups unknown or missing subjects as other', () => {
    const week = selected([record(undefined,180,'math'),record(undefined,60,'english'),record(undefined,60,'unknown'),record(undefined,60,null)]);
    expect(week.subjects.map(s=>[s.name,s.seconds])).toEqual([['数学',180],['その他',120],['英語',60]]);
    expect(week.subjects[0].percent).toBe(50);
    expect(week.subjects[1].percent).toBeCloseTo(100/3);
    expect(week.subjects[2].percent).toBeCloseTo(100/6);
    expect(week.subjectCount).toBe(2);
  });
  it('handles zero seconds without NaN or Infinity', () => {
    expect(selected([record(undefined,0)]).subjects[0].percent).toBe(0);
  });
  it('matches dashboard and achievement goal conditions and caps unique hints at three', () => {
    const sessions = ['2025-12-29','2025-12-30','2025-12-31','2026-01-01'].map((date,index)=>record(date,60,index % 2 ? 'math' : 'english'));
    const week = selected(sessions);
    expect(week.hints.map(h=>h.text).slice(0,2)).toEqual(['あと1日で週5日学習','あと1教科で週3教科']);
    const goals = deriveWeeklyGoalProgress({days:week.learningDays,subjects:week.subjectCount});
    const achievements = deriveAchievements({sessions});
    for (const goal of goals) expect(achievements.find(a=>a.id===goal.id)).toEqual(goal);
    const current = selected([...sessions,record()]);
    expect(current.hints).toHaveLength(3); expect(new Set(current.hints.map(h=>h.id)).size).toBe(3);
  });
  it('uses achieved labels instead of zero remaining', () => {
    const sessions = ['2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-04'].map((date,index)=>record(date,7200,['math','english','science'][index % 3]));
    const week = selected(sessions);
    expect(week.hints[0].text).toBe('週5日学習達成'); expect(week.hints[1].text).toBe('週3教科達成');
    expect(week.hints.map(h=>h.text).join()).not.toMatch(/あと0/);
    expect(week.highlights.length).toBeLessThanOrEqual(3);
  });
});

describe('JST and ISO week navigation', () => {
  it('changes week at Monday midnight JST, not UTC midnight', () => {
    const sessions = [record('2026-01-04'), record('2026-01-05',120)];
    expect(derive({sessions,now:Date.parse('2026-01-04T14:59:59Z')}).weeks[0].seconds).toBe(60);
    const monday = derive({sessions,now:Date.parse('2026-01-04T15:00:00Z')});
    expect(monday.weeks[0].seconds).toBe(120); expect(monday.weeks[1].seconds).toBe(60);
  });
  it('uses continuous ISO weeks over the last December and first January weeks', () => {
    const report = derive();
    expect(report.weeks[0].id).toBe('2026-W01'); expect(report.weeks[1].id).toBe('2025-W52');
    expect(report.weeks[0].days.map(d=>d.date)).toEqual(['2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02','2026-01-03','2026-01-04']);
    for (const week of report.weeks) expect(week.id).toBe(getWeeklyBossWeekId(week.startAt));
  });
  it('handles ISO week 53 and previous-year comparisons', () => {
    const report = derive({now:Date.parse('2021-01-04T00:00:00+09:00'),sessions:[record('2021-01-04',120),record('2020-12-31',60)]});
    expect(report.weeks.map(w=>w.id).slice(0,2)).toEqual(['2021-W01','2020-W53']);
    expect(report.weeks[0].comparison.seconds).toBe(60);
  });
  it('excludes future dates and never exposes future selectable weeks', () => {
    expect(derive({sessions:[record('2026-01-05',60)]}).weeks.every(w=>w.count===0)).toBe(true);
    expect(derive({now:Date.parse('2025-12-29T00:00:00+09:00'),sessions:[record('2026-01-04',60)]}).weeks[0].count).toBe(0);
    expect(moveReportWeek(0,-1)).toBe(0); expect(moveReportWeek(0,1)).toBe(1);
    expect(moveReportWeek(1,-1)).toBe(0); expect(moveReportWeek(3,1)).toBe(3);
  });
});
