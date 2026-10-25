import { describe, expect, it } from 'vitest';
import before from '../../test/fixtures/rpg-v2.9.6-enemies.json';
import snapshots from '../../test/fixtures/rpg-v2.9.6-battles.json';
import { BALANCE_SCENARIOS } from '../../scripts/simulateBattleBalance.js';
import { measureDifficultyBalance } from '../../scripts/measureDifficultyBalance.js';
import { prepareBattleAttack } from '../data/rpgBattleRepository.js';
import { preparePartyBattleAction } from './partyBattleEngine.js';
describe('individual enemy relief and unchanged rewards',()=>{
 it('retains base relief beneath the v2.9.10 Tower ramp, actions, affinities and rewards',()=>{
  for(const old of before.scenarios){const next=BALANCE_SCENARIOS.find(row=>row.id===old.id);const oldEnemies=old.enemy?[old.enemy]:old.encounter.enemies,newEnemies=next.enemy?[next.enemy]:next.encounter.enemies;
   oldEnemies.forEach((enemy,i)=>{const current=newEnemies[i];const ramp=old.id.startsWith('tower-')?(Math.max(0,old.floor-20)/80)**2:0;expect(current.maxHp).toBeLessThanOrEqual(Math.ceil(enemy.maxHp*(1+0.4*ramp)));expect(current.attack).toBeLessThanOrEqual(Math.ceil(enemy.attack*(1+0.2*ramp)));for(const key of ['element','weaknesses','resistances','energyCost','expReward','reward','firstClearReward','actionPattern'])expect(current[key]).toEqual(enemy[key]);});
  }
  expect(BALANCE_SCENARIOS.find(row=>row.id==='campaign-slime').enemy).toMatchObject({maxHp:20,attack:3});
 });
 it.each(snapshots.map((change,index)=>[index,change]))('resumes saved mode %s with untouched snapshots',(_index,change)=>{
  const battle=structuredClone(change.battle),party=!!battle.partySnapshot;
  const next=party?preparePartyBattleAction({battle,action:{targetEnemyInstanceId:battle.enemyStates[0].enemyInstanceId},now:2}).battle:prepareBattleAttack({battle,profile:change.profile,progress:{normalWins:3},actionId:'resume',now:2}).battle;
  for(const key of party?['enemySnapshots','partySnapshot','encounterSnapshot','weeklyBossSnapshot']:['enemySnapshot','playerSnapshot','chapterSnapshot'])expect(next[key]).toEqual(battle[key]);
 });
});
describe('v2.9.6 to v2.9.7 matrix',()=>{
 const after=measureDifficultyBalance();
 it('measures all 2100 cases and finishes without unbounded actions',()=>{expect(after).toHaveLength(2100);expect(after.every(row=>row.status!=='active'&&row.actions<300&&row.mpRemaining>=0)).toBe(true);});
 it('keeps all six jobs viable at Lv20 and improves aggregate boss access',()=>{
  expect(after.filter(row=>row.status==='won').length).toBeGreaterThanOrEqual(before.rows.filter(row=>row.status==='won').length);
  for(const jobId of new Set(after.map(row=>row.jobId)))for(const target of new Set(after.map(row=>row.target)))expect(after.some(row=>row.jobId===jobId&&row.level===20&&row.target===target&&row.status==='won')).toBe(true);
  expect(after.filter(row=>row.level===1&&row.target==='campaign-slime').every(row=>row.turns>1)).toBe(true);
 });
});
