import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { aggregateMonthlyStudy } from './monthlyStudySelectors.js';
import { deriveStudyAnalytics } from './studyAnalyticsSelectors.js';
import { deriveStudyGuidance } from './studyGuidanceSelectors.js';
import { deriveDashboardSummary } from './dashboardSelectors.js';
import StudyAnalytics from '../components/study/StudyAnalytics.jsx';

const now = Date.parse('2026-01-05T12:00:00+09:00');
const session = (id, date = '2026-01-05', seconds = 900, subjectId = 's_math', extra = {}) => ({ id, date, recordedSeconds: seconds, taskSnapshot: { subjectId }, validation: { status: 'valid' }, ...extra });
const goals = { dailyTargetMinutes: 15, weeklyStudyDays: 1 };
function guidance(sessions = [], studyGoals = goals, timestamp = now, period = 4, definitions) {
  const index = aggregateMonthlyStudy({ sessions, now: timestamp, ready: true, subjectDefinitions: definitions });
  return deriveStudyGuidance(index, deriveStudyAnalytics(index, timestamp, period, studyGoals), studyGoals, definitions);
}
const ids = rows => rows.map(row => row.id);

describe('study guidance goals and priority', () => {
  it.each([[0, true], [899, true], [900, false], [901, false]])('daily goal at %s seconds', (seconds, missing) => {
    const rows = guidance([session('a', undefined, seconds)]);
    expect(ids(rows).includes('daily')).toBe(missing);
    if (seconds === 899) expect(rows[0].title).toBe('あと1分で今日の目標です');
  });
  it.each([[899, true], [900, false], [901, false]])('today plan at %s seconds', (seconds, missing) => {
    expect(ids(guidance([session('a', undefined, seconds)], { ...goals, weeklyPlan: { mon: { s_math: 15 } } })).includes('plan-s_math')).toBe(missing);
  });
  it.each([[899, true], [900, false], [901, false]])('weekly subject goal at %s seconds', (seconds, missing) => {
    expect(ids(guidance([session('a', undefined, seconds)], { ...goals, subjectWeeklyTargets: { s_math: 15 } })).includes('subject-s_math')).toBe(missing);
  });
  it.each([[1, true], [2, false]])('weekly days with %s days', (days, missing) => {
    const sessions = [session('a'), ...(days === 2 ? [session('b', '2026-01-06')] : [])];
    expect(ids(guidance(sessions, { ...goals, weeklyStudyDays: 2 }, Date.parse('2026-01-06T12:00:00+09:00'))).includes('days')).toBe(missing);
  });
  it('caps at three and puts plan before personal time, days and subject goals', () => {
    const settings = { ...goals, weeklyPlan: { mon: { s_math: 15 } }, subjectWeeklyTargets: { s_english: 30 } };
    expect(ids(guidance([], settings))).toEqual(['plan-s_math', 'daily', 'days']);
    expect(ids(guidance([session('today'), session('previous', '2025-12-29')], { ...settings, weeklyPlan: undefined }))).toEqual(['subject-s_english', 'streak', 'subject-fact']);
  });
  it('orders plans by completion ratio then remaining time', () => {
    const settings = { ...goals, weeklyPlan: { mon: { s_math: 60, s_english: 30, s_science: 15 } } };
    expect(ids(guidance([session('m', undefined, 1800), session('e', undefined, 900, 's_english')], settings))).toEqual(['plan-s_english', 'plan-s_math', 'plan-s_science']);
  });
  it('suppresses weekly goals for the same subject as an unmet today plan', () => {
    const settings = { ...goals, weeklyPlan: { mon: { s_math: 30 } }, subjectWeeklyTargets: { s_math: 60, s_english: 30 } };
    expect(ids(guidance([session('today')], settings))).toEqual(['plan-s_math', 'subject-s_english', 'streak']);
    expect(ids(guidance([session('today', undefined, 1800)], settings))).toContain('subject-s_math');
  });
  it('uses existing personal defaults and invents no optional goals or history', () => {
    expect(guidance([], null).map(row => row.title)).toEqual(['あと2時間で今日の目標です', 'あと5日で今週5日の目標です']);
    expect(guidance([], { ...goals, subjectWeeklyTargets: { unknown: 30 }, weeklyPlan: { mon: { unknown: 30 } } })).toHaveLength(2);
  });
  it('shows only factual history after all goals are achieved', () => {
    const rows = guidance([session('today')], { ...goals, weeklyPlan: { mon: { s_math: 15 } }, subjectWeeklyTargets: { s_math: 15 } });
    expect(ids(rows)).toEqual(['streak', 'subject-fact', 'weekday-fact']);
    expect(rows[0].title).toContain('現在1日連続');
    expect(rows.map(row => row.title).join('')).not.toMatch(/悪化|サボ|努力不足|あと/);
  });
});

