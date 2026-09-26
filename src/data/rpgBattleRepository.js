import { doc, runTransaction } from 'firebase/firestore';
import { calculateAttackResult, calculateEnemyActionDamage, calculateGuardedDamage, calculateHealAmount, calculatePlayerAttack, calculatePlayerDefense, calculatePlayerMaxHp, calculateSkillDamage, getElementMultiplier } from '../rpg/battleCalculator.js';
import { ENEMY_CATALOG_VERSION, getEnemyCatalogItem } from '../rpg/enemyCatalog.js';
import { levelForTotalExp } from '../rpg/levelSystem.js';
import { normalizePlayerProfile } from '../rpg/playerProfile.js';
import { normalizeBattle } from '../rpg/battleState.js';
import { SKILL_CATALOG } from '../rpg/skillCatalog.js';
import { playerProfileRef } from './rewardLedgerRepository.js';
import { getChapter, CHAPTER_CATALOG_VERSION } from '../rpg/chapterCatalog.js';
import { getBoss, BOSS_CATALOG_VERSION } from '../rpg/bossCatalog.js';
import { applyBossClearProgress, applyBossClearProgressFromSnapshot, applyNormalVictoryProgress, applyNormalVictoryProgressFromSnapshot, isBossUnlocked, normalizeRpgProgress } from '../rpg/rpgProgress.js';
import { rpgProgressRef } from './rpgProgressRepository.js';
import { enemyActionForTurn, snapshotEnemyActionPattern } from '../rpg/enemyActionCatalog.js';
import { assertNoPendingRewardCorrections, rewardIntegrityRef } from './rewardCorrectionRepository.js';
import { TOWER_RULES_VERSION } from '../rpg/towerCatalog.js';
import { applyTowerVictory, normalizeTowerProgress } from '../rpg/towerProgress.js';
import { rpgTowerProgressRef } from './rpgTowerProgressRepository.js';
import { buildTowerEncounter } from '../rpg/towerCatalog.js';
import { buildTowerPartySnapshot } from '../rpg/partyMemberCatalog.js';
import { createPartyBattle, preparePartyBattleAction } from '../rpg/partyBattleEngine.js';
import { getWeeklyBossDefinition } from '../rpg/weeklyBossCatalog.js';

export const RPG_BATTLE_SCHEMA_VERSION = 2;
const appPath = (familyId, collectionName, id) => ['families', familyId, 'apps', 'junior-high', collectionName, id];
export const rpgBattleRef = (db, familyId, battleId) => doc(db, ...appPath(familyId, 'rpgBattles', battleId));
export const rpgBattleLedgerRef = (db, familyId, ledgerId) => doc(db, ...appPath(familyId, 'rpgBattleLedger', ledgerId));
export const createBattleId = () => `battle-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
export const createBattleActionId = () => `attack-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

const failure = (code) => Object.assign(new Error(code), { code });
const number = (value) => Number(value) || 0;
const equippedSnapshot = (profile) => ({ weapon: profile.equipped.weapon, armor: profile.equipped.armor, accessory: profile.equipped.accessory });
// Firestore persistence rule: optional fields are omitted unless they have a
// value; `undefined` must never cross a repository persistence boundary.
export const buildBattleSkillSnapshot = (skill) => {
  const base = { id: skill.id, name: skill.name, kind: skill.kind || 'attack', element: skill.element || 'neutral', maxUses: number(skill.maxUses) };
  if (base.kind === 'attack') return { ...base, powerPercent: number(skill.powerPercent) };
  if (base.kind === 'heal') return { ...base, healPercent: number(skill.healPercent) };
  if (base.kind === 'guard') return { ...base, damageReductionPercent: number(skill.damageReductionPercent) };
  return base;
};
const optional = (key, value) => value === undefined ? {} : { [key]: value };

