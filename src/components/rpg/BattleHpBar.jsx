export default function BattleHpBar({ name, hp, maxHp, ally = false }) {
  const percent = Math.max(0, Math.min(100, (Number(hp) || 0) / (Number(maxHp) || 1) * 100));
  return <div role="progressbar" aria-label={`${name} HP`} aria-valuemin={0} aria-valuemax={Number(maxHp) || 1} aria-valuenow={Number(hp) || 0} className="my-2 h-3 overflow-hidden rounded-full bg-white/20"><div className={`h-full ${ally ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${percent}%` }}/></div>;
}
