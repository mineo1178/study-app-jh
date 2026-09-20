import { doc, runTransaction } from 'firebase/firestore';
import { calculateAttackResult, calculateEnemyCounterDamage, calculatePlayerAttack, calculatePlayerDefense, calculatePlayerMaxHp, calculateSkillDamage, getElementMultiplier } from '../rpg/battleCalculator.js';
import { ENEMY_CATALOG_VERSION, getEnemyCatalogItem } from '../rpg/enemyCatalog.js';
import { levelForTotalExp } from '../rpg/levelSystem.js';
import { normalizePlayerProfile } from '../rpg/playerProfile.js';
import { normalizeBattle } from '../rpg/battleState.js';
import { SKILL_CATALOG } from '../rpg/skillCatalog.js';
import { playerProfileRef } from './rewardLedgerRepository.js';

export const RPG_BATTLE_SCHEMA_VERSION = 2;
const appPath = (familyId, collectionName, id) => ['families', familyId, 'apps', 'junior-high', collectionName, id];
export const rpgBattleRef = (db, familyId, battleId) => doc(db, ...appPath(familyId, 'rpgBattles', battleId));
export const rpgBattleLedgerRef = (db, familyId, ledgerId) => doc(db, ...appPath(familyId, 'rpgBattleLedger', ledgerId));
export const createBattleId = () => `battle-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
export const createBattleActionId = () => `attack-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

const failure = (code) => Object.assign(new Error(code), { code });
const number = (value) => Number(value) || 0;
const equippedSnapshot = (profile) => ({ weapon: profile.equipped.weapon, armor: profile.equipped.armor, accessory: profile.equipped.accessory });

export function prepareBattleStart({ profile, enemy, battleId, now }) {
  const current = normalizePlayerProfile(profile);
  if (current.activeBattleId) throw failure('ACTIVE_BATTLE_EXISTS');
  if (number(current.battleEnergy) < enemy.energyCost) throw failure('INSUFFICIENT_BATTLE_ENERGY');
  const skills = Object.fromEntries(Object.entries(SKILL_CATALOG).map(([id, skill]) => [id, { id: skill.id, name: skill.name, element: skill.element, powerPercent: skill.powerPercent, maxUses: skill.maxUses }]));
  const playerSnapshot = { level: current.level, maxHp: calculatePlayerMaxHp(current), attack: calculatePlayerAttack(current), defense: calculatePlayerDefense(current), equipped: equippedSnapshot(current), skills };
  const enemySnapshot = { name: enemy.name, element: enemy.element, weaknesses: [...enemy.weaknesses], resistances: [...enemy.resistances], maxHp: enemy.maxHp, attack: enemy.attack, energyCost: enemy.energyCost, expReward: enemy.expReward, catalogVersion: ENEMY_CATALOG_VERSION };
  return {
    profile: { ...current, battleEnergy: number(current.battleEnergy) - enemy.energyCost, activeBattleId: battleId, updatedAt: now },
    battle: { schemaVersion: 3, battleId, enemyId: enemy.id, enemySnapshot, enemyHp: enemy.maxHp, status: 'active', playerSnapshot, skillUses: Object.fromEntries(Object.keys(skills).map((id) => [id, 0])), playerHp: playerSnapshot.maxHp, attackCount: 0, startedAt: now, updatedAt: now, victory: null, defeat: null },
    ledger: { schemaVersion: RPG_BATTLE_SCHEMA_VERSION, type: 'battle_start', battleId, enemyId: enemy.id, energySpent: enemy.energyCost, enemySnapshot, playerSnapshot, status: 'applied', appliedAt: now },
  };
}