export function preparePartyTowerStart({ profile, encounter, battleId, now }) {
  const current = normalizePlayerProfile(profile);
  if (current.activeBattleId) throw failure('ACTIVE_BATTLE_EXISTS');
  if (number(current.battleEnergy) < encounter.energyCost) throw failure('INSUFFICIENT_BATTLE_ENERGY');
  const battle = createPartyBattle({ battleId, floor: encounter.floor, encounter, members: buildTowerPartySnapshot(current), now, battleKind: encounter.boss ? 'boss' : 'normal' });
  return { profile: { ...current, battleEnergy: number(current.battleEnergy) - encounter.energyCost, activeBattleId: battleId, updatedAt: now }, battle, ledger: { schemaVersion: RPG_BATTLE_SCHEMA_VERSION, type: 'battle_start', battleId, battleKind: battle.battleKind, battleMode: 'tower', floor: encounter.floor, energySpent: encounter.energyCost, encounterSnapshot: battle.encounterSnapshot, partySnapshot: battle.partySnapshot, status: 'applied', appliedAt: now } };
}
export function prepareWeeklyBossStart({ profile, boss, battleId, now }) { const current = normalizePlayerProfile(profile); if (current.activeBattleId) throw failure('ACTIVE_BATTLE_EXISTS'); if (number(current.battleEnergy) < boss.energyCost) throw failure('INSUFFICIENT_BATTLE_ENERGY'); const enemy = { ...boss, enemyId: boss.id, enemyInstanceId: `weekly-${boss.weekId}-${boss.id}` }; const snapshot = { weekId: boss.weekId, bossId: boss.id, name: boss.name, rulesVersion: boss.rulesVersion, reward: boss.reward }; const battle = createPartyBattle({ battleId, encounter: { rulesVersion: boss.rulesVersion, energyCost: boss.energyCost, expReward: boss.expReward, enemies: [enemy] }, members: buildTowerPartySnapshot(current), now, battleKind: 'boss', battleMode: 'weekly_boss', schemaVersion: 9, weeklyBossSnapshot: snapshot }); return { profile: { ...current, battleEnergy: number(current.battleEnergy) - boss.energyCost, activeBattleId: battleId, updatedAt: now }, battle, ledger: { schemaVersion: 1, type: 'battle_start', battleId, battleMode: 'weekly_boss', weekId: boss.weekId, energySpent: boss.energyCost, weeklyBossSnapshot: snapshot, status: 'applied', appliedAt: now } }; }
export function prepareWeeklyBossResult({ battle, profile, action, actionId, now }) { const change = preparePartyBattleAction({ battle, action: { ...action, actionId }, now }); const current = normalizePlayerProfile(profile); const base = { battle: change.battle, attackLedger: { schemaVersion: 1, type: 'attack', actionId, battleId: battle.battleId, status: 'applied', appliedAt: now } }; if (change.battle.status === 'lost') return { ...base, profile: { ...current, activeBattleId: null, updatedAt: now }, defeatLedger: { type: 'defeat', battleId: battle.battleId, expGranted: 0 } }; if (change.battle.status !== 'won') return base; const reward = battle.weeklyBossSnapshot.reward; const gacha = { ...current.gacha, ticketBalances: { ...current.gacha.ticketBalances, gold: number(current.gacha.ticketBalances.gold) + 1 }, starFragments: number(current.gacha.starFragments) + reward.starFragments, alchemyItems: { ...current.gacha.alchemyItems, [reward.alchemyItemId]: number(current.gacha.alchemyItems[reward.alchemyItemId]) + 1 } }; const totalExp = current.totalExp + reward.expReward; const weekIds = [...current.weeklyBoss.clearedWeekIds, battle.weeklyBossSnapshot.weekId].slice(-12); return { ...base, battle: { ...change.battle, victory: { ...change.battle.victory, weeklyBoss: reward } }, profile: { ...current, totalExp, level: levelForTotalExp(totalExp), activeBattleId: null, gacha, weeklyBoss: { ...current.weeklyBoss, clearedWeekIds: [...new Set(weekIds)], totalClears: number(current.weeklyBoss.totalClears) + 1, lastClearedAt: now, lastBossId: battle.weeklyBossSnapshot.bossId }, updatedAt: now }, victoryLedger: { type: 'weekly_boss_clear', battleId: battle.battleId, weekId: battle.weeklyBossSnapshot.weekId, reward } }; }

export function preparePartyBattleResult({ battle: rawBattle, profile, towerProgress, action, actionId, now }) {
  const change = preparePartyBattleAction({ battle: rawBattle, action: { ...action, actionId }, now });
  const current = normalizePlayerProfile(profile); const base = { battle: change.battle, attackLedger: { schemaVersion: 1, type: 'attack', actionId, battleId: change.battle.battleId, action: change.event, enemyEvents: change.enemyEvents, outcome: change.battle.status, status: 'applied', appliedAt: now }, result: change };
  if (change.battle.status === 'lost') return { ...base, profile: { ...current, activeBattleId: null, updatedAt: now }, defeatLedger: { schemaVersion: 1, type: 'defeat', battleId: change.battle.battleId, expGranted: 0, status: 'applied', appliedAt: now } };
  if (change.battle.status !== 'won') return base;
  const expGranted = number(change.battle.encounterSnapshot.expReward); const totalExpAfter = current.totalExp + expGranted; const levelAfter = levelForTotalExp(totalExpAfter);
  const profileAfter = { ...current, totalExp: totalExpAfter, level: levelAfter, activeBattleId: null, updatedAt: now };
  const wonBattle = { ...change.battle, victory: { ...change.battle.victory, expGranted, totalExpBefore: current.totalExp, totalExpAfter, levelBefore: current.level, levelAfter } };
  return { ...base, battle: wonBattle, profile: profileAfter, towerProgress: applyTowerVictory(towerProgress, { floor: Number(wonBattle.towerFloor), boss: wonBattle.battleKind === 'boss', now }), victoryLedger: { schemaVersion: RPG_BATTLE_SCHEMA_VERSION, type: 'victory', battleId: wonBattle.battleId, expGranted, totalExpBefore: current.totalExp, totalExpAfter, levelBefore: current.level, levelAfter, triggeringActionId: actionId, status: 'applied', appliedAt: now } };
}

