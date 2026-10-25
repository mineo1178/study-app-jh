import { hasMpRules, battleActorMp } from '../../rpg/statAllocation.js';
import { hasUnlimitedSkills } from '../../rpg/skillRules.js';
export default function BattleMpBar({ battle }) {
  if (!hasMpRules(battle)) return null;
  const members = battle.partySnapshot?.members || [{ memberId: 'hero', name: '主人公', maxMp: battle.playerSnapshot?.maxMp }];
  return <div className="mt-2 space-y-2 text-xs font-black">{members.filter(member => member.memberId === 'hero' || hasUnlimitedSkills(battle)).map(member => {
    const mp = battleActorMp(battle, member.memberId);
    return <div key={member.memberId}><p>{member.name} MP {mp} / {member.maxMp}</p><div role="progressbar" aria-label={`${member.name}MP`} aria-valuenow={mp} aria-valuemin={0} aria-valuemax={member.maxMp} className="mt-1 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-sky-400" style={{ width: `${Math.max(0, Math.min(100, mp / member.maxMp * 100))}%` }}/></div></div>;
  })}</div>;
}
