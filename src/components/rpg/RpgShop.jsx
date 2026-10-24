import { useState } from 'react';
import { EQUIPMENT_CATALOG } from '../../rpg/equipmentCatalog.js';
import { RESOURCE_SHOP_CATALOG } from '../../rpg/resourceShopCatalog.js';
import { resourceTransactionState } from '../../rpg/resourceTransactions.js';
import ShopItemCard from './ShopItemCard.jsx';
import ResourceOfferDetails from './ResourceOfferDetails.jsx';

export default function RpgShop({ profile, onPurchaseRequest, pendingItemId }) {
  const [category, setCategory] = useState('equipment');
  return <section className="space-y-4"><div><p className="text-[10px] font-black tracking-widest text-slate-400">GOLD SHOP</p><h2 className="text-xl font-black text-slate-800">ショップ</h2></div><div className="grid grid-cols-3 gap-2" aria-label="商品カテゴリ">{[['equipment', '装備'], ['materials', '学習素材'], ['alchemy', '錬金素材']].map(([id, label]) => <button key={id} type="button" aria-pressed={category === id} onClick={() => setCategory(id)} className={category === id ? 'rounded-xl bg-blue-600 p-3 text-xs font-black text-white' : 'rounded-xl bg-slate-100 p-3 text-xs font-black text-slate-700'}>{label}</button>)}</div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{category === 'equipment' ? Object.values(EQUIPMENT_CATALOG).map(item => <ShopItemCard key={item.id} item={item} profile={profile} purchasing={pendingItemId === item.id} disabled={Boolean(pendingItemId)} onPurchase={onPurchaseRequest}/>) : Object.values(RESOURCE_SHOP_CATALOG).filter(item => item.category === category).map(item => {
    const state = resourceTransactionState(profile, item);
    return <article key={item.id} className="min-w-0 space-y-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"><h3 className="font-black text-slate-800">{item.name} ×1</h3><p className="text-xs font-bold leading-relaxed text-slate-500">{item.description}</p><p className="font-black text-amber-700">{item.cost.gold} GOLD</p><ResourceOfferDetails profile={profile} offer={item}/><p className={state.available ? 'text-xs font-bold text-emerald-700' : 'text-xs font-bold text-rose-700'}>{state.available ? '購入可能' : 'GOLD不足'}</p><button type="button" disabled={!state.available || Boolean(pendingItemId)} onClick={() => onPurchaseRequest?.(item)} className="w-full rounded-xl bg-blue-600 py-3 text-sm font-black text-white disabled:bg-slate-300">{pendingItemId === item.id ? '購入処理中…' : '購入する'}</button></article>;
  })}</div></section>;
}
