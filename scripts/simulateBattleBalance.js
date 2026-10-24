/* global process */
import { battleMpCost } from '../src/rpg/statAllocation.js';
import { pathToFileURL } from 'node:url';
import { ENEMY_CATALOG } from '../src/rpg/enemyCatalog.js';
import { BOSS_CATALOG } from '../src/rpg/bossCatalog.js';
import { buildTowerEncounter } from '../src/rpg/towerCatalog.js';
import { getWeeklyBossDefinition } from '../src/rpg/weeklyBossCatalog.js';
import { normalizePlayerProfile } from '../src/rpg/playerProfile.js';
import { totalExpForLevel } from '../src/rpg/levelSystem.js';
import { calculateEnemyActionDamage, calculateHealAmount, calculateSkillDamage, getElementMultiplier } from '../src/rpg/battleCalculator.js';
import { enemyActionForTurn } from '../src/rpg/enemyActionCatalog.js';
import { createPartyBattle, partySkillKey, preparePartyBattleAction } from '../src/rpg/partyBattleEngine.js';
import { buildTowerPartySnapshot } from '../src/rpg/partyMemberCatalog.js';
import { prepareBattleAttack, prepareBattleStart } from '../src/data/rpgBattleRepository.js';

// Catalog-only fixtures; no Firebase connection or production data. No RNG:
// combat, targeting and the two action policies are deterministic.
const profile = (level, partyMemberIds, equipped) => normalizePlayerProfile({
  totalExp: totalExpForLevel(level), battleEnergy: 100, partyMemberIds,
  unlockedPartyMemberIds: partyMemberIds, equipped,
  ownedEquipment: Object.fromEntries(Object.values(equipped).map(id => [id, true])),
});
export const BALANCE_PLAYERS = {
  beginner: profile(1, ['hero', 'guardian'], {}),
  intermediate: profile(7, ['hero', 'guardian', 'mage'], { weapon: 'iron_sword', armor: 'mineral_armor', accessory: 'history_charm' }),
  prepared: profile(12, ['hero', 'guardian', 'healer'], { weapon: 'scholar_blade', armor: 'balanced_robe', accessory: 'logic_badge' }),
  trained: profile(20, ['hero', 'homura', 'shizuku'], { weapon: 'dragon_star_blade', armor: 'dragon_scale_armor', accessory: 'logic_badge' }),
};
export const BALANCE_SCENARIOS = [
  ...Object.values(ENEMY_CATALOG).map(enemy => ({ id: `campaign-${enemy.id}`, enemy })),
  ...Object.values(BOSS_CATALOG).map(enemy => ({ id: `campaign-${enemy.id}`, enemy, boss: true })),
  ...[1, 4, 7, 10, 20, 24, 27, 30, 54, 57, 60].map(floor => ({ id: `tower-${floor}`, floor, encounter: buildTowerEncounter({ floor }) })),
  ...[1, 2, 3, 4].map(week => { const enemy = getWeeklyBossDefinition(`2026-W0${week}`); return { id: enemy.id, encounter: { rulesVersion: enemy.rulesVersion, energyCost: enemy.energyCost, expReward: enemy.expReward, enemies: [{ ...enemy, enemyInstanceId: enemy.id }] } }; }),
];
const attackDamage = (actor, skill, enemy) => skill ? calculateSkillDamage({ playerAttack: actor.attack, powerPercent: skill.powerPercent, elementPercent: getElementMultiplier({ attackElement: skill.element, weaknesses: enemy.weaknesses, resistances: enemy.resistances }).percent }).damage : actor.attack;

function partyAction(battle, policy) {
  const actor = battle.partySnapshot.members.find(member => member.memberId === battle.activePartyMemberId);
  const living = battle.enemyStates.filter(state => state.status === 'active');
  const target = [...living].sort((a,b) => a.hp - b.hp)[0];
  const normal = { targetEnemyInstanceId: target.enemyInstanceId };
  if (policy === 'normal') return normal;
  const skills = actor.skills.filter(skill => (battle.skillUses[partySkillKey(actor.memberId, skill.id)] || 0) < skill.maxUses && (actor.memberId !== 'hero' || !battle.mpRulesVersion || battle.playerMp >= battleMpCost(battle, skill)));
  const wounded = battle.partyStates.filter(state => state.status === 'active').map(state => ({ ...state, maxHp: battle.partySnapshot.members.find(member => member.memberId === state.memberId).maxHp })).sort((a,b) => a.hp/a.maxHp - b.hp/b.maxHp);
  const heal = skills.find(skill => skill.kind === 'heal');
  if (heal && wounded[0]?.hp < wounded[0]?.maxHp * .55) return { skillId: heal.id, targetMemberId: wounded[0].memberId };
  const own = wounded.find(state => state.memberId === actor.memberId);
  const guard = skills.find(skill => skill.kind === 'guard');
  const targeted = living.some((state, index) => wounded.length && battle.partyStates.filter(state => state.status === 'active')[(battle.roundNumber + index) % wounded.length].memberId === actor.memberId);
  const incoming = living.reduce((sum, state) => { const enemy = battle.enemySnapshots.find(enemy => enemy.enemyInstanceId === state.enemyInstanceId); const raw = enemyActionForTurn(enemy.actionPattern, battle.roundNumber); return sum + calculateEnemyActionDamage({ enemyAttack: enemy.attack, powerPercent: raw.powerPercent, playerDefense: actor.defense }).damage; }, 0);
  if (guard && targeted && own.hp <= incoming && own.hp > incoming * (100 - guard.damageReductionPercent) / 100) return { skillId: guard.id };
  let best = { ...normal, score: Math.min(target.hp, actor.attack) };
  for (const skill of skills.filter(skill => skill.kind === 'attack')) {
    for (const state of living) {
      const targets = skill.targetType === 'all_enemies' ? living : [state];
      const score = targets.reduce((sum, target) => sum + Math.min(target.hp, attackDamage(actor, skill, battle.enemySnapshots.find(enemy => enemy.enemyInstanceId === target.enemyInstanceId))), 0);
      if (score > best.score) best = { skillId: skill.id, targetEnemyInstanceId: state.enemyInstanceId, score };
    }
  }
  const action = { ...best };
  delete action.score;
  return action;
}

