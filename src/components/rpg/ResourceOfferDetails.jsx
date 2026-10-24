import { resourceTransactionState } from '../../rpg/resourceTransactions.js';

export default function ResourceOfferDetails({ profile, offer }) {
  const state = resourceTransactionState(profile, offer);
  return <div className="space-y-2 text-xs font-bold text-slate-600">{state.rows.map(row => <div key={row.key} className="rounded-xl bg-slate-50 p-3"><p className="font-black text-slate-800">{row.label}</p><p>消費 {row.spend} ／ 受取 {row.receive}</p><p>所持 {row.before} → {row.after < 0 ? '取引できません' : row.after}</p>{row.shortage > 0 && <p className="text-rose-700">あと{row.shortage}{row.key === 'gold' ? ' GOLD' : '個'}不足</p>}</div>)}</div>;
}
