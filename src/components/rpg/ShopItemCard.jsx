import { MATERIAL_DEFS } from '../../rpg/rewardConfig.js';
import { getShopItemState } from '../../rpg/shopUiLogic.js';
import { getEquipmentDisplayStats } from '../../rpg/equipmentDisplay.js';

const SLOT_LABELS = { weapon: '武器', armor: '防具', accessory: 'アクセサリー' };

export default function ShopItemCard({ item, profile, onPurchase, purchasing }) {
  const state = getShopItemState(profile, item);
  const stats = getEquipmentDisplayStats(item);
  if (!item) return null;
  return <article className="flex min-w-0 flex-col rounded-[1.5rem] border border-slate-100 bg-white p-5 text-left shadow-sm">
    <div className="flex items-start justify-between gap-2"><div><h3 className="text-base font-black text-slate-800">{item.name}</h3><p className="mt-1 text-[10px] font-black tracking-wider text-blue-600">{SLOT_LABELS[item.slot] || item.slot} ・ {String(item.rarity || 'common').toUpperCase()}</p></div></div>
    <p className="mt-3 min-h-10 text-xs font-bold leading-relaxed text-slate-500">{item.description || '説明はありません。'}</p>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-black"><div className="rounded-lg bg-blue-50 p-2 text-blue-700">攻撃力 +{stats.attack}</div><div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">防御力 +{stats.defense}</div></div><p className="mt-2 text-xs font-bold text-slate-500">特殊能力：{stats.specialAbilityLabel}</p>
    <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">{state.goldRequired.toLocaleString('ja-JP')} GOLD</div>
    <div className="mt-2 space-y-1 text-xs font-bold text-slate-600">{Object.entries(item.cost?.materials || {}).map(([key, required]) => { const current = Number(profile?.materials?.[key]) || 0; const short = current < Number(required); return <div key={key} className={short ? 'text-rose-600' : ''}>{MATERIAL_DEFS[key]?.label || key} <span className="font-black">{current} / {required}</span></div>; })}</div>
    <div className="mt-4 min-h-5 text-xs font-bold">{state.owned ? <span className="text-emerald-600">所有済み</span> : state.insufficientGold ? <span className="text-rose-600">{state.goldShortage.toLocaleString('ja-JP')} GOLD不足</span> : state.insufficientMaterials ? <span className="text-rose-600">素材不足</span> : <span className="text-emerald-600">購入可能</span>}</div>
    {!state.owned && <button type="button" disabled={!state.purchasable || purchasing} onClick={() => onPurchase?.(item)} className="mt-2 w-full rounded-xl bg-blue-600 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200">{purchasing ? '購入処理中…' : '購入する'}</button>}
  </article>;
}
