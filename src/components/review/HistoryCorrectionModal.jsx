import { useState } from 'react';
import { X } from 'lucide-react';
import { durationFieldsFromSeconds, durationSecondsFromFields, isDurationCorrectionAllowed } from '../../review/manualReviewUi.js';
import { formatHms } from '../../data/studySessionSelectors.js';

export default function HistoryCorrectionModal({ session, initialDecision = 'valid', busy = false, error = null, onClose, onSubmit }) {
  const [fields, setFields] = useState(() => durationFieldsFromSeconds(session?.recordedSeconds));
  const [decision, setDecision] = useState(initialDecision);
  if (!session) return null;
  const targetSeconds = durationSecondsFromFields(fields);
  const validDuration = isDurationCorrectionAllowed(session.recordedSeconds, targetSeconds);
  const isPending = session.validation?.status === 'pending_review';
  const canSubmit = validDuration && (isPending || decision !== 'valid' || targetSeconds < Number(session.recordedSeconds));
  const submit = () => onSubmit({ session, targetSeconds, targetStatus: decision, reason: decision === 'invalid' ? 'manual_review_invalid' : targetSeconds < Number(session.recordedSeconds) ? 'manual_duration_correction' : 'manual_review_approved' });
  return <div className="fixed inset-0 z-[180] flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="学習履歴を訂正">
    <div className="w-full max-w-lg rounded-t-[2rem] bg-white p-6 shadow-2xl sm:rounded-[2rem]"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Reviewer correction</p><h2 className="mt-1 text-xl font-black text-slate-800">{session.taskSnapshot?.title || '学習記録'}を訂正</h2><p className="mt-1 text-xs font-bold text-slate-500">現在: {formatHms(session.recordedSeconds)}</p></div><button type="button" onClick={onClose} disabled={busy} className="rounded-xl bg-slate-100 p-2 text-slate-500"><X size={18}/></button></div>
      <div className="mt-5 grid grid-cols-3 gap-2">{[['hours', '時'], ['minutes', '分'], ['seconds', '秒']].map(([key, label]) => <label key={key} className="text-center text-xs font-black text-slate-500">{label}<input min="0" type="number" value={fields[key]} onChange={(event) => setFields((old) => ({ ...old, [key]: event.target.value }))} className="mt-1 w-full rounded-xl bg-slate-50 p-3 text-center font-mono text-lg text-slate-800"/></label>)}</div>
      {!canSubmit && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-600">時間は現在の記録より増やせません。通常記録の有効訂正は時間短縮が必要です。分・秒は0〜59で入力してください。</p>}
      <div className="mt-5 grid grid-cols-2 gap-2">{(isPending ? [['valid', '有効として承認'], ['invalid', '無効にする']] : [['valid', '時間を短縮'], ['invalid', 'この記録を無効にする']]).map(([value, label]) => <button type="button" key={value} onClick={() => setDecision(value)} className={`rounded-xl p-3 text-xs font-black ${decision === value ? value === 'invalid' ? 'bg-rose-600 text-white' : 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{label}</button>)}</div>
      {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-600">{error}</p>}
      <button type="button" disabled={busy || !canSubmit} onClick={submit} className="mt-5 w-full rounded-xl bg-slate-900 py-4 text-sm font-black text-white disabled:opacity-50">{busy ? '処理中...' : '訂正を確定'}</button>
      <p className="mt-3 text-center text-[11px] font-bold text-slate-400">物理削除は行わず、無効化は監査可能な状態で保存します。</p>
    </div>
  </div>;
}