export function prepareBattleStart({ profile, enemy, battleId, now, battleKind = 'normal', chapter = null, bossId = null, battleMode = 'campaign', towerFloor = null }) {
  const current = normalizePlayerProfile(profile);
  if (current.activeBattleId) throw failure('ACTIVE_BATTLE_EXISTS');
  if (number(current.battleEnergy) < enemy.energyCost) throw failure('INSUFFICIENT_BATTLE_ENERGY');
  const skills = Object.fromEntries(Object.entries(SKILL_CATALOG).map(([id, skill]) => [id, buildBattleSkillSnapshot(skill)]));
  const playerSnapshot = { level: current.level, maxHp: calculatePlayerMaxHp(current), attack: calculatePlayerAttack(current), defense: calculatePlayerDefense(current), equipped: equippedSnapshot(current), skills };
  const enemySnapshot = { name: enemy.name, element: enemy.element, weaknesses: [...enemy.weaknesses], resistances: [...enemy.resistances], maxHp: enemy.maxHp, attack: enemy.attack, energyCost: enemy.energyCost, expReward: enemy.expReward, actionPattern: snapshotEnemyActionPattern(enemy.actionPattern), ...(battleKind === 'boss' ? { firstClearReward: { gold: number(enemy.firstClearReward?.gold), materials: { ...(enemy.firstClearReward?.materials || {}) } } } : {}), catalogVersion: battleKind === 'boss' ? BOSS_CATALOG_VERSION : ENEMY_CATALOG_VERSION };
  const chapterSnapshot = chapter ? { id: chapter.id, number: chapter.number, name: chapter.name, normalWinsRequired: chapter.normalWinsRequired, bossId: chapter.bossId, nextChapterId: chapter.nextChapterId ?? null, catalogVersion: CHAPTER_CATALOG_VERSION } : null;
  return {
    profile: { ...current, battleEnergy: number(current.battleEnergy) - enemy.energyCost, activeBattleId: battleId, updatedAt: now },
    battle: { schemaVersion: 7, battleId, battleKind, battleMode, ...(bossId ? { bossId } : {}), ...(towerFloor ? { towerFloor, towerRulesVersion: TOWER_RULES_VERSION } : {}), chapterSnapshot, enemyId: enemy.id, enemySnapshot, enemyHp: enemy.maxHp, status: 'active', playerSnapshot, skillUses: Object.fromEntries(Object.keys(skills).map((id) => [id, 0])), playerHp: playerSnapshot.maxHp, attackCount: 0, startedAt: now, updatedAt: now, victory: null, defeat: null },
    ledger: { schemaVersion: RPG_BATTLE_SCHEMA_VERSION, type: 'battle_start', battleId, battleKind, battleMode, ...(bossId ? { bossId } : {}), ...(towerFloor ? { floor: towerFloor, towerRulesVersion: TOWER_RULES_VERSION } : {}), chapterSnapshot, enemyId: enemy.id, energySpent: enemy.energyCost, enemySnapshot, playerSnapshot, status: 'applied', appliedAt: now },
  };
}

