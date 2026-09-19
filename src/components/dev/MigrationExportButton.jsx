import { useState } from 'react';
import { Download } from 'lucide-react';
import { createMigrationExport, downloadMigrationExport, migrationExportFilename } from '../../data/exportMigrationData';

export default function MigrationExportButton({ tasks, studySessions, activeTimer }) {
  const [result, setResult] = useState(null);
  const handleExport = () => {
    const payload = createMigrationExport({ tasks, studySessions, activeTimers: activeTimer ? [{ id: 'current', ...activeTimer }] : [] });
    downloadMigrationExport(payload, migrationExportFilename());
    setResult({ tasks: payload.tasks.length, sessions: payload.studySessions.length });
  };
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-left">
      <div className="text-[10px] font-black tracking-widest text-slate-400">DEVELOPMENT ONLY</div>
      <button type="button" onClick={handleExport} className="mt-2 flex w-full items-center justify-between rounded-xl bg-white px-3 py-3 text-xs font-black text-slate-700 shadow-sm hover:bg-blue-50">
        <span>Migration用データを書き出す</span><Download size={15}/>
      </button>
      <p className="mt-2 text-[10px] font-bold text-slate-400">読み取り専用・Firestoreへ書き込みません</p>
      {result && <p className="mt-1 text-[10px] font-black text-emerald-600">Task: {result.tasks}件 / StudySession: {result.sessions}件。JSONを書き出しました。</p>}
    </div>
  );
}
