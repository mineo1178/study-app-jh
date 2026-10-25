import { describe, expect, it } from 'vitest';
import { JOB_CATALOG, playerJobId } from './jobCatalog.js';
import { heroJobSnapshot } from './jobStats.js';
import { normalizePlayerProfile } from './playerProfile.js';
import { totalExpForLevel } from './levelSystem.js';
import { prepareJobChange } from '../data/rpgJobRepository.js';
import { prepareBattleStart, prepareBattleAttack, preparePartyTowerStart } from '../data/rpgBattleRepository.js';
import { buildTowerPartySnapshot } from './partyMemberCatalog.js';
import { preparePartyBattleAction } from './partyBattleEngine.js';
import { ENEMY_CATALOG } from './enemyCatalog.js';
import { buildTowerEncounter } from './towerCatalog.js';
import { calculateHealAmount } from './battleCalculator.js';
import { measureJobBalance } from '../../scripts/measureJobBalance.js';
import { findUndefinedPaths } from '../test/findUndefinedPaths.js';
const profile=()=>normalizePlayerProfile({totalExp:totalExpForLevel(20),gold:333,battleEnergy:30,statAllocation:{hp:9,mp:10},ownedEquipment:{iron_sword:true},equipped:{weapon:'iron_sword'},custom:{retained:true}});
describe('job changes and captured combat',()=>{
  it('defaults missing legacy jobs to adventurer',()=>{expect(playerJobId({})).toBe('adventurer');expect(normalizePlayerProfile({}).jobId).toBe('adventurer');});
  it.each(Object.keys(JOB_CATALOG))('changes to %s for free, preserves data and captures its own abilities and skills',jobId=>{
    const before={...profile(),jobId:jobId==='adventurer'?'warrior':'adventurer'};
    const change=prepareJobChange({profile:before,jobId,expected:{jobId:before.jobId,revision:0},actionId:'job',now:1});
    expect(change.patch).toEqual({jobId,jobRevision:1,updatedAt:1});expect(change.profile).toEqual({...before,...change.patch});
    const restored=JSON.parse(JSON.stringify(change.profile));const stats=heroJobSnapshot(restored);expect(stats.jobId).toBe(jobId);const unallocated=heroJobSnapshot({...restored,statAllocation:{hp:0,mp:0}});expect(stats.maxHp-unallocated.maxHp).toBe(27);expect(stats.maxMp-unallocated.maxMp).toBe(20);
    const battle=prepareBattleStart({profile:restored,enemy:{...ENEMY_CATALOG.slime,maxHp:10000},battleId:'job',now:1}).battle;
    expect(battle.playerSnapshot).toMatchObject({...stats,skills:Object.fromEntries(stats.skills.map(skill=>[skill.id,expect.objectContaining({id:skill.id,mpCost:skill.mpCost})]))});
    expect(battle.playerSnapshot.equipped.weapon).toBe('iron_sword');
    for(const skill of Object.values(battle.playerSnapshot.skills)) {
      const injured={...battle,playerHp:20};
      const result=prepareBattleAttack({battle:injured,profile:restored,actionId:skill.id,now:2,action:{kind:'skill',damage:1,skill:{...skill,useNumber:1},...(skill.kind==='heal'?{healing:calculateHealAmount({playerMaxHp:battle.playerSnapshot.maxHp,playerHp:20,healPercent:skill.healPercent})}:{})}});
      expect(result.battle.playerMp).toBe(battle.playerMp-skill.mpCost);expect(result.battle.playerSnapshot).toEqual(battle.playerSnapshot);
    }
    const tower=preparePartyTowerStart({profile:restored,encounter:buildTowerEncounter({floor:10}),battleId:'tower',now:1}).battle;
    expect(tower.partySnapshot.members[0]).toMatchObject(heroJobSnapshot(restored,{party:true}));
    const baseline=buildTowerPartySnapshot(profile(),{skillRulesVersion:2,jobRulesVersion:1});expect(tower.partySnapshot.members.slice(1)).toEqual(baseline.slice(1));
    const skill=tower.partySnapshot.members[0].skills[0];
    const next=preparePartyBattleAction({battle:tower,action:{skillId:skill.id,targetEnemyInstanceId:tower.enemyStates[0].enemyInstanceId},now:2}).battle;
    expect(next.playerMp).toBe(tower.playerMp-skill.mpCost);expect(findUndefinedPaths(next)).toEqual([]);
  });
  it.each(['unknown','__proto__','constructor',null,1])('rejects invalid job %s',jobId=>expect(()=>prepareJobChange({profile:profile(),jobId})).toThrow('INVALID_JOB_ID'));
  it('rejects battle-time changes, stale revisions and no-op changes',()=>{
    const args={profile:profile(),jobId:'mage',expected:{jobId:'adventurer',revision:0},now:1};
    expect(()=>prepareJobChange({...args,profile:{...args.profile,activeBattleId:'battle'}})).toThrow('JOB_CHANGE_DURING_BATTLE');
    expect(()=>prepareJobChange({...args,profile:{...args.profile,jobRevision:2}})).toThrow('JOB_PROFILE_CHANGED');
    expect(()=>prepareJobChange({...args,jobId:'adventurer'})).toThrow('JOB_UNCHANGED');
  });
  it.each(Object.keys(JOB_CATALOG))('preserves old Battle snapshots with live job %s',jobId=>{
    const initial=prepareBattleStart({profile:profile(),enemy:{...ENEMY_CATALOG.slime,maxHp:1000},battleId:'old',now:1}).battle;
    delete initial.skillRulesVersion; delete initial.playerSnapshot.jobId; delete initial.playerSnapshot.jobRulesVersion; delete initial.playerSnapshot.jobModifiers;
    const saved=structuredClone(initial.playerSnapshot),skill=initial.playerSnapshot.skills.aqua_edge;
    const next=prepareBattleAttack({battle:initial,profile:{...profile(),jobId},actionId:'old',now:2,action:{kind:'skill',damage:1,skill:{...skill,useNumber:1}}}).battle;
    expect(next.playerSnapshot).toEqual(saved);expect(next.playerSnapshot.skills).toHaveProperty('healing_light');
    expect(next.playerSnapshot).not.toHaveProperty('jobId');
  });
});
describe('six-job boss balance',()=>{
  const rows=measureJobBalance();
  it('measures 972 bounded fights and keeps all six jobs viable with training',()=>{
    expect(rows).toHaveLength(972);expect(rows.every(row=>row.status!=='active'&&row.actions<300&&row.mpRemaining>=0)).toBe(true);
    for(const jobId of Object.keys(JOB_CATALOG)) for(const target of new Set(rows.map(row=>row.target))) expect(rows.some(row=>row.jobId===jobId&&row.target===target&&row.level===20&&row.status==='won')).toBe(true);
  });
  it('keeps styles distinct and no class overwhelmingly stronger in the measured matrix',()=>{
    const summaries=Object.keys(JOB_CATALOG).map(jobId=>rows.filter(row=>row.jobId===jobId&&row.status==='won').length);
    expect(Math.max(...summaries)-Math.min(...summaries)).toBeLessThanOrEqual(12);
    expect(new Set(Object.keys(JOB_CATALOG).map(jobId=>JSON.stringify(heroJobSnapshot({...profile(),jobId}))))).toHaveLength(6);
  });
});