export function prepareBattleAttack({ battle: rawBattle, profile, progress, towerProgress = {}, actionId, now, action = { kind: 'normal_attack', damage: null } }) {
  const battle = normalizeBattle(rawBattle);
  if (battle.status !== 'active') throw failure('BATTLE_ALREADY_COMPLETED');
  const skillKind = action.skill?.kind || 'attack';
  const isAttack = !action.skill || skillKind === 'attack';
  const result = isAttack ? calculateAttackResult(battle.enemyHp, action.damage ?? battle.playerSnapshot?.attack) : { damage: 0, hpBefore: battle.enemyHp, hpAfter: battle.enemyHp, victory: false };
  const attackCount = number(battle.attackCount) + 1;
  const playerAttack = isAttack ? { attack: battle.playerSnapshot?.attack, ...optional('poweredDamage', action.poweredDamage), damage: result.damage, enemyHpBefore: result.hpBefore, enemyHpAfter: result.hpAfter } : null;
  const skillUses = action.skill ? { ...battle.skillUses, [action.skill.id]: action.skill.useNumber } : battle.skillUses;
  if (!result.victory) { const enemyAction = enemyActionForTurn(battle.enemySnapshot.actionPattern, attackCount); const actionDamage = calculateEnemyActionDamage({ enemyAttack: battle.enemySnapshot.attack, powerPercent: enemyAction.powerPercent, playerDefense: battle.playerSnapshot.defense }); const baseDamage = actionDamage.damage; const damage = skillKind === 'guard' ? calculateGuardedDamage({ baseDamage, damageReductionPercent: action.skill.damageReductionPercent }) : baseDamage; const playerHpBefore = action.healing?.playerHpAfterHeal ?? battle.playerHp; const playerHpAfter = Math.max(0, playerHpBefore - damage); const lost = playerHpAfter === 0; const enemyCounter = { actionId: enemyAction.id, actionName: enemyAction.name, powerPercent: enemyAction.powerPercent, attack: actionDamage.attack, poweredAttack: actionDamage.poweredAttack, playerDefense: battle.playerSnapshot.defense, damage, playerHpBefore, playerHpAfter }; const defeat = lost ? { playerHpBefore, playerHpAfter: 0, enemyHpAfter: result.hpAfter, triggeringActionId: actionId, defeatedAt: now } : null; const guard = skillKind === 'guard' ? { baseDamage, reductionPercent: action.skill.damageReductionPercent, finalDamage: damage } : undefined; const attackLedger = { schemaVersion: 1, type: 'attack', actionKind: action.kind, actionId, battleId: battle.battleId, attackNumber: attackCount, ...optional('skill', action.skill), ...optional('elementResult', action.elementResult), ...optional('playerAttack', playerAttack), ...optional('healing', action.healing), ...optional('guard', guard), enemyCounter, outcome: lost ? 'lost' : 'active', status: 'applied', appliedAt: now }; return { battle: { ...battle, enemyHp: result.hpAfter, playerHp: playerHpAfter, skillUses, status: lost ? 'lost' : 'active', defeat, attackCount, updatedAt: now }, attackLedger, victoryLedger: null, defeatLedger: lost ? { schemaVersion: 1, type: 'defeat', battleId: battle.battleId, enemyId: battle.enemyId, playerHpBefore, playerHpAfter: 0, enemyHpAfter: result.hpAfter, attackCount, triggeringActionId: actionId, expGranted: 0, status: 'applied', appliedAt: now } : null, profile: lost ? { ...normalizePlayerProfile(profile), activeBattleId: null, updatedAt: now } : null, result: { ...result, ...optional('healing', action.healing), ...optional('guard', guard), enemyCounter, actionKind: action.kind, ...optional('skill', action.skill), ...optional('elementResult', action.elementResult) }, };
  }
  const current = normalizePlayerProfile(profile);
  const totalExpBefore = current.totalExp;
  const expGranted = number(battle.enemySnapshot?.expReward);
  const totalExpAfter = totalExpBefore + expGranted;
  const levelAfter = levelForTotalExp(totalExpAfter);
  const victory = { expGranted, totalExpBefore, totalExpAfter, levelBefore: current.level, levelAfter, actionId, grantedAt: now };
  let nextProfile = { ...current, totalExp: totalExpAfter, level: levelAfter, activeBattleId: null, updatedAt: now }; let nextProgress = null; let nextTowerProgress = null; let bossClearLedger = null; let bossClear = null;
  if (battle.battleMode === 'tower') nextTowerProgress = applyTowerVictory(towerProgress, { floor: Number(battle.towerFloor), boss: battle.battleKind === 'boss', now });
  if (Number(battle.schemaVersion) >= 5 && battle.chapterSnapshot?.id) {
    const usesSnapshotProgress = Number(battle.schemaVersion) >= 7;
    if (battle.battleKind === 'normal') nextProgress = usesSnapshotProgress
      ? applyNormalVictoryProgressFromSnapshot(progress, battle.chapterSnapshot, now)
      : applyNormalVictoryProgress(progress, battle.chapterSnapshot.id, now);
    if (battle.battleKind === 'boss') { const reward = battle.enemySnapshot.firstClearReward || {}; nextProgress = usesSnapshotProgress
      ? applyBossClearProgressFromSnapshot(progress, battle.chapterSnapshot, now)
      : applyBossClearProgress(progress, battle.chapterSnapshot.id, now); const materials = { ...nextProfile.materials }; Object.entries(reward.materials || {}).forEach(([key, quantity]) => { materials[key] = number(materials[key]) + number(quantity); }); nextProfile = { ...nextProfile, gold: number(nextProfile.gold) + number(reward.gold), materials }; bossClear = { chapterId: battle.chapterSnapshot.id, chapterBefore: battle.chapterSnapshot.id, chapterAfter: nextProgress.currentChapterId === battle.chapterSnapshot.id ? null : nextProgress.currentChapterId, firstClear: true, reward: { gold: number(reward.gold), materials: { ...(reward.materials || {}) } } }; bossClearLedger = { schemaVersion: 1, type: 'boss_clear', chapterId: bossClear.chapterId, bossId: battle.bossId, battleId: battle.battleId, expGranted, firstClearReward: bossClear.reward, chapterBefore: bossClear.chapterBefore, chapterAfter: bossClear.chapterAfter, status: 'applied', appliedAt: now }; }
  }
  return {
    battle: { ...battle, enemyHp: 0, skillUses, status: 'won', attackCount, updatedAt: now, victory: bossClear ? { ...victory, bossClear } : victory, defeat: null },
    profile: nextProfile, progress: nextProgress, towerProgress: nextTowerProgress, bossClearLedger,
    attackLedger: { schemaVersion: 1, type: 'attack', actionKind: action.kind, actionId, battleId: battle.battleId, attackNumber: attackCount, ...optional('skill', action.skill), ...optional('elementResult', action.elementResult), ...optional('playerAttack', playerAttack), enemyCounter: null, outcome: 'won', status: 'applied', appliedAt: now },
    victoryLedger: { schemaVersion: RPG_BATTLE_SCHEMA_VERSION, type: 'victory', battleId: battle.battleId, enemyId: battle.enemyId, expGranted, totalExpBefore, totalExpAfter, levelBefore: current.level, levelAfter, triggeringActionId: actionId, status: 'applied', appliedAt: now },
    result,
  };
}

