import { describe, expect, it } from 'vitest';
import before from '../../test/fixtures/rpg-v2.9.13-before-enemies.json';
import { buildTowerEncounter } from './towerCatalog.js';
import { getWeeklyBossDefinition } from './weeklyBossCatalog.js';
import { preparePartyTowerStart, preparePartyBattleResult, prepareWeeklyBossStart, prepareWeeklyBossResult } from '../data/rpgBattleRepository.js';
import { preparePartyBattleAction } from './partyBattleEngine.js';
import { calculateEnemyActionDamage } from './battleCalculator.js';
import { enemyActionForTurn } from './enemyActionCatalog.js';
import { BALANCE_PLAYERS, simulateBattle } from '../../scripts/simulateBattleBalance.js';
import { balanceBase, heroProfile, OPTIONS, candidateTarget } from '../../scripts/measureEnemyBalance.js';
import { companionBuildProfile } from '../../scripts/measureCompanionBalance.js';
import { JOB_CATALOG } from './jobCatalog.js';

const strip = value => JSON.parse(JSON.stringify(value,(key,v) => ['rulesVersion','maxHp','attack'].includes(key) ? undefined : v));
const weekly = before.filter(t => t.id.startsWith('weekly_'));

describe('v2.9.13 enemy-only balance', () => {
  it.each(before.filter(t=>t.floor))('limits changes and preserves every reward / pattern at $id', target => {
    const old=target.encounter, next=buildTowerEncounter({floor:target.floor});
    expect(next.rulesVersion).toBe(7);
    expect(strip(next)).toEqual(strip(old));
    const expected=candidateTarget(target,'medium').encounter;
    next.enemies.forEach((e,i)=> {
      const oldHp = expected.enemies[i].maxHp;
      if (target.floor < 10) {
        expect(e.maxHp).toBeLessThan(oldHp + 1);
        expect(Math.abs(e.maxHp - oldHp * (1 - (10 - target.floor) * 0.012))).toBeLessThan(1);
      } else expect(e.maxHp).toBe(oldHp);
      expect(e.attack).toBe(expected.enemies[i].attack);
      if((target.floor>=10 && target.floor<=20) || target.floor>=60) {
        expect(e.maxHp).toBe(old.enemies[i].maxHp);
        expect(e.attack).toBe(old.enemies[i].attack);
      }
    });
  });
  it.each(weekly)('changes only HP / attack / version for new $id battles', target => {
    const old=target.encounter.enemies[0], next=getWeeklyBossDefinition(old.weekId);
    const { enemyInstanceId: ignored, ...definition }=old;
    expect(ignored).toBe(old.id);
    expect(strip(next)).toEqual(strip(definition));
    expect(next).toMatchObject({rulesVersion:5,maxHp:Math.round(old.maxHp*1.3),attack:Math.round(old.attack*1.08)});
    const start=prepareWeeklyBossStart({profile:BALANCE_PLAYERS.trained,boss:next,battleId:'new',now:1});
    expect(start.battle.enemyStates[0].hp).toBe(next.maxHp);
    expect(start.battle.weeklyBossSnapshot.rulesVersion).toBe(5);
  });
  it('uses version 7 and new HP at the Tower start boundary',()=> {
    const encounter=buildTowerEncounter({floor:40});
    const start=preparePartyTowerStart({profile:BALANCE_PLAYERS.trained,encounter,battleId:'new',now:1});
    expect(start.battle.towerRulesVersion).toBe(7);
    expect(start.battle.enemyStates.map(e=>e.hp)).toEqual(encounter.enemies.map(e=>e.maxHp));
    expect(start.profile.battleEnergy).toBe(BALANCE_PLAYERS.trained.battleEnergy-encounter.energyCost);
  });
  it.each([...weekly,...before.filter(t=>[40,80,100].includes(t.floor))].flatMap(target=>[
    {...target,era:'old'},
    {...target,era:'new',encounter:target.floor?buildTowerEncounter({floor:target.floor}):{enemies:[getWeeklyBossDefinition(target.encounter.enemies[0].weekId)]}},
  ]))('resumes saved $era $id with original damage, snapshots and settlement',target=> {
    const isWeekly=!target.floor;
    const profile=balanceBase(30);
    const start=isWeekly ? prepareWeeklyBossStart({profile,boss:target.encounter.enemies[0],battleId:'old',now:1}) : preparePartyTowerStart({profile,encounter:target.encounter,battleId:'old',now:1});
    let battle=start.battle, change;
    const snapshot=structuredClone(battle);
    // Save after the first real action, then reload with the new catalogs installed.
    battle=preparePartyBattleAction({battle,action:{actionId:'first',targetEnemyInstanceId:battle.enemyStates[0].enemyInstanceId},now:2}).battle;
    const savedHp=battle.enemyStates[0].hp;
    battle=JSON.parse(JSON.stringify(battle));
    expect(battle.enemyStates[0].hp).toBe(savedHp);
    expect(savedHp).toBe(snapshot.enemyStates[0].hp-snapshot.partySnapshot.members[0].attack);
    for(let action=2;battle.status==='active'&&action<=300;action++) {
      const args={battle,profile:start.profile,towerProgress:{currentFloor:target.floor,highestFloor:(target.floor||1)-1},action:{targetEnemyInstanceId:battle.enemyStates.find(e=>e.status==='active').enemyInstanceId},actionId:String(action),now:action+1};
      change=isWeekly ? prepareWeeklyBossResult(args) : preparePartyBattleResult(args);
      for(const event of change.result.enemyEvents) {
        const enemy=snapshot.enemySnapshots.find(e=>e.enemyInstanceId===event.enemyInstanceId);
        const member=snapshot.partySnapshot.members.find(m=>m.memberId===event.targetMemberId);
        expect(event.damage).toBe(calculateEnemyActionDamage({enemyAttack:enemy.attack,powerPercent:enemyActionForTurn(enemy.actionPattern,battle.roundNumber).powerPercent,playerDefense:member.defense}).damage);
      }
      battle=JSON.parse(JSON.stringify(change.battle));
      expect(battle.enemySnapshots).toEqual(snapshot.enemySnapshots);
      expect(battle.partySnapshot).toEqual(snapshot.partySnapshot);
      expect(battle.encounterSnapshot).toEqual(snapshot.encounterSnapshot);
      expect(battle.weeklyBossSnapshot).toEqual(snapshot.weeklyBossSnapshot);
      expect(battle.towerRulesVersion).toBe(snapshot.towerRulesVersion);
    }
    expect(battle.status).not.toBe('active');
    expect(change.profile.activeBattleId).toBeNull();
    if(battle.status==='won') {
      if(isWeekly) {
        expect(change.victoryLedger.reward).toEqual(snapshot.weeklyBossSnapshot.reward);
        expect(change.profile.totalExp-profile.totalExp).toBe(snapshot.weeklyBossSnapshot.reward.expReward);
        expect(change.profile.weeklyBoss.totalClears).toBe(profile.weeklyBoss.totalClears+1);
      } else {
        expect(change.victoryLedger.expGranted).toBe(snapshot.encounterSnapshot.expReward);
        expect(change.towerProgress.currentFloor).toBe(target.floor+1);
      }
    } else expect(change.defeatLedger.expGranted).toBe(0);
    const settle=isWeekly ? prepareWeeklyBossResult : preparePartyBattleResult;
    expect(()=>settle({battle,profile:change.profile,action:{},actionId:'retry',now:999})).toThrow('BATTLE_ALREADY_COMPLETED');
  });
  it.each([25,30])('measures floor 100 for all 36 balanced companion conditions at Lv%s', level=> {
    const results=[];
    for(const jobId of Object.keys(JOB_CATALOG)) for(const build of ['none','attack','balanced']) for(const party of ['defensive','offensive']) {
      const ids=party==='defensive'?['hero','guardian','healer']:balanceBase(level).partyMemberIds;
      const profile=ids.slice(1).reduce((p,id)=>companionBuildProfile(p,id,'balanced'),heroProfile(level,jobId,build,ids));
      results.push(simulateBattle(profile,{encounter:buildTowerEncounter({floor:100})},'strategy',OPTIONS));
    }
    expect(results.filter(r=>r.status==='won')).toHaveLength(level===25?0:2);
    expect(results.every(r=>r.status!=='active')).toBe(true);
  });
});
