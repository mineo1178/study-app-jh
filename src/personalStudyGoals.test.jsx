import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { normalizeStudyGoals, personalStudyTargets, personalGoalProgress, confirmedGoalProfile } from './personalStudyGoals.js';
import { deriveDashboardSummary } from './data/dashboardSelectors.js';
import { deriveWeeklyReport } from './data/weeklyReportSelectors.js';
import { deriveAchievements } from './rpg/achievementSelectors.js';
import WeeklyReport from './components/study/WeeklyReport.jsx';

const now = Date.parse('2026-01-04T12:00:00+09:00');
const session = (date, seconds, id = date, subjectId = 'math', status = 'valid') => ({ id, date, recordedSeconds: seconds, taskSnapshot: { subjectId }, validation: { status } });
const derive = (studyGoals, sessions = []) => deriveDashboardSummary({ now, ready: true, playerProfile: { studyGoals }, sessions });
describe('personal study goals', () => {
  it('keeps confirmed goals during optimistic snapshots and accepts acknowledged cross-device updates', () => {
    const current = { studyGoals: { dailyTargetMinutes: 90, weeklyStudyDays: 5 }, gold: 10 };
    const next = { studyGoals: { dailyTargetMinutes: 60, weeklyStudyDays: 3 }, gold: 20 };
    expect(confirmedGoalProfile(next, current, true)).toEqual({ ...next, studyGoals: current.studyGoals });
    expect(confirmedGoalProfile(next, current, false)).toBe(next);
    expect(confirmedGoalProfile(current, current, false)).toBe(current);
  });
  it.each([undefined, null, {}, { dailyTargetMinutes: 120, weeklyStudyDays: 5 }])('defaults old profiles: %j', value => {
    expect(normalizeStudyGoals(value)).toEqual({ dailyTargetMinutes: 120, weeklyStudyDays: 5 });
  });
  it.each([15, 360])('accepts daily endpoint %s', dailyTargetMinutes => expect(normalizeStudyGoals({ dailyTargetMinutes }).dailyTargetMinutes).toBe(dailyTargetMinutes));
  it.each([14, 361, '90', null, NaN, Infinity, 16, 15.5])('rejects daily %s', dailyTargetMinutes => expect(normalizeStudyGoals({ dailyTargetMinutes }).dailyTargetMinutes).toBe(120));
  it.each([1, 7])('accepts weekly endpoint %s', weeklyStudyDays => expect(normalizeStudyGoals({ weeklyStudyDays }).weeklyStudyDays).toBe(weeklyStudyDays));
  it.each([0, 8, '5', null, NaN, Infinity, 1.5])('rejects weekly %s', weeklyStudyDays => expect(normalizeStudyGoals({ weeklyStudyDays }).weeklyStudyDays).toBe(5));
  it.each([[120,5,600],[90,5,450],[60,3,180]])('derives %s × %s', (dailyTargetMinutes, weeklyStudyDays, minutes) => expect(personalStudyTargets({ dailyTargetMinutes, weeklyStudyDays }).weeklyTargetSeconds).toBe(minutes * 60));
  it.each([[0,0,5400],[2700,50,2700],[4200,77,1200],[5399,99,1],[5400,100,0],[7200,100,0]])('90 minute daily progress at %s', (seconds, percent, remaining) => {
    expect(personalGoalProgress(seconds, 5400)).toEqual({ percent, remaining });
    const result = derive({ dailyTargetMinutes: 90 }, [session('2026-01-04', seconds)]);
    expect(result).toMatchObject({ percent, remaining, todaySeconds: seconds, target: 5400 });
    expect(result.actions.some(action => action.id === 'daily')).toBe(remaining > 0);
  });
  it.each([0,4,5,7])('counts %s weekly days once and excludes invalid sessions', count => {
    const sessions = Array.from({ length: count }, (_, index) => session(`2025-12-${29 + index <= 31 ? 29 + index : 31}`, 60, `id${index}`));
    sessions.forEach((item, index) => { item.date = new Date(Date.parse('2025-12-29T00:00:00Z') + index * 86400000).toISOString().slice(0,10); });
    if (count) sessions.push(session(sessions[0].date, 120, 'extra'));
    sessions.push(session('2026-01-04', 9999, 'invalid', 'english', 'invalid'));
    const result = derive({ weeklyStudyDays: 5 }, sessions);
    expect(result.weekDays).toBe(count); expect(result.weekSeconds).toBe(count * 60 + (count ? 120 : 0));
    expect(result.actions.some(action => action.id === 'days')).toBe(count < 5);
    expect(result.actions).toHaveLength(3);
  });
  it('uses current goals for all weeks, including empty and over-target weeks', () => {
    const studyGoals = { dailyTargetMinutes: 60, weeklyStudyDays: 3 };
    const report = deriveWeeklyReport({ now, ready: true, studyGoals, sessions: [session('2025-12-28', 20000), session('2026-01-04', 3600)] });
    expect(report.weeks.every(week => week.weeklyTargetSeconds === 10800 && week.weeklyStudyDays === 3)).toBe(true);
    expect(report.weeks[0].days[6].achieved).toBe(true);
    expect(report.weeks[1].seconds).toBe(20000); expect(report.weeks[2].seconds).toBe(0);
    const html = renderToStaticMarkup(<WeeklyReport now={now} ready studyGoals={studyGoals} sessions={[]}/>);
    expect(html).toContain('0分 / 3時間'); expect(html).toContain('0 / 3日'); expect(html).toContain('現在の目標を基準に表示');
  });
  it('offers one weekly personal action and then available rewards when custom goals are met', () => {
    const studyGoals = { dailyTargetMinutes: 60, weeklyStudyDays: 3 };
    const sessions = [session('2025-12-29',60,'a','math'), session('2025-12-30',60,'b','english'), session('2026-01-04',3600,'c','science')];
    const rewardProgress = { status: 'ready', goals: [{ id: 'gacha', available: true, name: 'ガチャ', requirements: [] }] };
    const summary = deriveDashboardSummary({ now, ready: true, sessions, playerProfile: { studyGoals }, rewardProgress });
    expect(summary.actions.map(action => action.id)).toEqual(['week-time','gacha']);
    const complete = deriveDashboardSummary({ now, ready: true, sessions: sessions.map(s => ({ ...s, recordedSeconds: 3600 })), playerProfile: { studyGoals }, rewardProgress });
    expect(complete.actions.map(action => action.id)).toEqual(['gacha']);
    const missing = derive(studyGoals);
    expect(missing.actions.filter(action => ['days','week-time'].includes(action.id))).toHaveLength(1);
    expect(missing.actions).toHaveLength(3);
  });
  it.each([30,60,90,180])('keeps achievement unlock boundaries fixed with %s minute goals', dailyTargetMinutes => {
    const playerProfile = { studyGoals: { dailyTargetMinutes, weeklyStudyDays: 3 } };
    const find = (sessions, id) => deriveAchievements({ playerProfile, sessions }).find(a => a.id === id);
    expect(find([session('2026-01-04',7199)], 'achievement_daily_2h').completed).toBe(false);
    expect(find([session('2026-01-04',7200)], 'achievement_daily_2h').completed).toBe(true);
    const days = Array.from({ length: 5 }, (_, i) => session(`2025-12-${29+i <= 31 ? 29+i : 31}`,60,`day${i}`));
    days[3].date='2026-01-01'; days[4].date='2026-01-02';
    expect(find(days.slice(0,4),'achievement_week_5days').completed).toBe(false);
    expect(find(days,'achievement_week_5days').completed).toBe(true);
    const subjects = ['math','english','science'].map(id => session('2026-01-04',60,id,id));
    expect(find(subjects.slice(0,2),'achievement_week_3subjects').completed).toBe(false);
    expect(find(subjects,'achievement_week_3subjects').completed).toBe(true);
  });
});
