import { battleHeadingLabel, battleHpPercent, canUseBattleActions, getBattleSkillEntries } from '../../rpg/battleUiLogic.js';
import BattleSkillList from './BattleSkillList.jsx';
import BattleFeedback from './BattleFeedback.jsx';
import { ELEMENT_LABELS } from '../../rpg/elementConfig.js';

export default function BattleArena({ battle, onAttack, onSkill, attacking, feedback }) {
  const hp = battleHpPercent(battle);
  const playerHp = Math.max(0, Math.min(100, ((Number(battle.playerHp) || 0) / (Number(battle.playerSnapshot?.maxHp) || 1)) * 100));
  const labels = (values) => (values || []).map((value) => ELEMENT_LABELS[value] || '無').join('・') || 'なし';
  const canAct = canUseBattleActions(battle, attacking);

  return <section className="rounded-[2rem] bg-gradient-to-br from-slate-900 to-indigo-900 p-4 sm:p-6 break-words text-white shadow-xl">
    <p className="text-[10px] font-black tracking-widest text-indigo-200">{battleHeadingLabel(battle)}</p>
    <h2 className="mt-2 text-2xl font-black">{battle.enemySnapshot?.name || '敵'}</h2>
    <p className="mt-2 text-xs font-bold text-indigo-100">属性：{ELEMENT_LABELS[battle.enemySnapshot?.element] || '無'} 弱点：{labels(battle.enemySnapshot?.weaknesses)} 耐性：{labels(battle.enemySnapshot?.resistances)}</p>
    <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-rose-400" style={{ width: `${hp}%` }}/></div>
    <p className="mt-2 text-right text-xs font-black">敵 HP {battle.enemyHp} / {battle.enemySnapshot?.maxHp} ・ 攻撃力 {battle.enemySnapshot?.attack || 0}</p>
    <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-emerald-400" style={{ width: `${playerHp}%` }}/></div>
    <p className="mt-2 text-right text-xs font-black">あなた HP {battle.playerHp} / {battle.playerSnapshot?.maxHp}</p>
    <p className="mt-5 text-sm font-bold text-indigo-100">攻撃力 {battle.playerSnapshot?.attack || 5} ・ 防御力 {battle.playerSnapshot?.defense || 0}（戦闘開始時）</p>
    <p className="mt-2 text-xs text-indigo-100">{canAct ? '行動可能' : attacking ? '行動を処理中です' : '現在は行動できません'} ・ 攻撃対象：{battle.enemySnapshot?.name || '敵'}</p>
    <button type="button" disabled={!canAct} onClick={onAttack} className="mt-6 w-full rounded-xl bg-rose-500 py-4 text-base font-black text-white disabled:bg-slate-500">{attacking ? '行動中…' : '通常攻撃'}</button>
    <BattleSkillList battle={battle} skills={getBattleSkillEntries(battle)} attacking={attacking} onSkill={onSkill}/>
    <BattleFeedback feedback={feedback}/>
  </section>;
}
