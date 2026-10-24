import { useState } from 'react';
import { canUseBattleActions, resolvePartyBattleSelection } from '../../rpg/battleUiLogic.js';
import BattleMpBar from './BattleMpBar.jsx';
import BattleSkillList from './BattleSkillList.jsx';
import BattleHpBar from './BattleHpBar.jsx';
import BattleFeedback from './BattleFeedback.jsx';
import { ELEMENT_LABELS } from '../../rpg/elementConfig.js';

export default function PartyBattleArena({ battle, onAttack, onSkill, attacking, feedback }) {
  const [enemyId, setEnemyId] = useState(battle.enemyStates.find((state) => state.status === 'active')?.enemyInstanceId || null);
  const [allyId, setAllyId] = useState(battle.activePartyMemberId);
  const actor = battle.partySnapshot.members.find((member) => member.memberId === battle.activePartyMemberId);
  const selected = resolvePartyBattleSelection(battle, enemyId, allyId);
  const canAct = canUseBattleActions(battle, attacking);
  const title = battle.battleMode === 'weekly_boss' ? ['WEEKLY BOSS', battle.weeklyBossSnapshot?.name] : [`無限の塔 ${battle.towerFloor}F`, ''];
  const elements = values => (values || []).map(value => ELEMENT_LABELS[value] || '無').join('・') || 'なし';

  return <section className="rounded-[2rem] bg-gradient-to-br from-slate-900 to-indigo-900 p-4 sm:p-5 break-words text-white">
    <p className="text-xs font-black text-indigo-200">{title[0]} {title[1] && `・ ${title[1]}`}</p>
    <p className="mt-1 text-xs font-black text-indigo-200">ROUND {battle.roundNumber} ・ {actor?.name}のターン</p>
    {battle.battleMode === 'weekly_boss' && <p className="mt-2 text-xs text-amber-200">今週の初回討伐報酬あり</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-3">{battle.enemySnapshots.map((enemy) => {
      const state = battle.enemyStates.find((item) => item.enemyInstanceId === enemy.enemyInstanceId);
      return <button type="button" aria-pressed={selected.enemyId === enemy.enemyInstanceId} disabled={attacking || state.status !== 'active'} onClick={() => setEnemyId(enemy.enemyInstanceId)} key={enemy.enemyInstanceId} className={`min-w-0 break-words rounded-xl p-3 text-left ${selected.enemyId === enemy.enemyInstanceId ? 'ring-2 ring-amber-300 bg-rose-700' : 'bg-white/10'} disabled:opacity-40`}><b>{enemy.name}</b><p className="mt-1 text-xs font-bold">{state.status !== 'active' ? '撃破済み' : selected.enemyId === enemy.enemyInstanceId ? '攻撃対象' : '選択して攻撃対象にする'}</p><BattleHpBar name={enemy.name} hp={state.hp} maxHp={enemy.maxHp}/><p className="text-xs">{ELEMENT_LABELS[enemy.element] || '無'} / HP {state.hp}/{enemy.maxHp}</p><p className="mt-1 text-xs">弱点：{elements(enemy.weaknesses)} / 耐性：{elements(enemy.resistances)}</p></button>;
    })}</div>
    <div className="mt-4 grid gap-2 sm:grid-cols-3">{battle.partySnapshot.members.map((member) => {
      const state = battle.partyStates.find((item) => item.memberId === member.memberId);
      return <button type="button" aria-pressed={selected.allyId === member.memberId} disabled={attacking || state.status !== 'active'} onClick={() => setAllyId(member.memberId)} key={member.memberId} className={`min-w-0 break-words rounded-xl p-3 text-left ${selected.allyId === member.memberId ? 'bg-emerald-600 ring-2 ring-emerald-200' : 'bg-white/10'} disabled:opacity-40`}><b>{member.name}</b><p className="mt-1 text-xs font-bold">{state.status !== 'active' ? '戦闘不能' : member.memberId === battle.activePartyMemberId ? '行動可能・今回の行動者' : battle.actedMemberIds?.includes(member.memberId) ? 'このラウンドは行動済み' : '行動待ち'}</p><BattleHpBar name={member.name} hp={state.hp} maxHp={member.maxHp} ally/><p className="text-xs">{member.role} / HP {state.hp}/{member.maxHp}</p><p className="mt-1 text-xs">{Number(state.guardPercent) > 0 ? `防御中・被ダメージ${state.guardPercent}%軽減（敵の反撃終了まで）` : '防御効果なし'}</p><p className="mt-1 text-xs">{state.status !== 'active' ? '回復対象外' : selected.allyId === member.memberId ? '回復対象（仲間1人のスキル）' : '選択して回復対象にする'}</p></button>;
    })}</div>
    <button type="button" disabled={!canAct || !selected.enemyId} onClick={() => onAttack?.(selected.enemyId)} className="mt-5 w-full rounded-xl bg-rose-500 py-3 font-black disabled:bg-slate-500">通常攻撃</button>
    <BattleMpBar battle={battle}/>
    <BattleSkillList battle={battle} skills={actor?.skills || []} selected={selected} attacking={attacking} onSkill={onSkill}/>
    <BattleFeedback feedback={feedback}/>
  </section>;
}
