import { BALANCE_PLAYERS, BALANCE_SCENARIOS, simulateBattle } from './simulateBattleBalance.js';
import { JOB_CATALOG } from '../src/rpg/jobCatalog.js';
import { panelNodeState } from '../src/rpg/skillPanelSelectors.js';
const branch=kind=>Array.from({length:6},(_,i)=>kind+'_'+(i+1));
export const PANEL_BUILDS={none:[],early:['attack_1','defense_1','magic_1','support_1'],attack:[...branch('attack'),...branch('magic')],defense:[...branch('defense'),...branch('support')],magic:[...branch('magic'),...branch('attack')],balanced:Array.from({length:6},(_,i)=>['attack','defense','magic','support'].map(kind=>kind+'_'+(i+1))).flat()};
export function panelBuildProfile(base,build,progress,towerProgress) {
 let profile={...base,skillPanel:{unlockedNodeIds:[],revision:0}};
 for(const id of PANEL_BUILDS[build])if(panelNodeState(id,profile,progress,towerProgress).unlockable)profile={...profile,skillPanel:{unlockedNodeIds:[...profile.skillPanel.unlockedNodeIds,id],revision:profile.skillPanel.revision+1}};
 return profile;
}
export function measurePanelBalance() {
 const rows=[],targets=BALANCE_SCENARIOS.filter(row=>row.enemy||[10,20,30,60].includes(row.floor)||row.id.startsWith('weekly_'));
 for(const base of Object.values(BALANCE_PLAYERS).filter(player=>[7,12,20].includes(player.level)))for(const jobId of Object.keys(JOB_CATALOG))for(const build of Object.keys(PANEL_BUILDS)) {
  const hp=Math.ceil((base.level-1)/2),profile={...base,jobId,partyMemberIds:['hero','guardian','healer'],statAllocation:{hp,mp:base.level-1-hp},weeklyBoss:{...base.weeklyBoss,totalClears:base.level===7?0:base.level===12?3:10}},progress={completedChapterIds:['chapter_1','chapter_2']},towerProgress={highestFloor:base.level===7?10:base.level===12?30:60};
  const grown=panelBuildProfile(profile,build,progress,towerProgress);
  for(const target of targets)rows.push({level:base.level,jobId,build,target:target.id,nodes:grown.skillPanel.unlockedNodeIds,before:simulateBattle(profile,target,'strategy',{mpRules:true,skillRules:true,jobRules:true}),after:simulateBattle(grown,target,'strategy',{mpRules:true,skillRules:true,jobRules:true})});
 }
 return rows;
}
