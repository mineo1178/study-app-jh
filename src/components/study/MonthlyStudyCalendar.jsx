import { useMemo, useState } from 'react';
import { aggregateMonthlyStudy, deriveMonthlyStudyCalendar, moveCalendarMonth, calendarCellDuration } from '../../data/monthlyStudySelectors.js';
import { reportDuration as duration } from '../../data/weeklyReportSelectors.js';

const card = 'min-w-0 rounded-[2rem] border border-slate-100 bg-white p-4 sm:p-6 shadow-sm';
const button = 'min-h-11 rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40';
const clock = timestamp => timestamp === null ? '時刻なし' : new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(timestamp);

function SubjectBreakdown({ subjects }) {
  return subjects.length ? <ul className="mt-3 space-y-3">{subjects.map(subject => <li key={subject.id} className="min-w-0"><p className="flex flex-wrap justify-between gap-1 text-sm"><b className="break-words">{subject.name}</b><span>{duration(subject.seconds)} ・ {subject.percent.toFixed(1)}%</span></p><progress aria-label={`${subject.name}の割合`} value={subject.percent} max="100" className="mt-1 block h-2 w-full accent-blue-600"/></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">科目別の学習記録はありません。</p>;
}

export default function MonthlyStudyCalendar({ sessions, now, ready, studyGoals, subjectDefinitions, onBack }) {
  const index = useMemo(() => aggregateMonthlyStudy({ sessions, now, ready, subjectDefinitions }), [sessions, now, ready, subjectDefinitions]);
  const [selection, setSelection] = useState({ month: null, date: null });
  const month = selection.month || index.currentMonth;
  const calendar = useMemo(() => deriveMonthlyStudyCalendar(index,month,studyGoals), [index, month, studyGoals]);
  const selectedDate = selection.date || (calendar.month === index.currentMonth ? index.today : `${calendar.month}-01`);
  const day = calendar.days?.find(item => item.date === selectedDate);
  const navigate = direction => setSelection({ month: moveCalendarMonth(calendar.month,direction,index.currentMonth), date: null });
  return <section aria-label="月間学習カレンダー" className="mx-auto max-w-3xl min-w-0 space-y-4 text-left">
    <header className={card}><h1 className="text-xl font-black">月間学習カレンダー</h1><p className="mt-2 text-sm text-slate-500">確定した有効な学習記録から、月と日ごとの学習を振り返れます。</p><button type="button" className={`${button} mt-3`} onClick={onBack}>ダッシュボードへ戻る</button></header>
    {calendar.status === 'loading' ? <div className={card} role="status">学習記録を読み込み中です…</div> : <>
      <div className={card}>
        <h2 className="text-lg font-black" aria-live="polite">{calendar.label}</h2>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} onClick={() => navigate(-1)} disabled={calendar.month === '0001-01'}>前月</button><button type="button" className={button} onClick={() => navigate(1)} disabled={calendar.month === index.currentMonth}>次月</button></div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">{[['総学習時間',duration(calendar.seconds)],['学習日数',`${calendar.studyDays}日`],['1日目標達成',`${calendar.achievedDays}日`],['学習した科目',`${calendar.subjectCount}科目`]].map(([label,value]) => <div key={label} className="min-w-0 rounded-xl bg-slate-50 p-3"><dt>{label}</dt><dd className="mt-1 break-words font-bold">{value}</dd></div>)}</dl>
        <p className="mt-3 text-xs text-slate-500">現在の1日目標（{duration(calendar.dailyTargetSeconds)}）を基準に表示。実績の固定条件とは別です。</p>
        {!calendar.studyDays && <p className="mt-3 text-sm">この月の学習記録はありません。</p>}
        <p className="mt-4 text-xs text-slate-500">時間は「時間:分」。✓＝目標達成、—＝学習なし。日付を押すと詳細を表示します。</p>
        <div className="mt-2 grid grid-cols-7 gap-1" aria-label={`${calendar.label}のカレンダー`}>
          {['月','火','水','木','金','土','日'].map(label => <span key={label} className="py-1 text-center text-xs font-bold">{label}</span>)}
          {calendar.cells.map((cell,i) => cell ? <button type="button" key={cell.date} disabled={cell.future} aria-current={cell.isToday ? 'date' : undefined} aria-pressed={cell.date === selectedDate} aria-label={`${cell.date} ${cell.isToday ? '今日 ' : ''}${cell.future ? '未来日' : `${duration(cell.seconds)} ${cell.seconds > 0 ? '学習あり' : '学習なし'} ${cell.achieved ? '目標達成' : '目標未達'}`}`} onClick={() => setSelection({ month: calendar.month, date: cell.date })} className={`min-h-20 min-w-0 rounded-lg border px-0.5 py-2 text-center focus-visible:outline-2 focus-visible:outline-offset-1 ${cell.date === selectedDate ? 'border-blue-700 ring-1 ring-blue-700' : 'border-slate-100'} ${cell.future ? 'bg-slate-50 text-slate-400' : cell.achieved ? 'bg-emerald-50 text-emerald-800' : 'bg-white text-slate-700'}`}><span className="block text-xs font-bold">{cell.dayNumber}</span><span className="mt-1 block text-[10px] sm:text-xs">{cell.future ? '未来' : cell.seconds > 0 ? calendarCellDuration(cell.seconds) : '—'}</span><span className="block min-h-4 text-[10px]">{cell.isToday ? '今日' : cell.date === selectedDate ? '選択' : cell.achieved ? '✓' : ''}</span>{cell.achieved && (cell.isToday || cell.date === selectedDate) && <span className="block text-[10px]">✓</span>}</button> : <span key={`blank-${i}`} aria-hidden="true"/>)}
        </div>
      </div>
      {day && <div className={card} aria-label="日別の振り返り" aria-live="polite"><h2 className="text-lg font-black">{day.date.replaceAll('-','/')}の振り返り</h2><p className="mt-2 text-sm">総学習時間 {duration(day.seconds)} ・ 学習記録 {day.count}回</p>{day.count ? <><SubjectBreakdown subjects={day.breakdown}/><h3 className="mt-5 font-bold">学習記録</h3><ul className="mt-2 divide-y divide-slate-100">{day.records.map(record => <li key={record.id} className="break-words py-3 text-sm"><b>{record.title}</b><p>{record.subject} ・ {duration(record.seconds)}</p><p className="text-xs text-slate-500">開始 {clock(record.startedAt)}（JST）</p></li>)}</ul></> : <p className="mt-3 text-sm">この日の学習記録はありません。</p>}</div>}
      <div className={card}><h2 className="text-lg font-black">月間の科目別学習時間</h2><SubjectBreakdown subjects={calendar.subjects}/></div>
    </>}
  </section>;
}
