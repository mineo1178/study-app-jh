import { describe,expect,it } from 'vitest';
import { JOB_CATALOG } from './jobCatalog.js';
import { SKILL_PANEL_CATALOG } from './skillPanelCatalog.js';
import { skillPanelStats,skillPanelEffects,skillPanelNodes,panelNodeState } from './skillPanelSelectors.js';
import { heroJobSnapshot } from './jobStats.js';
import { totalExpForLevel } from './levelSystem.js';
import { prepareSkillPanelAction } from '../data/rpgSkillPanelRepository.js';
import { prepareJobChange } from '../data/rpgJobRepository.js';
import { prepareBattleAttack } from '../data/rpgBattleRepository.js';
import { preparePartyBattleAction } from './partyBattleEngine.js';
import old from '../../test/fixtures/rpg-v2.9.8-panel-battles.json';
const progress={completedChapterIds:['chapter_1','chapter_2']},towerProgress={highestFloor:60};
const base=jobId=>({jobId,totalExp:totalExpForLevel(20),gold:3000,statAllocation:{hp:9,mp:10},weeklyBoss:{totalClears:10},custom:{keep:true}});
const unlock=(profile,nodeId)=>prepareSkillPanelAction({profile,progress,towerProgress,nodeId,expectedRevision:profile.skillPanel?.revision||0,expectedJobId:profile.jobId,actionId:nodeId,now:1}).profile;
describe('job-specific shared panel economy',()=>{
 it('adds five per job without changing existing common IDs or costs',()=>{expect(skillPanelNodes({},'common')).toHaveLength(25);for(const jobId of Object.keys(JOB_CATALOG)){const own=skillPanelNodes({jobId},'job');expect(own).toHaveLength(6);expect(own.filter(n=>n.jobId===jobId)).toHaveLength(5);expect(own.filter(n=>n.jobId).map(n=>n.cost)).toEqual([2,3,4,4,6]);}expect(Object.keys(SKILL_PANEL_CATALOG)).toHaveLength(55);});
 it.each(Object.keys(JOB_CATALOG))('keeps %s purchases and spent SP through free job changes, enabling only its own effects',jobId=>{
  let p=unlock(base(jobId),'attack_1');for(let i=1;i<=5;i++)p=unlock(p,'job_'+jobId+'_'+i);
  const before=heroJobSnapshot(p),without=heroJobSnapshot({...p,skillPanel:{unlockedNodeIds:['attack_1'],revision:p.skillPanel.revision}});expect({hp:before.maxHp,mp:before.maxMp,attack:before.attack,defense:before.defense,skills:before.skills}).not.toEqual({hp:without.maxHp,mp:without.maxMp,attack:without.attack,defense:without.defense,skills:without.skills});
  const stats=skillPanelStats(p,progress,towerProgress);expect(stats).toMatchObject({used:21,remaining:43,earned:64});
  expect(panelNodeState('job_'+jobId+'_5',p,progress,towerProgress).status).toBe('owned');
  const other=jobId==='warrior'?'mage':'warrior';let switched=prepareJobChange({profile:p,jobId:other,expected:{jobId,revision:0},actionId:'change',now:2}).profile;
  expect(switched.gold).toBe(3000);expect(switched.skillPanel).toEqual(p.skillPanel);expect(skillPanelStats(switched,progress,towerProgress).used).toBe(21);
  const commonOnly={...switched,skillPanel:{unlockedNodeIds:['attack_1'],revision:p.skillPanel.revision}};expect(skillPanelEffects(switched)).toEqual(skillPanelEffects(commonOnly));
  expect(panelNodeState('job_'+jobId+'_1',switched,progress,towerProgress).status).toBe('owned');expect(panelNodeState('job_'+jobId+'_2',{...base(other)},progress,towerProgress).unlockable).toBe(false);
  switched=prepareJobChange({profile:switched,jobId,expected:{jobId:other,revision:1},actionId:'back',now:3}).profile;
  expect(heroJobSnapshot(switched)).toEqual(before);expect(switched.statAllocation).toEqual(p.statAllocation);
 });
 it('shares the 80 SP cap across all six jobs instead of minting SP on each switch',()=>{
  let p={...base('adventurer'),totalExp:totalExpForLevel(41)};p=unlock(p,'attack_1');
  for(const jobId of Object.keys(JOB_CATALOG)){p={...p,jobId};for(let i=1;i<=5;i++){const id='job_'+jobId+'_'+i;if(panelNodeState(id,p,progress,towerProgress).unlockable)p=unlock(p,id);}}
  expect(skillPanelStats(p,progress,towerProgress)).toMatchObject({earned:80,used:80,remaining:0});expect(p.gold).toBe(3000);
  expect(()=>prepareSkillPanelAction({profile:p,progress,towerProgress,nodeId:'magic_1',expectedRevision:p.skillPanel.revision,expectedJobId:p.jobId,actionId:'over',now:1})).toThrow('PANEL_NOT_AVAILABLE');
 });
 it('resets investments in multiple jobs and common nodes together without resetting base allocation',()=>{let p=unlock(base('adventurer'),'attack_1');p=unlock(p,'job_adventurer_1');p={...p,jobId:'warrior'};p=unlock(p,'job_warrior_1');const change=prepareSkillPanelAction({profile:p,progress,towerProgress,kind:'reset',expectedRevision:p.skillPanel.revision,expectedJobId:p.jobId,actionId:'reset-all',now:2});expect(change.profile).toMatchObject({gold:2000,jobId:'warrior',statAllocation:p.statAllocation,skillPanel:{unlockedNodeIds:[],revision:p.skillPanel.revision+1}});expect(skillPanelStats(change.profile,progress,towerProgress).remaining).toBe(64);});
 it('keeps targeted techniques within the shared total power cap',()=>{
  for(const jobId of ['warrior','thief','mage']){let p=base(jobId);for(const id of ['attack_1','attack_2','attack_3','attack_4','attack_5','attack_6'])p=unlock(p,id);for(let i=1;i<=5;i++)p=unlock(p,'job_'+jobId+'_'+i);const normal=heroJobSnapshot({...p,skillPanel:{unlockedNodeIds:[],revision:0}}),grown=heroJobSnapshot(p);for(const skill of grown.skills.filter(s=>s.kind==='attack')){const before=normal.skills.find(s=>s.id===skill.id);expect(skill.powerPercent).toBeLessThanOrEqual(Math.floor(before.powerPercent*1.25));expect(skill.mpCost).toBeGreaterThanOrEqual(1);}}
 });
 it('rejects unowned nodes of another job and wrong-job stale confirmation',()=>{
  const p=base('mage');expect(()=>unlock(p,'job_warrior_1')).toThrow('PANEL_NOT_AVAILABLE');expect(()=>prepareSkillPanelAction({profile:p,progress,towerProgress,nodeId:'job_mage_1',expectedRevision:0,expectedJobId:'warrior',actionId:'old',now:1})).toThrow('PANEL_PROFILE_CHANGED');
 });
 it.each(old.map((change,index)=>[index,change]))('continues v2.9.8 mode %s without changing captured panel bonuses',(_i,change)=>{
  const battle=structuredClone(change.battle),party=!!battle.partySnapshot;
  const result=party?preparePartyBattleAction({battle,action:{targetEnemyInstanceId:battle.enemyStates[0].enemyInstanceId},now:2}).battle:prepareBattleAttack({battle,profile:{...change.profile,jobId:'warrior'},actionId:'legacy',now:2}).battle;
  const before=party?battle.partySnapshot:battle.playerSnapshot,after=party?result.partySnapshot:result.playerSnapshot;expect(after).toEqual(before);expect((party?after.members[0]:after).skillPanelSnapshot.rulesVersion).toBe(1);
 });
});
