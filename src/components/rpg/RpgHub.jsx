import { useState } from 'react';
import RpgWalletPanel from './RpgWalletPanel.jsx';
import RpgShop from './RpgShop.jsx';
import EquipmentPanel from './EquipmentPanel.jsx';
import BattlePanel from './BattlePanel.jsx';
import QuestBoard from './QuestBoard.jsx';
import MaterialCatalog from './MaterialCatalog.jsx';
import MaterialExchange from './MaterialExchange.jsx';
import PartyPanel from './PartyPanel.jsx';

export default function RpgHub({ profile, progress, towerProgress, questState, onClaimQuest, pendingQuestId, onPurchaseRequest, onMaterialExchangeRequest, pendingMaterialExchange, onEquip, onUnequip, pendingItemId, pendingAction, status, battle, onStartBattleRequest, onAttackBattle, onUseBattleSkill, startingEnemyId, attacking, onBattleBack, battleFeedback, onSaveParty, savingParty }) {
  const [section, setSection] = useState('battle');
  return <section className="space-y-6 animate-in fade-in duration-500"><div><p className="text-[10px] font-black tracking-widest text-violet-600">STUDY ADVENTURE</p><h1 className="text-2xl font-black text-slate-800">RPG</h1></div><RpgWalletPanel profile={profile}/><div className="grid grid-cols-2 sm:grid-cols-6 rounded-2xl bg-slate-100 p-1">{[['battle', '戦闘'], ['party', 'パーティー'], ['quest', 'クエスト'], ['shop', 'ショップ'], ['equipment', '装備'], ['materials', '素材']].map(([id, label]) => <button type="button" key={id} onClick={() => setSection(id)} className={`rounded-xl py-3 text-sm font-black ${section === id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div>{status && <div className={`rounded-xl px-4 py-3 text-sm font-bold ${status.kind === 'error' ? 'bg-rose-50 text-rose-700' : 'text-emerald-700'}`}>{status.message}</div>}{section === 'battle' ? <BattlePanel profile={profile} progress={progress} towerProgress={towerProgress} battle={battle} onStartRequest={onStartBattleRequest} onAttack={onAttackBattle} onSkill={onUseBattleSkill} startingEnemyId={startingEnemyId} attacking={attacking} onBack={onBattleBack} feedback={battleFeedback}/> : section === 'party' ? <PartyPanel profile={profile} onSave={onSaveParty} pending={savingParty}/> : section === 'quest' ? <QuestBoard profile={profile} progress={progress} questState={questState} onClaim={onClaimQuest} pendingQuestId={pendingQuestId}/> : section === 'shop' ? <RpgShop profile={profile} onPurchaseRequest={onPurchaseRequest} pendingItemId={pendingItemId}/> : section === 'equipment' ? <EquipmentPanel profile={profile} onEquip={onEquip} onUnequip={onUnequip} pendingAction={pendingAction}/> : <div className="space-y-8"><MaterialCatalog materials={profile?.materials}/><MaterialExchange profile={profile} onExchangeRequest={onMaterialExchangeRequest} pending={pendingMaterialExchange}/></div>}</section>;
}
