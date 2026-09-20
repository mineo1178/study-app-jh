import { useState } from 'react';
import RpgWalletPanel from './RpgWalletPanel.jsx';
import RpgShop from './RpgShop.jsx';
import EquipmentPanel from './EquipmentPanel.jsx';

export default function RpgHub({ profile, onPurchaseRequest, onEquip, onUnequip, pendingItemId, pendingAction, status }) {
  const [section, setSection] = useState('shop');
  return <section className="space-y-6 animate-in fade-in duration-500"><div><p className="text-[10px] font-black tracking-widest text-violet-600">STUDY ADVENTURE</p><h1 className="text-2xl font-black text-slate-800">RPG</h1></div><RpgWalletPanel profile={profile}/><div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1"><button type="button" onClick={() => setSection('shop')} className={`rounded-xl py-3 text-sm font-black ${section === 'shop' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>ショップ</button><button type="button" onClick={() => setSection('equipment')} className={`rounded-xl py-3 text-sm font-black ${section === 'equipment' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>装備</button></div>{status && <div className={`rounded-xl px-4 py-3 text-sm font-bold ${status.kind === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{status.message}</div>}{section === 'shop' ? <RpgShop profile={profile} onPurchaseRequest={onPurchaseRequest} pendingItemId={pendingItemId}/> : <EquipmentPanel profile={profile} onEquip={onEquip} onUnequip={onUnequip} pendingAction={pendingAction}/>}</section>;
}
