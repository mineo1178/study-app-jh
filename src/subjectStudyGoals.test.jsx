import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { goalSubjects } from './subjectCatalog.js';
import { normalizeSubjectWeeklyTargets as normalize, deriveSubjectGoalProgress as progress, prioritizeSubjectGoals } from './subjectStudyGoals.js';
import { deriveDashboardSummary } from './data/dashboardSelectors.js';
import { deriveWeeklyReport } from './data/weeklyReportSelectors.js';
import { deriveAchievements } from './rpg/achievementSelectors.js';
import { calculateStudyReward } from './rpg/rewardCalculator.js';
import { applyRewardToPlayerProfile } from './data/rewardLedgerRepository.js';
import LearningDashboard from './components/study/LearningDashboard.jsx';
import WeeklyReport from './components/study/WeeklyReport.jsx';

const now = Date.parse('2026-01-04T12:00:00+09:00');
const session = (id, date, minutes, subjectId = 's_math', extra = {}) => ({ id, date, recordedSeconds: minutes * 60, taskSnapshot: { subjectId }, validation: { status: 'valid' }, ...extra });
const dashboard = (targets, sessions = [], extra = {}) => deriveDashboardSummary({ now, ready: true, sessions, playerProfile: { studyGoals: { subjectWeeklyTargets: targets } }, ...extra });
const report = (targets, sessions = [], extra = {}) => deriveWeeklyReport({ now, ready: true, sessions, studyGoals: { subjectWeeklyTargets: targets }, ...extra });

