import { useState } from 'react';
export function LedgerRewardSummary({ ledger }) {
  if (!ledger) return <p className="text-xs text-slate-500">報酬台帳はまだありません。</p>;
  const gold = ledger.status === 'reversed' ? 0 : (ledger.effectiveRewards || ledger.rewards)?.gold;
  if (!Number.isFinite(gold)) return <p className="text-xs text-slate-500">確定報酬を確認できません。</p>;
  return <div className="space-y-1 text-xs text-amber-700"><p>保存済み確定報酬：GOLD {gold.toLocaleString('ja-JP')}G{ledger.status === 'reversed' && '（取消済み）'}</p><p>初回付与：{Number(ledger.rewards?.gold || 0).toLocaleString('ja-JP')}G</p>{ledger.correctionStatus === 'reversal_pending' && <p>報酬の回収が保留中です。</p>}</div>;
}
export default function StudyRewardHistory({ sessionId, loadLedger }) {
  const [ledger, setLedger] = useState(undefined), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const load = async () => { if (loading) return; setLoading(true); setError(''); try { setLedger(await loadLedger(sessionId)); } catch { setError('報酬台帳を読み込めませんでした。再試行してください。'); } finally { setLoading(false); } };
  return <div className="mt-2 space-y-2"><button type="button" disabled={loading} onClick={load} className="min-h-11 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50">{loading ? '報酬を確認中…' : '報酬台帳を確認'}</button>{error && <p role="alert" className="text-xs text-rose-600">{error}</p>}{ledger !== undefined && <LedgerRewardSummary ledger={ledger}/>}</div>;
}
