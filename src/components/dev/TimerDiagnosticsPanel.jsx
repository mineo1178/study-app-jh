import { useState, useSyncExternalStore } from 'react';
import { diagnosticTimerState, timerDiagnostics } from '../../timer/timerDiagnostics.js';

const time = (value) => typeof value === 'number' && Number.isFinite(value) ? new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—';

export default function TimerDiagnosticsPanel({ timer, authenticated, isOwner }) {
  const entries = useSyncExternalStore(timerDiagnostics.subscribe, timerDiagnostics.getSnapshot, timerDiagnostics.getSnapshot);
  const [expanded, setExpanded] = useState(true);
  const [exportText, setExportText] = useState('');
  const [message, setMessage] = useState('');
  const state = diagnosticTimerState(timer, entries.at(-1)?.timestamp || 0);
  const copy = async () => {
    const text = timerDiagnostics.export();
    setExportText(text);
    try { await navigator.clipboard.writeText(text); setMessage('診断ログをコピーしました。'); }
    catch { setMessage('下の欄を選択して診断ログをコピーしてください。'); }
  };
  return <aside aria-label="タイマー診断" className="fixed bottom-3 left-3 z-[180] w-[calc(100vw-24px)] max-w-md rounded-2xl border border-amber-300 bg-slate-950 p-4 text-xs text-white shadow-2xl">
    <div className="flex items-center justify-between gap-2"><h2 className="font-black">タイマー診断（端末内のみ）</h2><button type="button" onClick={() => setExpanded(!expanded)} className="min-h-11 rounded-lg bg-white/15 px-3">{expanded ? '折りたたむ' : '開く'}</button></div>
    {expanded && <div className="max-h-[65dvh] overflow-y-auto break-words">
      <p className="mt-2 leading-relaxed">再発したら、再読み込みする前に「ログをコピー」を押してください。学習内容やログイン情報は記録しません。</p>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt>状態</dt><dd>{state.status} / stale: {String(state.stale)}</dd>
        <dt>timerId</dt><dd className="break-all">{state.timerId || '—'}</dd>
        <dt>startedAt</dt><dd>{time(state.startedAt)}</dd>
        <dt>lastHeartbeatAt</dt><dd>{time(state.lastHeartbeatAt)}</dd>
        <dt>visibility</dt><dd>{entries.at(-1)?.visibility || 'unknown'}</dd>
        <dt>online</dt><dd>{String(entries.at(-1)?.online ?? 'unknown')}</dd>
        <dt>認証 / 所有者</dt><dd>{String(authenticated)} / {String(isOwner)}</dd>
      </dl>
      <button type="button" onClick={copy} className="mt-3 min-h-11 w-full rounded-lg bg-amber-300 px-3 font-black text-slate-950">ログをコピー（最大300件）</button>
      {message && <p role="status" className="mt-2">{message}</p>}
      {exportText && <textarea aria-label="コピー用診断ログ" readOnly value={exportText} className="mt-2 h-28 w-full rounded-lg bg-white p-2 text-slate-900"/>}
      <ol className="mt-3 space-y-2">{entries.slice(-20).reverse().map((entry) => <li key={entry.id} className="rounded-lg bg-white/10 p-2"><p>{time(entry.timestamp)} {entry.event}</p><p className="break-all text-slate-300">{JSON.stringify(entry)}</p></li>)}</ol>
    </div>}
  </aside>;
}