export async function startBattle({ db, familyId, enemyId, battleId }) {
  const enemy = getEnemyCatalogItem(enemyId);
  if (!enemy) throw failure('ENEMY_NOT_FOUND');
  const profile = playerProfileRef(db, familyId); const progress = rpgProgressRef(db, familyId); const battle = rpgBattleRef(db, familyId, battleId); const ledger = rpgBattleLedgerRef(db, familyId, `start-${battleId}`); const integrity = rewardIntegrityRef(db, familyId); const now = Date.now();
  return runTransaction(db, async (transaction) => {
    const [profileSnap, progressSnap, battleSnap, ledgerSnap, integritySnap] = await Promise.all([transaction.get(profile), transaction.get(progress), transaction.get(battle), transaction.get(ledger), transaction.get(integrity)]);
    if (battleSnap.exists() || ledgerSnap.exists()) return { applied: false, reason: 'BATTLE_ALREADY_EXISTS' };
    assertNoPendingRewardCorrections(integritySnap.exists() ? integritySnap.data() : {});
    const currentProgress = normalizeRpgProgress(progressSnap.exists() ? progressSnap.data() : {}); const chapter = getChapter(currentProgress.currentChapterId);
    if (!chapter.normalEnemyIds.includes(enemyId)) throw failure('ENEMY_NOT_AVAILABLE_IN_CHAPTER');
    const change = prepareBattleStart({ profile: profileSnap.exists() ? profileSnap.data() : {}, enemy, battleId, now, chapter });
    transaction.set(profile, change.profile); transaction.set(battle, change.battle); transaction.set(ledger, change.ledger);
    return { applied: true, battle: change.battle };
  });
}

export async function startBossBattle({ db, familyId, bossId, battleId }) {
  const boss = getBoss(bossId); if (!boss) throw failure('BOSS_NOT_FOUND');
  const profile = playerProfileRef(db, familyId); const progress = rpgProgressRef(db, familyId); const battle = rpgBattleRef(db, familyId, battleId); const ledger = rpgBattleLedgerRef(db, familyId, `start-${battleId}`); const integrity = rewardIntegrityRef(db, familyId); const now = Date.now();
  return runTransaction(db, async (transaction) => {
    const [profileSnap, progressSnap, battleSnap, ledgerSnap, integritySnap] = await Promise.all([transaction.get(profile), transaction.get(progress), transaction.get(battle), transaction.get(ledger), transaction.get(integrity)]);
    const currentProgress = normalizeRpgProgress(progressSnap.exists() ? progressSnap.data() : {}); const chapter = getChapter(currentProgress.currentChapterId); const chapterClear = rpgBattleLedgerRef(db, familyId, `boss-clear-${chapter.id}`); const chapterClearSnap = await transaction.get(chapterClear);
    if (battleSnap.exists() || ledgerSnap.exists()) return { applied: false, reason: 'BATTLE_ALREADY_EXISTS' };
    assertNoPendingRewardCorrections(integritySnap.exists() ? integritySnap.data() : {});
    if (chapter.bossId !== bossId) throw failure('BOSS_NOT_AVAILABLE_IN_CHAPTER'); if (chapterClearSnap.exists() || currentProgress.completedChapterIds.includes(chapter.id)) throw failure('BOSS_ALREADY_CLEARED'); if (!isBossUnlocked(currentProgress, chapter)) throw failure('BOSS_LOCKED');
    const change = prepareBattleStart({ profile: profileSnap.exists() ? profileSnap.data() : {}, enemy: boss, battleId, now, battleKind: 'boss', chapter, bossId });
    transaction.set(profile, change.profile); transaction.set(battle, change.battle); transaction.set(ledger, change.ledger); return { applied: true, battle: change.battle };
  });
}

