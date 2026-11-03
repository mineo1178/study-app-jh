import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { BALANCE_PLAYERS, simulateBattle } from './simulateBattleBalance.js';
import { heroProfile, OPTIONS } from './measureEnemyBalance.js';
import { companionBuildProfile } from './measureCompanionBalance.js';
import { JOB_CATALOG } from '../src/rpg/jobCatalog.js';
import { buildTowerEncounter } from '../src/rpg/towerCatalog.js';
import { earnedCompanionPoints, readCompanionGrowth } from '../src/rpg/companionGrowthSelectors.js';
import { writeBalanceData } from './balanceData.js';

const frozen = JSON.parse(readFileSync('test/fixtures/rpg-v2.9.13-before-enemies.json'));
const growths = {
  none: { allocation: {}, nodes: [] },
  roots: { allocation: {}, nodes: ['vitality','focus'] },
  starter: { allocation: { hp: 2 }, nodes: ['vitality','focus'] },
  fourPoints: { allocation: { hp: 4 }, nodes: ['vitality','focus'] },
  defense2: { allocation: { defense: 2 }, nodes: ['vitality','defense'] },
  balanced: null,
};
const rows = [];
for (const level of [11,12,13,14]) for (const floor of [30,35,38,39,40,41,42,45,50]) for (const jobId of Object.keys(JOB_CATALOG)) for (const heroBuild of ['none','attack','balanced']) for (const party of ['defensive','offensive']) for (const [growth, config] of Object.entries(growths)) for (const equipment of (level === 12 && [39,40,41].includes(floor) ? ['lv12','lv7','none'] : ['lv12'])) {
  // Keep the historical 36-condition labels, including identical Lv12 parties.
  const ids = party === 'defensive' ? ['hero','guardian','healer'] : BALANCE_PLAYERS.prepared.partyMemberIds;
  const reference = equipment === 'lv7' ? BALANCE_PLAYERS.intermediate : BALANCE_PLAYERS.prepared;
  let profile = { ...heroProfile(level,jobId,heroBuild,ids), equipped: equipment === 'none' ? {} : reference.equipped, ownedEquipment: reference.ownedEquipment };
  for (const id of ids.slice(1)) {
    profile = growth === 'balanced' ? companionBuildProfile(profile,id,'balanced') : { ...profile, companionGrowth: { ...profile.companionGrowth, [id]: { allocation: { hp:0, mp:0, attack:0, defense:0, ...config.allocation }, unlockedNodeIds: config.nodes, revision:0 } } };
    readCompanionGrowth(profile,id); // Validate actual EXP budgets / node connectivity.
  }
  const before = simulateBattle(profile,frozen.find(t => t.floor === floor),'strategy',OPTIONS);
  const after = simulateBattle(profile,{encounter:buildTowerEncounter({floor})},'strategy',OPTIONS);
  assert(before.status !== 'active' && after.status !== 'active');
  rows.push({ level,floor,jobId,heroBuild,party,growth,equipment,earnedPoints:earnedCompanionPoints(profile),memberGrowth:ids.slice(1).map(id=>({id,...readCompanionGrowth(profile,id)})),equipped:profile.equipped,before,after });
}
const path = 'docs/rpg-v2.9.13-tower40-investigation.json';
const report = { levels:[11,12,13,14],floors:[30,35,38,39,40,41,42,45,50],growths,rows };
if (existsSync('docs/rpg-v2.9.13-data-manifest.json')) writeBalanceData(path,report);
else writeFileSync(path,JSON.stringify(report));
// Keep small exact-count regressions independent of the Vitest 1,470 cases.
for (const [floor,growth,beforeWins,afterWins] of [[39,'none',36,36],[40,'none',32,2],[41,'none',36,36],[40,'defense2',34,28],[40,'balanced',36,36]]) {
  const selected = rows.filter(r=>r.level===12&&r.floor===floor&&r.growth===growth&&r.equipment==='lv12');
  assert.equal(selected.length,36);
  assert.equal(selected.filter(r=>r.before.status==='won').length,beforeWins);
  assert.equal(selected.filter(r=>r.after.status==='won').length,afterWins);
}
console.log('Tower40 investigation verified:',rows.length,'conditions; original 32/36 -> 2/36; 2 defense points + 5 SP -> 28/36');
