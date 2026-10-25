import { useRef, useState } from 'react';
import { normalizePlayerProfile } from '../../rpg/playerProfile.js';
import { readStatAllocation, statAllocationStats, statAllocationCost, STAT_REALLOCATION_GOLD } from '../../rpg/statAllocation.js';
import { heroJobSnapshot } from '../../rpg/jobStats.js';
import { createRpgActionId } from '../../data/rpgShopRepository.js';
import CommerceConfirmModal from './CommerceConfirmModal.jsx';

const errorMessage = error => ({ STAT_PROFILE_CHANGED: '他の操作でデータが更新されました。「最新データを反映」で確認し直してください。', STAT_CHANGE_DURING_BATTLE: '戦闘中は能力を変更できません。', REWARD_CORRECTION_PENDING: '報酬訂正の確認中は再配分できません。', INSUFFICIENT_GOLD: 'GOLDが足りません。', INVALID_STAT_ALLOCATION: '保存された配分が不正です。配分を保存できません。', STAT_POINTS_EXCEEDED: '育成ポイントが不足しています。' }[error?.code || error?.message] || '保存に失敗しました。入力内容を保持しています。もう一度お試しください。');
const allocationDisplay = (profile, allocation, totalExp) => { const { maxHp, maxMp } = heroJobSnapshot({ jobId: profile?.jobId, statAllocation: allocation, totalExp }); return { maxHp, maxMp }; };
const baseline = profile => ({ ...readStatAllocation(profile), totalExp: profile.totalExp || 0, gold: profile.gold || 0 });
export default function StatAllocationPanel(props) {
  try { readStatAllocation(props.profile); }
  catch (error) { return <p role="alert" className="text-rose-700">{errorMessage(error)}</p>; }
  return <AllocationEditor {...props}/>;
}
function AllocationEditor({ profile, onSave, locked, onPendingChange }) {
  const [source, setSource] = useState(() => baseline(profile));
  const [allocation, setAllocation] = useState(() => readStatAllocation(profile));
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const request = useRef(null);
  const lock = useRef(false);
  const current = { ...statAllocationStats({ totalExp: source.totalExp, statAllocation: { hp: source.hp, mp: source.mp } }), ...allocationDisplay(profile, { hp: source.hp, mp: source.mp }, source.totalExp) };
  const preview = { used: allocation.hp + allocation.mp, remaining: current.earned - allocation.hp - allocation.mp, ...allocationDisplay(profile, allocation, source.totalExp) };
  const cost = statAllocationCost(source, allocation);
  const changed = source.hp !== allocation.hp || source.mp !== allocation.mp;
  const stale = JSON.stringify(source) !== JSON.stringify(baseline(profile));
  const disabled = pending || locked || Boolean(profile.activeBattleId);
  const refresh = () => { setSource(baseline(profile)); setConfirm(false); setError(''); request.current = null; };
  const change = (key, delta) => { setAllocation(value => ({ ...value, [key]: value[key] + delta })); request.current = null; setSuccess(''); };
  const save = async () => {
    if (lock.current || disabled || stale || !changed || preview.remaining < 0 || source.gold < cost) return;
    lock.current = true; setPending(true); onPendingChange?.(true); setError('');
    request.current ||= createRpgActionId('stat-allocation');
    try {
      const response = await onSave({ allocation, expected: source, actionId: request.current });
      if (!response.applied && response.reason !== 'ALREADY_APPLIED') throw Error(response.reason);
      setSource({ ...allocation, totalExp: source.totalExp, gold: source.gold - cost });
      setConfirm(false); setSuccess('能力育成を保存しました。'); request.current = null;
    } catch (failure) { setError(errorMessage(failure)); }
    finally { lock.current = false; setPending(false); onPendingChange?.(false); }
  };
  return <section className="min-w-0 space-y-4 rounded-2xl bg-white p-4 text-slate-800 shadow-sm">
    <h2 className="text-xl font-black">能力育成</h2>
    <p className="text-sm">Lv{normalizePlayerProfile({ totalExp: source.totalExp }).level} ・ 獲得 {current.earned}pt ・ 使用済み {current.used}pt ・ 未配分 {current.remaining}pt</p>
    <p className="text-xs">未使用ポイントの追加は無料。配分済みポイントを減らす再配分は1回 {STAT_REALLOCATION_GOLD}G。主人公だけに反映されます。</p>
    <p className="text-sm font-bold">現在の最大HP {current.maxHp} ／ 最大MP {current.maxMp}</p>
    {['hp', 'mp'].map(key => <div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"><label className="font-bold" htmlFor={'allocation-' + key}>{key.toUpperCase()}配分</label><div className="flex items-center gap-3"><button type="button" aria-label={key.toUpperCase() + 'を減らす'} disabled={disabled || allocation[key] === 0} onClick={() => change(key, -1)} className="h-11 w-11 rounded-lg bg-slate-200 disabled:opacity-40">−</button><output id={'allocation-' + key} className="min-w-8 text-center font-black">{allocation[key]}pt</output><button type="button" aria-label={key.toUpperCase() + 'を増やす'} disabled={disabled || preview.remaining <= 0} onClick={() => change(key, 1)} className="h-11 w-11 rounded-lg bg-blue-100 disabled:opacity-40">＋</button></div></div>)}
    <div aria-live="polite" className="space-y-1 text-sm"><p>プレビュー：最大HP {current.maxHp} → {preview.maxHp}</p><p>最大MP {current.maxMp} → {preview.maxMp}</p><p>使用予定 {preview.used}pt ・ 未配分 {preview.remaining}pt</p><p>{cost ? 'GOLD再配分' : '無料追加配分'} ・ 消費 {cost}G ／ 残高 {source.gold} → {source.gold - cost}G</p></div>
    {preview.remaining < 0 && <p role="alert">育成ポイントが不足しています。配分を減らしてください。</p>}
    {locked && <p role="alert">戦闘中は能力を変更できません。</p>}
    {stale && <p role="alert">データが更新されました。最新データを反映して確認し直してください。</p>}
    {error && <p role="alert" className="text-rose-700">{error}</p>}{success && <p role="status" className="text-emerald-700">{success}</p>}
    <div className="flex flex-wrap gap-3"><button type="button" disabled={disabled || stale || !changed || preview.remaining < 0 || source.gold < cost} onClick={() => { setConfirm(true); setError(''); }} className="rounded-xl bg-blue-600 px-4 py-3 font-black text-white disabled:bg-slate-300">保存内容を確認</button><button type="button" disabled={pending} onClick={refresh} className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold">最新データを反映</button></div>
    <CommerceConfirmModal open={confirm} title="能力育成を確定しますか？" profile={{ gold: source.gold }} offer={{ cost: { gold: cost, materials: {} }, receive: { gold: 0, materials: {}, alchemyItems: {} } }} pending={pending} allowed={!disabled && !stale && changed} onCancel={() => setConfirm(false)} onConfirm={save} confirmLabel="この配分で確定" error={error}>
      <p className="text-sm">最大HP {current.maxHp} → {preview.maxHp} ／ 最大MP {current.maxMp} → {preview.maxMp}</p><p className="text-sm">消費GOLD {cost} ／ GOLD残高 {source.gold} → {source.gold - cost}</p>{stale && <p role="alert">最新データを反映して確認し直してください。</p>}
    </CommerceConfirmModal>
  </section>;
}
