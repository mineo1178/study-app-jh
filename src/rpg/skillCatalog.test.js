import { heroJobSnapshot } from './jobStats.js';
import { buildTowerEncounter } from './towerCatalog.js';
import { preparePartyTowerStart } from '../data/rpgBattleRepository.js';
import { preparePartyBattleAction } from './partyBattleEngine.js';
import { describe, expect, it } from 'vitest';
import { SKILL_CATALOG } from './skillCatalog.js';
describe('starter skills', () => { it('defines attack, heal and guard skills', () => { expect(Object.keys(SKILL_CATALOG)).toHaveLength(7); Object.values(SKILL_CATALOG).forEach((skill) => expect(skill).toMatchObject({ id: expect.any(String), name: expect.any(String), kind: expect.any(String), maxUses: 2 })); expect(SKILL_CATALOG.healing_light).toMatchObject({ kind: 'heal', healPercent: 35 }); expect(SKILL_CATALOG.guard_stance).toMatchObject({ kind: 'guard', damageReductionPercent: 50 }); }); });

describe('new job skills', () => {
  function start(jobId) {
    const profile = { jobId, battleEnergy: 3 };
    return preparePartyTowerStart({ profile, encounter: buildTowerEncounter({ floor: 1 }), battleId: 'skills', now: 1 }).battle;
  }

  it('lets the warrior use a neutral attack for 4 MP', () => {
    const battle = start('warrior');
    const result = preparePartyBattleAction({ battle, action: { actionId: 'strike', skillId: 'power_strike', targetEnemyInstanceId: battle.enemyStates[0].enemyInstanceId }, now: 2 });
    expect(result.battle.playerMp).toBe(battle.playerMp - 4);
    expect(result.battle.enemyStates[0].hp).toBeLessThan(battle.enemyStates[0].hp);
  });

  it('lets the priest heal a wounded ally for 1 MP', () => {
    const battle = start('priest');
    const hero = battle.partySnapshot.members[0];
    expect(heroJobSnapshot({ jobId: 'priest' }).skills).toContainEqual(expect.objectContaining({ id: 'quick_heal', targetType: 'single_ally', healPercent: 18 }));
    battle.partyStates[0].hp = hero.maxHp - 10;
    const result = preparePartyBattleAction({ battle, action: { actionId: 'heal', skillId: 'quick_heal', targetMemberId: 'hero' }, now: 2 });
    expect(result.battle.playerMp).toBe(battle.playerMp - 1);
    expect(result.actionEffects).toContainEqual({ kind: 'heal', targetId: 'hero', actualHeal: Math.floor(hero.maxHp * 0.18) });
  });
});
