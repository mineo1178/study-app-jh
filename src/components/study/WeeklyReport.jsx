import { useMemo, useState } from 'react';
import { deriveWeeklyReport, moveReportWeek, reportDuration as duration } from '../../data/weeklyReportSelectors.js';

const card = 'min-w-0 rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-6 shadow-sm';
const button = 'min-h-11 rounded-xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40';
const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`;
const timeDifference = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${duration(Math.abs(value))}`;

export default function WeeklyReport({ sessions, now, ready, subjectDefinitions, studyGoals, onBack }) {
  const report = useMemo(() => deriveWeeklyReport({ sessions, now, ready, subjectDefinitions, studyGoals }), [sessions, now, ready, subjectDefinitions, studyGoals]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const week = report.weeks[selectedIndex];
  const dailyMax = Math.max(week?.dailyTargetSeconds || 7200, ...(week?.days.map(day => day.seconds) || []));
  const trendMax = Math.max(1, ...report.weeks.map(item => item.seconds));
  const metrics = [
    { key: 'seconds', name: '学習時間', format: duration, difference: timeDifference },
    { key: 'learningDays', name: '学習日数', format: value => `${value}日`, difference: value => `${signed(value)}日` },
    { key: 'subjectCount', name: '教科数', format: value => `${value}教科`, difference: value => `${signed(value)}教科` },
    { key: 'count', name: '記録数', format: value => `${value}回`, difference: value => `${signed(value)}回` },
  ];
  return <section aria-label="週間レポート" className="min-w-0 space-y-4 text-left">
    <header className={card}>
      <h1 className="text-xl font-black text-slate-800">週間レポート</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">学習時間や教科のバランスを振り返れます。先週との違いも確認して、次の1週間に活かしましょう。確定した有効な学習記録を表示します。</p>
      <button type="button" className={`${button} mt-3`} aria-label="ダッシュボードへ戻る" onClick={onBack}>ダッシュボードへ戻る</button>
    </header>
    {report.status === 'loading' ? <div className={card} role="status">学習記録を読み込み中です…</div> : <>
      <div className={card}>
        <p className="text-xs font-bold text-blue-700">{selectedIndex === 0 ? '今週' : `${selectedIndex}週前`}</p>
        <h2 className="mt-1 break-words text-lg font-black" aria-live="polite">{week.label}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={button} aria-label="前の週を見る" disabled={selectedIndex === report.weeks.length - 1} onClick={() => setSelectedIndex(index => moveReportWeek(index, 1, report.weeks.length))}>前の週</button>
          <button type="button" className={button} aria-label="次の週を見る" disabled={selectedIndex === 0} onClick={() => setSelectedIndex(index => moveReportWeek(index, -1, report.weeks.length))}>次の週</button>
        </div>
        {selectedIndex === 0 && <p className="mt-3 text-xs leading-relaxed text-slate-500">今週は今日までの記録です。先週は週全体の記録を表示します。</p>}
        {!week.count && <p className="mt-3 text-sm text-slate-500">この週の学習記録はまだありません。</p>}
        <table className="mt-4 w-full table-fixed text-xs sm:text-sm">
          <caption className="mb-2 text-left font-black">選択週と先週の比較</caption>
          <thead><tr className="text-slate-500"><th scope="col" className="py-2 text-left">指標</th><th scope="col">選択週</th><th scope="col">先週</th><th scope="col">差</th></tr></thead>
          <tbody>{metrics.map(metric => <tr key={metric.key} className="border-t border-slate-100"><th scope="row" className="py-3 pr-1 text-left font-bold">{metric.name}</th><td className="break-words px-1 text-center">{metric.format(week[metric.key])}</td><td className="break-words px-1 text-center">{week.previous.count ? metric.format(week.previous[metric.key]) : '—'}</td><td className="break-words px-1 text-center">{week.comparison ? metric.difference(week.comparison[metric.key]) : '—'}</td></tr>)}</tbody>
        </table>
        {!week.comparison && <p className="mt-2 text-xs text-slate-500">先週の記録なし</p>}
      </div>
      <div className={card}>
        <h2 className="text-lg font-black">自分の目標</h2>
        <p className="mt-2 break-words text-sm font-bold">{duration(week.seconds)} / {duration(week.weeklyTargetSeconds)}{week.seconds >= week.weeklyTargetSeconds ? ' ・ 達成' : ''}</p>
        <p className="mt-2 text-sm font-bold">{week.learningDays} / {week.weeklyStudyDays}日{week.learningDays >= week.weeklyStudyDays ? ' ・ 達成' : ''}</p>
        <p className="mt-2 text-xs text-slate-500">現在の目標を基準に表示。実績条件（週5日・週3教科）は固定です。</p>
      </div>
      <div className={card}>
        <h2 className="text-lg font-black">日別の学習</h2>
        <ul className="mt-3 space-y-3">{week.days.map(day => <li key={day.date} className="min-w-0"><div className="flex flex-wrap justify-between gap-1 text-xs"><span className="font-bold">{day.weekday}（{day.date.slice(5).replace('-', '/')}）</span><span>{duration(day.seconds)}{day.achieved && ` ・ ${duration(week.dailyTargetSeconds)}達成`}</span></div><progress aria-label={`${day.weekday}曜日の学習時間`} value={day.seconds} max={dailyMax} className="mt-1 block h-2 w-full max-w-full accent-blue-600"/></li>)}</ul>
      </div>
      <div className={card}>
        <h2 className="text-lg font-black">教科のバランス</h2>
        {!week.subjects.length ? <p className="mt-3 text-sm text-slate-500">この週の教科の記録はありません。</p> : <ul className="mt-3 space-y-4">{week.subjects.map(subject => <li key={subject.id} className="min-w-0"><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="min-w-0 break-words font-bold">{subject.name}</span><span className="text-xs">{duration(subject.seconds)} ・ {subject.percent.toFixed(1)}%</span></div><progress aria-label={`${subject.name}の割合`} value={subject.percent} max="100" className="mt-2 block h-2 w-full max-w-full" style={{ accentColor: subject.color }}/></li>)}</ul>}
      </div>
      <div className={card}>
        <h2 className="text-lg font-black">この週のハイライト</h2>
        {week.highlights.length ? <ul className="mt-3 space-y-2 text-sm leading-relaxed">{week.highlights.map(text => <li key={text} className="break-words">{text}</li>)}</ul> : <p className="mt-3 text-sm text-slate-500">記録が増えると、この週の学習の特徴を確認できます。</p>}
        <h3 className="mt-5 font-black">次の学習へのヒント</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">週5日・週3教科のヒントは固定の実績条件です。日々の目標は現在の自分の設定を使います。週の目標は毎週リセットされます。今日の目標は今週を選んだときだけ表示します。</p>
        <ul className="mt-3 space-y-2 text-sm font-bold text-blue-700">{week.hints.map(hint => <li key={hint.id} className="break-words">{hint.text}</li>)}</ul>
      </div>
      <div className={card}>
        <h2 className="text-lg font-black">直近4週間</h2>
        <p className="mt-2 text-xs text-slate-500">週を押すと詳しいレポートを開けます。</p>
        <div className="mt-3 space-y-3">{report.weeks.map((item,index) => <button type="button" key={item.id} aria-label={`${item.label}のレポートを見る`} aria-pressed={index === selectedIndex} onClick={() => setSelectedIndex(index)} className={`block min-h-11 w-full min-w-0 rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${index === selectedIndex ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}><span className="block break-words text-xs font-bold">{index === 0 ? '今週' : `${index}週前`} ・ {item.label}{index === selectedIndex ? '（選択中）' : ''}</span><span className="mt-1 block text-sm">{duration(item.seconds)} ・ {item.learningDays}日</span><span className="mt-2 block h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true"><span className="block h-full rounded-full bg-blue-600" style={{ width: `${item.seconds / trendMax * 100}%` }}/></span></button>)}</div>
      </div>
    </>}
  </section>;
}
