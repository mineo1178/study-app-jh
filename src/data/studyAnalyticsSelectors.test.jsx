import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { aggregateMonthlyStudy } from './monthlyStudySelectors.js';
import { deriveStudyAnalytics } from './studyAnalyticsSelectors.js';
import { consecutiveDays, deriveAchievements } from '../rpg/achievementSelectors.js';
import { deriveDashboardSummary } from './dashboardSelectors.js';
import { deriveWeeklyReport } from './weeklyReportSelectors.js';
import { calculateStudyReward } from '../rpg/rewardCalculator.js';
import StudyAnalytics from '../components/study/StudyAnalytics.jsx';

const now=Date.parse('2026-01-05T12:00:00+09:00');
const session=(id,date,seconds=900,subjectId='s_math',extra={})=>({id,date,recordedSeconds:seconds,taskSnapshot:{subjectId},validation:{status:'valid'},...extra});
const derive=(sessions=[],period=4,goals,timestamp=now)=>deriveStudyAnalytics(aggregateMonthlyStudy({sessions,now:timestamp,ready:true}),timestamp,period,goals);

describe('weekly trend and comparison',()=>{
  it.each([0,1,4,8])('shows available %s weeks',count=>{
    const sessions=Array.from({length:count},(_,i)=>session(String(i),new Date(Date.parse('2026-01-05T00:00:00Z')-i*7*86400000).toISOString().slice(0,10)));
    const result=derive(sessions,8);
    expect(result.weeks).toHaveLength(count);
    expect(result.recordWeeks).toBe(count);
    if(count) expect(result.weeks.at(-1)).toMatchObject({current:true,id:'2026-W02'});
    expect(result.weeks.every(w=>w.startAt<=now)).toBe(true);
  });
  it('keeps missing weeks and handles ISO year crossover',()=>{
    const result=derive([session('old','2025-12-15'),session('current','2026-01-05')]);
    expect(result.weeks.map(w=>[w.id,w.studyDays])).toEqual([['2025-W51',1],['2025-W52',0],['2026-W01',0],['2026-W02',1]]);
    expect(result.weeks.at(-2).current).toBe(false);
    expect(result.previous).toBeNull();
  });
  it.each([[1800,900,900],[900,1800,-900],[900,900,0]])('compares current %s with previous %s', (current,previous,difference)=>{
    const result=derive([session('current','2026-01-05',current),session('previous','2025-12-29',previous)]);
    expect(result.difference).toEqual({seconds:difference,days:0});
  });
  it('does not replace missing previous week with zero',()=>{
    const result=derive([session('current','2026-01-05',9000)]);
    expect(result.previous).toBeNull(); expect(result.difference).toBeNull();
  });
});

describe('weekday and subject statistics',()=>{
  it('combines the same weekday across weeks with study-day averages',()=>{
    const result=derive([session('m1','2026-01-05',1800),session('m2','2025-12-29',900),session('m3','2025-12-29',900),session('t','2025-12-30',600)]);
    expect(result.weekdays[0]).toMatchObject({label:'月',seconds:3600,studyDays:2,averageSeconds:1800});
    expect(result.weekdays[1]).toMatchObject({label:'火',seconds:600,studyDays:1,averageSeconds:600});
    expect(result.weekdays[2]).toMatchObject({seconds:0,studyDays:0,averageSeconds:0});
  });
  it('uses JST Monday when UTC is still Sunday',()=>{
    const timestamp=Date.parse('2026-01-04T15:00:00Z');
    expect(derive([session('m','2026-01-05')],4,undefined,timestamp).weekdays[0].studyDays).toBe(1);
    expect(derive([session('future','2026-01-05')],4,undefined,timestamp-1).seconds).toBe(0);
  });
  it('sorts by time then catalog order and handles missing subjects',()=>{
    const result=derive([session('e','2026-01-05',900,'s_english'),session('m','2026-01-05',900),session('m2','2026-01-05',0),session('u','2026-01-05',900,'orphan'),session('missing','2026-01-05',900,null)]);
    expect(result.subjects.map(s=>[s.id,s.seconds,s.studyDays])).toEqual([['other',1800,1],['s_math',900,1],['s_english',900,1]]);
    expect(result.subjects.reduce((sum,s)=>sum+s.percent,0)).toBeCloseTo(100);
  });
  it('compares latest four weeks with previous four only with sufficient historical span',()=>{
    const sessions=Array.from({length:8},(_,i)=>session(String(i),new Date(Date.parse('2026-01-05T00:00:00Z')-i*7*86400000).toISOString().slice(0,10),i<4?1800:900));
    const result=derive(sessions);
    expect(result.comparisonAvailable).toBe(true);
    expect(result.subjects[0]).toMatchObject({seconds:7200,recentSeconds:7200,previousSeconds:3600});
    expect(derive(sessions.slice(0,7)).comparisonAvailable).toBe(false);
  });
  it('retains subjects with records only in the previous four weeks for the comparison',()=>{
    const result=derive([session('old','2025-11-17',1800,'s_english'),session('current','2026-01-05',900)]);
    expect(result.subjects.map(subject=>subject.id)).toEqual(['s_math']);
    expect(result.subjectComparison.find(subject=>subject.id==='s_english')).toMatchObject({recentSeconds:0,previousSeconds:1800});
  });
});

