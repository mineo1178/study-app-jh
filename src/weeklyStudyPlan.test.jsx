import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PLAN_DAYS, normalizeWeeklyStudyPlan as normalize, planWeekdayForDate, deriveTodayPlanProgress, derivePlanSubjectTotals, deriveWeeklyPlanProgress } from './weeklyStudyPlan.js';
import { deriveDashboardSummary } from './data/dashboardSelectors.js';
import { deriveWeeklyReport } from './data/weeklyReportSelectors.js';
import { goalSubjects } from './subjectCatalog.js';
import { deriveAchievements } from './rpg/achievementSelectors.js';
import { calculateStudyReward } from './rpg/rewardCalculator.js';
import { applyRewardToPlayerProfile } from './data/rewardLedgerRepository.js';
import LearningDashboard from './components/study/LearningDashboard.jsx';
import WeeklyReport from './components/study/WeeklyReport.jsx';

const now = Date.parse('2026-01-05T00:00:00+09:00');
const session = (id, seconds, subjectId = 's_math', extra = {}) => ({ id, date: '2026-01-05', recordedSeconds: seconds, taskSnapshot: { subjectId }, validation: { status: 'valid' }, ...extra });
const dashboard = (weeklyPlan, sessions = [], timestamp = now) => deriveDashboardSummary({ now: timestamp, ready: true, sessions, playerProfile: { studyGoals: { weeklyPlan } } });

describe('weekly plan normalization', () => {
  it.each([undefined, null, {}, [], 'bad', 15])('handles missing/non-map %j', value => expect(normalize(value)).toEqual({}));
  it.each([15,360])('accepts %s', minutes => expect(normalize({ mon: { s_math: minutes } })).toEqual({ mon: { s_math: minutes } }));
  it.each([0,-15,375,'15',NaN,Infinity,16,15.5,null])('ignores %s', minutes => expect(normalize({ mon: { s_math: minutes } })).toEqual({}));
  it('handles seven days, multiple subjects and invalid/unknown entries without mutating input', () => {
    const raw = Object.fromEntries(PLAN_DAYS.map(day => [day,{ s_math: 15, s_english: 30, orphan: 45 }]));
    raw.other = { s_math: 30 };
    const before = structuredClone(raw);
    expect(Object.keys(normalize(raw))).toEqual(PLAN_DAYS);
    expect(normalize(raw).mon).toEqual({ s_math: 15, s_english: 30 });
    expect(raw).toEqual(before);
    expect(normalize({ mon: [], tue: 15, wed: null })).toEqual({});
    expect(derivePlanSubjectTotals(raw)).toEqual({ s_math: 105, s_english: 210 });
  });
});

describe('JST plan selection', () => {
  it.each([['2026-01-04T23:59:00+09:00','sun'],['2026-01-05T00:00:00+09:00','mon'],['2026-01-04T15:00:00Z','mon'],['2026-01-04T14:59:00Z','sun']])('selects %s', (date,day) => {
    const plan = { sun: { s_math: 15 }, mon: { s_english: 30 } };
    expect(dashboard(plan,[],Date.parse(date)).todayPlan[0].id).toBe(day === 'sun' ? 's_math' : 's_english');
  });
  it('validates dates including year boundary', () => {
    expect(planWeekdayForDate('2026-01-05')).toBe('mon');
    expect(planWeekdayForDate('2026-01-04')).toBe('sun');
    expect(planWeekdayForDate('2025-12-29')).toBe('mon');
    expect(planWeekdayForDate('2026-02-30')).toBeUndefined();
  });
});

