import { doc, runTransaction } from 'firebase/firestore';
import { calculateAttackResult, calculatePlayerAttack } from '../rpg/battleCalculator.js';
import { ENEMY_CATALOG_VERSION, getEnemyCatalogItem } from '../rpg/enemyCatalog.js';
import { levelForTotalExp } from '../rpg/levelSystem.js';
import { normalizePlayerProfile } from '../rpg/playerProfile.js';
import { playerProfileRef } from './rewardLedgerRepository.js';

export const RPG_BATTLE_SCHEMA_VERSION = 1;
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
  const playerSnapshot = { level: current.level, attack: calculatePlayerAttack(current), equipped: equippedSnapshot(current) };
  const enemySnapshot = { name: enemy.name, maxHp: enemy.maxHp, energyCost: enemy.energyCost, expReward: enemy.expReward, catalogVersion: ENEMY_CATALOG_VERSION };
  return {
    profile: { ...current, battleEnergy: number(current.battleEnergy) - enemy.energyCost, activeBattleId: battleId, updatedAt: now },
    battle: { schemaVersion: RPG_BATTLE_SCHEMA_VERSION, battleId, enemyId: enemy.id, enemySnapshot, enemyHp: enemy.maxHp, status: 'active', playerSnapshot, attackCount: 0, startedAt: now, updatedAt: now, victory: null },
    ledger: { schemaVersion: RPG_BATTLE_SCHEMA_VERSION, type: 'battle_start', battleId, enemyId: enemy.id, energySpent: enemy.energyCost, enemySnapshot, playerSnapshot, status: 'applied', appliedAt: now },
  };
}

export function prepareBattleAttack({ battle, profile, actionId, now }) {
  if (battle.status !== 'active') throw failure('BATTLE_ALREADY_COMPLETED');
  const result = calculateAttackResult(battle.enemyHp, battle.playerSnapshot?.attack);
  const attackCount = number(battle.attackCount) + 1;
  const attackLedger = { schemaVersion: RPG_BATTLE_SCHEMA_VERSION, type: 'attack', actionId, battleId: battle.battleId, attackNumber: attackCount, damage: result.damage, hpBefore: result.hpBefore, hpAfter: result.hpAfter, victory: result.victory, status: 'applied', appliedAt: now };
  if (!result.victory) return { battle: { ...battle, enemyHp: result.hpAfter, attackCount, updatedAt: now }, attackLedger, victoryLedger: null, profile: null, result };
  const current = normalizePlayerProfile(profile);
  const totalExpBefore = current.totalExp;
  const expGranted = number(battle.enemySnapshot?.expReward);
  const totalExpAfter = totalExpBefore + expGranted;
  const levelAfter = levelForTotalExp(totalExpAfter);
  const victory = { expGranted, totalExpBefore, totalExpAfter, levelBefore: current.level, levelAfter, actionId, grantedAt: now };
  return {
    battle: { ...battle, enemyHp: 0, status: 'won', attackCount, updatedAt: now, victory },
    profile: { ...current, totalExp: totalExpAfter, level: levelAfter, activeBattleId: null, updatedAt: now },
    attackLedger,
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
  const profile = playerProfileRef(db, familyId); const battleRef = rpgBattleRef(db, familyId, battleId); const attackLedgerRef = rpgBattleLedgerRef(db, familyId, actionId); const victoryLedgerRef = rpgBattleLedgerRef(db, familyId, `victory-${battleId}`); const now = Date.now();
  return runTransaction(db, async (transaction) => {
    const [battleSnap, attackLedgerSnap, victoryLedgerSnap, profileSnap] = await Promise.all([transaction.get(battleRef), transaction.get(attackLedgerRef), transaction.get(victoryLedgerRef), transaction.get(profile)]);
    if (attackLedgerSnap.exists()) return { applied: false, reason: 'ALREADY_APPLIED' };
    if (!battleSnap.exists()) throw failure('BATTLE_NOT_FOUND');
    const battle = battleSnap.data();
    if (battle.status !== 'active' || victoryLedgerSnap.exists()) throw failure('BATTLE_ALREADY_COMPLETED');
    const change = prepareBattleAttack({ battle, profile: profileSnap.exists() ? profileSnap.data() : {}, actionId, now });
    transaction.set(battleRef, change.battle); transaction.set(attackLedgerRef, change.attackLedger);
    if (change.victoryLedger) { transaction.set(profile, change.profile); transaction.set(victoryLedgerRef, change.victoryLedger); }
    return { applied: true, battle: change.battle, result: change.result, victory: Boolean(change.victoryLedger) };
  });
}
