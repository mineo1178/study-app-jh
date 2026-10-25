import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { BALANCE_PLAYERS, BALANCE_SCENARIOS, simulateBattle } from './simulateBattleBalance.js';
import { JOB_CATALOG } from '../src/rpg/jobCatalog.js';
export function measureJobBalance() {
  const rows=[];
  const targets=BALANCE_SCENARIOS.filter(row=>row.boss||[10,20,30,60].includes(row.floor)||row.id.startsWith('weekly_'));
  for(const jobId of Object.keys(JOB_CATALOG)) for(const base of Object.values(BALANCE_PLAYERS).filter(player=>[7,12,20].includes(player.level))) for(const allocation of ['hp','mp','balanced']) for(const healer of [false,true]) {
    const points=base.level-1,hp=allocation==='hp'?points:allocation==='balanced'?Math.ceil(points/2):0;
    const profile={...base,jobId,partyMemberIds:['hero','guardian',healer?'healer':'mage'],statAllocation:{hp,mp:points-hp}};
    for(const target of targets) {if(target.enemy&&healer) continue; rows.push({jobId,level:base.level,allocation,healer,target:target.id,...simulateBattle(profile,target,'strategy',{mpRules:true,skillRules:true,jobRules:true})});}
  }
  return rows;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(measureJobBalance(),null,2));