export async function startTowerBattle({ db, familyId, battleId }) {
  const profile = playerProfileRef(db, familyId); const progress = rpgProgressRef(db, familyId); const towerProgress = rpgTowerProgressRef(db, familyId); const battle = rpgBattleRef(db, familyId, battleId); const ledger = rpgBattleLedgerRef(db, familyId, `start-${battleId}`); const integrity = rewardIntegrityRef(db, familyId); const now = Date.now();
  return runTransaction(db, async (transaction) => {
    const [profileSnap, progressSnap, towerSnap, battleSnap, ledgerSnap, integritySnap] = await Promise.all([transaction.get(profile), transaction.get(progress), transaction.get(towerProgress), transaction.get(battle), transaction.get(ledger), transaction.get(integrity)]);
    if (battleSnap.exists() || ledgerSnap.exists()) return { applied: false, reason: 'BATTLE_ALREADY_EXISTS' };
    assertNoPendingRewardCorrections(integritySnap.exists() ? integritySnap.data() : {});
    if (!normalizeRpgProgress(progressSnap.exists() ? progressSnap.data() : {}).campaignCompleted) throw failure('TOWER_LOCKED');
    const currentTower = normalizeTowerProgress(towerSnap.exists() ? towerSnap.data() : {}); const encounter = buildTowerEncounter({ floor: currentTower.currentFloor });
    const change = preparePartyTowerStart({ profile: profileSnap.exists() ? profileSnap.data() : {}, encounter, battleId, now });
    transaction.set(profile, change.profile); transaction.set(battle, change.battle); transaction.set(ledger, change.ledger); return { applied: true, battle: change.battle };
  });
}

export async function startWeeklyBossBattle({ db, familyId, battleId, now = Date.now() }) { const profile = playerProfileRef(db, familyId); const progress = rpgProgressRef(db, familyId); const battle = rpgBattleRef(db, familyId, battleId); const ledger = rpgBattleLedgerRef(db, familyId, `start-${battleId}`); const integrity = rewardIntegrityRef(db, familyId); const boss = getWeeklyBossDefinition(now); const clear = rpgBattleLedgerRef(db, familyId, `weekly-boss-clear-${boss.weekId}`); return runTransaction(db, async (transaction) => { const [profileSnap, progressSnap, battleSnap, ledgerSnap, integritySnap, clearSnap] = await Promise.all([transaction.get(profile), transaction.get(progress), transaction.get(battle), transaction.get(ledger), transaction.get(integrity), transaction.get(clear)]); if (battleSnap.exists() || ledgerSnap.exists()) return { applied: false, reason: 'BATTLE_ALREADY_EXISTS' }; assertNoPendingRewardCorrections(integritySnap.exists() ? integritySnap.data() : {}); if (!normalizeRpgProgress(progressSnap.exists() ? progressSnap.data() : {}).campaignCompleted) throw failure('WEEKLY_BOSS_LOCKED'); if (clearSnap.exists()) throw failure('WEEKLY_BOSS_ALREADY_CLEARED'); const change = prepareWeeklyBossStart({ profile: profileSnap.exists() ? profileSnap.data() : {}, boss, battleId, now }); transaction.set(profile, change.profile); transaction.set(battle, change.battle); transaction.set(ledger, change.ledger); return { applied: true, battle: change.battle }; }); }

