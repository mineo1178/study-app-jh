import { MATERIAL_DEFS } from '../../rpg/rewardConfig.js';
import { MATERIAL_EXCHANGE_GIVE, MATERIAL_EXCHANGE_RECEIVE } from '../../data/rpgMaterialExchangeRepository.js';

export default function MaterialExchangeConfirmModal({ exchange, profile, exchanging, onCancel, onConfirm }) {
  if (!exchange) return null;
  const source = MATERIAL_DEFS[exchange.sourceMaterialKey];
  const target = MATERIAL_DEFS[exchange.targetMaterialKey];
  const sourceBefore = Number(profile?.materials?.[exchange.sourceMaterialKey]) || 0;
  const targetBefore = Number(profile?.materials?.[exchange.targetMaterialKey]) || 0;
  return <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/60 p-4"><section role="dialog" aria-modal="true" className="w-[calc(100vw-32px)] max-w-md rounded-[2rem] bg-white p-6 shadow-2xl"><h2 className="text-xl font-black text-slate-800">素材を交換しますか？</h2><p className="mt-3 text-sm font-bold leading-relaxed text-slate-600">{source?.label}を{MATERIAL_EXCHANGE_GIVE}個使って<br/>{target?.label}を{MATERIAL_EXCHANGE_RECEIVE}個受け取ります。</p><div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700"><p>{source?.label} {sourceBefore} → {sourceBefore - MATERIAL_EXCHANGE_GIVE}</p><p className="mt-2">{target?.label} {targetBefore} → {targetBefore + MATERIAL_EXCHANGE_RECEIVE}</p></div><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={exchanging} onClick={onCancel} className="rounded-xl bg-slate-100 py-3 text-sm font-black text-slate-600 disabled:opacity-50">キャンセル</button><button type="button" disabled={exchanging} onClick={onConfirm} className="rounded-xl bg-violet-600 py-3 text-sm font-black text-white disabled:bg-slate-300">{exchanging ? '交換処理中…' : '交換する'}</button></div></section></div>;
}
