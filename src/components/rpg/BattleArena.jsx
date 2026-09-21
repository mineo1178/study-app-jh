import { battleHeadingLabel, battleHpPercent, getBattleSkillEntries, getRemainingSkillUses } from '../../rpg/battleUiLogic.js';
import { ELEMENT_LABELS } from '../../rpg/elementConfig.js';

export default function BattleArena({ battle, onAttack, onSkill, attacking, feedback }) {
  const hp = battleHpPercent(battle);
  const playerHp = Math.max(0, Math.min(100, ((Number(battle.playerHp) || 0) / (Number(battle.playerSnapshot?.maxHp) || 1)) * 100));
  const labels = (values) => (values || []).map((value) => ELEMENT_LABELS[value] || '無').join('・') || 'なし';
  const skillDetail = (skill) => skill.kind === 'heal'
    ? `回復・最大HPの${Number(skill.healPercent) || 0}%`
    : skill.kind === 'guard'
      ? `防御・被ダメージ${Number(skill.damageReductionPercent) || 0}%軽減`
      : `攻撃・${ELEMENT_LABELS[skill.element] || '無'}属性・威力 ${Number(skill.powerPercent) || 0}%`;
  const fullHp = Number(battle.playerHp) >= Number(battle.playerSnapshot?.maxHp);

  return <section className="rounded-[2rem] bg-gradient-to-br from-slate-900 to-indigo-900 p-6 text-white shadow-xl">
    <p className="text-[10px] font-black tracking-widest text-indigo-200">{battleHeadingLabel(battle)}</p>
    <h2 className="mt-2 text-2xl font-black">{battle.enemySnapshot?.name || '敵'}</h2>
    <p className="mt-2 text-xs font-bold text-indigo-100">属性：{ELEMENT_LABELS[battle.enemySnapshot?.element] || '無'} 弱点：{labels(battle.enemySnapshot?.weaknesses)} 耐性：{labels(battle.enemySnapshot?.resistances)}</p>
    <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-rose-400" style={{ width: `${hp}%` }}/></div>
    <p className="mt-2 text-right text-xs font-black">敵 HP {battle.enemyHp} / {battle.enemySnapshot?.maxHp} ・ 攻撃力 {battle.enemySnapshot?.attack || 0}</p>
    <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-emerald-400" style={{ width: `${playerHp}%` }}/></div>
    <p className="mt-2 text-right text-xs font-black">あなた HP {battle.playerHp} / {battle.playerSnapshot?.maxHp}</p>
    <p className="mt-5 text-sm font-bold text-indigo-100">攻撃力 {battle.playerSnapshot?.attack || 5} ・ 防御力 {battle.playerSnapshot?.defense || 0}（戦闘開始時）</p>
    <button type="button" disabled={attacking} onClick={onAttack} className="mt-6 w-full rounded-xl bg-rose-500 py-4 text-base font-black text-white disabled:bg-slate-500">{attacking ? '行動中…' : '通常攻撃'}</button>
    <div className="mt-5 space-y-3">{getBattleSkillEntries(battle).map((skill) => {
      const remaining = getRemainingSkillUses(skill, battle.skillUses?.[skill.id]);
      const healBlocked = skill.kind === 'heal' && fullHp;
      return <div key={skill.id} className="rounded-xl bg-white/10 p-3">
        <div className="font-black">{skill.name} <span className="text-xs text-indigo-100">{skillDetail(skill)}</span></div>
        <div className="mt-1 text-xs font-bold text-indigo-100">残り {remaining} / {Math.max(0, Number(skill.maxUses) || 0)}{healBlocked ? ' ・ HPは満タンです' : remaining === 0 ? ' ・ 使用回数を使い切りました' : ''}</div>
        <button type="button" disabled={attacking || remaining === 0 || healBlocked} onClick={() => onSkill?.(skill.id)} className="mt-2 w-full rounded-lg bg-indigo-500 py-2 text-sm font-black disabled:bg-slate-500">{attacking ? '行動中…' : '使う'}</button>
      </div>;
    })}</div>
    {feedback?.length > 0 && <div className="mt-5 rounded-xl bg-white/10 p-3 text-sm font-bold">{feedback.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div>}
  </section>;
}