describe('averages, period and filtering',()=>{
  it('averages over displayed weeks including incomplete current week and zero weeks',()=>{
    const result=derive([session('old','2025-12-15',1800),session('today','2026-01-05',900)]);
    expect(result).toMatchObject({studyDays:2,recordWeeks:2,averageWeekDays:0.5,averageDaySeconds:1350,averageWeekSeconds:675});
  });
  it('returns finite zeros with no study',()=>{
    const result=derive();
    expect(result).toMatchObject({seconds:0,studyDays:0,averageDaySeconds:0,averageWeekSeconds:0,averageWeekDays:0,goalPercent:0});
    expect(result.subjects).toEqual([]);
    expect(result.weekdays.every(d=>d.averageSeconds===0)).toBe(true);
  });
  it('switches aggregate windows without altering source data and excludes all ineffective records',()=>{
    const sessions=[session('old','2025-11-17',900),session('current','2026-01-05',1800,'s_math',{segments:[{startedAt:1,endedAt:999999999}]}),session('invalid','2026-01-05',9000,'s_math',{validation:{status:'invalid'}}),session('pending','2026-01-05',9000,'s_math',{validation:{status:'pending_review'}}),session('stale','2026-01-05',9000,'s_math',{isStale:true}),session('live','2026-01-05',9000,'s_math',{isLive:true}),session('future','2026-01-06',9000)];
    sessions.push(sessions[1]);
    const before=structuredClone(sessions);
    const index=aggregateMonthlyStudy({sessions,now,ready:true});
    expect(deriveStudyAnalytics(index,now,4).seconds).toBe(1800);
    expect(deriveStudyAnalytics(index,now,8).seconds).toBe(2700);
    expect(sessions).toEqual(before);
  });
});

describe('streak uses achievement rules',()=>{
  it.each([[],['2026-01-05'],['2026-01-03','2026-01-04','2026-01-05'],['2026-01-01','2026-01-03'],['2025-12-30','2025-12-31','2026-01-01']].map(dates=>[dates]))('reuses longest calculation for %j',dates=>{
    const sessions=dates.map((date,i)=>session(String(i),date));
    const result=derive(sessions);
    expect(result.longestStreak).toBe(consecutiveDays(dates));
    expect(result.longestStreak).toBe(deriveAchievements({sessions}).find(a=>a.id==='achievement_streak_3').current);
  });
  it.each([['2026-01-05',1],['2026-01-04',1],['2026-01-03',0]])('counts current ending at %s', (date,current)=>expect(derive([session('a',date)]).currentStreak).toBe(current));
  it('keeps the existing zero-duration record definition for streak without counting it as positive study time',()=>{
    const sessions=[session('a','2026-01-04',0),session('b','2026-01-05',0)];
    expect(derive(sessions)).toMatchObject({currentStreak:2,longestStreak:2,studyDays:0});
    expect(deriveAchievements({sessions}).find(a=>a.id==='achievement_streak_3').current).toBe(2);
  });
});

describe('goals and separation',()=>{
  it.each([[5399,0],[5400,1],[7200,1]])('90-minute target at %s', (seconds,achievedDays)=>expect(derive([session('a','2025-12-29',seconds)],4,{dailyTargetMinutes:90}).achievedDays).toBe(achievedDays));
  it('updates current personal goal while preserving game and existing displays',()=>{
    const sessions=[session('a','2026-01-05',5400)];
    const index=aggregateMonthlyStudy({sessions,now,ready:true});
    const goals={dailyTargetMinutes:90,weeklyStudyDays:3,weeklyPlan:{mon:{s_math:15}},subjectWeeklyTargets:{s_math:180}};
    const profile={studyGoals:goals,totalExp:900,gold:30};
    const achievement=deriveAchievements({sessions,playerProfile:profile});
    const reward=calculateStudyReward(sessions[0]);
    const dashboard=deriveDashboardSummary({sessions,now,ready:true,playerProfile:profile});
    const report=deriveWeeklyReport({sessions,now,ready:true,studyGoals:goals});
    expect(deriveStudyAnalytics(index,now,4,goals).achievedDays).toBe(1);
    expect(deriveStudyAnalytics(index,now,4,{dailyTargetMinutes:120}).achievedDays).toBe(0);
    expect(deriveAchievements({sessions,playerProfile:profile})).toEqual(achievement);
    expect(achievement.find(a=>a.id==='achievement_daily_2h')).toMatchObject({target:7200,completed:false});
    expect(calculateStudyReward(sessions[0])).toEqual(reward);
    expect(deriveDashboardSummary({sessions,now,ready:true,playerProfile:profile})).toEqual(dashboard);
    expect(deriveWeeklyReport({sessions,now,ready:true,studyGoals:goals})).toEqual(report);
  });
});

describe('analytics rendering',()=>{
  it('renders safe empty facts and selected period',()=>{
    const html=renderToStaticMarkup(<StudyAnalytics sessions={[]} now={now} ready/>);
    expect(html).toContain('直近4週間'); expect(html).toContain('直近8週間');
    expect(html).toContain('前週の記録なし'); expect(html).toContain('比較ができる記録がありません');
    expect(html).not.toMatch(/NaN|Infinity|undefined|selector|session|validation|stale|aggregation/);
    expect(html).toContain('途中の今週・記録のない週を含む');
  });
  it('renders numeric bars and current personal goal explanation',()=>{
    const html=renderToStaticMarkup(<StudyAnalytics sessions={[session('a','2026-01-05',900,'e_programming')]} now={now} ready/>);
    expect(html).toContain('今週・途中経過'); expect(html).toContain('その他・プログラミング');
    expect(html).toContain('現在の1日目標'); expect(html).toContain('100.0%');
  });
  it('renders loading without confirmed zero summary',()=>{
    const html=renderToStaticMarkup(<StudyAnalytics sessions={[]} now={now} ready={false}/>);
    expect(html).toContain('読み込み中'); expect(html).not.toContain('総学習時間');
  });
});
