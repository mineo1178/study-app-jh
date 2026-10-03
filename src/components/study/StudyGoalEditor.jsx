import { useRef, useState } from 'react';
import { DEFAULT_STUDY_GOALS, normalizeStudyGoals } from '../../personalStudyGoals.js';
import { dashboardDuration } from '../../data/dashboardSelectors.js';
import { SUBJECT_DEFS, SUBJECT_GROUP_LABELS, goalSubjects } from '../../subjectCatalog.js';
import { normalizeSubjectWeeklyTargets } from '../../subjectStudyGoals.js';

const goalDraft = value => ({ ...normalizeStudyGoals(value), subjectWeeklyTargets: normalizeSubjectWeeklyTargets(value?.subjectWeeklyTargets) });

const button = 'min-h-11 rounded-xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 focus-visible:outline-2 disabled:opacity-40';
export default function StudyGoalEditor({ studyGoals, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => goalDraft(studyGoals));
  const [subjectGroup, setSubjectGroup] = useState(Object.keys(SUBJECT_DEFS)[0]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
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
    <button type="button" ref={trigger} disabled={saving} className={button} aria-expanded={editing} aria-controls="study-goal-editor" onClick={() => { setDraft(goalDraft(studyGoals)); setMessage(''); setEditing(true); }}>目標を変更</button>
    {editing && <form id="study-goal-editor" aria-label="自分の学習目標" className="mt-3 min-w-0 space-y-3 rounded-xl bg-slate-50 p-3" onSubmit={save} onKeyDown={event => { if (event.key === 'Escape' && !pending.current) { event.preventDefault(); close(); } }}>
      <h3 className="font-bold">自分の目標</h3>
      <label className="block text-sm">1日の目標時間<select autoFocus disabled={saving} className="mt-1 block min-h-11 w-full rounded-lg border bg-white p-2" value={draft.dailyTargetMinutes} onChange={event => setDraft({ ...draft, dailyTargetMinutes: Number(event.target.value) })}>{Array.from({ length: 24 }, (_, index) => (index + 1) * 15).map(minutes => <option key={minutes} value={minutes}>{dashboardDuration(minutes * 60)}</option>)}</select></label>
      <label className="block text-sm">1週間の目標日数<select disabled={saving} className="mt-1 block min-h-11 w-full rounded-lg border bg-white p-2" value={draft.weeklyStudyDays} onChange={event => setDraft({ ...draft, weeklyStudyDays: Number(event.target.value) })}>{Array.from({ length: 7 }, (_, index) => index + 1).map(days => <option key={days} value={days}>{days}日</option>)}</select></label>
      <fieldset className="min-w-0 space-y-3 border-t border-slate-200 pt-3">
        <legend className="text-sm font-bold">科目別週間目標</legend>
        <label className="block text-sm">科目のカテゴリ<select disabled={saving} className="mt-1 block min-h-11 w-full rounded-lg border bg-white p-2" value={subjectGroup} onChange={event => setSubjectGroup(event.target.value)}>{Object.keys(SUBJECT_DEFS).map(id => <option key={id} value={id}>{SUBJECT_GROUP_LABELS[id]}</option>)}</select></label>
        <div className="max-h-64 space-y-3 overflow-y-auto p-1">{goalSubjects({ [subjectGroup]: SUBJECT_DEFS[subjectGroup] }).map(subject => <label key={subject.id} className="block break-words text-sm">{subject.name}<select disabled={saving} className="mt-1 block min-h-11 w-full rounded-lg border bg-white p-2" value={draft.subjectWeeklyTargets[subject.id] || 0} onChange={event => setDraft({ ...draft, subjectWeeklyTargets: { ...draft.subjectWeeklyTargets, [subject.id]: Number(event.target.value) } })}>{Array.from({ length: 41 }, (_, index) => index * 15).map(minutes => <option key={minutes} value={minutes}>{minutes ? dashboardDuration(minutes * 60) : '目標なし'}</option>)}</select></label>)}</div>
        <p className="text-xs text-slate-500">0分は目標なし。カテゴリを切り替えても入力は保持されます。</p>
      </fieldset>
      <p className="text-xs text-slate-500">実績・報酬の条件は変わりません。初期値に戻す場合も保存してください。</p>
      <div className="flex flex-wrap gap-2"><button type="submit" className={button} disabled={saving}>{saving ? '保存中…' : '保存'}</button><button type="button" className={button} disabled={saving} onClick={close}>キャンセル</button><button type="button" className={button} disabled={saving} onClick={() => setDraft(goalDraft(DEFAULT_STUDY_GOALS))}>初期値に戻す</button></div>
    </form>}
    <p role="status" className="mt-2 break-words text-sm">{message}</p>
  </div>;
}
