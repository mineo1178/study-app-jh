import { hasMpRules } from '../../rpg/statAllocation.js';
import { battleSkillAvailability, battleSkillDescription, skillTargetLabel } from '../../rpg/battleUiLogic.js';

export default function BattleSkillList({ battle, skills, selected, attacking, onSkill }) {
  const party = Number(battle.schemaVersion) >= 8;
  return <div className="mt-4 space-y-3">{skills.map(skill => {
    const availability = battleSkillAvailability(battle, skill, selected, attacking);
    return <div key={skill.id} className="min-w-0 break-words rounded-xl bg-white/10 p-3">
      <p className="font-black">{skill.name}</p>
      <p className="mt-1 text-xs text-indigo-100">{battleSkillDescription(skill)} ・ 対象：{skillTargetLabel(skill, party)}</p>
      <p className="mt-1 text-xs text-indigo-100">1回使用を消費 ・ 残り {availability.remaining} / {Math.max(0, Number(skill.maxUses) || 0)}（この戦闘）</p>
      {hasMpRules(battle) && (!party || battle.activePartyMemberId === 'hero') && <p className="mt-1 text-xs text-sky-200">消費MP {skill.mpCost} ・ 現在MP {battle.playerMp}</p>}
      <p className="mt-1 text-xs">{availability.available ? '使用可能' : `使用できません：${availability.reason}`}</p>
      <button type="button" disabled={!availability.available} onClick={() => onSkill?.(skill.id, party && skill.targetType === 'single_enemy' ? selected.enemyId : null, party && skill.targetType === 'single_ally' ? selected.allyId : null)} aria-label={`${skill.name}を使う`} className="mt-2 min-h-11 w-full rounded-lg bg-indigo-500 px-3 py-2 text-sm font-black disabled:bg-slate-600">{attacking ? '行動中…' : '使う'}</button>
    </div>;
  })}</div>;
}
