import { useState } from 'react';
import { formatHms } from '../../data/studySessionSelectors.js';
import { durationFieldsFromSeconds, durationSecondsFromFields, isDurationCorrectionAllowed } from '../../review/manualReviewUi.js';

const time = (value) => new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function StudyTimeReviewModal({ session, subjectLabel, busy = false, error, onClose, onSubmit }) {
  const [fields, setFields] = useState(() => durationFieldsFromSeconds(session?.recordedSeconds));
  if (!session) return null;
  const seconds = durationSecondsFromFields(fields);
  const allowed = isDurationCorrectionAllowed(session.recordedSeconds, seconds);
  const submit = (targetSeconds) => onSubmit({ session, targetSeconds });
  const intervals = session.timeReview.originalSegments || session.segments || [];
  return <div className="fixed inset-0 z-[180] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="学習時間の確認">
    <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem] sm:p-6">
      <h2 className="text-xl font-black text-slate-800">学習時間の確認</h2>
      <p className="mt-3 text-sm font-bold leading-relaxed text-slate-600">アプリを操作していない時間があったため、実際に勉強した時間を確認してください。</p>
      <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
        <p className="break-words font-black">{subjectLabel} / {session.taskSnapshot?.title || '学習記録'}</p>
        <p className="mt-2">タイマーが記録した時間：<strong>{formatHms(session.timeReview.measuredSeconds)}</strong></p>
        {session.timeReview.reasons.includes('idle_auto_stop') && <p className="mt-2">15分間操作がなかったため自動停止しました。</p>}
        {session.timeReview.reasons.includes('background_5_minutes') && <p className="mt-2">アプリが連続5分以上表示されていない時間がありました。</p>}
        <p className="mt-2 text-xs">他のアプリで何をしていたかは確認できません。</p>
        <p className="mt-3 text-xs font-bold">対象の学習区間（休憩は含みません）</p>
        {intervals.map((segment, index) => <p key={index} className="mt-1 text-xs">{time(segment.startedAt)} ～ {time(segment.endedAt)}</p>)}
      </div>
      <p className="mt-4 text-sm font-bold text-slate-700">あなたが実際に勉強した時間を申告してください。</p>
      <p className="mt-1 text-xs text-slate-500">入力範囲：0秒 ～ {formatHms(session.recordedSeconds)}。計測終了後の時間は追加できません。</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[[ 'hours', '時間' ], [ 'minutes', '分' ], [ 'seconds', '秒' ]].map(([key, label]) => <label key={key} className="min-w-0 text-xs font-bold text-slate-600">{label}<input type="number" inputMode="numeric" min="0" max={key === 'hours' ? Math.floor(session.recordedSeconds / 3600) : 59} step="1" disabled={busy} value={fields[key]} onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base"/></label>)}
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-bold text-rose-600">{error}</p>}
      {!allowed && <p role="alert" className="mt-2 text-xs font-bold text-rose-600">計測時間以下で入力してください。</p>}
      <p className="mt-3 text-xs text-slate-500">確認が済むまで、この記録は学習実績や報酬に含まれません。</p>
      <div className="mt-4 space-y-2">
        <button type="button" disabled={busy} onClick={() => submit(session.recordedSeconds)} className="min-h-11 w-full rounded-xl bg-blue-600 p-3 text-sm font-black text-white disabled:opacity-50">計測時間のまま確定</button>
        <button type="button" disabled={busy || !allowed || seconds >= session.recordedSeconds} onClick={() => submit(seconds)} className="min-h-11 w-full rounded-xl bg-slate-100 p-3 text-sm font-black text-slate-700 disabled:opacity-50">入力した短い時間で確定</button>
        <button type="button" disabled={busy} onClick={() => submit(0)} className="min-h-11 w-full rounded-xl bg-slate-100 p-3 text-sm font-bold text-slate-700 disabled:opacity-50">勉強していなかったので0分で確定</button>
        <button type="button" disabled={busy} onClick={onClose} className="min-h-11 w-full rounded-xl p-3 text-sm font-bold text-slate-500 disabled:opacity-50">後で確認</button>
      </div>
    </div>
  </div>;
}
