import { MATERIAL_DEFS } from '../../rpg/rewardConfig';
export default function MaterialInventory({ materials }) {
  const owned = Object.entries(materials || {}).filter(([, value]) => Number(value) > 0);
  if (!owned.length) return <p className="mt-3 text-xs font-bold text-slate-400">所持素材はありません</p>;
  return <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{owned.map(([key, value]) => <div key={key} className="flex min-w-0 justify-between rounded-xl bg-violet-50 px-3 py-2 text-xs font-bold text-violet-900"><span className="truncate">{MATERIAL_DEFS[key]?.label || key}</span><span>{value}</span></div>)}</div>;
}
