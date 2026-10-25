import { BALANCE_PLAYERS, BALANCE_SCENARIOS, simulateBattle } from './simulateBattleBalance.js';
import { JOB_CATALOG } from '../src/rpg/jobCatalog.js';
export function measureDifficultyBalance(scenarios = BALANCE_SCENARIOS) {
  const rows=[];
  for(const base of Object.values(BALANCE_PLAYERS)) for(const jobId of Object.keys(JOB_CATALOG)) for(const allocation of base.level===1?['none']:['hp','mp','balanced']) for(const healer of [false,true]) {
    const points=base.level-1,hp=allocation==='hp'?points:allocation==='balanced'?Math.ceil(points/2):0;
    const profile={...base,jobId,statAllocation:{hp,mp:points-hp},partyMemberIds:['hero','guardian',healer?'healer':'mage']};
    for(const scenario of scenarios) { if(scenario.enemy&&healer)continue;rows.push({level:base.level,jobId,allocation,healer,target:scenario.id,...simulateBattle(profile,scenario,'strategy',{mpRules:true,skillRules:true,jobRules:true})}); }
  }
  return rows;
}
