import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { aggregateMonthlyStudy, deriveMonthlyStudyCalendar, moveCalendarMonth, monthlyStudyDate, calendarCellDuration } from './monthlyStudySelectors.js';
import { deriveDashboardSummary } from './dashboardSelectors.js';
import { deriveWeeklyReport } from './weeklyReportSelectors.js';
import { getUnifiedStudySessions } from './studySessionSelectors.js';
import { deriveAchievements } from '../rpg/achievementSelectors.js';
import MonthlyStudyCalendar from '../components/study/MonthlyStudyCalendar.jsx';

const now = Date.parse('2026-10-03T23:59:00+09:00');
const session = (id,date,seconds,subjectId='s_math',extra={}) => ({ id,date,recordedSeconds:seconds,taskSnapshot:{ subjectId,title:'数学の復習' },validation:{ status:'valid' },...extra });
const aggregate = (sessions=[], timestamp=now) => aggregateMonthlyStudy({sessions,now:timestamp,ready:true});
const calendar = (sessions=[],month='2026-10',studyGoals,timestamp=now) => deriveMonthlyStudyCalendar(aggregate(sessions,timestamp),month,studyGoals);

describe('calendar layout and navigation', () => {
  it.each([['2026-02',28,6,35],['2024-02',29,3,35],['2026-04',30,2,35],['2026-10',31,3,35],['2026-06',30,0,35],['2026-03',31,6,42],['2021-02',28,0,28]])('builds %s', (month,count,leading,cells) => {
    const result=calendar([],month);
    expect(result.days).toHaveLength(count);
    expect(result.cells).toHaveLength(cells);
    expect(result.cells.slice(0,leading).every(cell=>cell===null)).toBe(true);
    expect(result.cells[leading].date).toBe(`${month}-01`);
    expect(result.cells[leading+count-1].dayNumber).toBe(count);
    expect(result.cells.slice(leading+count).every(cell=>cell===null)).toBe(true);
  });
  it.each([['2026-10',-1,'2026-09'],['2026-09',1,'2026-10'],['2026-10',1,'2026-10'],['2025-12',1,'2026-01'],['2026-01',-1,'2025-12']])('moves %s by %s', (month,direction,expected)=>expect(moveCalendarMonth(month,direction,'2026-10')).toBe(expected));
  it('bounds future and invalid months',()=>{
    expect(calendar([],'2026-11').month).toBe('2026-10');
    expect(calendar([],'invalid').month).toBe('2026-10');
    expect(moveCalendarMonth('0001-01',-1,'2026-10')).toBe('0001-01');
  });
});

describe('JST date and existing attribution',()=>{
  it.each([['2026-10-03T00:00:00+09:00','2026-10-03'],['2026-10-03T23:59:00+09:00','2026-10-03'],['2026-09-30T15:00:00Z','2026-10-01'],['2026-10-03T23:30:00-07:00','2026-10-04']])('formats %s', (timestamp,date)=>expect(monthlyStudyDate(Date.parse(timestamp))).toBe(date));
  it('uses recorded date for midnight-crossing sessions, matching Dashboard/Report',()=>{
    const sessions=[session('cross','2026-10-03',1800,'s_math',{segments:[{startedAt:Date.parse('2026-10-02T23:50:00+09:00'),endedAt:Date.parse('2026-10-03T00:20:00+09:00')}]})];
    const result=calendar(sessions);
    expect(result.days[2].seconds).toBe(1800);
    expect(result.days[1].seconds).toBe(0);
    expect(deriveDashboardSummary({sessions,now,ready:true}).todaySeconds).toBe(1800);
    expect(deriveWeeklyReport({sessions,now,ready:true}).weeks[0].days.find(d=>d.date==='2026-10-03').seconds).toBe(1800);
  });
});

