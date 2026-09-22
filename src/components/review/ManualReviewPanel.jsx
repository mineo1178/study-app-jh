import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { formatHms } from '../../data/studySessionSelectors.js';

const taskTitle = (session) => session.taskSnapshot?.title || session.taskTitle || '学習記録';
const subject = (session) => session.taskSnapshot?.subjectId || session.subjectId || '未設定';

export default function ManualReviewPanel({ queue, profile, studySessions = [], ledgersBySessionId = {}, busySessionIds = {}, message = null, onOpenCorrection, onRetry }) {
  const { pendingReviewSessions, pendingCorrectionSessionIds } = queue;
  return <div className="space-y-6 animate-in fade-in duration-300">
    {message && <p className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">{message}</p>}
    <section className="rounded-[2rem] border border-amber-100 bg-amber-50/70 p-5 sm:p-7">
      <div className="flex items-center gap-3"><AlertTriangle className="text-amber-600"/><div><h2 className="font-black text-slate-800">要確認の学習記録</h2><p className="text-xs font-bold text-slate-500">Reviewerの決定は自動再判定で上書きされません。</p></div></div>
      <div className="mt-5 space-y-3">
        {pendingReviewSessions.length === 0 && <p className="rounded-2xl bg-white/70 p-4 text-sm font-bold text-slate-400">確認が必要な学習記録はありません。</p>}
        {pendingReviewSessions.map((session) => <div key={session.id} className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-black text-slate-800">{taskTitle(session)}</div><div className="mt-1 text-xs font-bold text-slate-500">{session.date || '日付不明'} / {subject(session)} / {session.taskSnapshot?.activityType || 'other'} / {formatHms(session.recordedSeconds)}</div></div><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700">pending_review</span></div>
          <div className="mt-3 text-xs font-bold text-slate-600">理由: {(session.validation?.reasonCodes || []).join(', ') || 'なし'}</div>
          <details className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><summary className="cursor-pointer font-black">監査情報を表示</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{JSON.stringify({ segments: session.segments || [], legacySource: session.legacySource || null, migrationReview: session.migrationReview || null, manualReview: session.manualReview || null }, null, 2)}</pre></details>
          <button type="button" disabled={Boolean(busySessionIds[session.id])} onClick={() => onOpenCorrection(session, 'valid')} className="mt-4 w-full rounded-xl bg-amber-600 py-3 text-sm font-black text-white disabled:opacity-50">確認して確定</button>
        </div>)}
      </div>
    </section>
    <section className="rounded-[2rem] border border-rose-100 bg-rose-50/60 p-5 sm:p-7">
      <div className="flex items-center gap-3"><ShieldCheck className="text-rose-600"/><div><h2 className="font-black text-slate-800">報酬回収保留</h2><p className="text-xs font-bold text-slate-500">保留中は購入・新規戦闘がロックされます。</p></div></div>
      <div className="mt-4 rounded-2xl bg-white/70 p-3 text-xs font-bold text-slate-600">現在: GOLD {profile.gold || 0} / Battle Energy {profile.battleEnergy || 0}</div>
      <div className="mt-4 space-y-3">
        {pendingCorrectionSessionIds.length === 0 && <p className="rounded-2xl bg-white/70 p-4 text-sm font-bold text-slate-400">回収保留はありません。</p>}
        {pendingCorrectionSessionIds.map((sessionId) => { const session = studySessions.find((item) => item.id === sessionId); const ledger = ledgersBySessionId[sessionId]; const deduction = ledger?.pendingCorrection?.deduction; const materialBalance = deduction?.material?.key ? Number(profile.materials?.[deduction.material.key]) || 0 : null; return <div key={sessionId} className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-sm font-black text-slate-800">{session ? taskTitle(session) : '学習記録'}</div><div className="mt-1 text-[11px] font-bold text-slate-500">Session ID: {sessionId}{session ? ` / ${formatHms(session.recordedSeconds)}` : ''}</div><div className="mt-1 text-xs font-bold text-slate-500">報酬回収保留中 {deduction ? ` / GOLD ${deduction.gold}, Energy ${deduction.battleEnergy}, ${deduction.material?.key} ${deduction.material?.quantity}` : ''}</div>{materialBalance !== null && <div className="mt-1 text-[11px] font-bold text-slate-500">対象素材の残高: {deduction.material.key} {materialBalance}</div>}{ledger?.pendingCorrection?.requestedBy && <div className="mt-1 text-[11px] font-bold text-slate-500">依頼者: {ledger.pendingCorrection.requestedBy}</div>}<button type="button" disabled={Boolean(busySessionIds[sessionId])} onClick={() => onRetry(sessionId)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"><RefreshCw size={14}/> 回収を再試行</button></div>; })}
      </div>
    </section>
  </div>;
}
