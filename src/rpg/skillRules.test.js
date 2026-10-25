import { describe, expect, it } from 'vitest';
import { prepareBattleStart, prepareBattleAttack, preparePartyTowerStart, prepareWeeklyBossStart } from '../data/rpgBattleRepository.js';
import { preparePartyBattleAction, createPartyBattle } from './partyBattleEngine.js';
import { buildTowerPartySnapshot, PARTY_MEMBER_CATALOG } from './partyMemberCatalog.js';
import { normalizePlayerProfile } from './playerProfile.js';
import { totalExpForLevel } from './levelSystem.js';
import { calculateHealAmount } from './battleCalculator.js';
import { ENEMY_CATALOG } from './enemyCatalog.js';
import { buildTowerEncounter } from './towerCatalog.js';
import { getWeeklyBossDefinition } from './weeklyBossCatalog.js';
import { battleSkillAvailability } from './battleUiLogic.js';
import { findUndefinedPaths } from '../test/findUndefinedPaths.js';
import { measureSkillRulesBalance } from '../../scripts/measureSkillRulesBalance.js';
const player = () => normalizePlayerProfile({ totalExp: totalExpForLevel(12), battleEnergy: 100, statAllocation: { hp: 0, mp: 11 } });
const campaign = () => prepareBattleStart({ profile: player(), enemy: { ...ENEMY_CATALOG.slime, maxHp: 10000, attack: 1 }, battleId: 'skills', now: 1 }).battle;
const act = (battle, id) => prepareBattleAttack({ battle, profile: player(), actionId: String(battle.attackCount), now: 2, action: { kind: 'skill', ...(id === 'healing_light' ? { healing: calculateHealAmount({ playerMaxHp: battle.playerSnapshot.maxHp, playerHp: battle.playerHp, healPercent: 35 }) } : {}), damage: 1, skill: { ...battle.playerSnapshot.skills[id], useNumber: (battle.skillUses[id] || 0) + 1 } } });
const durable = battle => ({ ...battle, partySnapshot: { members: battle.partySnapshot.members.map(member => ({ ...member, maxHp: 10000 })) }, partyStates: battle.partyStates.map(state => ({ ...state, hp: 100 })), enemyStates: battle.enemyStates.map(state => ({ ...state, hp: 100000 })), enemySnapshots: battle.enemySnapshots.map(enemy => ({ ...enemy, attack: 1 })) });
const advanceTo = (battle, actorId) => { while (battle.activePartyMemberId !== actorId) battle = preparePartyBattleAction({ battle, action: { targetEnemyInstanceId: battle.enemyStates[0].enemyInstanceId }, now: 2 }).battle; return battle; };
describe('versioned skill rules', () => {
  it.each(['flame_slash','aqua_edge','thunder_strike','guard_stance'])('uses %s beyond two actions, consumes MP and keeps enemy turns', id => {
    let battle = campaign();
    for (let i=0;i<3;i++) battle = act(battle,id).battle;
    expect(battle.skillUses[id]).toBe(3); expect(battle.playerMp).toBe(24); expect(battle.attackCount).toBe(3);
    expect(() => act({ ...battle, playerMp: 1 }, id)).toThrow('INSUFFICIENT_MP');
  });
  it('retains maxUses and hero-only MP on old Campaign/Tower/Weekly snapshots', () => {
    const old = campaign(); delete old.skillRulesVersion;
    expect(() => act({ ...old, skillUses: { aqua_edge: 2 } }, 'aqua_edge')).toThrow('SKILL_NO_USES');
    for (const schemaVersion of [8,9]) {
      const members = buildTowerPartySnapshot(player());
      let battle = createPartyBattle({ battleId: 'legacy', schemaVersion, encounter: buildTowerEncounter({ floor: 10 }), members, now: 1, mpRulesVersion: 1 });
      battle = { ...battle, activePartyMemberId: 'guardian', skillUses: { 'guardian:guardian_wall': 1 }, playerMp: 0 };
      const next = preparePartyBattleAction({ battle, action: { skillId: 'guardian_wall' }, now: 2 }).battle;
      expect(next.partySnapshot.members).toEqual(members); expect(next.playerMp).toBe(0); expect(next).not.toHaveProperty('memberMp');
      expect(() => preparePartyBattleAction({ battle: { ...battle, skillUses: { 'guardian:guardian_wall': 2 } }, action: { skillId: 'guardian_wall' }, now: 2 })).toThrow('SKILL_NO_USES');
    }
  });
  it.each([['guardian','guardian_wall',8,2],['mage','firestorm',12,4],['healer','healing_prayer',12,4]])('gives %s independent finite MP, persists three uses and keeps turns', (id,skillId,mp,cost) => {
    const profile = { ...player(), partyMemberIds: ['hero',id] };
    let battle = durable(preparePartyTowerStart({ profile, encounter: buildTowerEncounter({ floor: 10 }), battleId: id, now: 1 }).battle);
    for(let i=0;i<3;i++) {
      battle = advanceTo(battle,id);
      const result = preparePartyBattleAction({ battle, action: { skillId }, now: i+2 });
      expect(result.event.mp).toEqual({before:mp-i*cost,after:mp-(i+1)*cost,cost});
      battle = JSON.parse(JSON.stringify(result.battle));
      expect(battle.activePartyMemberId).toBe('hero'); expect(battle.roundNumber).toBe(i+2);
    }
    expect(battle.skillUses[id+':'+skillId]).toBe(3); expect(battle.memberMp[id]).toBe(mp-3*cost); expect(battle.playerMp).toBe(30);
    battle = advanceTo(battle,id); battle.memberMp[id] = cost-1;
    expect(() => preparePartyBattleAction({ battle, action: { skillId }, now: 6 })).toThrow('INSUFFICIENT_MP');
    const available = battleSkillAvailability(battle,battle.partySnapshot.members[1].skills[0]);
    expect(available.available).toBe(false); expect(available.reason).toContain('不足 1');
  });
  it('snapshots MP costs for every gacha companion without hero allocation leaking', () => {
    for(const id of Object.keys(PARTY_MEMBER_CATALOG).filter(id=>id!=='hero')) {
      const profile = { ...player(), partyMemberIds: ['hero',id], unlockedPartyMemberIds: ['hero',id] };
      const battle = preparePartyTowerStart({ profile, encounter: buildTowerEncounter({floor:10}), battleId:id, now:1 }).battle;
      expect(findUndefinedPaths(battle)).toEqual([]);
      const companion = battle.partySnapshot.members[1]; expect(companion.maxMp).toBeGreaterThan(0); expect(companion.skills.every(skill=>Number.isInteger(skill.mpCost)&&skill.mpCost>0)).toBe(true);
      const other = preparePartyTowerStart({ profile: { ...profile, statAllocation: { hp:11,mp:0 } }, encounter:buildTowerEncounter({floor:10}),battleId:id,now:1 }).battle;
      expect(other.partySnapshot.members[1]).toEqual(companion);
    }
  });
  it('marks new Weekly battles and rejects unnecessary healing without changing MP', () => {
    const battle = prepareWeeklyBossStart({ profile: player(), boss:getWeeklyBossDefinition('2026-W01'),battleId:'weekly',now:1 }).battle;
    expect(battle.skillRulesVersion).toBe(2); expect(battle.memberMp).toEqual({guardian:8,mage:12});
    expect(() => preparePartyBattleAction({battle,action:{skillId:'healing_light',targetMemberId:'hero'},now:2})).toThrow('HEAL_NOT_NEEDED');
    expect(battle.playerMp).toBe(30);
  });
  it('exhausts hero healing MP after repeated heals and keeps normal attacks free', () => {
    let battle = campaign();
    for(let i=0;i<10;i++) { battle.playerHp=1; battle=act(battle,'healing_light').battle; }
    expect(battle.playerMp).toBe(0); expect(battle.skillUses.healing_light).toBe(10);
    battle.playerHp=1; expect(() => act(battle,'healing_light')).toThrow('INSUFFICIENT_MP');
    const next=prepareBattleAttack({battle,profile:player(),actionId:'normal',now:3}).battle;
    expect(next.playerMp).toBe(0);
  });
});
describe('skill rules balance matrix', () => {
  const rows = measureSkillRulesBalance();
  it('measures 162 comparisons over all required bosses, levels, allocations and healer choices', () => {
    expect(rows).toHaveLength(162); expect(rows.every(row=>row.after.status!=='active'&&row.after.actions<300)).toBe(true);
    expect(rows.every(row=>row.after.mpRemaining>=0)).toBe(true);
  });
  it('keeps Lv12 Weekly bosses winnable in all builds and retains healer tactics', () => {
    const weekly=rows.filter(row=>row.level===12&&row.target.startsWith('weekly_'));
    expect(weekly).toHaveLength(24); expect(weekly.every(row=>row.after.status==='won')).toBe(true);
    expect(weekly.some(row=>row.healer&&row.after.heals>rows.find(other=>other.level===row.level&&other.allocation===row.allocation&&other.target===row.target&&!other.healer).after.heals)).toBe(true);
  });
});
