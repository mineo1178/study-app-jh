import { describe, expect, it } from 'vitest';
import { SKILL_PANEL_CATALOG, PANEL_EFFECT_LIMITS } from './skillPanelCatalog.js';
import { earnedSkillSp, readSkillPanel, skillPanelStats, panelNodeState, skillPanelEffects, applySkillPanelEffects } from './skillPanelSelectors.js';
import { totalExpForLevel } from './levelSystem.js';
import { heroJobSnapshot } from './jobStats.js';
import { JOB_CATALOG } from './jobCatalog.js';
import { prepareSkillPanelAction } from '../data/rpgSkillPanelRepository.js';
import { prepareBattleStart, preparePartyTowerStart, prepareWeeklyBossStart } from '../data/rpgBattleRepository.js';
import { buildTowerEncounter } from './towerCatalog.js';
import { getWeeklyBossDefinition } from './weeklyBossCatalog.js';
import { ENEMY_CATALOG } from './enemyCatalog.js';
import { preparePartyBattleAction } from './partyBattleEngine.js';
import oldBattles from '../../test/fixtures/rpg-v2.9.6-battles.json';
import { measurePanelBalance, panelBuildProfile } from '../../scripts/measurePanelBalance.js';
const progress={completedChapterIds:['chapter_1','chapter_2']},towerProgress={highestFloor:60};
const profile=()=>({gold:3000,totalExp:totalExpForLevel(20),statAllocation:{hp:9,mp:10},jobId:'adventurer',battleEnergy:30,custom:{keep:true},ownedEquipment:{iron_sword:true},equipped:{weapon:'iron_sword'},weeklyBoss:{totalClears:10}});
const action=(p,nodeId,extra={})=>prepareSkillPanelAction({profile:p,progress,towerProgress,nodeId,expectedRevision:p.skillPanel?.revision||0,expectedJobId:p.jobId,actionId:'panel',now:1,...extra});
describe('derived SP and catalog reachability',()=>{
 it.each([[1,0],[7,12],[12,22],[20,38],[41,80],[99,80]])('derives Lv%s SP without trusting saved level',(level,sp)=>expect(earnedSkillSp({totalExp:totalExpForLevel(level),level:999}).earned).toBe(sp));
 it('counts distinct Campaign and Tower progress, caps Weekly/overall and never grants a balance field',()=>{
  const sp=earnedSkillSp({...profile(),weeklyBoss:{totalClears:500,clearedWeekIds:['2026-W01','2026-W01']}},{completedChapterIds:['chapter_1','chapter_1','chapter_2','fake']},{highestFloor:100,bossWins:999});
  expect(sp).toMatchObject({earned:64,sources:{level:38,campaign:4,tower:12,weekly:10}});
  expect(earnedSkillSp(profile(),progress,{highestFloor:10,bossWins:999}).sources.tower).toBe(2);
  expect(Object.values(SKILL_PANEL_CATALOG).filter(node=>!node.jobId)).toHaveLength(25);expect(readSkillPanel({})).toEqual({unlockedNodeIds:[],revision:0});
 });
 it('requires adjacency, hides secrets until both branches are obtained and enforces SP/level',()=>{
  expect(panelNodeState('attack_3',profile(),progress,towerProgress).unlockable).toBe(false);
  expect(panelNodeState('attack_6',profile(),progress,towerProgress).visible).toBe(false);
  let p=profile();for(const id of ['attack_1','attack_2','attack_3','attack_4','attack_5'])p=action(p,id).profile;
  expect(panelNodeState('attack_6',p,progress,towerProgress)).toMatchObject({visible:true,unlockable:true});
  expect(action(p,'attack_6').profile.skillPanel.unlockedNodeIds).toContain('attack_6');
  expect(panelNodeState('attack_1',{...profile(),totalExp:0,weeklyBoss:{}}).reason).toContain('SP不足');
  expect(panelNodeState('attack_6',{...p,totalExp:totalExpForLevel(7)},progress,towerProgress).reason).toContain('Lv12');
 });
 it.each([{unlockedNodeIds:['fake'],revision:0},{unlockedNodeIds:['attack_1','attack_1'],revision:0},{unlockedNodeIds:['attack_3'],revision:1},{unlockedNodeIds:[],revision:-1},null])('rejects corrupt state without silently resetting %j',skillPanel=>expect(()=>readSkillPanel({skillPanel})).toThrow('INVALID_SKILL_PANEL_STATE'));
});
describe('atomic panel preparations',()=>{
 it('preserves every unrelated field and resets only panels for 1000G',()=>{
  const before=profile(),change=action(before,'attack_1');expect(change.patch).toEqual({skillPanel:{unlockedNodeIds:['attack_1'],revision:1},updatedAt:1});expect(change.profile).toEqual({...before,...change.patch});
  const reset=action(change.profile,null,{kind:'reset',expectedRevision:1});expect(reset.profile).toEqual({...change.profile,gold:2000,skillPanel:{unlockedNodeIds:[],revision:2},updatedAt:1});expect(skillPanelStats(reset.profile,progress,towerProgress).remaining).toBe(64);
 });
 it.each(['fake','__proto__','start',null])('rejects invalid node %s',nodeId=>expect(()=>action(profile(),nodeId)).toThrow('INVALID_PANEL_NODE'));
 it('rejects stale, duplicate, unconnected, insufficient SP/gold and battle changes',()=>{
  const p=action(profile(),'attack_1').profile;
  expect(()=>action(p,'attack_1')).toThrow('PANEL_ALREADY_UNLOCKED');expect(()=>action(p,'magic_2')).toThrow('PANEL_NOT_AVAILABLE');
  expect(()=>action(p,'attack_2',{expectedRevision:0})).toThrow('PANEL_PROFILE_CHANGED');expect(()=>action({...profile(),totalExp:0,weeklyBoss:{}},'attack_1',{progress:{},towerProgress:{}})).toThrow('PANEL_NOT_AVAILABLE');
  expect(()=>action({...p,gold:999},null,{kind:'reset'})).toThrow('INSUFFICIENT_GOLD');expect(()=>action({...p,activeBattleId:'active'},null,{kind:'reset'})).toThrow('PANEL_CHANGE_DURING_BATTLE');
 });
});
describe('captured hero-only effects',()=>{
 it.each(Object.keys(JOB_CATALOG))('adds effects after job/HP/MP allocation and caps MP/heal/guard for %s',jobId=>{
  const p=panelBuildProfile({...profile(),jobId},'magic',progress,towerProgress),base=heroJobSnapshot({...p,skillPanel:{unlockedNodeIds:[],revision:0}}),grown=heroJobSnapshot(p),effects=skillPanelEffects(p);
  expect(grown.maxHp).toBe(base.maxHp+effects.maxHp);expect(grown.maxMp).toBe(base.maxMp+effects.maxMp);expect(grown.attack).toBe(base.attack+effects.attack);expect(grown.defense).toBe(base.defense+effects.defense);
  expect(grown.skills.every(skill=>skill.mpCost>=1)).toBe(true);expect(grown.skills.filter(skill=>skill.kind==='heal').every(skill=>skill.healPercent<=60)).toBe(true);expect(grown.skills.filter(skill=>skill.kind==='guard').every(skill=>skill.damageReductionPercent<=80)).toBe(true);
  for(const key of Object.keys(effects))expect(effects[key]).toBeLessThanOrEqual(PANEL_EFFECT_LIMITS[key]);
  const starts=[prepareBattleStart({profile:p,enemy:ENEMY_CATALOG.slime,battleId:'c',now:1}),preparePartyTowerStart({profile:p,encounter:buildTowerEncounter({floor:10}),battleId:'t',now:1}),prepareWeeklyBossStart({profile:p,boss:getWeeklyBossDefinition('2026-W01'),battleId:'w',now:1})];
  for(const change of starts)expect((change.battle.playerSnapshot||change.battle.partySnapshot.members[0]).skillPanelSnapshot).toMatchObject({unlockedNodeIds:p.skillPanel.unlockedNodeIds,effects});
  const captured=starts[1].battle,skill=captured.partySnapshot.members[0].skills[0],turn=preparePartyBattleAction({battle:captured,action:{skillId:skill.id,targetEnemyInstanceId:captured.enemyStates[0].enemyInstanceId},now:2});expect(turn.battle.playerMp).toBe(captured.playerMp-skill.mpCost);
  const plain=preparePartyTowerStart({profile:{...p,skillPanel:{unlockedNodeIds:[],revision:0}},encounter:buildTowerEncounter({floor:10}),battleId:'base',now:1});expect(starts[1].battle.partySnapshot.members.slice(1)).toEqual(plain.battle.partySnapshot.members.slice(1));
 });
 it.each(oldBattles.slice(1))('keeps an existing party snapshot untouched after live panel changes',change=>{
  const next=preparePartyBattleAction({battle:change.battle,action:{targetEnemyInstanceId:change.battle.enemyStates[0].enemyInstanceId},now:2}).battle;expect(next.partySnapshot).toEqual(change.battle.partySnapshot);expect(next.partySnapshot.members[0]).not.toHaveProperty('skillPanelSnapshot');
 });
});
it('clamps guard/heal and never turns a paid skill into zero MP',()=>{const p={...profile(),skillPanel:{unlockedNodeIds:['support_1','support_2','support_3','support_4','support_5','support_6','magic_1','magic_2','magic_4'],revision:9}};const result=applySkillPanelEffects(p,{maxHp:40,maxMp:8,attack:5,defense:0,skills:[{kind:'heal',mpCost:1,healPercent:58},{kind:'guard',mpCost:1,damageReductionPercent:79}]});expect(result.skills[0]).toMatchObject({mpCost:1,healPercent:60});expect(result.skills[1]).toMatchObject({mpCost:1,damageReductionPercent:80});});

describe('panel balance',()=>{
 const rows=measurePanelBalance();
 it('measures 1404 fights without infinite actions or one-round Weekly sweeps',()=>{expect(rows).toHaveLength(1404);expect(rows.every(row=>row.after.status!=='active'&&row.after.actions<300&&row.after.mpRemaining>=0)).toBe(true);expect(rows.filter(row=>row.target.startsWith('weekly_')).every(row=>row.after.turns>1)).toBe(true);});
 it('keeps every job viable against major bosses with training',()=>{for(const jobId of Object.keys(JOB_CATALOG))for(const target of new Set(rows.map(row=>row.target)))expect(rows.some(row=>row.jobId===jobId&&row.level===20&&row.target===target&&row.after.status==='won')).toBe(true);});
});
