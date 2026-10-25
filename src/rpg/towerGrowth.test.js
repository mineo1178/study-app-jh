import { describe, expect, it } from 'vitest';
import baseline from '../../test/fixtures/rpg-v2.9.9-tower.json';
import { buildTowerEncounter, buildTowerEnemy } from './towerCatalog.js';
import { ENEMY_CATALOG } from './enemyCatalog.js';
import { calculateEnemyActionDamage } from './battleCalculator.js';
import { enemyActionForTurn } from './enemyActionCatalog.js';
import { BOSS_CATALOG } from './bossCatalog.js';
import { SKILL_PANEL_CATALOG } from './skillPanelCatalog.js';
import { BALANCE_PLAYERS, BALANCE_SCENARIOS, simulateBattle } from '../../scripts/simulateBattleBalance.js';
import { preparePartyBattleResult } from '../data/rpgBattleRepository.js';

const withoutVersion = encounter => JSON.parse(JSON.stringify(encounter, (key,value) => key === 'rulesVersion' ? undefined : value));
describe('v2.9.10 Tower growth', () => {
  it.each(Array.from({length:20},(_,i)=>i+1))('preserves the entire floor %s encounter except the rule version', floor => {
    expect(withoutVersion(buildTowerEncounter({floor}))).toEqual(withoutVersion(baseline.encounters[floor]));
  });
  it.each([21,30,40,41,50,60,61,80,81,100])('strengthens every enemy at floor %s while preserving counts, EXP and energy', floor => {
    const before=baseline.encounters[floor], after=buildTowerEncounter({floor});
    expect(after.rulesVersion).toBe(5);
    expect(after.enemies).toHaveLength(before.enemies.length);
    expect(after.expReward).toBe(before.expReward);
    expect(after.energyCost).toBe(before.energyCost);
    after.enemies.forEach((enemy,i)=> {
      expect(enemy.maxHp).toBeGreaterThanOrEqual(before.enemies[i].maxHp);
      expect(enemy.attack).toBeGreaterThanOrEqual(before.enemies[i].attack);
      const x=((floor-20)/80)**2;
      // Scaling uses the unrounded baseline; allow one point of rounding error.
      expect(Math.abs(enemy.maxHp-before.enemies[i].maxHp*(1+0.4*x))).toBeLessThan(1.2);
      expect(Math.abs(enemy.attack-before.enemies[i].attack*(1+0.2*x))).toBeLessThan(1.2);
    });
  });
  it.each([...Object.values(ENEMY_CATALOG),...Object.values(BOSS_CATALOG)])('keeps same-species $id stats monotonic through floor 200', baseEnemy => {
    let previous=buildTowerEnemy({floor:1,baseEnemy});
    for(let floor=2;floor<=200;floor++) {
      const enemy=buildTowerEnemy({floor,baseEnemy});
      expect(enemy.maxHp).toBeGreaterThanOrEqual(previous.maxHp);
      expect(enemy.attack).toBeGreaterThanOrEqual(previous.attack);
      if([21,41,61,81].includes(floor)) {
        expect(enemy.maxHp/previous.maxHp).toBeLessThan(1.1);
        expect(enemy.attack/previous.attack).toBeLessThan(1.1);
      }
      previous=enemy;
    }
  });
  it('preserves the 54 purchasable hero panels',()=>expect(Object.keys(SKILL_PANEL_CATALOG).filter(id=>id!=='start')).toHaveLength(54));
  it.each(baseline.regression)('keeps Campaign / Weekly combat unchanged: $id', row=> {
    expect(simulateBattle(BALANCE_PLAYERS.trained,BALANCE_SCENARIOS.find(s=>s.id===row.id),'strategy',{mpRules:true,skillRules:true,jobRules:true})).toEqual(row.result);
  });
  it.each(baseline.battles)('resumes frozen rules 4 battle $battle.battleId through completion', fixture=> {
    let battle=JSON.parse(JSON.stringify(fixture.battle));
    const before=structuredClone(battle);
    let change;
    for(let action=1;battle.status==='active'&&action<=300;action++) {
      change=preparePartyBattleResult({battle,profile:fixture.profile,towerProgress:fixture.towerProgress,action:{targetEnemyInstanceId:battle.enemyStates.find(e=>e.status==='active').enemyInstanceId},actionId:`old-${action}`,now:action+1});
      for(const event of change.result.enemyEvents) {
        const enemy=before.enemySnapshots.find(e=>e.enemyInstanceId===event.enemyInstanceId);
        const member=before.partySnapshot.members.find(m=>m.memberId===event.targetMemberId);
        const action=enemyActionForTurn(enemy.actionPattern,battle.roundNumber);
        expect(event.damage).toBe(calculateEnemyActionDamage({enemyAttack:enemy.attack,powerPercent:action.powerPercent,playerDefense:member.defense}).damage);
      }
      battle=JSON.parse(JSON.stringify(change.battle));
      expect(battle.enemySnapshots).toEqual(before.enemySnapshots);
      expect(battle.partySnapshot).toEqual(before.partySnapshot);
      expect(battle.encounterSnapshot).toEqual(before.encounterSnapshot);
      expect(battle.towerRulesVersion).toBe(4);
    }
    expect(battle.status).not.toBe('active');
    if(battle.status==='won') {
      expect(change.victoryLedger.expGranted).toBe(before.encounterSnapshot.expReward);
      expect(change.towerProgress.currentFloor).toBe(before.towerFloor+1);
    } else {
      expect(change.defeatLedger.expGranted).toBe(0);
      expect(change.towerProgress).toBeUndefined();
    }
    expect(()=>preparePartyBattleResult({battle,profile:change.profile,towerProgress:change.towerProgress,action:{},actionId:'retry',now:999})).toThrow('BATTLE_ALREADY_COMPLETED');
    expect(fixture.battle).toEqual(before);
  });
});