export function simulateBattle(player, scenario, policy = 'strategy', { mpRules = false } = {}) {
  let battle = scenario.enemy
    ? prepareBattleStart({ profile: player, enemy: scenario.enemy, battleId: 'simulation', now: 1, battleKind: scenario.boss ? 'boss' : 'normal' }).battle
    : createPartyBattle({ mpRulesVersion: mpRules ? 1 : null, battleId: 'simulation', encounter: scenario.encounter, members: buildTowerPartySnapshot(player), now: 1, battleKind: scenario.encounter.boss ? 'boss' : 'normal' });
  // Keep the v2.9.1 baseline reproducible; explicitly opt in for the new MP matrix.
  if (!mpRules) { delete battle.mpRulesVersion; delete battle.playerMp; }
  const initial = structuredClone(battle);
  let actions = 0, damage = 0, enemyActions = 0, heals = 0, guards = 0;
  while (battle.status === 'active' && actions < 300) {
    actions++;
    if (scenario.enemy) {
      let action = { kind: 'normal_attack', damage: null };
      if (policy === 'strategy') {
        const actor = battle.playerSnapshot;
        const skills = Object.values(actor.skills).filter(skill => (battle.skillUses[skill.id] || 0) < skill.maxUses && (!battle.mpRulesVersion || battle.playerMp >= battleMpCost(battle, skill)));
        const heal = skills.find(skill => skill.kind === 'heal');
        const enemyAction = enemyActionForTurn(battle.enemySnapshot.actionPattern, battle.attackCount + 1);
        const incoming = calculateEnemyActionDamage({ enemyAttack: battle.enemySnapshot.attack, powerPercent: enemyAction.powerPercent, playerDefense: actor.defense }).damage;
        const guard = skills.find(skill => skill.kind === 'guard');
        if (heal && battle.playerHp < actor.maxHp * .55) {
          action = { kind: 'skill', skill: { ...heal, useNumber: (battle.skillUses[heal.id] || 0) + 1 }, healing: calculateHealAmount({ playerMaxHp: actor.maxHp, playerHp: battle.playerHp, healPercent: heal.healPercent }) };
        } else if (guard && incoming >= battle.playerHp && Math.floor(incoming / 2) < battle.playerHp && enemyAction.powerPercent > 100) {
          action = { kind: 'skill', skill: { ...guard, useNumber: (battle.skillUses[guard.id] || 0) + 1 } };
        } else {
          const best = skills.filter(skill => skill.kind === 'attack').map(skill => ({ skill, damage: attackDamage(actor, skill, battle.enemySnapshot) })).sort((a,b) => b.damage - a.damage)[0];
          if (best?.damage > actor.attack) action = { kind: 'skill', damage: best.damage, skill: { ...best.skill, useNumber: (battle.skillUses[best.skill.id] || 0) + 1 } };
        }
      }
      const result = prepareBattleAttack({ battle, profile: player, progress: {}, actionId: String(actions), now: actions + 1, action });
      if (result.result.enemyCounter) { damage += result.result.enemyCounter.damage; enemyActions++; }
      if (action.skill?.kind === 'heal') heals++;
      if (action.skill?.kind === 'guard') guards++;
      battle = result.battle;
    } else {
      const action = partyAction(battle, policy);
      const actor = battle.partySnapshot.members.find(member => member.memberId === battle.activePartyMemberId);
      const kind = actor.skills.find(skill => skill.id === action.skillId)?.kind;
      if (kind === 'heal') heals++;
      if (kind === 'guard') guards++;
      const result = preparePartyBattleAction({ battle, action: { ...action, actionId: String(actions) }, now: actions + 1 });
      damage += result.enemyEvents.reduce((sum,event) => sum + event.damage, 0);
      enemyActions += result.enemyEvents.length;
      battle = result.battle;
    }
  }
  const hp = scenario.enemy ? battle.playerHp : battle.partyStates.reduce((sum,state) => sum + state.hp, 0);
  const maxHp = scenario.enemy ? initial.playerHp : initial.partyStates.reduce((sum,state) => sum + state.hp, 0);
  const turns = scenario.enemy ? actions : battle.status === 'active' ? battle.roundNumber - 1 : battle.roundNumber;
  return { ...(mpRules ? { mpRemaining: battle.playerMp, maxMp: initial.playerSnapshot?.maxMp ?? initial.partySnapshot?.members.find(member => member.memberId === 'hero').maxMp, heroSkillUses: Object.entries(battle.skillUses).filter(([key]) => !key.includes(':') || key.startsWith('hero:')).reduce((sum, [,used]) => sum + used, 0) } : {}), status: battle.status, winRate: battle.status === 'won' ? 100 : 0, turns, oneTurnRate: battle.status === 'won' && turns === 1 ? 100 : 0, hp, hpPercent: Math.round(hp/maxHp*1000)/10, damage, enemyActions, heals, guards, unhurt: damage === 0, actions };
}

export function measureBalance() {
  return Object.entries(BALANCE_PLAYERS).flatMap(([player, profile]) => BALANCE_SCENARIOS.flatMap(scenario => ['normal', 'strategy'].map(policy => ({ player, scenario: scenario.id, policy, ...simulateBattle(profile, scenario, policy) }))));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(measureBalance(), null, 2));
