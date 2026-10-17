import StudyGoalEditor from './StudyGoalEditor.jsx';
import { derivePlanReview } from '../../data/studyPlanReviewSelectors.js';
import { reportDuration } from '../../data/weeklyReportSelectors.js';
import { goalSubjects } from '../../subjectCatalog.js';

export default function StudyPlanReview({ completedWeek, studyGoals, subjectDefinitions, onSave }) {
  const { goals, targets, totals, suggestions } = derivePlanReview(studyGoals, subjectDefinitions);
  const subjects = goalSubjects(subjectDefinitions);
  return <section aria-label="次の学習計画を考える" className="min-w-0 rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
    <h2 className="text-lg font-black">次の学習計画を考える</h2>
    <h3 className="mt-3 font-bold">先週の学習状況（完了した週）</h3>
    <p className="mt-1 break-words text-xs">{completedWeek.label}</p>
    {completedWeek.count ? <div className="mt-2 space-y-1 break-words text-sm">
      <p>学習時間：{reportDuration(completedWeek.seconds)} ・ 学習した日数：{completedWeek.learningDays}日</p>
      <p>学習した教科：{completedWeek.subjects.filter(subject => subject.seconds > 0).map(subject => subject.name).join('、') || '時間のある記録なし'}</p>
      {completedWeek.subjects[0]?.seconds > 0 && <p>最も多く学習した教科：{completedWeek.subjects[0].name}</p>}
    </div> : <p className="mt-2 text-sm">先週の確定した学習記録はありません。</p>}
    <h3 className="mt-4 font-bold">現在の目標と予定</h3>
    <p className="mt-2 text-sm">週間目標：{goals.weeklyStudyDays}日・{goals.dailyTargetMinutes * goals.weeklyStudyDays}分（1日{goals.dailyTargetMinutes}分）</p>
    <p className="mt-1 text-sm">週間予定：{totals.studyDays}日・{totals.minutes}分</p>
    <details className="mt-2"><summary className="min-h-11 text-sm">現在の週間プラン・科目別目標を確認</summary>
      <ul className="space-y-2 text-sm">{totals.days.map(day => <li key={day.id} className="break-words">{day.name}：{day.minutes ? subjects.filter(subject => totals.plan[day.id]?.[subject.id]).map(subject => `${subject.name} ${totals.plan[day.id][subject.id]}分`).join('、') : '予定なし'}</li>)}</ul>
      <ul className="mt-3 space-y-2 text-sm">{subjects.filter(subject => targets[subject.id] || totals.subjects[subject.id]).map(subject => <li key={subject.id} className="break-words">{subject.name}：週間目標 {targets[subject.id] ? `${targets[subject.id]}分` : 'なし'}・週間予定 {totals.subjects[subject.id] || 0}分</li>)}</ul>
    </details>
    <p className="mt-2 text-xs leading-relaxed text-slate-500">実績は先週、目標と予定は現在の設定です。過去のプラン履歴は保存していないため、先週の予定達成率は判定しません。週間プランは毎週繰り返す予定です。</p>
    <h3 className="mt-4 font-bold">計画の見直し候補</h3>
    {!suggestions.length && <p className="mt-2 text-sm">現在の目標と週間プランに大きな不整合はありません。</p>}
    <p className="mt-2 text-xs text-slate-500">目標と予定の一致は、学習成果を保証するものではありません。予定を変えるかは自分で選べます。</p>
    {onSave ? <StudyGoalEditor studyGoals={studyGoals} onSave={onSave} reviewSuggestions={suggestions}/> : <ul className="mt-2 space-y-2 text-sm">{suggestions.map(candidate => <li key={candidate.id} className="break-words">{candidate.text}</li>)}</ul>}
  </section>;
}