describe('one-pass effective aggregation',()=>{
  it('aggregates records, days and subjects while excluding invalid/live/stale/future and duplicates',()=>{
    const sessions=[session('a','2026-10-01',3600),session('b','2026-10-01',1800,'s_english'),session('c','2026-10-02',1200,'s_math'),session('zero','2026-10-03',0),session('invalid','2026-10-03',9000,'s_math',{validation:{status:'invalid'}}),session('review','2026-10-03',9000,'s_math',{validation:{status:'pending_review'}}),session('stale','2026-10-03',9000,'s_math',{isStale:true}),session('live','2026-10-03',9000,'s_math',{isLive:true}),session('future','2026-10-04',9000),session('bad','2026-02-30',9000),session('negative','2026-10-03',-1),session('nan','2026-10-03',NaN)];
    sessions.push(sessions[0]);
    const result=calendar(sessions,undefined,{dailyTargetMinutes:90});
    expect(result).toMatchObject({seconds:6600,studyDays:2,achievedDays:1,subjectCount:2});
    expect(result.days[0]).toMatchObject({seconds:5400,count:2,achieved:true});
    expect(result.days[2]).toMatchObject({count:1,seconds:0});
    expect(result.subjects.map(s=>[s.id,s.seconds])).toEqual([['s_math',4800],['s_english',1800]]);
    expect(result.subjects.reduce((sum,s)=>sum+s.percent,0)).toBeCloseTo(100);
  });
  it('uses recorded duration excluding pauses; keeps day detail records in chronological order',()=>{
    const start=Date.parse('2026-10-03T00:00:00+09:00');
    const sessions=[session('late','2026-10-03',900,'s_english',{taskSnapshot:{subjectId:'s_english'},segments:[{startedAt:start+7200000,endedAt:start+99999999}]}),session('early','2026-10-03',1800,'s_math',{segments:[{startedAt:start,endedAt:start+3600000}]})];
    const result=calendar(sessions).days[2];
    expect(result).toMatchObject({seconds:2700,count:2});
    expect(result.records.map(record=>record.seconds)).toEqual([1800,900]);
    expect(result.records[1].title).toBe('学習');
    expect(result.breakdown).toHaveLength(2);
  });
  it('handles missing/unknown subjects and catalog tie order, with no zero subject bars',()=>{
    const sessions=[session('e','2026-10-03',60,'s_english'),session('m','2026-10-03',60),session('u','2026-10-03',60,'orphan'),session('missing','2026-10-03',60,null,{taskSnapshot:{}}),session('zero','2026-10-03',0,'s_science')];
    const result=calendar(sessions);
    expect(result.subjects.map(s=>s.id)).toEqual(['other','s_math','s_english']);
    expect(result.subjectCount).toBe(2);
    expect(result.days[2].records.at(-2)).toMatchObject({title:'学習',subject:'その他'});
    expect(calendar().subjects).toEqual([]);
    expect(calendar().days.every(d=>d.count===0)).toBe(true);
  });
  it('uses unified old histories without migration or mutation',()=>{
    const tasks=[{id:'task',subjectId:'s_math',title:'復習',history:[{id:'history',date:'2026-10-03',duration:900}]}];
    const sessions=getUnifiedStudySessions(tasks,[]);
    expect(calendar(sessions).seconds).toBe(900);
    const before=structuredClone(sessions);
    aggregate(sessions);
    expect(sessions).toEqual(before);
  });
});

describe('current personal goals and future days',()=>{
  it.each([[0,false],[5399,false],[5400,true],[7200,true]])('90-minute goal at %s seconds', (seconds,achieved)=>{
    const result=calendar([session('a','2026-10-03',seconds)],'2026-10',{dailyTargetMinutes:90});
    expect(result.days[2].achieved).toBe(achieved);
    expect(result.achievedDays).toBe(achieved?1:0);
    expect(result.days[3]).toMatchObject({future:true,achieved:false});
  });
  it('recalculates past-month goals without changing achievements or sessions',()=>{
    const sessions=[session('a','2026-09-01',5400)];
    const index=aggregate(sessions);
    expect(deriveMonthlyStudyCalendar(index,'2026-09',{dailyTargetMinutes:90}).achievedDays).toBe(1);
    expect(deriveMonthlyStudyCalendar(index,'2026-09',{dailyTargetMinutes:120}).achievedDays).toBe(0);
    expect(calendar(sessions,'2026-09').dailyTargetSeconds).toBe(7200);
    expect(deriveAchievements({sessions,playerProfile:{studyGoals:{dailyTargetMinutes:90}}})).toEqual(deriveAchievements({sessions,playerProfile:{studyGoals:{dailyTargetMinutes:120}}}));
  });
  it('does not expose confirmed zero summaries during loading',()=>{
    const result=deriveMonthlyStudyCalendar(aggregateMonthlyStudy({sessions:[],now,ready:false}),'2026-10');
    expect(result).toEqual({status:'loading',cells:[]});
  });
});

describe('monthly UI',()=>{
  it('renders current day selection, future cells, safe empty states and navigation',()=>{
    const html=renderToStaticMarkup(<MonthlyStudyCalendar sessions={[]} now={now} ready/>);
    expect(html).toContain('2026年10月');
    expect(html).toContain('aria-current="date"');
    expect(html).toContain('2026-10-04 未来日');
    expect(html).not.toContain('2026-10-04 0分');
    expect(html).toContain('この月の学習記録はありません。');
    expect(html).toContain('この日の学習記録はありません。');
    expect(html).toContain('現在の1日目標');
    expect(html).toMatch(/disabled="">次月/);
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });
  it('renders task, subject, effective duration, JST time and subject percentage',()=>{
    const sessions=[session('a','2026-10-03',900,'e_programming',{taskSnapshot:{subjectId:'e_programming',title:'コード練習'},segments:[{startedAt:Date.parse('2026-10-02T15:30:00Z')} ]})];
    const html=renderToStaticMarkup(<MonthlyStudyCalendar sessions={sessions} now={now} ready/>);
    expect(html).toContain('コード練習');
    expect(html).toContain('その他・プログラミング');
    expect(html).toContain('15分');
    expect(html).toContain('00:30');
    expect(html).toContain('100.0%');
    expect(html).not.toMatch(/validation|pending_review|NaN|Infinity/);
  });
  it('renders only loading instead of summary before readiness',()=>{
    const html=renderToStaticMarkup(<MonthlyStudyCalendar sessions={[]} now={now} ready={false}/>);
    expect(html).toContain('学習記録を読み込み中');
    expect(html).not.toContain('総学習時間');
  });
  it.each([[0,'0:00'],[59,'<1分'],[60,'0:01'],[9420,'2:37']])('formats compact %s seconds', (seconds,expected)=>expect(calendarCellDuration(seconds)).toBe(expected));
});
