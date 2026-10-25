/* global process */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BALANCE_PLAYERS, simulateBattle } from './simulateBattleBalance.js';
import { panelBuildProfile } from './measurePanelBalance.js';
import { JOB_CATALOG } from '../src/rpg/jobCatalog.js';
import { buildTowerEncounter } from '../src/rpg/towerCatalog.js';
export const TOWER_FLOORS = [1,10,20,21,30,40,41,50,60,61,80,81,100];
const baseline = JSON.parse(readFileSync(new URL('../test/fixtures/rpg-v2.9.9-tower.json', import.meta.url)));
export function measureTowerBalance() {
  const rows = [], equipmentControls = [];
  for (const base of Object.values(BALANCE_PLAYERS).filter(p => [7,12,20].includes(p.level))) {
    for (const jobId of Object.keys(JOB_CATALOG)) for (const build of ['none','attack','balanced']) for (const party of ['defensive','offensive']) {
      const hp = Math.ceil((base.level-1)/2);
      const profile = {...base, jobId, partyMemberIds: party === 'defensive' ? ['hero','guardian','healer'] : base.partyMemberIds, statAllocation:{hp,mp:base.level-1-hp}, weeklyBoss:{...base.weeklyBoss,totalClears:base.level===7?0:base.level===12?3:10}};
      const grown = panelBuildProfile(profile,build,{completedChapterIds:['chapter_1','chapter_2']},{highestFloor:base.level===7?10:base.level===12?30:60});
      for (const floor of TOWER_FLOORS) {
        const before = baseline.encounters[floor], after = buildTowerEncounter({floor});
        rows.push({level:base.level,jobId,build,party,floor,equipped:grown.equipped,nodes:grown.skillPanel.unlockedNodeIds,before:simulateBattle(grown,{encounter:before},'strategy',{mpRules:true,skillRules:true,jobRules:true}),after:simulateBattle(grown,{encounter:after},'strategy',{mpRules:true,skillRules:true,jobRules:true})});
        if(base.level===20 && build==='balanced' && party==='offensive' && [60,80,100].includes(floor)) {
          const unequipped={...grown,equipped:{}};
          equipmentControls.push({jobId,floor,withoutEquipment:simulateBattle(unequipped,{encounter:after},'strategy',{mpRules:true,skillRules:true,jobRules:true}),withEquipment:rows[rows.length-1].after});
        }
      }
    }
  }
  return {equipmentControls,enemies:TOWER_FLOORS.map(floor => ({floor,before:baseline.encounters[floor].enemies.map(({enemyId,maxHp,attack})=>({enemyId,maxHp,attack})),after:buildTowerEncounter({floor}).enemies.map(({enemyId,maxHp,attack})=>({enemyId,maxHp,attack}))})),rows};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = measureTowerBalance();
  writeFileSync('docs/rpg-v2.9.10-balance.json','{\n"enemies":'+JSON.stringify(report.enemies,null,2)+',\n"equipmentControls":'+JSON.stringify(report.equipmentControls,null,2)+',\n"rows":[\n'+report.rows.map(row=>JSON.stringify(row)).join(',\n')+'\n]}\n');
  for (const level of [7,12,20]) console.log(level, TOWER_FLOORS.map(floor => {const rows=report.rows.filter(r=>r.level===level&&r.floor===floor);return `${floor}:${rows.filter(r=>r.before.status==='won').length}->${rows.filter(r=>r.after.status==='won').length}/${rows.length}`;}).join(' '));
}
