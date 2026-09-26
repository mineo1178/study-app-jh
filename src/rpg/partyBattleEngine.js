import { calculateEnemyActionDamage, calculateHealAmount, calculateSkillDamage, getElementMultiplier } from './battleCalculator.js';
import { enemyActionForTurn } from './enemyActionCatalog.js';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const n = (value) => Math.max(0, Number(value) || 0);
const alive = (state) => state.status === 'active';
const status = (hp) => hp > 0 ? 'active' : 'defeated';
export const partySkillKey = (memberId, skillId) => `${memberId}:${skillId}`;

export function createPartyBattle({ battleId, floor = null, encounter, members, now, battleKind, battleMode = 'tower', schemaVersion = 8, weeklyBossSnapshot = null }) {
  const enemySnapshots = encounter.enemies.map((enemy) => ({ ...enemy }));
  return {
    schemaVersion, battleId, battleKind, battleMode, ...(floor ? { towerFloor: floor, towerRulesVersion: encounter.rulesVersion } : {}), ...(weeklyBossSnapshot ? { weeklyBossSnapshot } : {}),
    encounterSnapshot: { floor, rulesVersion: encounter.rulesVersion, energyCost: encounter.energyCost, expReward: encounter.expReward, enemies: enemySnapshots },
    partySnapshot: { members }, partyStates: members.map((member) => ({ memberId: member.memberId, hp: member.maxHp, status: 'active', guardPercent: 0 })),
    enemySnapshots, enemyStates: enemySnapshots.map((enemy) => ({ enemyInstanceId: enemy.enemyInstanceId, hp: enemy.maxHp, status: 'active' })),
    roundNumber: 1, activePartyMemberId: members[0].memberId, actedMemberIds: [], skillUses: {}, status: 'active', startedAt: now, updatedAt: now, victory: null, defeat: null,
  };
}
const memberFor = (battle, id) => battle.partySnapshot.members.find((member) => member.memberId === id);
const enemyFor = (battle, id) => battle.enemySnapshots.find((enemy) => enemy.enemyInstanceId === id);
function nextActor(battle, states, acted) { return states.find((state) => alive(state) && !acted.includes(state.memberId))?.memberId || null; }
function resolveEnemyPhase(battle, partyStates, round) {
  let states = partyStates.map((state) => ({ ...state })); const events = [];
  battle.enemyStates.filter(alive).forEach((enemyState, enemyIndex) => {
    const living = states.filter(alive); if (!living.length) return;
    const target = living[(round + enemyIndex) % living.length]; const member = memberFor(battle, target.memberId); const enemy = enemyFor(battle, enemyState.enemyInstanceId);
    const action = enemyActionForTurn(enemy.actionPattern, round); const base = calculateEnemyActionDamage({ enemyAttack: enemy.attack, powerPercent: action.powerPercent, playerDefense: member.defense }).damage;
    const damage = target.guardPercent > 0 ? Math.max(1, Math.floor(base * (100 - target.guardPercent) / 100)) : base;
    const hp = Math.max(0, target.hp - damage); states = states.map((state) => state.memberId === target.memberId ? { ...state, hp, status: status(hp), guardPercent: 0 } : { ...state, guardPercent: 0 });
    events.push({ enemyInstanceId: enemyState.enemyInstanceId, targetMemberId: target.memberId, actionId: action.id, damage });
  });
  return { partyStates: states, events };
}
export function preparePartyBattleAction({ battle, action, now }) {
  if (battle.status !== 'active') fail('BATTLE_ALREADY_COMPLETED');
  const actorId = battle.activePartyMemberId; const actorState = battle.partyStates.find((state) => state.memberId === actorId);
  if (!actorState || !alive(actorState)) fail('INVALID_BATTLE_ACTOR');
  const actor = memberFor(battle, actorId); let partyStates = battle.partyStates.map((state) => ({ ...state })); let enemyStates = battle.enemyStates.map((state) => ({ ...state }));
  const skill = action.skillId ? actor.skills.find((item) => item.id === action.skillId) : null;
  if (action.skillId && !skill) fail('SKILL_NOT_AVAILABLE');
  const targetType = skill?.targetType || 'single_enemy'; const usesKey = skill ? partySkillKey(actorId, skill.id) : null;
  if (skill && n(battle.skillUses?.[usesKey]) >= n(skill.maxUses)) fail('SKILL_NO_USES');
  if (!['single_enemy', 'all_enemies', 'self', 'single_ally', 'all_allies'].includes(targetType)) fail('INVALID_BATTLE_TARGET');
  const targetEnemy = action.targetEnemyInstanceId ? enemyStates.find((state) => state.enemyInstanceId === action.targetEnemyInstanceId) : null;
  const targetAlly = action.targetMemberId ? partyStates.find((state) => state.memberId === action.targetMemberId) : null;
  const event = { actorId, actionKind: skill ? 'skill' : 'normal_attack', ...(skill ? { skillId: skill.id } : {}) };
  if (targetType === 'single_enemy') {
    const only = enemyStates.filter(alive); const target = targetEnemy || (only.length === 1 ? only[0] : null);
    if (!target || !alive(target)) fail('INVALID_BATTLE_TARGET'); const enemy = enemyFor(battle, target.enemyInstanceId); const multiplier = skill ? getElementMultiplier({ attackElement: skill.element, weaknesses: enemy.weaknesses, resistances: enemy.resistances }) : { type: 'normal', percent: 100 };
    const damage = skill ? calculateSkillDamage({ playerAttack: actor.attack, powerPercent: skill.powerPercent, elementPercent: multiplier.percent }).damage : actor.attack; const hp = Math.max(0, target.hp - damage);
    enemyStates = enemyStates.map((state) => state.enemyInstanceId === target.enemyInstanceId ? { ...state, hp, status: status(hp) } : state); event.targetEnemyInstanceId = target.enemyInstanceId; event.damage = damage;
  } else if (targetType === 'all_enemies') {
    enemyStates.filter(alive).forEach((target) => { const enemy = enemyFor(battle, target.enemyInstanceId); const multiplier = getElementMultiplier({ attackElement: skill.element, weaknesses: enemy.weaknesses, resistances: enemy.resistances }); const damage = calculateSkillDamage({ playerAttack: actor.attack, powerPercent: skill.powerPercent, elementPercent: multiplier.percent }).damage; const hp = Math.max(0, target.hp - damage); enemyStates = enemyStates.map((state) => state.enemyInstanceId === target.enemyInstanceId ? { ...state, hp, status: status(hp) } : state); }); event.targetType = 'all_enemies';
  } else if (targetType === 'self') { partyStates = partyStates.map((state) => state.memberId === actorId ? { ...state, guardPercent: n(skill.damageReductionPercent) } : state); event.targetMemberId = actorId;
  } else {
    const targets = targetType === 'all_allies' ? partyStates.filter(alive) : [targetAlly]; if (!targets.length || targets.some((target) => !target || !alive(target))) fail('INVALID_BATTLE_TARGET');
    if (targets.every((target) => target.hp >= memberFor(battle, target.memberId).maxHp)) fail('HEAL_NOT_NEEDED');
    targets.forEach((target) => { const member = memberFor(battle, target.memberId); const healed = calculateHealAmount({ playerMaxHp: member.maxHp, playerHp: target.hp, healPercent: skill.healPercent }); partyStates = partyStates.map((state) => state.memberId === target.memberId ? { ...state, hp: healed.playerHpAfterHeal } : state); }); event.targetType = targetType;
  }
  const skillUses = skill ? { ...battle.skillUses, [usesKey]: n(battle.skillUses?.[usesKey]) + 1 } : battle.skillUses;
  if (enemyStates.every((state) => !alive(state))) return { battle: { ...battle, partyStates, enemyStates, skillUses, status: 'won', activePartyMemberId: null, updatedAt: now, victory: { actionId: action.actionId, grantedAt: now } }, event, enemyEvents: [] };
  const acted = [...battle.actedMemberIds, actorId]; let next = nextActor(battle, partyStates, acted); let round = battle.roundNumber; let enemyEvents = [];
  if (!next) { const phase = resolveEnemyPhase(battle, partyStates, round); partyStates = phase.partyStates; enemyEvents = phase.events; if (partyStates.every((state) => !alive(state))) return { battle: { ...battle, partyStates, enemyStates, skillUses, actedMemberIds: acted, activePartyMemberId: null, status: 'lost', updatedAt: now, defeat: { actionId: action.actionId, defeatedAt: now } }, event, enemyEvents }; round += 1; next = nextActor(battle, partyStates, []); return { battle: { ...battle, partyStates, enemyStates, skillUses, roundNumber: round, actedMemberIds: [], activePartyMemberId: next, updatedAt: now }, event, enemyEvents }; }
  return { battle: { ...battle, partyStates, enemyStates, skillUses, actedMemberIds: acted, activePartyMemberId: next, updatedAt: now }, event, enemyEvents };
}
