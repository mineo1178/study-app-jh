/* global process */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BALANCE_PLAYERS, simulateBattle } from './simulateBattleBalance.js';
import { panelBuildProfile } from './measurePanelBalance.js';
import { COMPANION_GROWTH_CATALOG } from '../src/rpg/companionGrowthCatalog.js';
import { companionNodeState, earnedCompanionPoints } from '../src/rpg/companionGrowthSelectors.js';
import { JOB_CATALOG } from '../src/rpg/jobCatalog.js';
import { buildTowerEncounter } from '../src/rpg/towerCatalog.js';
import { getWeeklyBossDefinition } from '../src/rpg/weeklyBossCatalog.js';
export const COMPANION_BUILDS = ['none', 'defensive', 'attack', 'magic', 'balanced'];
export function companionBuildProfile(profile, memberId, build) {
  let remaining = earnedCompanionPoints(profile);
  const allocation = { hp: 0, mp: 0, attack: 0, defense: 0 };
  const order = { none: [], defensive: ['defense', 'hp', 'mp', 'attack'], attack: ['attack', 'hp', 'mp', 'defense'], magic: ['mp', 'attack', 'hp', 'defense'], balanced: ['hp', 'mp', 'attack', 'defense'] }[build];
  while (remaining && order.length) { let changed = false; for (const key of order) { const cap = key === 'hp' || key === 'mp' ? 12 : 6; if (remaining && allocation[key] < cap) { allocation[key]++; remaining--; changed = true; if (build !== 'balanced') break; } } if (!changed) break; }
  let next = { ...profile, companionGrowth: { ...profile.companionGrowth, [memberId]: { allocation, unlockedNodeIds: [], revision: 0 } } };
  const sequence = { none: [], defensive: ['vitality','defense','aptitude','signature','focus','offense'], attack: ['focus','offense','aptitude','signature','vitality','defense'], magic: ['focus','offense','aptitude','signature','vitality','defense'], balanced: ['vitality','focus','offense','defense','aptitude','signature'] }[build];
  for (const id of sequence) if (companionNodeState(next, memberId, id).unlockable) next = { ...next, companionGrowth: { ...next.companionGrowth, [memberId]: { ...next.companionGrowth[memberId], unlockedNodeIds: [...next.companionGrowth[memberId].unlockedNodeIds,id] } } };
  return next;
}
const options = { mpRules: true, skillRules: true, jobRules: true, companionGrowth: true };
const compact = r => [r.status, r.turns, r.hp, r.mpRemaining, r.skillUseCount, r.heals, r.guards];
export function measureCompanionBalance() {
  const members = Object.keys(COMPANION_GROWTH_CATALOG), floors = [20,40,60,80,100];
  const targets = [...floors.map(floor => ({ id: 'tower-' + floor, encounter: buildTowerEncounter({ floor }) })), ...[1,2,3,4].map(week => { const boss = getWeeklyBossDefinition('2026-W0' + week); return { id: boss.id, encounter: { rulesVersion: boss.rulesVersion, enemies: [{ ...boss, enemyInstanceId: boss.id }] } }; })];
  const rows = [], reference = [];
  const beforeReport = JSON.parse(readFileSync(new URL('../docs/rpg-v2.9.10-balance.json', import.meta.url)));
  for (const base of Object.values(BALANCE_PLAYERS).filter(p => [7,12,20].includes(p.level))) for (const jobId of Object.keys(JOB_CATALOG)) {
    const hp = Math.ceil((base.level - 1)/2), progress = { completedChapterIds: ['chapter_1','chapter_2'] }, towerProgress = { highestFloor: base.level === 7 ? 10 : base.level === 12 ? 30 : 60 };
    const p = { ...base, jobId, statAllocation: { hp, mp: base.level - 1 - hp }, unlockedPartyMemberIds: ['hero',...members], weeklyBoss: { ...base.weeklyBoss, totalClears: base.level === 7 ? 0 : base.level === 12 ? 3 : 10 } };
    for (const memberId of members) {
      const profile = panelBuildProfile({ ...p, partyMemberIds: ['hero',memberId,memberId === 'guardian' ? 'healer' : 'guardian'] }, 'balanced', progress, towerProgress);
      for (const target of targets) {
        const before = compact(simulateBattle(profile, target, 'strategy', options));
        for (const build of COMPANION_BUILDS) {
          const grown = companionBuildProfile(profile, memberId, build);
          rows.push({ level: base.level, jobId, memberId, build, target: target.id, allocation: grown.companionGrowth[memberId].allocation, nodes: grown.companionGrowth[memberId].unlockedNodeIds, before, strategy: compact(simulateBattle(grown, target, 'strategy', options)), normal: compact(simulateBattle(grown, target, 'normal', options)) });
        }
      }
    }
    for (const heroBuild of ['none','attack','balanced']) for (const party of ['defensive','offensive']) {
      const partyMemberIds = party === 'defensive' ? ['hero','guardian','healer'] : base.partyMemberIds;
      const profile = panelBuildProfile({ ...p, partyMemberIds }, heroBuild, progress, towerProgress);
      for (const floor of floors) {
        const target = targets.find(t => t.id === 'tower-' + floor), before = simulateBattle(profile, target, 'strategy', options);
        const old = beforeReport.rows.find(r => r.level === base.level && r.jobId === jobId && r.build === heroBuild && r.party === party && r.floor === floor);
        if (JSON.stringify(before) !== JSON.stringify(old.after)) throw Error('v2.9.10 baseline mismatch');
        for (const build of COMPANION_BUILDS) {
          const grown = partyMemberIds.slice(1).reduce((current,id) => companionBuildProfile(current,id,build),profile);
          reference.push({ level: base.level, jobId, heroBuild, party, floor, build, before: compact(before), after: compact(simulateBattle(grown,target,'strategy',options)) });
        }
      }
    }
  }
  return { baseline: '13f974c113bb68b4a72a54ac2ecc929871b1faaf', columns: ['status','rounds','remainingPartyHp','heroMp','skillUses','heals','guards'], rows, reference };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = measureCompanionBalance();
  writeFileSync('docs/rpg-v2.9.11-balance.json', JSON.stringify(report));
  for (const level of [7,12,20]) for (const floor of [20,40,60,80,100]) console.log(level, floor, COMPANION_BUILDS.map(build => { const rows = report.reference.filter(r => r.level === level && r.floor === floor && r.build === build); return build + ':' + rows.filter(r => r.after[0] === 'won').length + '/' + rows.length; }).join(' '));
  console.log('matrix', report.rows.length, 'reference', report.reference.length);
}
