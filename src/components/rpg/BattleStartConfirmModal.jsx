import { useEffect, useRef } from 'react';
import { buildBattlePreparation } from '../../rpg/battlePreparation.js';
import { ELEMENT_LABELS } from '../../rpg/elementConfig.js';
import { MemberPreparation } from './PreparationDetails.jsx';

export default function BattleStartConfirmModal({ enemy, profile, towerProgress, onCancel, onConfirm, onReview, starting }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!enemy) return undefined;
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, [enemy]);
  const data = buildBattlePreparation({ profile, candidate: enemy, towerProgress });
  if (!data) return null;
  const keyDown = event => {
    if (event.key === 'Escape' && !starting) onCancel?.();
    if (event.key !== 'Tab') return;
    const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), summary')].filter(node => node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first?.focus(); }
  };
  return <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/60 p-4"><section ref={dialogRef} tabIndex={-1} onKeyDown={keyDown} role="dialog" aria-modal="true" aria-labelledby="battle-preparation-title" className="max-h-[90dvh] w-full min-w-0 max-w-lg space-y-4 overflow-y-auto break-words rounded-3xl bg-white p-4 shadow-2xl sm:p-6">
    <h2 id="battle-preparation-title" className="text-xl font-black text-slate-800">{data.name}：戦闘準備</h2>
    <p className="text-sm font-bold text-slate-600">{data.isBoss ? 'ボス戦' : '通常戦'} ・ 敵 {data.enemies.length}体 ・ {data.solo ? '主人公単独' : 'パーティー戦'}</p>
    <section className="space-y-3 rounded-2xl bg-violet-50 p-3"><h3 className="font-black text-violet-800">今回参加する仲間</h3>{data.members.map(member => <MemberPreparation key={member.memberId} member={member} solo={data.solo}/>)}</section>
    <section className="text-sm text-slate-700"><h3 className="font-black">主人公の装備</h3>{data.equipment.map(({ slot, item }) => <p key={slot} className="mt-1">{{ weapon: '武器', armor: '防具', accessory: 'アクセサリー' }[slot]}：{item?.name || '未装備'}</p>)}</section>
    <details className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><summary className="cursor-pointer font-bold">敵ごとの弱点・耐性</summary><div className="mt-2 space-y-3">{data.affinities.map((enemy, index) => <div key={index}><b>{index + 1}. {enemy.name}</b><p>弱点：{enemy.weaknesses.length ? enemy.weaknesses.map(entry => `${ELEMENT_LABELS[entry.element] || entry.element}（対応スキル${entry.available ? 'あり' : 'なし'}）`).join('・') : '確認できる情報なし'}</p><p>耐性：{enemy.resistances.map(element => ELEMENT_LABELS[element] || element).join('・') || '確認できる情報なし'}</p></div>)}</div></details>
    <ul className="space-y-1 text-xs font-bold text-violet-700">{data.hints.map(hint => <li key={hint}>・{hint}</li>)}</ul>
    <p className="text-sm font-black text-slate-700">Battle Energy：現在 {data.energy.energy} / 消費 {data.energy.required}</p><p className="text-xs text-slate-500">敗北してもEnergyは戻りません。開始時の最新データで確定します。</p>
    {(!data.energy.sufficient || data.blocked) && <p role="alert" className="text-sm font-bold text-rose-700">{data.blocked ? '進行中の戦闘があります。' : 'Battle Energyが足りません。'}</p>}
    <div className="grid gap-2 sm:grid-cols-2">{[['party', 'パーティーを見直す'], ['equipment', '装備を見直す']].map(([section, label]) => <button key={section} type="button" disabled={starting || data.blocked} onClick={() => onReview?.(section)} className="rounded-xl bg-violet-100 px-3 py-3 text-sm font-black text-violet-800 disabled:opacity-50">{label}</button>)}</div>
    <div className="grid gap-3"><button type="button" disabled={starting || data.blocked || !data.energy.sufficient} onClick={onConfirm} className="rounded-xl bg-rose-600 px-3 py-3 font-black text-white disabled:bg-slate-300">{starting ? '開始中…' : 'このまま戦う'}</button><button type="button" disabled={starting} onClick={onCancel} className="rounded-xl bg-slate-100 py-3 font-black text-slate-600 disabled:opacity-50">キャンセル</button></div>
  </section></div>;
}
