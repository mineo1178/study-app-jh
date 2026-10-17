import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { changedStudyGoals, derivePlanChanges, derivePlanReview, planReviewTotals } from './studyPlanReviewSelectors.js';
import { deriveWeeklyReport } from './weeklyReportSelectors.js';
import { deriveDashboardSummary } from './dashboardSelectors.js';
import { deriveStudyAnalytics } from './studyAnalyticsSelectors.js';
import { aggregateMonthlyStudy } from './monthlyStudySelectors.js';
import { deriveStudyGuidance } from './studyGuidanceSelectors.js';
import StudyPlanReview from '../components/study/StudyPlanReview.jsx';

const goals = { dailyTargetMinutes: 120, weeklyStudyDays: 1, subjectWeeklyTargets: { s_math: 90 }, weeklyPlan: { mon: { s_math: 90 } } };
const review = extra => derivePlanReview({ ...goals, ...extra });
const now = Date.parse('2026-01-04T15:00:00Z');
const record = (id, seconds, extra = {}) => ({ id, date: '2026-01-04', recordedSeconds: seconds, taskSnapshot: { subjectId: 's_math' }, validation: { status: 'valid' }, ...extra });

describe('current plan review candidates', () => {
  it('prioritizes missing plan without choosing a weekday or generating settings', () => {
    const value = review({ weeklyPlan: {} });
    expect(value.suggestions[0]).toMatchObject({ id: 'empty' });
    expect(value.suggestions[0]).not.toHaveProperty('day');
    expect(value.totals.minutes).toBe(0);
  });
  it('explains missing study days', () => expect(review({ weeklyStudyDays: 5 }).suggestions[0].text).toContain('5日ですが、予定を設定しているのは1日'));
  it('emits one candidate per subject using total minutes across weekdays', () => {
    const value = review({ weeklyPlan: { mon: { s_math: 15 }, wed: { s_math: 30 } } });
    expect(value.suggestions).toEqual([{ id: 'subject-s_math', subjectId: 's_math', text: '中学校・数学は週間目標より予定が45分少なく設定されています。' }]);
  });
  it('allows an overloaded day while explaining the difference', () => expect(review({ weeklyPlan: { mon: { s_math: 180 } } }).suggestions[0]).toMatchObject({ id: 'day-mon', day: 'mon', text: expect.stringContaining('60分多く') }));
  it.each([90, 105, 120])('has no shortage when the subject target is met with %s minutes', minutes => expect(review({ weeklyPlan: { mon: { s_math: minutes } } }).suggestions).toEqual([]));
  it('does not invent targets for planned subjects without a target', () => expect(review({ subjectWeeklyTargets: {}, weeklyPlan: { mon: { s_english: 30 } } }).suggestions).toEqual([]));
  it('caps at three, ordering days then subjects then daily load, without duplicates', () => {
    const value = review({ weeklyStudyDays: 5, subjectWeeklyTargets: { s_math: 600, s_english: 90, s_science: 90 }, weeklyPlan: { mon: { s_math: 180 } } });
    expect(value.suggestions.map(s => s.id)).toEqual(['days', 'subject-s_math', 'subject-s_science']);
    expect(new Set(value.suggestions.map(s => s.id)).size).toBe(3);
    expect(review({ weeklyPlan: {}, weeklyStudyDays: 7 }).suggestions.map(s => s.id)).toEqual(['empty', 'subject-s_math']);
  });
});

