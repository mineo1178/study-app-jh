import { readCompanionGrowth } from '../../rpg/companionGrowthSelectors.js';
import CompanionGrowthPanel from './CompanionGrowthPanel.jsx';
import { useState } from 'react';
import { PARTY_MEMBER_CATALOG } from '../../rpg/partyMemberCatalog.js';
import { normalizePlayerProfile } from '../../rpg/playerProfile.js';
import { partyPreview, partySummary, partyRoleLabel } from '../../rpg/battlePreparation.js';
import { ELEMENT_LABELS } from '../../rpg/elementConfig.js';
import { MemberPreparation } from './PreparationDetails.jsx';

export default function PartyPanel(props) {
  try { const safe = normalizePlayerProfile(props.profile || {}); for (const id of safe.unlockedPartyMemberIds.filter(id => id !== 'hero')) readCompanionGrowth(safe, id); }
  catch { return <p role="alert">育成データを確認できません。保存済みデータを変更せず停止しています。</p>; }
  return <PartyEditor {...props}/>;
}
function PartyEditor({ profile, onSave, pending, locked, onSaveGrowth, onPendingChange }) {
  const [memberId, setMemberId] = useState(null);
  const [growthPending, setGrowthPending] = useState(false);
  const safe = normalizePlayerProfile(profile || {});
  const [ids, setIds] = useState(safe.partyMemberIds);
  const disabled = Boolean(pending || growthPending || locked || safe.activeBattleId);
  const toggle = id => {
    if (disabled || id === 'hero' || !safe.unlockedPartyMemberIds.includes(id)) return;
    setIds(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 3 ? [...current, id] : current);
  };
  const before = partySummary(partyPreview(safe, safe.partyMemberIds));
  const after = partySummary(partyPreview(safe, ids));
  const changed = JSON.stringify(ids) !== JSON.stringify(safe.partyMemberIds);
  return <section className="space-y-4">
    <p className="text-sm font-bold text-slate-600">主人公を含む最大3人。候補を選び、「この編成で保存」で確定します。戦闘中は変更できません。</p>
    <div className="rounded-2xl bg-violet-50 p-4 text-sm text-slate-700" aria-live="polite"><h2 className="font-black">編成の比較（保存前）</h2><p className="mt-2">合計HP：{before.maxHp} → {after.maxHp}</p><p>合計攻撃力：{before.attack} → {after.attack}</p>{[['heal', '回復'], ['guard', '防御'], ['area', '全体攻撃']].map(([key, label]) => <p key={key}>{label}スキル：{before[key] ? 'あり' : 'なし'} → {after[key] ? 'あり' : 'なし'}</p>)}<p className="break-words">属性攻撃：{before.elements.map(element => ELEMENT_LABELS[element] || element).join('・') || 'なし'} → {after.elements.map(element => ELEMENT_LABELS[element] || element).join('・') || 'なし'}</p><p className="mt-2 text-xs">合計値は参考情報です。勝敗を示すものではありません。Campaignは主人公だけが参加します。</p></div>
    <div className="flex flex-wrap gap-2"><button type="button" disabled={disabled || !changed} onClick={() => onSave?.(ids)} className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white disabled:bg-slate-300">{pending ? '保存中…' : 'この編成で保存'}</button><button type="button" disabled={disabled || !changed} onClick={() => setIds(safe.partyMemberIds)} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold disabled:opacity-50">候補を戻す</button></div>
    {memberId && <CompanionGrowthPanel key={memberId} profile={safe} memberId={memberId} onSave={onSaveGrowth} locked={disabled} onPendingChange={value => { setGrowthPending(value); onPendingChange?.(value); }}/>}
    <div className="grid gap-3 sm:grid-cols-2">{Object.values(PARTY_MEMBER_CATALOG).map(member => {
      const selected = ids.includes(member.id);
      const unlocked = safe.unlockedPartyMemberIds.includes(member.id);
      const snapshot = unlocked ? partyPreview(safe, member.id === 'hero' ? ['hero'] : ['hero', member.id]).find(entry => entry.memberId === member.id) : null;
      return <article key={member.id} className={`min-w-0 break-words rounded-2xl border-2 p-4 ${selected ? 'border-violet-500 bg-violet-50' : 'border-slate-100 bg-white'}`}>
        {snapshot ? <MemberPreparation member={snapshot}/> : <><h2 className="font-black">{member.name} 🔒</h2><p className="text-xs">{partyRoleLabel(member.role)} ・ 未解放</p></>}
        <p className="mt-2 text-xs font-bold text-slate-500">{safe.partyMemberIds.includes(member.id) ? '保存済み：編成中' : '保存済み：編成外'} / {selected ? '候補：編成中' : '候補：編成外'}</p>
        <button type="button" aria-pressed={selected} disabled={disabled || !unlocked || member.id === 'hero' || (!selected && ids.length >= 3)} onClick={() => toggle(member.id)} className="mt-3 rounded-lg bg-violet-600 px-4 py-3 text-xs font-black text-white disabled:bg-slate-300">{member.id === 'hero' ? '主人公は固定' : selected ? '候補から外す' : unlocked ? '候補に入れる' : '未解放'}</button>
        {member.id !== 'hero' && <button type="button" disabled={disabled || !unlocked} onClick={() => setMemberId(member.id)} className="ml-2 mt-3 min-h-11 rounded-lg bg-violet-100 px-4 py-3 text-xs font-black disabled:opacity-50">{member.name}を育成</button>}
      </article>;
    })}</div>
  </section>;
}