export function prepareBattleAttack({ battle: rawBattle, profile, actionId, now, action = { kind: 'normal_attack', damage: null } }) {
  const battle = normalizeBattle(rawBattle);
  if (battle.status !== 'active') throw failure('BATTLE_ALREADY_COMPLETED');
  const result = calculateAttackResult(battle.enemyHp, action.damage ?? battle.playerSnapshot?.attack);
  const attackCount = number(battle.attackCount) + 1;
  const playerAttack = { attack: battle.playerSnapshot?.attack, poweredDamage: action.poweredDamage, damage: result.damage, enemyHpBefore: result.hpBefore, enemyHpAfter: result.hpAfter };
  const skillUses = action.skill ? { ...battle.skillUses, [action.skill.id]: action.skill.useNumber } : battle.skillUses;
  if (!result.victory) { const damage = calculateEnemyCounterDamage(battle.enemySnapshot.attack, battle.playerSnapshot.defense); const playerHpBefore = battle.playerHp; const playerHpAfter = Math.max(0, playerHpBefore - damage); const lost = playerHpAfter === 0; const enemyCounter = { attack: battle.enemySnapshot.attack, playerDefense: battle.playerSnapshot.defense, damage, playerHpBefore, playerHpAfter }; const defeat = lost ? { playerHpBefore, playerHpAfter: 0, enemyHpAfter: result.hpAfter, triggeringActionId: actionId, defeatedAt: now } : null; const attackLedger = { schemaVersion: 1, type: 'attack', actionKind: action.kind, actionId, battleId: battle.battleId, attackNumber: attackCount, skill: action.skill || undefined, elementResult: action.elementResult, playerAttack, enemyCounter, outcome: lost ? 'lost' : 'active', status: 'applied', appliedAt: now }; return { battle: { ...battle, enemyHp: result.hpAfter, playerHp: playerHpAfter, skillUses, status: lost ? 'lost' : 'active', defeat, attackCount, updatedAt: now }, attackLedger, victoryLedger: null, defeatLedger: lost ? { schemaVersion: 1, type: 'defeat', battleId: battle.battleId, enemyId: battle.enemyId, playerHpBefore, playerHpAfter: 0, enemyHpAfter: result.hpAfter, attackCount, triggeringActionId: actionId, expGranted: 0, status: 'applied', appliedAt: now } : null, profile: lost ? { ...normalizePlayerProfile(profile), activeBattleId: null, updatedAt: now } : null, result: { ...result, enemyCounter, actionKind: action.kind, skill: action.skill, elementResult: action.elementResult }, };
  }
  const current = normalizePlayerProfile(profile);
  const totalExpBefore = current.totalExp;
  const expGranted = number(battle.enemySnapshot?.expReward);
  const totalExpAfter = totalExpBefore + expGranted;
  const levelAfter = levelForTotalExp(totalExpAfter);
  const victory = { expGranted, totalExpBefore, totalExpAfter, levelBefore: current.level, levelAfter, actionId, grantedAt: now };
  return {
    battle: { ...battle, enemyHp: 0, skillUses, status: 'won', attackCount, updatedAt: now, victory, defeat: null },
    profile: { ...current, totalExp: totalExpAfter, level: levelAfter, activeBattleId: null, updatedAt: now },
    attackLedger: { schemaVersion: 1, type: 'attack', actionKind: action.kind, actionId, battleId: battle.battleId, attackNumber: attackCount, skill: action.skill || undefined, elementResult: action.elementResult, playerAttack, enemyCounter: null, outcome: 'won', status: 'applied', appliedAt: now },
    victoryLedger: { schemaVersion: RPG_BATTLE_SCHEMA_VERSION, type: 'victory', battleId: battle.battleId, enemyId: battle.enemyId, expGranted, totalExpBefore, totalExpAfter, levelBefore: current.level, levelAfter, triggeringActionId: actionId, status: 'applied', appliedAt: now },
    result,
  };
}

export async function startBattle({ db, familyId, enemyId, battleId }) {
  const enemy = getEnemyCatalogItem(enemyId);
  if (!enemy) throw failure('ENEMY_NOT_FOUND');
  const profile = playerProfileRef(db, familyId); const battle = rpgBattleRef(db, familyId, battleId); const ledger = rpgBattleLedgerRef(db, familyId, `start-${battleId}`); const now = Date.now();
  return runTransaction(db, async (transaction) => {
    const [profileSnap, battleSnap, ledgerSnap] = await Promise.all([transaction.get(profile), transaction.get(battle), transaction.get(ledger)]);
    if (battleSnap.exists() || ledgerSnap.exists()) return { applied: false, reason: 'BATTLE_ALREADY_EXISTS' };
    const change = prepareBattleStart({ profile: profileSnap.exists() ? profileSnap.data() : {}, enemy, battleId, now });
    transaction.set(profile, change.profile); transaction.set(battle, change.battle); transaction.set(ledger, change.ledger);
    return { applied: true, battle: change.battle };
  });
}