export async function attackBattle({ db, familyId, battleId, actionId, targetEnemyInstanceId = null }) {
  const profile = playerProfileRef(db, familyId); const progressRef = rpgProgressRef(db, familyId); const towerProgressRef = rpgTowerProgressRef(db, familyId); const battleRef = rpgBattleRef(db, familyId, battleId); const attackLedgerRef = rpgBattleLedgerRef(db, familyId, actionId); const victoryLedgerRef = rpgBattleLedgerRef(db, familyId, `victory-${battleId}`); const defeatLedgerRef = rpgBattleLedgerRef(db, familyId, `defeat-${battleId}`); const now = Date.now();
  return runTransaction(db, async (transaction) => {
    const [battleSnap, attackLedgerSnap, victoryLedgerSnap, defeatLedgerSnap, profileSnap, progressSnap, towerSnap] = await Promise.all([transaction.get(battleRef), transaction.get(attackLedgerRef), transaction.get(victoryLedgerRef), transaction.get(defeatLedgerRef), transaction.get(profile), transaction.get(progressRef), transaction.get(towerProgressRef)]);
    if (attackLedgerSnap.exists()) return { applied: false, reason: 'ALREADY_APPLIED' };
    if (!battleSnap.exists()) throw failure('BATTLE_NOT_FOUND');
    const battle = normalizeBattle(battleSnap.data());
    if (battle.status !== 'active' || victoryLedgerSnap.exists() || defeatLedgerSnap.exists()) throw failure('BATTLE_ALREADY_COMPLETED');
    if (Number(battle.schemaVersion) >= 8 && battle.battleMode === 'weekly_boss') { const clearRef = rpgBattleLedgerRef(db, familyId, `weekly-boss-clear-${battle.weeklyBossSnapshot.weekId}`); const clearSnap = await transaction.get(clearRef); if (clearSnap.exists()) throw failure('WEEKLY_BOSS_ALREADY_CLEARED'); const change = prepareWeeklyBossResult({ battle, profile: profileSnap.exists() ? profileSnap.data() : {}, action: { targetEnemyInstanceId }, actionId, now }); transaction.set(battleRef, change.battle); transaction.set(attackLedgerRef, change.attackLedger); if (change.profile) transaction.set(profile, change.profile); if (change.victoryLedger) { transaction.set(victoryLedgerRef, change.victoryLedger); transaction.set(clearRef, change.victoryLedger); } if (change.defeatLedger) transaction.set(defeatLedgerRef, change.defeatLedger); return { applied: true, battle: change.battle, victory: Boolean(change.victoryLedger), defeat: Boolean(change.defeatLedger) }; }
    if (Number(battle.schemaVersion) >= 8 && battle.battleMode === 'tower') { const change = preparePartyBattleResult({ battle, profile: profileSnap.exists() ? profileSnap.data() : {}, towerProgress: towerSnap.exists() ? towerSnap.data() : {}, action: { targetEnemyInstanceId }, actionId, now }); transaction.set(battleRef, change.battle); transaction.set(attackLedgerRef, change.attackLedger); if (change.profile) transaction.set(profile, change.profile); if (change.towerProgress) transaction.set(towerProgressRef, change.towerProgress); if (change.victoryLedger) transaction.set(victoryLedgerRef, change.victoryLedger); if (change.defeatLedger) transaction.set(defeatLedgerRef, change.defeatLedger); return { applied: true, battle: change.battle, result: change.result, victory: Boolean(change.victoryLedger), defeat: Boolean(change.defeatLedger) }; }
    const clearRef = battle.battleKind === 'boss' && battle.chapterSnapshot?.id ? rpgBattleLedgerRef(db, familyId, `boss-clear-${battle.chapterSnapshot.id}`) : null; const clearSnap = clearRef ? await transaction.get(clearRef) : null; if (clearSnap?.exists()) throw failure('BOSS_ALREADY_CLEARED');
    const change = prepareBattleAttack({ battle, profile: profileSnap.exists() ? profileSnap.data() : {}, progress: progressSnap.exists() ? progressSnap.data() : {}, towerProgress: towerSnap.exists() ? towerSnap.data() : {}, actionId, now });
    transaction.set(battleRef, change.battle); transaction.set(attackLedgerRef, change.attackLedger);
    if (change.victoryLedger) { transaction.set(profile, change.profile); transaction.set(victoryLedgerRef, change.victoryLedger); }
    if (change.progress) transaction.set(progressRef, change.progress); if (change.bossClearLedger) transaction.set(clearRef, change.bossClearLedger);
    if (change.towerProgress) transaction.set(towerProgressRef, change.towerProgress);
    if (change.defeatLedger) { transaction.set(profile, change.profile); transaction.set(defeatLedgerRef, change.defeatLedger); }
    return { applied: true, battle: change.battle, result: change.result, victory: Boolean(change.victoryLedger), defeat: Boolean(change.defeatLedger) };
  });
}