describe('facts, JST boundaries and effective records', () => {
  it('compares the two immediately completed weeks and ignores current partial totals', () => {
    const rows = guidance([session('older', '2025-12-22', 1800), session('previous', '2025-12-29', 3600), session('today', undefined, 900)]);
    expect(rows[0]).toMatchObject({ id: 'completed-weeks' });
    expect(rows[0].title).toBe('完了した週の学習時間：12/22〜12/28は30分、12/29〜1/4は1時間でした');
    expect(ids(guidance([session('previous', '2025-12-29'), session('today')]))).not.toContain('completed-weeks');
    expect(ids(guidance([session('older', '2025-12-15'), session('previous', '2025-12-29'), session('today')]))).not.toContain('completed-weeks');
  });
  it('keeps top subject scoped to four weeks even when eight weeks are selected', () => {
    const sessions = [session('old', '2025-11-17', 9000, 's_english'), session('today')];
    for (const period of [4, 8]) expect(guidance(sessions, goals, now, period).find(row => row.id === 'subject-fact').title).toContain('数学');
  });
  it('uses the existing current streak through yesterday', () => {
    const rows = guidance([session('one', '2026-01-03'), session('two', '2026-01-04')], { ...goals, dailyTargetMinutes: 15 });
    expect(rows.find(row => row.id === 'streak').title).toContain('現在2日連続');
  });
  it('changes day, plan and ISO week at JST Monday across the year', () => {
    const boundary = Date.parse('2025-12-28T15:00:00Z');
    const settings = { ...goals, weeklyPlan: { mon: { s_english: 15 }, sun: { s_math: 15 } } };
    const sessions = [session('sunday', '2025-12-28')];
    expect(ids(guidance(sessions, settings, boundary - 1))).not.toContain('days');
    expect(ids(guidance(sessions, settings, boundary))).toEqual(['plan-s_english', 'daily', 'days']);
  });
  it.each([{ validation: { status: 'pending_review' } }, { validation: { status: 'invalid' } }, { isStale: true }, { isLive: true }])('excludes ineffective records %j', extra => {
    expect(guidance([session('excluded', undefined, 9000, 's_math', extra)])).toEqual(guidance([]));
  });
  it('recomputes after review with only the confirmed shortened time, including zero', () => {
    const pending = session('review', undefined, 9000, 's_math', { validation: { status: 'pending_review' } });
    expect(ids(guidance([pending]))).toEqual(['daily', 'days']);
    expect(guidance([{ ...pending, recordedSeconds: 600, validation: { status: 'valid' } }])[0].title).toBe('あと5分で今日の目標です');
    expect(guidance([{ ...pending, recordedSeconds: 0, validation: { status: 'valid' } }])[0].title).toBe('あと15分で今日の目標です');
    expect(ids(guidance([{ ...pending, recordedSeconds: 900, validation: { status: 'valid' } }]))).not.toContain('daily');
  });
  it('does not rescan sessions per candidate or alter Dashboard next actions', () => {
    const sessions = [session('a')];
    const settings = { ...goals, weeklyPlan: { mon: { s_math: 30 } } };
    const dashboard = () => deriveDashboardSummary({ sessions, now, ready: true, playerProfile: { studyGoals: settings } });
    const before = dashboard();
    const index = aggregateMonthlyStudy({ sessions, now, ready: true });
    const analytics = deriveStudyAnalytics(index, now, 4, settings);
    const first = deriveStudyGuidance(index, analytics, settings);
    sessions[Symbol.iterator] = () => { throw new Error('unexpected session scan'); };
    expect(deriveStudyGuidance(index, analytics, settings)).toEqual(first);
    delete sessions[Symbol.iterator];
    expect(dashboard()).toEqual(before);
    expect(before.actions[0].id).toBe('plan-s_math');
  });
  it('returns no candidates until loaded', () => {
    expect(deriveStudyGuidance({ status: 'loading' }, { status: 'loading' })).toEqual([]);
  });
});

describe('guidance UI', () => {
  it('renders at most three cards with semantic navigation buttons and wrapping names', () => {
    const html = renderToStaticMarkup(<StudyAnalytics sessions={[]} now={now} ready studyGoals={{ ...goals, weeklyPlan: { mon: { s_math: 15 } } }} onNavigate={() => {}}/>);
    const section = html.split('次の一歩')[1].split('分析する期間')[0];
    expect(section.match(/<li /g)).toHaveLength(3);
    expect(section).toContain('ダッシュボードで確認');
    expect(section).toContain('週間レポートで確認');
    expect(section).toContain('type="button"');
    expect(section).toContain('[overflow-wrap:anywhere]');
    expect(section).not.toMatch(/pending_review|invalid|stale|selector|undefined/);
  });
});
