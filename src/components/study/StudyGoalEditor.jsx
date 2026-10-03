import { PLAN_DAYS, PLAN_DAY_LABELS, normalizeWeeklyStudyPlan, derivePlanSubjectTotals } from '../../weeklyStudyPlan.js';
import { useRef, useState } from 'react';
import { DEFAULT_STUDY_GOALS, normalizeStudyGoals } from '../../personalStudyGoals.js';
import { dashboardDuration } from '../../data/dashboardSelectors.js';
import { SUBJECT_DEFS, SUBJECT_GROUP_LABELS, goalSubjects } from '../../subjectCatalog.js';
import { normalizeSubjectWeeklyTargets } from '../../subjectStudyGoals.js';

const goalDraft = value => ({ ...normalizeStudyGoals(value), subjectWeeklyTargets: normalizeSubjectWeeklyTargets(value?.subjectWeeklyTargets), weeklyPlan: normalizeWeeklyStudyPlan(value?.weeklyPlan) });

const button = 'min-h-11 rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 focus-visible:outline-2 disabled:opacity-40';
export default function StudyGoalEditor({ studyGoals, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => goalDraft(studyGoals));
  const [subjectGroup, setSubjectGroup] = useState(Object.keys(SUBJECT_DEFS)[0]);
  const [category, setCategory] = useState('basic');
  const [day, setDay] = useState('mon');
  const [confirmClear, setConfirmClear] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const planTotals = derivePlanSubjectTotals(draft.weeklyPlan);
  const dayMinutes = Object.values(draft.weeklyPlan[day] || {}).reduce((sum,minutes) => sum + minutes,0);
  const trigger = useRef(null);
  const pending = useRef(false);
  const close = () => { setEditing(false); requestAnimationFrame(() => trigger.current?.focus()); };
  const save = async event => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setSaving(true); setMessage('');
    try {
      await onSave(draft);
      setMessage('学習目標を更新しました'); close();
    } catch {
      setMessage('目標を保存できませんでした');
    } finally { pending.current = false; setSaving(false); }
  };
  return <div className="mt-3 min-w-0">
    <button type="button" ref={trigger} disabled={saving} className={button} aria-expanded={editing} aria-controls="study-goal-editor" onClick={() => { setDraft(goalDraft(studyGoals)); setMessage(''); setConfirmClear(false); setCategory('basic'); setEditing(true); }}>目標を変更</button>
    {editing && <form id="study-goal-editor" aria-label="自分の学習目標" className="mt-3 min-w-0 space-y-3 rounded-xl bg-slate-50 p-3" onSubmit={save} onKeyDown={event => { if (event.key === 'Escape' && !pending.current) { event.preventDefault(); close(); } }}>
      <h3 className="font-bold">自分の目標</h3>
      <div className="flex flex-wrap gap-2" aria-label="目標の種類">{[['basic','基本目標'],['subjects','科目別目標'],['plan','週間プラン']].map(([id,label]) => <button type="button" key={id} disabled={saving} className={`${button} ${category === id ? 'ring-2 ring-blue-600' : ''}`} aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}</div>
      <div hidden={category !== 'basic'} className="space-y-3">
      <label className="block text-sm">1日の目標時間<select autoFocus disabled={saving} className="mt-1 block min-h-11 w-full rounded-lg border bg-white p-2" value={draft.dailyTargetMinutes} onChange={event => setDraft({ ...draft, dailyTargetMinutes: Number(event.target.value) })}>{Array.from({ length: 24 }, (_, index) => (index + 1) * 15).map(minutes => <option key={minutes} value={minutes}>{dashboardDuration(minutes * 60)}</option>)}</select></label>
      <label className="block text-sm">1週間の目標日数<select disabled={saving} className="mt-1 block min-h-11 w-full rounded-lg border bg-white p-2" value={draft.weeklyStudyDays} onChange={event => setDraft({ ...draft, weeklyStudyDays: Number(event.target.value) })}>{Array.from({ length: 7 }, (_, index) => index + 1).map(days => <option key={days} value={days}>{days}日</option>)}</select></label>
      </div>
      <fieldset hidden={category !== 'subjects'} className="min-w-0 space-y-3 border-t border-slate-200 pt-3">
        <legend className="text-sm font-bold">科目別週間目標</legend>
        <label className="block text-sm">科目のカテゴリ<select disabled={saving} className="mt-1 block min-h-11 w-full rounded-lg border bg-white p-2" value={subjectGroup} onChange={event => setSubjectGroup(event.target.value)}>{Object.keys(SUBJECT_DEFS).map(id => <option key={id} value={id}>{SUBJECT_GROUP_LABELS[id]}</option>)}</select></label>
        <div className="max-h-64 space-y-3 overflow-y-auto p-1">{goalSubjects({ [subjectGroup]: SUBJECT_DEFS[subjectGroup] }).map(subject => <label key={subject.id} className="block break-words text-sm">{subject.name}<select disabled={saving} className="mt-1 block min-h-11 w-full rounded-lg border bg-white p-2" value={draft.subjectWeeklyTargets[subject.id] || 0} onChange={event => setDraft({ ...draft, subjectWeeklyTargets: { ...draft.subjectWeeklyTargets, [subject.id]: Number(event.target.value) } })}>{Array.from({ length: 41 }, (_, index) => index * 15).map(minutes => <option key={minutes} value={minutes}>{minutes ? dashboardDuration(minutes * 60) : '目標なし'}</option>)}</select></label>)}</div>
        <p className="text-xs text-slate-500">0分は目標なし。カテゴリを切り替えても入力は保持されます。</p>
      </fieldset>
      {category === 'plan' && <fieldset className="min-w-0 space-y-3">
        <legend className="text-sm font-bold">週間プラン（毎週繰り返す予定）</legend>
        <div className="grid grid-cols-7 gap-1" aria-label="曜日選択">{PLAN_DAYS.map((id,index) => <button type="button" key={id} disabled={saving} aria-label={`${PLAN_DAY_LABELS[index]}曜日`} aria-pressed={day === id} className={`min-h-11 rounded-lg text-sm font-bold focus-visible:outline-2 ${day === id ? 'bg-blue-700 text-white' : 'bg-white text-blue-700'}`} onClick={() => setDay(id)}>{PLAN_DAY_LABELS[index]}</button>)}</div>
        <p className="text-sm">この日の予定：{dashboardDuration(dayMinutes * 60)}</p>
        {dayMinutes > draft.dailyTargetMinutes && <p className="text-xs text-amber-800">この日の予定は1日の目標時間を超えています（保存できます）。</p>}
        <div className="max-h-64 space-y-3 overflow-y-auto p-1">{[...goalSubjects()].sort((a,b) => Number(Boolean(draft.weeklyPlan[day]?.[b.id])) - Number(Boolean(draft.weeklyPlan[day]?.[a.id]))).map(subject => <label key={subject.id} className="block break-words text-sm">{subject.name}<select disabled={saving} className="mt-1 block min-h-11 w-full rounded-lg border bg-white p-2" value={draft.weeklyPlan[day]?.[subject.id] || 0} onChange={event => setDraft({ ...draft, weeklyPlan: { ...draft.weeklyPlan, [day]: { ...draft.weeklyPlan[day], [subject.id]: Number(event.target.value) } } })}>{Array.from({ length: 25 },(_,index) => index * 15).map(minutes => <option key={minutes} value={minutes}>{minutes ? dashboardDuration(minutes * 60) : '予定なし'}</option>)}</select></label>)}</div>
        <details><summary className="min-h-11 text-sm">科目別の週間予定合計</summary>{goalSubjects().filter(subject => planTotals[subject.id] || draft.subjectWeeklyTargets[subject.id]).map(subject => <p key={subject.id} className="break-words text-xs">{subject.name}：予定 {planTotals[subject.id] || 0}分 / 週間目標 {draft.subjectWeeklyTargets[subject.id] || 0}分（一致しなくても保存できます）</p>)}</details>
        <button type="button" disabled={saving} className={button} onClick={() => setConfirmClear(true)}>週間プランをすべて消す</button>
        {confirmClear && <div role="group" aria-label="週間プラン消去の確認"><p className="text-sm">編集可能な全曜日の予定を消します。保存すると反映されます。</p><button type="button" disabled={saving} className={button} onClick={() => { setDraft({ ...draft, weeklyPlan: {} }); setConfirmClear(false); }}>消去する</button><button type="button" disabled={saving} className={button} onClick={() => setConfirmClear(false)}>消去をやめる</button></div>}
      </fieldset>}
      <p className="text-xs text-slate-500">実績・報酬の条件は変わりません。初期値に戻す場合も保存してください。</p>
      <div className="flex flex-wrap gap-2"><button type="submit" className={button} disabled={saving}>{saving ? '保存中…' : '保存'}</button><button type="button" className={button} disabled={saving} onClick={close}>キャンセル</button><button type="button" className={button} disabled={saving} onClick={() => setDraft({ ...draft, ...DEFAULT_STUDY_GOALS })}>基本目標を初期値に戻す</button></div>
    </form>}
    <p role="status" className="mt-2 break-words text-sm">{message}</p>
  </div>;
}
