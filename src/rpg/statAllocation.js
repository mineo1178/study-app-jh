import { hasUnlimitedSkills } from './skillRules.js';
import { levelForTotalExp } from './levelSystem.js';

export const MAX_STAT_POINTS = 30;
export const BASE_PLAYER_MAX_HP = 40;
export const BASE_PLAYER_MAX_MP = 8;
export const STAT_REALLOCATION_GOLD = 120;
export const MP_RULES_VERSION = 1;
export const SKILL_MP_COSTS = Object.freeze({ flame_slash: 2, aqua_edge: 2, thunder_strike: 2, healing_light: 3, guard_stance: 2 });
const fail = code => { throw Object.assign(new Error(code), { code }); };
export const earnedStatPoints = totalExp => Math.min(MAX_STAT_POINTS, Math.max(0, levelForTotalExp(totalExp) - 1));
export function validateStatAllocation(allocation, totalExp) {
  if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation) || Object.keys(allocation).length !== 2 || Object.keys(allocation).some(key => !['hp', 'mp'].includes(key))) fail('INVALID_STAT_ALLOCATION');
  if (['hp', 'mp'].some(key => !Number.isInteger(allocation[key]) || allocation[key] < 0 || allocation[key] > MAX_STAT_POINTS)) fail('INVALID_STAT_ALLOCATION');
  if (allocation.hp + allocation.mp > earnedStatPoints(totalExp)) fail('STAT_POINTS_EXCEEDED');
  return { hp: allocation.hp, mp: allocation.mp };
}
export const readStatAllocation = profile => validateStatAllocation(profile?.statAllocation === undefined ? { hp: 0, mp: 0 } : profile.statAllocation, profile?.totalExp || 0);
export const statAllocationValues = allocation => ({ hpBonus: allocation.hp * 3, maxHp: BASE_PLAYER_MAX_HP + allocation.hp * 3, maxMp: BASE_PLAYER_MAX_MP + allocation.mp * 2 });
export function statAllocationStats(profile) {
  const allocation = readStatAllocation(profile);
  const earned = earnedStatPoints(profile?.totalExp || 0);
  return { allocation, earned, used: allocation.hp + allocation.mp, remaining: earned - allocation.hp - allocation.mp, ...statAllocationValues(allocation) };
}
export const statAllocationCost = (before, after) => after.hp < before.hp || after.mp < before.mp ? STAT_REALLOCATION_GOLD : 0;
export const hasMpRules = battle => battle?.mpRulesVersion === MP_RULES_VERSION;
export const battleActorMp = (battle, actorId = 'hero') => actorId === 'hero' ? battle.playerMp : battle.memberMp?.[actorId];
export const actorUsesMp = (battle, actorId = 'hero') => hasMpRules(battle) && (actorId === 'hero' || hasUnlimitedSkills(battle));
export function battleMpCost(battle, skill, actorId = 'hero') {
  if (!actorUsesMp(battle, actorId) || !skill) return 0;
  if (!Number.isInteger(skill.mpCost) || skill.mpCost < 0) fail('INVALID_MP_SNAPSHOT');
  return skill.mpCost;
}
export function consumeBattleMp(battle, skill, actorId = 'hero') {
  if (!actorUsesMp(battle, actorId) || !skill) return {};
  const cost = battleMpCost(battle, skill, actorId);
  const current = battleActorMp(battle, actorId);
  if (!Number.isInteger(current) || current < cost) fail('INSUFFICIENT_MP');
  return actorId === 'hero' ? { playerMp: current - cost } : { memberMp: { ...battle.memberMp, [actorId]: current - cost } };
}
