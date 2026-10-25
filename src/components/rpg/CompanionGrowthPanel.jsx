import { useEffect, useRef, useState } from 'react';
import { PARTY_MEMBER_CATALOG } from '../../rpg/partyMemberCatalog.js';
import { partyPreview } from '../../rpg/battlePreparation.js';
import { COMPANION_POINT_CAPS, COMPANION_RESET_GOLD, companionEffectDescription } from '../../rpg/companionGrowthCatalog.js';
import { companionDefinition, companionNodeState, readCompanionGrowth } from '../../rpg/companionGrowthSelectors.js';
import { createRpgActionId } from '../../data/rpgShopRepository.js';
import { MemberPreparation } from './PreparationDetails.jsx';
const errors = { COMPANION_PROFILE_CHANGED: '別端末で更新されました。最新状態で読み直してください。', COMPANION_CHANGE_DURING_BATTLE: '戦闘中は育成できません。', INSUFFICIENT_GOLD: 'GOLDが不足しています。', REWARD_CORRECTION_PENDING: '報酬訂正が保留中のため振り直せません。', PARTY_MEMBER_LOCKED: 'この仲間は未解放です。' };
export default function CompanionGrowthPanel(props) {
  try { readCompanionGrowth(props.profile, props.memberId); }
  catch { return <p role="alert">育成データを確認できません。保存済みデータは変更していません。</p>; }
  if (!props.profile.unlockedPartyMemberIds.includes(props.memberId)) return <p role="alert">未解放の仲間は育成できません。</p>;
  return <GrowthEditor {...props}/>;
}
function GrowthEditor({ profile, memberId, onSave, locked, onPendingChange }) {
  const [source, setSource] = useState(() => readCompanionGrowth(profile, memberId));
  const [allocation, setAllocation] = useState(source.allocation), [nodes, setNodes] = useState(source.unlockedNodeIds);
  const [request, setRequest] = useState(null), [pending, setPending] = useState(false), [message, setMessage] = useState('');
  const saving = useRef(false), heading = useRef(null), confirmButton = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { if (request) confirmButton.current?.focus(); }, [request]);
  const member = PARTY_MEMBER_CATALOG[memberId], definition = companionDefinition(memberId);
  const draft = { ...profile, companionGrowth: { ...profile.companionGrowth, [memberId]: { allocation, unlockedNodeIds: nodes, revision: source.revision } } };
  const state = readCompanionGrowth(draft, memberId), latest = readCompanionGrowth(profile, memberId);
  const stale = latest.revision !== source.revision;
  const disabled = Boolean(locked || profile.activeBattleId || pending || stale || !onSave);
  const before = partyPreview(profile, ['hero', memberId]).find(item => item.memberId === memberId);
  const after = partyPreview(draft, ['hero', memberId]).find(item => item.memberId === memberId);
  const changed = Object.keys(allocation).some(key => allocation[key] !== source.allocation[key]) || nodes.length !== source.unlockedNodeIds.length;
  const cost = Object.keys(allocation).some(key => allocation[key] < source.allocation[key]) ? COMPANION_RESET_GOLD : 0;
  const reload = () => { setSource(latest); setAllocation(latest.allocation); setNodes(latest.unlockedNodeIds); setRequest(null); setMessage(''); };
  const confirm = kind => { setMessage(''); setRequest({ memberId, kind, allocation, unlockedNodeIds: nodes, expectedRevision: source.revision, actionId: createRpgActionId('companion-growth') }); };
  const save = async () => {
    if (saving.current || disabled || !request) return;
    saving.current = true; setPending(true); onPendingChange?.(true); setMessage('');
    try {
      const result = await onSave(request);
      if (!result.applied && result.reason !== 'ALREADY_APPLIED') throw Error(result.reason);
      if (result.profile) { const next = readCompanionGrowth(result.profile, memberId); setSource(next); setAllocation(next.allocation); setNodes(next.unlockedNodeIds); }
      setRequest(null); setMessage('保存しました。次のTower・Weekly Battleから反映されます。');
    } catch (error) { setMessage(errors[error.code || error.message] || '保存に失敗しました。同じ操作を再送できます。'); }
    finally { saving.current = false; setPending(false); onPendingChange?.(false); }
  };
  return <section className="min-w-0 space-y-4 rounded-2xl border-2 border-violet-300 bg-white p-3 sm:p-5" aria-label={member.name + 'の個別育成'}>
    <h2 ref={heading} tabIndex={-1} className="text-xl font-black">{member.name}の個別育成</h2><p>{member.element || (memberId === 'mage' ? '火' : memberId === 'healer' ? '水' : '地')}属性 ・ {member.rarity || '通常仲間'}</p><p className="font-bold">得意分野：{definition.specialty}</p>
    <p className="text-sm">各仲間が独立してLv−1、最大20pt・20SPを獲得します。能力はHP+3／MP+2／攻撃+1／防御+1。主人公のポイント・SPは使いません。</p>
    <p className="font-bold" aria-live="polite">能力：残り{state.remaining}pt ／ {state.earned}pt SP：残り{state.remainingSp}SP ／ {state.earned}SP</p>
    <fieldset disabled={disabled || Boolean(request)} className="space-y-2"><legend className="font-bold">能力ポイント配分</legend>{Object.entries(COMPANION_POINT_CAPS).map(([key, cap]) => <div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-2"><span>{({hp:'HP',mp:'MP',attack:'攻撃',defense:'防御'})[key]}：{allocation[key]} / {cap}pt</span><div className="flex gap-2"><button type="button" aria-label={key + 'を減らす'} disabled={!allocation[key]} onClick={() => setAllocation({ ...allocation, [key]: allocation[key] - 1 })} className="min-h-11 min-w-11 rounded-lg bg-slate-200">−</button><button type="button" aria-label={key + 'を増やす'} disabled={!state.remaining || allocation[key] >= cap} onClick={() => setAllocation({ ...allocation, [key]: allocation[key] + 1 })} className="min-h-11 min-w-11 rounded-lg bg-violet-100">＋</button></div></div>)}</fieldset>
    <h3 className="font-black">専用スキルパネル</h3><p className="text-xs">生命の根・魔力の根から、表示された接続先を順に解放します。「得意分野」はどちらかの枝から接続できます。</p>
    <div className="grid gap-2 sm:grid-cols-2">{definition.nodes.map(node => { const status = companionNodeState(draft, memberId, node.id); return <button type="button" key={node.id} disabled={disabled || Boolean(request) || !status.unlockable} aria-pressed={status.owned} onClick={() => setNodes([...nodes, node.id])} className={'min-h-11 min-w-0 break-words rounded-xl border-2 p-3 text-left text-sm ' + (status.owned ? 'border-emerald-600 bg-emerald-50' : status.unlockable ? 'border-violet-500 bg-violet-50' : 'border-slate-200 bg-slate-50')}><b>{node.name}（{node.cost}SP）{status.owned ? ' 取得済み' : status.unlockable ? ' 取得可能' : ' 未解放'}</b><span className="block">{companionEffectDescription(node.effects)}</span><span className="block text-xs">接続元：{node.parents.map(id => definition.nodes.find(n => n.id === id).name).join(' / ') || '開始点'}</span></button>; })}</div>
    <div className="space-y-2 rounded-xl bg-violet-50 p-3"><h3 className="font-bold">育成前 → 保存後の能力</h3>{[['maxHp','HP'],['maxMp','MP'],['attack','攻撃'],['defense','防御']].map(([key,label]) => <p key={key}>{label}：{before[key]} → {after[key]}</p>)}<p className="text-xs">技：{after.skills.map(skill => { const old = before.skills.find(s => s.id === skill.id); return skill.name + ' MP' + old.mpCost + '→' + skill.mpCost + ' / ' + (skill.kind === 'attack' ? '威力 ' + old.powerPercent + '→' + skill.powerPercent + '%' : skill.kind === 'heal' ? '回復 ' + old.healPercent + '→' + skill.healPercent + '%' : '軽減 ' + old.damageReductionPercent + '→' + skill.damageReductionPercent + '%'); }).join('・')}</p><MemberPreparation member={after}/></div>
    <p className="text-xs">振り直しは仲間1人100G（学習1分の獲得G相当）。配分を減らして保存する場合も100G。技の消費MPは最低1、回復率は60%、ガード軽減は80%まで。</p>
    {stale && <p role="alert">別の操作で育成が更新されました。<button type="button" disabled={pending} onClick={reload} className="min-h-11 underline">最新状態で読み直す</button></p>}
    <div className="flex flex-wrap gap-2"><button type="button" disabled={disabled || !changed || Boolean(request)} onClick={() => confirm('save')} className="min-h-11 rounded-xl bg-violet-600 px-4 py-3 font-bold text-white disabled:bg-slate-300">保存内容を確認</button><button type="button" disabled={pending || !changed} onClick={reload} className="min-h-11 rounded-xl bg-slate-100 px-4 py-3">未保存の変更を戻す</button><button type="button" disabled={disabled || Boolean(request) || (!source.used && !source.usedSp) || profile.gold < COMPANION_RESET_GOLD} onClick={() => confirm('reset')} className="min-h-11 rounded-xl bg-slate-100 px-4 py-3">この仲間を振り直す（100G）</button></div>
    {request && <div role="region" aria-label="個別育成の保存確認" className="space-y-3 rounded-xl border-2 border-violet-600 p-3"><h3 className="font-bold">{member.name}：{request.kind === 'reset' ? '能力配分と取得パネルをすべて戻します' : '表示中の配分とパネルを保存します'}</h3><p>消費G：{request.kind === 'reset' ? COMPANION_RESET_GOLD : cost} ／ 残高：{profile.gold}G</p><div className="flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={() => setRequest(null)} className="min-h-11 rounded-xl bg-slate-100 p-3">キャンセル</button><button ref={confirmButton} type="button" disabled={disabled} onClick={save} className="min-h-11 rounded-xl bg-violet-600 p-3 font-bold text-white disabled:bg-slate-300">{pending ? '保存中…' : '確定する'}</button></div></div>}
    {message && <p role="status">{message}</p>}
  </section>;
}