describe('plan editing differences and preservation', () => {
  it('lists additions, removals, changed weekdays and subjects, and totals', () => {
    const diff = derivePlanChanges({ mon: { s_math: 30 }, tue: { s_english: 15 } }, { mon: { s_math: 45 }, wed: { s_english: 30 } });
    expect(diff.changes.map(c => [c.day, c.subjectId, c.from, c.to, c.delta])).toEqual([['mon','s_math',30,45,15],['tue','s_english',15,0,-15],['wed','s_english',0,30,30]]);
    expect(diff.current.minutes).toBe(45); expect(diff.next.minutes).toBe(75);
    expect(diff.next.days[2].minutes).toBe(30);
    expect(diff.next.subjects).toEqual({ s_math: 45, s_english: 30 });
  });
  it('uses the existing 15-minute range and handles zero as removal', () => {
    expect(planReviewTotals({ mon: { s_math: 360 }, tue: { s_math: 0, s_english: 16 }, wed: { s_math: 375 } }).minutes).toBe(360);
    expect(derivePlanChanges({ mon: { s_math: 15 } }, { mon: { s_math: 0 } }).changes[0].to).toBe(0);
  });
  it('omits unchanged basic goals and subject targets in plan-only edits', () => {
    const before = { ...goals, future: true, subjectWeeklyTargets: { s_math: 90, orphan: 50 }, weeklyPlan: { mon: { s_math: 90, orphan: 50 }, future: { s_math: 15 } } };
    const copy = structuredClone(before);
    expect(changedStudyGoals(before, { ...before, weeklyPlan: { mon: { s_math: 105 } } })).toEqual({ weeklyPlan: { mon: { s_math: 105 } } });
    expect(before).toEqual(copy);
    expect(changedStudyGoals(before, before)).toEqual({});
    expect(changedStudyGoals(before, { ...before, weeklyPlan: { mon: { s_math: 90, s_english: 0 } } })).toEqual({});
  });
  it('changes only the basic field that was edited', () => expect(changedStudyGoals(goals, { ...goals, weeklyStudyDays: 3 })).toEqual({ weeklyStudyDays: 3 }));
});

describe('completed week reuse and current settings separation', () => {
  it('reuses filtered, deduplicated completed-week aggregates and reflects confirmations', () => {
    const sessions = [record('valid', 900), record('duplicate', 900, { timerId: 'same' }), record('duplicate2', 900, { timerId: 'same' }), record('pending', 999, { validation: { status: 'pending_review' } }), record('invalid', 999, { validation: { status: 'invalid' } }), record('stale', 999, { isStale: true }), record('live', 999, { isLive: true }), record('current', 999, { date: '2026-01-05' })];
    const completed = rows => deriveWeeklyReport({ now, ready: true, sessions: rows }).weeks[1];
    expect(completed(sessions)).toMatchObject({ seconds: 1800, count: 2, learningDays: 1, plan: null });
    expect(completed([record('valid', 300)])).toMatchObject({ seconds: 300 });
    expect(completed([record('valid', 0)])).toMatchObject({ seconds: 0 });
  });
  it.each([
    ['2026-01-04T14:59:59Z','2025-12-22'],
    ['2026-01-04T15:00:00Z','2025-12-29'],
    ['2026-02-01T15:00:00Z','2026-01-26'],
    ['2021-01-03T15:00:00Z','2020-12-28'],
  ])('chooses the completed week at %s using JST', (timestamp, monday) => expect(deriveWeeklyReport({ now: Date.parse(timestamp), ready: true }).weeks[1].days[0].date).toBe(monday));
  it('shows actual history separately from current settings and handles no suggestions or history', () => {
    const completedWeek = deriveWeeklyReport({ now, ready: true }).weeks[1];
    const html = renderToStaticMarkup(<StudyPlanReview completedWeek={completedWeek} studyGoals={goals}/>);
    expect(html).toContain('先週の確定した学習記録はありません');
    expect(html).toContain('大きな不整合はありません');
    expect(html).toContain('先週の予定達成率は判定しません');
    expect(html).toContain('毎週繰り返す予定');
    expect(html).toContain('成果を保証するものではありません');
  });
  it('updates existing Dashboard and report from saved settings without changing actuals', () => {
    const updated = { ...goals, weeklyPlan: { mon: { s_math: 105 } } };
    const dashboard = studyGoals => deriveDashboardSummary({ now, ready: true, playerProfile: { studyGoals } });
    expect(dashboard(goals).todayPlan[0].targetSeconds).toBe(90 * 60);
    expect(dashboard(updated).todayPlan[0].targetSeconds).toBe(105 * 60);
    const report = deriveWeeklyReport({ now, ready: true, studyGoals: updated });
    expect(report.weeks[0].plan.plannedSeconds).toBe(105 * 60);
    expect(report.weeks[1].plan).toBeNull();
    expect(report.weeks[0].seconds).toBe(0);
    const index = aggregateMonthlyStudy({ now, ready: true });
    const guidance = studyGoals => deriveStudyGuidance(index, deriveStudyAnalytics(index, now, 4, studyGoals), studyGoals);
    expect(guidance(goals)[0].title).toContain('あと1時間30分');
    expect(guidance(updated)[0].title).toContain('あと1時間45分');
  });
});
