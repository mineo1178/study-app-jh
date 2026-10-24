import { hasMpRules } from '../../rpg/statAllocation.js';
export default function BattleMpBar({ battle }) {
  if (!hasMpRules(battle)) return null;
  const maxMp = battle.partySnapshot?.members?.find(member => member.memberId === 'hero')?.maxMp ?? battle.playerSnapshot?.maxMp;
  return <div className="mt-2 text-xs font-black"><p>主人公 MP {battle.playerMp} / {maxMp}</p><div role="progressbar" aria-label="主人公MP" aria-valuenow={battle.playerMp} aria-valuemin={0} aria-valuemax={maxMp} className="mt-1 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full bg-sky-400" style={{ width: `${Math.max(0, Math.min(100, battle.playerMp / maxMp * 100))}%` }}/></div></div>;
}
