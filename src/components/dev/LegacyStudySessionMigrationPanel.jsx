import { useMemo, useState } from 'react';
import { AlertTriangle, Database, Download } from 'lucide-react';
import { createMigrationExport, downloadMigrationExport, migrationExportFilename } from '../../data/exportMigrationData';
import { buildLegacyMigrationPreflight, isLegacyMigrationCompleted, isMigrationConfirmationValid, migrationConfirmationText } from '../../data/legacyMigrationPreflight';
import { createLegacyStudySessions } from '../../data/studySessionRepository';

const blockerLabel = {
  UNRESOLVED_PENDING_REVIEW: '未解決のpending_reviewがあります',
  ACTIVE_TIMER_EXISTS: '計測中のActiveTimerがあります',
  LEGACY_SOURCE_DUPLICATE: 'legacySourceの重複があります',
  DOCUMENT_ID_COLLISION: '生成予定document IDが既存データと衝突しています',
  CANDIDATE_COUNT_CHANGED: '前回確認時から候補件数が変化しています',
  CANDIDATE_GENERATION_ERROR: '候補生成でエラーが発生しました',
};

export default function LegacyStudySessionMigrationPanel({ db, familyId, tasks, studySessions, activeTimer, onMigrationComplete }) {
  const [confirmation, setConfirmation] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [result, setResult] = useState(null);
  const preflight = useMemo(() => buildLegacyMigrationPreflight({
    tasks,
    studySessions,
    activeTimers: activeTimer ? [activeTimer] : [],
  }), [tasks, studySessions, activeTimer]);
  const migrationCompleted = isLegacyMigrationCompleted(preflight);
  const confirmationText = migrationConfirmationText(preflight.migrationCandidateCount || 0);
  const confirmationValid = isMigrationConfirmationValid(preflight, confirmation);
  const visibleBlockers = migrationCompleted
    ? preflight.blockers?.filter((blocker) => blocker !== 'CANDIDATE_COUNT_CHANGED')
    : preflight.blockers;
  const verifiedLegacySourceUniqueCount = result?.verification
    ? new Set(result.verification.candidates.length === 0
      ? result.studySessions.filter((session) => session.legacySource?.taskId).map((session) => `${session.legacySource.taskId}:${session.legacySource.historyId || ''}`)
      : []).size
    : 0;

  const handleBackup = () => {
    const payload = createMigrationExport({ tasks, studySessions, activeTimers: activeTimer ? [{ id: 'current', ...activeTimer }] : [] });
    downloadMigrationExport(payload, migrationExportFilename());
  };

  const handleApply = async () => {
    if (migrationCompleted || !confirmationValid || isApplying) return;
    handleBackup();
    setIsApplying(true);
    setResult(null);
    try {
      const writeResult = await createLegacyStudySessions({ db, familyId, candidates: preflight.candidates });
      const verification = buildLegacyMigrationPreflight({ tasks, studySessions: writeResult.studySessions, activeTimers: activeTimer ? [activeTimer] : [] });
      setResult({ ...writeResult, verification });
      await onMigrationComplete?.();
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-left">
      <div className="flex items-center gap-2 text-[10px] font-black tracking-widest text-amber-700"><Database size={14}/> DEVELOPMENT ONLY</div>
      <h2 className="mt-1 text-sm font-black text-slate-800">Legacy StudySession Migration</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-600">
        <span>Task: {preflight.taskCount || 0}</span><span>legacy history: {preflight.legacyHistoryCount || 0}</span>
        <span>既存StudySession: {preflight.existingStudySessionCount || 0}</span><span>migration候補: {preflight.migrationCandidateCount || 0}</span>
        <span>既存除外: {preflight.alreadyMigratedCount || 0}</span><span>ActiveTimer: {preflight.activeTimerCount || 0}</span>
        <span>manual invalid: {preflight.manualInvalidCount || 0}</span><span>manual valid: {preflight.manualValidCount || 0}</span>
        <span className="col-span-2">unresolved pending_review: {preflight.unresolvedPendingReviewCount || 0}</span>
      </div>
      {migrationCompleted && <p className="mt-3 rounded-lg bg-emerald-100 p-2 text-[10px] font-black text-emerald-800">Migration completed: {preflight.alreadyMigratedCount}件は移行済みです。</p>}
      {preflight.candidateCountChanged && !migrationCompleted && <p className="mt-3 rounded-lg bg-amber-100 p-2 text-[10px] font-black text-amber-800">前回確認: 292 / 現在: {preflight.migrationCandidateCount}。再確認が必要です。</p>}
      {visibleBlockers?.length > 0 && <div className="mt-3 rounded-lg bg-rose-50 p-2 text-[10px] font-bold text-rose-700"><AlertTriangle className="mr-1 inline" size={13}/>{visibleBlockers.map((blocker) => blockerLabel[blocker] || blocker).join(' / ')}</div>}
      <p className="mt-3 text-[10px] font-bold text-slate-500">適用前: 有効 {preflight.before?.effectiveSessionCount || 0}件 / {preflight.before?.effectiveStudySeconds || 0}秒。適用後想定: 有効 {preflight.projected?.effectiveSessionCount || 0}件 / {preflight.projected?.effectiveStudySeconds || 0}秒（手動判定による差分: {preflight.effectiveSessionCountDelta || 0}件 / {preflight.effectiveStudySecondsDelta || 0}秒）。</p>
      <button type="button" onClick={handleBackup} className="mt-3 flex w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-amber-100"><span>migration backup JSONを書き出す</span><Download size={14}/></button>
      <label className="mt-3 block text-[10px] font-black text-slate-600">{migrationCompleted ? '確認文字列: 移行済みのため入力不要' : `確認文字列: ${confirmationText}`}
        <input value={confirmation} disabled={migrationCompleted || isApplying} onChange={(event) => setConfirmation(event.target.value)} placeholder={confirmationText} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2 py-2 text-xs disabled:cursor-not-allowed disabled:bg-slate-100" />
      </label>
      <button type="button" disabled={migrationCompleted || !confirmationValid || isApplying} onClick={handleApply} className="mt-2 w-full rounded-xl bg-rose-600 px-3 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">{migrationCompleted ? '移行済み' : isApplying ? 'Migration中…' : `StudySessionを${preflight.migrationCandidateCount || 0}件createする`}</button>
      <p className="mt-2 text-[10px] font-bold text-slate-500">task.historyは削除せず、既存StudySessionも上書きしません。</p>
      {result?.error && <p className="mt-2 text-[10px] font-black text-rose-600">Migration stopped: {result.error}</p>}
      {result?.verification && <div className="mt-2 rounded-lg bg-emerald-50 p-2 text-[10px] font-bold text-emerald-800">requested: {result.requested} / created: {result.created} / skipped: {result.skipped} / failed: {result.failed}<br/>StudySession総数: {result.verification.existingStudySessionCount} / legacySource unique数: {verifiedLegacySourceUniqueCount}<br/>manual invalid: {result.verification.manualInvalidCount} / manual valid: {result.verification.manualValidCount} / unresolved: {result.verification.unresolvedPendingReviewCount}<br/>{result.verification.migrationCandidateCount === 0 ? 'Idempotency verified: migration candidate = 0' : 'Migration incomplete'}</div>}
    </div>
  );
}