export async function useBattleSkill({ db, familyId, battleId, skillId, actionId, targetEnemyInstanceId = null, targetMemberId = null }) {
  const profile = playerProfileRef(db, familyId); const progressRef = rpgProgressRef(db, familyId); const towerProgressRef = rpgTowerProgressRef(db, familyId); const battleRef = rpgBattleRef(db, familyId, battleId); const actionLedgerRef = rpgBattleLedgerRef(db, familyId, actionId); const victoryLedgerRef = rpgBattleLedgerRef(db, familyId, `victory-${battleId}`); const defeatLedgerRef = rpgBattleLedgerRef(db, familyId, `defeat-${battleId}`); const now = Date.now();
  return runTransaction(db, async (transaction) => {
    const [battleSnap, actionSnap, victorySnap, defeatSnap, profileSnap, progressSnap, towerSnap] = await Promise.all([transaction.get(battleRef), transaction.get(actionLedgerRef), transaction.get(victoryLedgerRef), transaction.get(defeatLedgerRef), transaction.get(profile), transaction.get(progressRef), transaction.get(towerProgressRef)]);
    if (actionSnap.exists()) return { applied: false, reason: 'ALREADY_APPLIED' };
    if (!battleSnap.exists()) throw failure('BATTLE_NOT_FOUND');
    const battle = normalizeBattle(battleSnap.data());
    if (battle.status !== 'active' || victorySnap.exists() || defeatSnap.exists()) throw failure('BATTLE_ALREADY_COMPLETED');
    if (Number(battle.schemaVersion) >= 8 && battle.battleMode === 'weekly_boss') { const clearRef = rpgBattleLedgerRef(db, familyId, `weekly-boss-clear-${battle.weeklyBossSnapshot.weekId}`); const clearSnap = await transaction.get(clearRef); if (clearSnap.exists()) throw failure('WEEKLY_BOSS_ALREADY_CLEARED'); const change = prepareWeeklyBossResult({ battle, profile: profileSnap.exists() ? profileSnap.data() : {}, action: { skillId, targetEnemyInstanceId, targetMemberId }, actionId, now }); transaction.set(battleRef, change.battle); transaction.set(actionLedgerRef, change.attackLedger); if (change.profile) transaction.set(profile, change.profile); if (change.victoryLedger) { transaction.set(victoryLedgerRef, change.victoryLedger); transaction.set(clearRef, change.victoryLedger); } if (change.defeatLedger) transaction.set(defeatLedgerRef, change.defeatLedger); return { applied: true, outcome: change.battle.status, victory: Boolean(change.victoryLedger), defeat: Boolean(change.defeatLedger) }; }
    if (Number(battle.schemaVersion) >= 8 && battle.battleMode === 'tower') { const change = preparePartyBattleResult({ battle, profile: profileSnap.exists() ? profileSnap.data() : {}, towerProgress: towerSnap.exists() ? towerSnap.data() : {}, action: { skillId, targetEnemyInstanceId, targetMemberId }, actionId, now }); transaction.set(battleRef, change.battle); transaction.set(actionLedgerRef, change.attackLedger); if (change.profile) transaction.set(profile, change.profile); if (change.towerProgress) transaction.set(towerProgressRef, change.towerProgress); if (change.victoryLedger) transaction.set(victoryLedgerRef, change.victoryLedger); if (change.defeatLedger) transaction.set(defeatLedgerRef, change.defeatLedger); return { applied: true, battle: change.battle, result: change.result, victory: Boolean(change.victoryLedger), defeat: Boolean(change.defeatLedger) }; }
    const skill = battle.playerSnapshot.skills?.[skillId];
    if (!skill) throw failure('SKILL_NOT_AVAILABLE');
    const used = Number(battle.skillUses?.[skillId] || 0);
    if (used >= Number(skill.maxUses || 0)) throw failure('SKILL_NO_USES');
    const kind = skill.kind || 'attack';
    if (!['attack', 'heal', 'guard'].includes(kind)) throw failure('SKILL_NOT_AVAILABLE');
    if (kind === 'heal' && battle.playerHp >= battle.playerSnapshot.maxHp) throw failure('HEAL_NOT_NEEDED');
    const actionSkill = { ...buildBattleSkillSnapshot({ ...skill, kind }), useNumber: used + 1 };
    const elementResult = kind === 'attack' ? getElementMultiplier({ attackElement: skill.element, weaknesses: battle.enemySnapshot.weaknesses, resistances: battle.enemySnapshot.resistances }) : undefined;
    const damageResult = kind === 'attack' ? calculateSkillDamage({ playerAttack: battle.playerSnapshot.attack, powerPercent: skill.powerPercent, elementPercent: elementResult.percent }) : null;
    const healing = kind === 'heal' ? calculateHealAmount({ playerMaxHp: battle.playerSnapshot.maxHp, playerHp: battle.playerHp, healPercent: skill.healPercent }) : undefined;
    const action = { kind: 'skill', damage: damageResult?.damage, poweredDamage: damageResult?.poweredDamage, elementResult, healing, skill: actionSkill };
    const clearRef = battle.battleKind === 'boss' && battle.chapterSnapshot?.id ? rpgBattleLedgerRef(db, familyId, `boss-clear-${battle.chapterSnapshot.id}`) : null; const clearSnap = clearRef ? await transaction.get(clearRef) : null; if (clearSnap?.exists()) throw failure('BOSS_ALREADY_CLEARED');
    const change = prepareBattleAttack({ battle, profile: profileSnap.exists() ? profileSnap.data() : {}, progress: progressSnap.exists() ? progressSnap.data() : {}, towerProgress: towerSnap.exists() ? towerSnap.data() : {}, actionId, now, action });
    transaction.set(battleRef, change.battle); transaction.set(actionLedgerRef, change.attackLedger);
    if (change.victoryLedger) { transaction.set(profile, change.profile); transaction.set(victoryLedgerRef, change.victoryLedger); }
    if (change.progress) transaction.set(progressRef, change.progress); if (change.bossClearLedger) transaction.set(clearRef, change.bossClearLedger);
    if (change.towerProgress) transaction.set(towerProgressRef, change.towerProgress);
    if (change.defeatLedger) { transaction.set(profile, change.profile); transaction.set(defeatLedgerRef, change.defeatLedger); }
    return { applied: true, actionKind: 'skill', skill: action.skill, elementResult, poweredDamage: damageResult?.poweredDamage, damage: damageResult?.damage, healing, guard: change.result.guard, enemyHpBefore: change.result.hpBefore, enemyHpAfter: change.result.hpAfter, enemyCounter: change.result.enemyCounter || null, outcome: change.battle.status, victory: Boolean(change.victoryLedger), defeat: Boolean(change.defeatLedger) };
  });
}