describe('subject goal normalization', () => {
  it.each([undefined, {}, null, [], 'bad', 30])('treats %j as no subject goals', value => expect(normalize(value)).toEqual({}));
  it.each([15,600])('accepts %s minutes', value => expect(normalize({ s_math: value })).toEqual({ s_math: value }));
  it.each([0,-15,615,'180',null,NaN,Infinity,16,15.5])('ignores invalid/no goal %s', value => expect(normalize({ s_math: value })).toEqual({}));
  it('keeps multiple known IDs separate and never converts unknown entries', () => {
    const raw = { s_math: 180, j_math: 240, orphan: 300, unknown: 120 };
    expect(normalize(raw)).toEqual({ s_math: 180, j_math: 240 });
    expect(raw.orphan).toBe(300);
    expect(goalSubjects()).toHaveLength(18);
    expect(goalSubjects({ old: [{ id: 'deprecated', label: 'old', deprecated: true }] })).toEqual([]);
  });
});
describe('subject goal progress and aggregation', () => {
  it.each([[0,180,0,false],[90,90,50,false],[179,1,99,false],[180,0,100,true],[210,0,117,true]])('180 minute target at %s', (actual, remaining, percent, achieved) => {
    const result = progress({ s_math: 180 }, new Map([['s_math',{ seconds: actual * 60 }]]))[0];
    expect(result).toMatchObject({ seconds: actual * 60, remaining: remaining * 60, percent, achieved });
    expect(result.barPercent).toBeLessThanOrEqual(100);
  });
  it('aggregates multiple days/sessions once, uses recorded seconds excluding pauses, and matches both selectors', () => {
    const sessions = [session('a','2025-12-29',60), session('b','2026-01-04',30,'s_math',{ segments: [{ startedAt: 1, endedAt: 99999999 }] }), session('c','2026-01-04',90,'s_english'), session('d','2026-01-04',600,'s_math',{ validation: { status: 'invalid' } }), session('e','2026-01-04',600,'s_math',{ validation: { status: 'pending_review' } }), session('f','2026-01-04',600,'s_math',{ isStale: true }), session('g','2026-01-04',600,'s_math',{ isLive: true })];
    sessions.push(sessions[0]);
    const targets = { s_math: 180, s_english: 240 };
    const weekly = report(targets,sessions).weeks[0];
    expect(weekly.subjectGoals.map(goal => [goal.id,goal.seconds])).toEqual([['s_math',5400],['s_english',5400]]);
    expect(dashboard(targets,sessions).subjectGoals).toEqual(prioritizeSubjectGoals(weekly.subjectGoals));
    expect(weekly.subjects.find(s=>s.id==='s_math').seconds).toBe(5400);
  });
  it('uses current targets for past weeks and ignores unknown subject goals', () => {
    const weeks = report({ s_math: 180, orphan: 600 },[session('old','2025-12-28',210)]).weeks;
    expect(weeks[0].subjectGoals[0]).toMatchObject({ seconds: 0, remaining: 10800 });
    expect(weeks[1].subjectGoals[0]).toMatchObject({ seconds: 12600, targetSeconds: 10800, achieved: true, percent: 117, barPercent: 100 });
    expect(weeks.every(w=>w.subjectGoals.length===1)).toBe(true);
    expect(report({}).weeks.every(w=>!w.subjectGoals.length)).toBe(true);
  });
});
describe('subject goals in Dashboard and Weekly Report', () => {
  it.each([0,1,3,4,6])('shows at most three of %s configured goals and one subject action', count => {
    const targets = Object.fromEntries(goalSubjects().slice(0,count).map(subject=>[subject.id,180]));
    const summary = dashboard(targets);
    const html = renderToStaticMarkup(<LearningDashboard summary={summary} onNavigate={()=>{}}/>);
    expect(html.match(/の週間目標達成率/g)?.length || 0).toBe(Math.min(3,count));
    expect(summary.actions.filter(a=>a.id.startsWith('subject-goal-'))).toHaveLength(count ? 1 : 0);
    expect(summary.actions.length).toBeLessThanOrEqual(3);
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('chooses highest completion ratio, then smallest remaining time, then catalog order; excludes achieved actions', () => {
    const targets = { s_math: 180, s_japanese: 180, s_social: 90, s_science: 180 };
    const summary = dashboard(targets,[session('m','2026-01-04',90),session('j','2026-01-04',90,'s_japanese'),session('s','2026-01-04',45,'s_social'),session('c','2026-01-04',180,'s_science')]);
    expect(summary.subjectGoals.map(g=>g.id)).toEqual(['s_social','s_math','s_japanese','s_science']);
    expect(summary.actions.find(a=>a.id.startsWith('subject-goal-')).id).toBe('subject-goal-s_social');
    expect(dashboard({ s_math: 180 },[session('m','2026-01-04',180)]).actions.some(a=>a.id.startsWith('subject-goal-'))).toBe(false);
  });
  it('preserves today/weekly/reward order while limiting subject actions to one', () => {
    const rewardProgress = { status: 'ready', goals: [{ id: 'gacha', available: true, name: 'ガチャ', requirements: [] }] };
    const targets = { s_math: 600, s_english: 600, s_science: 600 };
    const sessions = [session('m','2026-01-04',120),session('e','2026-01-04',60,'s_english'),session('s','2026-01-04',60,'s_science')];
    const summary = dashboard(targets,sessions,{ playerProfile: { studyGoals: { dailyTargetMinutes: 60, weeklyStudyDays: 1, subjectWeeklyTargets: targets } }, rewardProgress });
    expect(summary.actions.map(a=>a.id)).toEqual(['subject-goal-s_math','gacha']);
    expect(dashboard(targets,[],{rewardProgress}).actions.map(a=>a.id)).toEqual(['daily','days','subject-goal-s_math']);
  });
  it('renders all goals in report, including exact and over target with capped bars', () => {
    const sessions = [session('m','2026-01-04',210),session('e','2026-01-04',180,'s_english')];
    const html = renderToStaticMarkup(<WeeklyReport ready now={now} sessions={sessions} studyGoals={{ subjectWeeklyTargets: { s_math: 180, s_english: 180, s_japanese: 600 } }} onBack={()=>{}}/>);
    expect(html).toContain('3時間30分 / 3時間'); expect(html).toContain('117%'); expect(html).toContain('あと10時間'); expect(html).toContain('現在の目標を基準に表示');
    expect(html).toContain('value="100" max="100"'); expect(html).not.toMatch(/NaN|Infinity/);
    const noGoal = renderToStaticMarkup(<WeeklyReport ready now={now} sessions={[]} onBack={()=>{}}/>);
    expect(noGoal).toContain('科目別目標は設定されていません');
  });
});
describe('subject personal goals do not change the game', () => {
  it.each([{}, { s_math: 15 }, { s_math: 600, s_english: 600 }])('preserves achievement, reward, EXP and RPG data for %j', targets => {
    const sessions = [session('m','2026-01-04',119),session('e','2026-01-03',60,'s_english')];
    const profile = { totalExp: 900, gold: 30, battleEnergy: 5, studyGoals: { subjectWeeklyTargets: targets } };
    const plain = { ...profile, studyGoals: {} };
    expect(deriveAchievements({ sessions, playerProfile: profile })).toEqual(deriveAchievements({ sessions, playerProfile: plain }));
    const achievements = deriveAchievements({ sessions, playerProfile: profile });
    expect(achievements.find(a=>a.id==='achievement_daily_2h')).toMatchObject({ target: 7200, completed: false });
    expect(achievements.find(a=>a.id==='achievement_week_5days')).toMatchObject({ target: 5, completed: false });
    expect(achievements.find(a=>a.id==='achievement_week_3subjects')).toMatchObject({ target: 3, completed: false });
    const rewards = calculateStudyReward(sessions[0]);
    const next = applyRewardToPlayerProfile(profile,rewards,now), reference = applyRewardToPlayerProfile(plain,rewards,now);
    expect({ ...next, studyGoals: {} }).toEqual({ ...reference, studyGoals: {} });
    expect(next.totalExp).toBe(900); expect(next.studyGoals.subjectWeeklyTargets).toEqual(targets);
  });
});
