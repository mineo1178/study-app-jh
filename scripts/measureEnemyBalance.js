/* global process */
import { readFileSync } from 'node:fs';
import { writeBalanceData } from './balanceData.js';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { BALANCE_PLAYERS, simulateBattle } from './simulateBattleBalance.js';
import { panelBuildProfile } from './measurePanelBalance.js';
import { companionBuildProfile, COMPANION_BUILDS } from './measureCompanionBalance.js';
import { ENEMY_CATALOG } from '../src/rpg/enemyCatalog.js';
import { BOSS_CATALOG } from '../src/rpg/bossCatalog.js';
import { JOB_CATALOG } from '../src/rpg/jobCatalog.js';
import { COMPANION_GROWTH_CATALOG } from '../src/rpg/companionGrowthCatalog.js';
import { normalizePlayerProfile } from '../src/rpg/playerProfile.js';
import { totalExpForLevel } from '../src/rpg/levelSystem.js';
import { buildTowerEncounter } from '../src/rpg/towerCatalog.js';
import { getWeeklyBossDefinition } from '../src/rpg/weeklyBossCatalog.js';

export const CANDIDATES = {
  before: { weeklyHp: 1, weeklyAttack: 1, towerHp: 0, towerAttack: 0 },
  light: { weeklyHp: 1.15, weeklyAttack: 1.04, towerHp: .1, towerAttack: .04 },
  medium: { weeklyHp: 1.3, weeklyAttack: 1.08, towerHp: .2, towerAttack: .08 },
  strong: { weeklyHp: 1.5, weeklyAttack: 1.2, towerHp: .3, towerAttack: .12 },
};
export const OPTIONS = { mpRules: true, skillRules: true, jobRules: true, companionGrowth: true };
const columns = ['status','turns','hp','hpPercent','damage','heals','guards','skillUseCount','actions'];
const compact = result => columns.map(key => result[key]);
export function candidateTarget(target, candidate) {
  const next = structuredClone(target), c = CANDIDATES[candidate];
  if (target.id.startsWith('weekly_')) for (const enemy of next.encounter.enemies) {
    enemy.maxHp = Math.round(enemy.maxHp * c.weeklyHp);
    enemy.attack = Math.round(enemy.attack * c.weeklyAttack);
  }
  if (target.floor && candidate !== 'before') {
    const ramp = Math.max(0, 1 - Math.abs(target.floor - 40) / 20);
    for (const enemy of next.encounter.enemies) {
      // Use unrounded v2.9.11 growth: rounding twice can reduce stats between floors.
      const floor = target.floor, tier = Math.floor((floor - 1) / 10);
      const base = ENEMY_CATALOG[enemy.enemyId] || BOSS_CATALOG[enemy.enemyId];
      const boss = enemy.enemyId === 'orc_chief' || enemy.enemyId === 'ancient_golem';
      const high = (Math.max(0, floor - 20) / 80) ** 2;
      const hp = (boss ? base.maxHp * .65 : 20 + base.maxHp * .5) * (1 + (floor - 1) * .06 + tier * tier * .025) * (!boss && floor > 3 ? .96 : 1) * (1 + .4 * high);
      const attack = (boss ? Math.max(10,base.attack) : base.attack + 4) * (1 + (floor - 1) * .045 + tier * tier * .02) * (boss ? .7 : floor > 3 ? .95 : 1) * (1 + .2 * high);
      enemy.maxHp = Math.round(hp * (1 + c.towerHp * ramp));
      enemy.attack = Math.round(attack * (1 + c.towerAttack * ramp));
    }
  }
  return next;
}
export function balanceBase(level) {
  const base = Object.values(BALANCE_PLAYERS).find(p => p.level === level) || normalizePlayerProfile({ ...BALANCE_PLAYERS.trained, totalExp: totalExpForLevel(level) });
  const hp = Math.ceil((level - 1) / 2);
  return { ...base, statAllocation: { hp, mp: level - 1 - hp }, weeklyBoss: { ...base.weeklyBoss, totalClears: level < 12 ? 0 : level < 20 ? 3 : 10 } };
}
export function heroProfile(level, jobId, heroBuild, partyMemberIds) {
  return panelBuildProfile({ ...balanceBase(level), jobId, partyMemberIds, unlockedPartyMemberIds: ['hero', ...Object.keys(COMPANION_GROWTH_CATALOG)] }, heroBuild, { completedChapterIds: ['chapter_1','chapter_2'] }, { highestFloor: level < 12 ? 10 : level < 20 ? 30 : 60 });
}
export function measureEnemyBalance() {
  const targets = JSON.parse(readFileSync(new URL('../test/fixtures/rpg-v2.9.13-before-enemies.json',import.meta.url))).filter(t => !t.floor || [1,10,20,30,40,50,60,80,100].includes(t.floor));
  const rows = [];
  function record(meta, profile, target) {
    const results = {};
    for (const candidate of Object.keys(CANDIDATES)) {
      if (candidate !== 'before' && (target.enemy || target.floor <= 20 || target.floor >= 60)) { results[candidate] = results.before; continue; }
      const scenario = candidateTarget(target, candidate);
      results[candidate] = ['strategy','normal'].map(policy => compact(simulateBattle(profile, scenario, policy, OPTIONS)));
      assert(results[candidate].every(r => r[0] !== 'active'), 'simulation action cap');
    }
    rows.push({ ...meta, target: target.id, results });
  }
  for (const level of [1,7,12,20,25,30]) {
    for (const jobId of Object.keys(JOB_CATALOG)) {
      for (const heroBuild of ['none','attack','balanced']) for (const party of ['defensive','offensive']) for (const build of COMPANION_BUILDS) {
        const ids = party === 'defensive' ? ['hero','guardian','healer'] : balanceBase(level).partyMemberIds;
        const base = heroProfile(level,jobId,heroBuild,ids);
        const grown = ids.slice(1).reduce((p,id) => companionBuildProfile(p,id,build),base);
        for (const target of targets) record({ matrix:'reference', level, jobId, heroBuild, party, build, equipment:'equipped' },grown,target);
        if (heroBuild === 'balanced' && build === 'balanced') for (const target of targets) record({ matrix:'equipment',level,jobId,heroBuild,party,build,equipment:'none' },{...grown,equipped:{}},target);
      }
      for (const memberId of Object.keys(COMPANION_GROWTH_CATALOG)) for (const build of COMPANION_BUILDS) {
        const base = heroProfile(level,jobId,'balanced',['hero',memberId,memberId === 'guardian' ? 'healer':'guardian']);
        const grown = companionBuildProfile(base,memberId,build);
        for (const target of targets.filter(t => t.id.startsWith('weekly_'))) record({matrix:'weekly90',level,jobId,memberId,build},grown,target);
      }
    }
    console.log('measured level',level);
  }
  // Reproduce the historical 36-condition tower and 90-condition Weekly baseline.
  const old = JSON.parse(readFileSync(new URL('../docs/rpg-v2.9.11-balance.json',import.meta.url)));
  for (const row of old.reference) {
    const current = rows.find(r => r.matrix === 'reference' && r.level === row.level && r.jobId === row.jobId && r.heroBuild === row.heroBuild && r.party === row.party && r.build === row.build && r.target === `tower-${row.floor}`);
    assert.deepEqual(current.results.before[0].filter((_,i) => [0,1,2,5,6,7].includes(i)), [row.after[0],row.after[1],row.after[2],row.after[5],row.after[6],row.after[4]]);
  }
  for (const row of old.rows.filter(r => r.target.startsWith('weekly_'))) {
    const current = rows.find(r => r.matrix === 'weekly90' && r.level === row.level && r.jobId === row.jobId && r.memberId === row.memberId && r.build === row.build && r.target === row.target);
    assert.deepEqual(current.results.before[0].filter((_,i) => [0,1,2,5,6,7].includes(i)), [row.strategy[0],row.strategy[1],row.strategy[2],row.strategy[5],row.strategy[6],row.strategy[4]]);
  }
  const enemyStats = target => (target.encounter?.enemies || [target.enemy]).map(({ maxHp,attack,expReward,energyCost,reward,firstClearReward }) => ({maxHp,attack,expReward,energyCost,reward,firstClearReward}));
  for (const target of targets) {
    const actual = target.floor ? { encounter: buildTowerEncounter({floor:target.floor}) } : target.encounter ? { encounter: { enemies:[getWeeklyBossDefinition(target.encounter.enemies[0].weekId)] } } : target;
    if (process.argv.includes('--verify-after')) assert.deepEqual(enemyStats(actual),enemyStats(candidateTarget(target,'medium')));
  }
  return { selected:'medium', verifiedImplementation:process.argv.includes('--verify-after'), baseline:'1ef9b8e01b85ebd0f90602caa9e6eb5445a2311b', candidates:CANDIDATES, columns, policies:['strategy','normal'], targets, rows };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeBalanceData('docs/rpg-v2.9.13-comparison.json',measureEnemyBalance());
}
