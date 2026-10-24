import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { BALANCE_PLAYERS, BALANCE_SCENARIOS, simulateBattle } from './simulateBattleBalance.js';
const targets = BALANCE_SCENARIOS.filter(row => row.boss || [10,20,30,60].includes(row.floor) || row.id.startsWith('weekly_'));
export function measureStatAllocationBalance() {
  const rows = [];
  for (const [name, base] of Object.entries(BALANCE_PLAYERS)) {
    const points = Math.min(30, base.level - 1);
    for (const kind of points ? ['hp','mp','balanced'] : ['none']) {
      const hp = kind === 'hp' ? points : kind === 'balanced' ? Math.ceil(points / 2) : 0;
      for (const healer of [false, true]) {
        const profile = { ...base, partyMemberIds: ['hero', 'guardian', healer ? 'healer' : 'mage'], statAllocation: { hp, mp: points - hp } };
        for (const target of targets) {
          if (target.enemy && healer) continue;
          const before = simulateBattle({ ...profile, statAllocation: { hp: 0, mp: 0 } }, target);
          const after = simulateBattle(profile, target, 'strategy', { mpRules: true });
          rows.push({ name, level: base.level, allocation: kind, points: profile.statAllocation, healer, target: target.id, before, after });
        }
      }
    }
  }
  return rows;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(measureStatAllocationBalance(), null, 2));
