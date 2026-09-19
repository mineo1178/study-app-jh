import { Clock } from 'lucide-react';
import { formatHms } from '../../data/studySessionSelectors';

export default function LiveStudyStatus({ session, compact = false }) {
  if (!session) return null;
  const stale = session.isStale;
  return (
    <div className={compact ? 'mt-2 flex items-center justify-between gap-2' : 'mt-3 rounded-2xl bg-blue-50 p-3'}>
      <span className={`inline-flex items-center gap-1 text-[10px] font-black ${stale ? 'text-amber-600' : 'text-blue-600'}`}>
        <span className={`h-2 w-2 rounded-full ${stale ? 'bg-amber-500' : 'bg-blue-500 animate-pulse'}`} />
        {stale ? '要確認' : '勉強中'}
      </span>
      {stale
        ? <span className="text-[10px] font-bold text-amber-600">最後の確認で固定</span>
        : <span className="inline-flex items-center gap-1 font-mono text-base font-black text-blue-700"><Clock size={13} />{formatHms(session.recordedSeconds)}</span>}
    </div>
  );
}