describe('today progress', () => {
  it.each([[0,2700,false],[900,1800,false],[2699,1,false],[2700,0,true],[3600,0,true]])('compares %s seconds exactly', (seconds,remaining,achieved) => {
    const progress = deriveTodayPlanProgress({ mon: { s_math: 45 } },'2026-01-05',new Map([['s_math',{ seconds }]]))[0];
    expect(progress).toMatchObject({ seconds, remaining, achieved });
    expect(progress.barPercent).toBe(Math.min(100,seconds / 2700 * 100));
  });
  it('matches IDs only and excludes invalid, pending, stale, live and duplicate sessions', () => {
    const sessions = [session('math',1200),session('english',2400,'s_english'),session('unknown',600,'orphan'),session('missing',600,undefined),session('invalid',9000,'s_math',{ validation: { status: 'invalid' } }),session('pending',9000,'s_math',{ validation: { status: 'pending_review' } }),session('stale',9000,'s_math',{ isStale: true }),session('live',9000,'s_math',{ isLive: true })];
    sessions[3].taskSnapshot = {};
    sessions.push(sessions[0]);
    const summary = dashboard({ mon: { s_math: 45, s_english: 30 } }, sessions);
    expect(summary.todayPlan).toMatchObject([{ id: 's_math', seconds: 1200, remaining: 1500 },{ id: 's_english', seconds: 2400, achieved: true }]);
    expect(summary.actions.filter(a => a.id.startsWith('plan-'))).toHaveLength(1);
    expect(summary.actions[1].title).toContain('あと25分で今日の予定');
    expect(summary.todaySeconds).toBe(4800);
  });
  it.each([0,1,3,4,18])('caps Dashboard cards and actions for %s subjects', count => {
    const targets = Object.fromEntries(goalSubjects().slice(0,count).map(s => [s.id,45]));
    const summary = dashboard({ mon: targets });
    const html = renderToStaticMarkup(<LearningDashboard summary={summary} onNavigate={() => {}}/>);
    expect(html.match(/の今日の予定達成率/g)?.length || 0).toBe(Math.min(3,count));
    expect(summary.actions.length).toBeLessThanOrEqual(3);
    expect(summary.actions.filter(a => a.id.startsWith('plan-'))).toHaveLength(count ? 1 : 0);
    if (!count) expect(html).toContain('今日は学習プランが設定されていません');
  });
  it('prioritizes ratio, remaining and catalog order for one next action', () => {
    const summary = dashboard({ mon: { s_math: 60, s_japanese: 60, s_social: 30, s_english: 30 } },[session('math',1800),session('japanese',1800,'s_japanese'),session('social',900,'s_social'),session('english',1800,'s_english')]);
    expect(summary.actions.find(a => a.id.startsWith('plan-')).id).toBe('plan-s_social');
    expect(dashboard({ mon: { s_math: 15 } },[session('done',900)]).actions.some(a => a.id.startsWith('plan-'))).toBe(false);
    expect(deriveDashboardSummary({ now, ready: false }).todayPlan).toBeUndefined();
  });
});

describe('weekly comparison', () => {
  it('sums day and subject plans using existing aggregates, without weekly target limits', () => {
    const plan = { mon: { s_math: 45, s_english: 30 }, tue: { s_math: 60 }, sun: { s_math: 360 } };
    const report = deriveWeeklyReport({ now, ready: true, sessions: [session('math',1200),session('english',2400,'s_english'),session('actual',900,'s_science')], studyGoals: { weeklyPlan: plan, subjectWeeklyTargets: { s_math: 15 } } });
    const progress = report.weeks[0].plan;
    expect(progress).toMatchObject({ plannedSeconds: 495 * 60, actualSeconds: 4500 });
    expect(progress.days[0]).toMatchObject({ plannedSeconds: 4500, seconds: 4500, planAchieved: true });
    expect(progress.days[1]).toMatchObject({ plannedSeconds: 3600, seconds: 0, future: true });
    expect(progress.days[2].plannedSeconds).toBe(0);
    expect(progress.subjects.map(s => [s.id,s.plannedSeconds,s.seconds])).toEqual([['s_math',465*60,1200],['s_science',0,900],['s_english',1800,2400]]);
    expect(report.weeks.slice(1).every(w => w.plan === null)).toBe(true);
    const html = renderToStaticMarkup(<WeeklyReport ready now={now} sessions={[]} studyGoals={{ weeklyPlan: plan }}/>);
    expect(html).toContain('週間プラン vs 実績');
    expect(html).toContain('週間予定 8時間15分');
  });
  it.each([[0,false],[899,false],[900,true],[1200,true]])('compares day totals at %s seconds', (seconds,achieved) => {
    const progress = deriveWeeklyPlanProgress({ mon: { s_math: 15 } },[{ date: '2026-01-05',seconds }],new Map());
    expect(progress.days[0].planAchieved).toBe(achieved);
    expect(progress.actualSeconds).toBe(seconds);
  });
  it('supports actual-only and no-plan weeks', () => {
    const report = deriveWeeklyReport({ now, ready: true, sessions: [session('a',900)] });
    expect(report.weeks[0].plan).toMatchObject({ plannedSeconds: 0, actualSeconds: 900 });
    expect(report.weeks[0].plan.days.every(d => !d.planAchieved)).toBe(true);
  });
});

it('preserves achievements, reward calculation and RPG values; does not mutate session/Timer state', () => {
  const sessions = [session('math',7140)];
  const before = structuredClone(sessions);
  const plain = { totalExp: 900, gold: 30, battleEnergy: 5, studyGoals: {} };
  const profile = { ...plain, studyGoals: { weeklyPlan: { mon: { s_math: 15 } } } };
  expect(deriveAchievements({ sessions, playerProfile: profile })).toEqual(deriveAchievements({ sessions, playerProfile: plain }));
  const reward = calculateStudyReward(sessions[0]);
  expect({ ...applyRewardToPlayerProfile(profile,reward,now), studyGoals: {} }).toEqual(applyRewardToPlayerProfile(plain,reward,now));
  dashboard(profile.studyGoals.weeklyPlan,sessions);
  deriveWeeklyReport({ now, ready: true, sessions, studyGoals: profile.studyGoals });
  expect(sessions).toEqual(before);
});
