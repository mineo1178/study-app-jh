import { useState } from 'react';
import RpgWalletPanel from './RpgWalletPanel.jsx';
import RpgShop from './RpgShop.jsx';
import EquipmentPanel from './EquipmentPanel.jsx';
import BattlePanel from './BattlePanel.jsx';

export default function RpgHub({ profile, progress, onPurchaseRequest, onEquip, onUnequip, pendingItemId, pendingAction, status, battle, onStartBattleRequest, onAttackBattle, onUseBattleSkill, startingEnemyId, attacking, onBattleBack, battleFeedback }) {
  const [section, setSection] = useState('battle');
  return <section className="space-y-6 animate-in fade-in duration-500"><div><p className="text-[10px] font-black tracking-widest text-violet-600">STUDY ADVENTURE</p><h1 className="text-2xl font-black text-slate-800">RPG</h1></div><RpgWalletPanel profile={profile}/><div className="grid grid-cols-3 rounded-2xl bg-slate-100 p-1">{[['battle', '戦闘'], ['shop', 'ショップ'], ['equipment', '装備']].map(([id, label]) => <button type="button" key={id} onClick={() => setSection(id)} className={`rounded-xl py-3 text-sm font-black ${section === id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div>{status && <div className={`rounded-xl px-4 py-3 text-sm font-bold ${status.kind === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{status.message}</div>}{section === 'battle' ? <BattlePanel profile={profile} progress={progress} battle={battle} onStartRequest={onStartBattleRequest} onAttack={onAttackBattle} onSkill={onUseBattleSkill} startingEnemyId={startingEnemyId} attacking={attacking} onBack={onBattleBack} feedback={battleFeedback}/> : section === 'shop' ? <RpgShop profile={profile} onPurchaseRequest={onPurchaseRequest} pendingItemId={pendingItemId}/> : <EquipmentPanel profile={profile} onEquip={onEquip} onUnequip={onUnequip} pendingAction={pendingAction}/>}</section>;
}
