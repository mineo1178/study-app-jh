import { battleSkillDescription, skillTargetLabel } from '../../rpg/battleUiLogic.js';
import { partyRoleLabel } from '../../rpg/battlePreparation.js';

export function StatComparison({ before, after }) {
  return <dl className="mt-3 space-y-1 text-xs font-bold text-slate-700" aria-label="能力の変更前後">{[['maxHp', '最大HP'], ['attack', '攻撃力'], ['defense', '防御力']].map(([key, label]) => {
    const delta = after[key] - before[key];
    return <div key={key} className="flex flex-wrap justify-between gap-x-2"><dt>{label}</dt><dd>{before[key]} → {after[key]}（{delta === 0 ? '変化なし' : `${delta > 0 ? '+' : ''}${delta}`}）</dd></div>;
  })}</dl>;
}

export function MemberPreparation({ member, solo = false }) {
  const role = partyRoleLabel(member.role);
  return <div className="min-w-0 break-words text-sm text-slate-700"><p className="font-black">{member.name} ・ {role}</p><p className="mt-1 text-xs">HP {member.maxHp}{Number.isInteger(member.maxMp) && ` / MP ${member.maxMp}`} / 攻撃力 {member.attack} / 防御力 {member.defense}</p><details className="mt-2"><summary className="cursor-pointer font-bold">使用可能スキル：{member.skills.map(skill => skill.name).join('・')}</summary><ul className="mt-2 space-y-2 text-xs">{member.skills.map(skill => <li key={skill.id}><b>{skill.name}</b>：{battleSkillDescription(skill)} / {skillTargetLabel(skill, !solo)} / {Number.isInteger(skill.mpCost) ? `消費MP ${skill.mpCost}` : `${skill.maxUses}回`}</li>)}</ul></details></div>;
}