export async function attackBattle({ db, familyId, battleId, actionId }) {
  const profile = playerProfileRef(db, familyId); const battleRef = rpgBattleRef(db, familyId, battleId); const attackLedgerRef = rpgBattleLedgerRef(db, familyId, actionId); const victoryLedgerRef = rpgBattleLedgerRef(db, familyId, `victory-${battleId}`); const defeatLedgerRef = rpgBattleLedgerRef(db, familyId, `defeat-${battleId}`); const now = Date.now();
  return runTransaction(db, async (transaction) => {
    const [battleSnap, attackLedgerSnap, victoryLedgerSnap, defeatLedgerSnap, profileSnap] = await Promise.all([transaction.get(battleRef), transaction.get(attackLedgerRef), transaction.get(victoryLedgerRef), transaction.get(defeatLedgerRef), transaction.get(profile)]);
    if (attackLedgerSnap.exists()) return { applied: false, reason: 'ALREADY_APPLIED' };
    if (!battleSnap.exists()) throw failure('BATTLE_NOT_FOUND');
    const battle = normalizeBattle(battleSnap.data());
    if (battle.status !== 'active' || victoryLedgerSnap.exists() || defeatLedgerSnap.exists()) throw failure('BATTLE_ALREADY_COMPLETED');
    const change = prepareBattleAttack({ battle, profile: profileSnap.exists() ? profileSnap.data() : {}, actionId, now });
    transaction.set(battleRef, change.battle); transaction.set(attackLedgerRef, change.attackLedger);
    if (change.victoryLedger) { transaction.set(profile, change.profile); transaction.set(victoryLedgerRef, change.victoryLedger); }
    if (change.defeatLedger) { transaction.set(profile, change.profile); transaction.set(defeatLedgerRef, change.defeatLedger); }
    return { applied: true, battle: change.battle, result: change.result, victory: Boolean(change.victoryLedger), defeat: Boolean(change.defeatLedger) };
  });
}

export async function useBattleSkill({ db, familyId, battleId, skillId, actionId }) {
  const profile = playerProfileRef(db, familyId); const battleRef = rpgBattleRef(db, familyId, battleId); const actionLedgerRef = rpgBattleLedgerRef(db, familyId, actionId); const victoryLedgerRef = rpgBattleLedgerRef(db, familyId, `victory-${battleId}`); const defeatLedgerRef = rpgBattleLedgerRef(db, familyId, `defeat-${battleId}`); const now = Date.now();
  return runTransaction(db, async (transaction) => {
    const [battleSnap, actionSnap, victorySnap, defeatSnap, profileSnap] = await Promise.all([transaction.get(battleRef), transaction.get(actionLedgerRef), transaction.get(victoryLedgerRef), transaction.get(defeatLedgerRef), transaction.get(profile)]);
    if (actionSnap.exists()) return { applied: false, reason: 'ALREADY_APPLIED' };
    if (!battleSnap.exists()) throw failure('BATTLE_NOT_FOUND');
    const battle = normalizeBattle(battleSnap.data());
    if (battle.status !== 'active' || victorySnap.exists() || defeatSnap.exists()) throw failure('BATTLE_ALREADY_COMPLETED');
    const skill = battle.playerSnapshot.skills?.[skillId];
    if (!skill) throw failure('SKILL_NOT_AVAILABLE');
    const used = Number(battle.skillUses?.[skillId] || 0);
    if (used >= Number(skill.maxUses || 0)) throw failure('SKILL_NO_USES');
    const elementResult = getElementMultiplier({ attackElement: skill.element, weaknesses: battle.enemySnapshot.weaknesses, resistances: battle.enemySnapshot.resistances });
    const damageResult = calculateSkillDamage({ playerAttack: battle.playerSnapshot.attack, powerPercent: skill.powerPercent, elementPercent: elementResult.percent });
    const action = { kind: 'skill', damage: damageResult.damage, poweredDamage: damageResult.poweredDamage, elementResult, skill: { id: skill.id, name: skill.name, element: skill.element, powerPercent: skill.powerPercent, useNumber: used + 1, maxUses: skill.maxUses } };
    const change = prepareBattleAttack({ battle, profile: profileSnap.exists() ? profileSnap.data() : {}, actionId, now, action });
    transaction.set(battleRef, change.battle); transaction.set(actionLedgerRef, change.attackLedger);
    if (change.victoryLedger) { transaction.set(profile, change.profile); transaction.set(victoryLedgerRef, change.victoryLedger); }
    if (change.defeatLedger) { transaction.set(profile, change.profile); transaction.set(defeatLedgerRef, change.defeatLedger); }
    return { applied: true, actionKind: 'skill', skill: action.skill, elementResult, poweredDamage: damageResult.poweredDamage, damage: damageResult.damage, enemyHpBefore: change.result.hpBefore, enemyHpAfter: change.result.hpAfter, enemyCounter: change.result.enemyCounter || null, outcome: change.battle.status, victory: Boolean(change.victoryLedger), defeat: Boolean(change.defeatLedger) };
  });
}
