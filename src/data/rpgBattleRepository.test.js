import { describe, expect, it } from 'vitest';
import { ENEMY_CATALOG } from '../rpg/enemyCatalog.js';
import { prepareBattleAttack, prepareBattleStart } from './rpgBattleRepository.js';
import { calculateSkillDamage, getElementMultiplier } from '../rpg/battleCalculator.js';
import { findUndefinedPaths } from '../test/findUndefinedPaths.js';
import { BOSS_CATALOG } from '../rpg/bossCatalog.js';
import { getChapter } from '../rpg/chapterCatalog.js';

const now = 1000;
const profile = { battleEnergy: 3, totalExp: 90, level: 1, ownedEquipment: { iron_sword: {} }, equipped: { weapon: 'iron_sword' } };
describe('battle transaction logic', () => {
  it('starts a battle once with a snapshot and charges energy once', () => {
    const start = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'battle-a', now });
    expect(start.profile).toMatchObject({ battleEnergy: 2, activeBattleId: 'battle-a' });
    expect(start.battle).toMatchObject({ enemyHp: 20, status: 'active', attackCount: 0, playerSnapshot: { attack: 10 } });
    expect(start.ledger).toMatchObject({ type: 'battle_start', energySpent: 1 });
    expect(() => prepareBattleStart({ profile: start.profile, enemy: ENEMY_CATALOG.slime, battleId: 'battle-b', now })).toThrow('ACTIVE_BATTLE_EXISTS');
    expect(() => prepareBattleStart({ profile: { battleEnergy: 0 }, enemy: ENEMY_CATALOG.slime, battleId: 'battle-b', now })).toThrow('INSUFFICIENT_BATTLE_ENERGY');
  });
  it('writes the complete immutable Chapter snapshot to both new v7 battle records and start ledgers', () => {
    const chapter1 = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'chapter-1-start', now, chapter: getChapter('chapter_1') });
    const chapter2 = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.goblin, battleId: 'chapter-2-start', now, chapter: getChapter('chapter_2') });
    expect(chapter1.battle).toMatchObject({ schemaVersion: 7, chapterSnapshot: { id: 'chapter_1', normalWinsRequired: 3, nextChapterId: 'chapter_2' } });
    expect(chapter1.ledger.chapterSnapshot).toEqual(chapter1.battle.chapterSnapshot);
    expect(chapter2.battle).toMatchObject({ schemaVersion: 7, chapterSnapshot: { id: 'chapter_2', normalWinsRequired: 4, nextChapterId: null } });
    [chapter1.battle, chapter1.ledger, chapter2.battle, chapter2.ledger].forEach((payload) => expect(findUndefinedPaths(payload)).toEqual([]));
  });
  it('uses the v7 normal-wins snapshot rather than the live Chapter catalog cap', () => {
    const chapter = { ...getChapter('chapter_1'), normalWinsRequired: 5 };
    const start = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'snapshot-normal', now, chapter });
    const final = prepareBattleAttack({ battle: { ...start.battle, enemyHp: 1 }, profile: start.profile, progress: { currentChapterId: 'chapter_1', normalWins: 3 }, actionId: 'snapshot-normal-final', now });
    expect(final.progress).toMatchObject({ currentChapterId: 'chapter_1', normalWins: 4, campaignCompleted: false });
  });
  it('uses the v7 boss nextChapterId snapshot, including explicit final-chapter null', () => {
    const chapter = { ...getChapter('chapter_1'), normalWinsRequired: 3, nextChapterId: null };
    const start = prepareBattleStart({ profile, enemy: BOSS_CATALOG.orc_chief, battleId: 'snapshot-boss', now, battleKind: 'boss', bossId: 'orc_chief', chapter });
    const final = prepareBattleAttack({ battle: { ...start.battle, enemyHp: 1 }, profile: start.profile, progress: { currentChapterId: 'chapter_1', normalWins: 3 }, actionId: 'snapshot-boss-final', now });
    expect(final.progress).toMatchObject({ currentChapterId: 'chapter_1', completedChapterIds: ['chapter_1'], campaignCompleted: true });
    expect(final.battle.victory.bossClear.chapterAfter).toBeNull();
  });
  it('keeps a v6 boss without nextChapterId on the legacy live-catalog completion path', () => {
    const start = prepareBattleStart({ profile, enemy: BOSS_CATALOG.orc_chief, battleId: 'legacy-v6-boss', now, battleKind: 'boss', bossId: 'orc_chief', chapter: getChapter('chapter_1') });
    const legacy = { ...start.battle, schemaVersion: 6, chapterSnapshot: { ...start.battle.chapterSnapshot } };
    delete legacy.chapterSnapshot.nextChapterId;
    const final = prepareBattleAttack({ battle: { ...legacy, enemyHp: 1 }, profile: start.profile, progress: { currentChapterId: 'chapter_1', normalWins: 3 }, actionId: 'legacy-v6-boss-final', now });
    expect(final.progress).toMatchObject({ currentChapterId: 'chapter_2', normalWins: 0, completedChapterIds: ['chapter_1'], campaignCompleted: false });
  });
  it('updates HP and writes a regular attack ledger from the battle snapshot', () => {
    const start = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'battle-a', now });
    const attack = prepareBattleAttack({ battle: start.battle, profile: start.profile, actionId: 'attack-a', now: now + 1 });
    expect(attack.battle).toMatchObject({ enemyHp: 10, attackCount: 1, status: 'active' });
    expect(attack.attackLedger).toMatchObject({ playerAttack: { damage: 10, enemyHpBefore: 20, enemyHpAfter: 10 }, enemyCounter: { damage: 3, playerHpBefore: 40, playerHpAfter: 37 }, outcome: 'active' });
    expect(attack.profile).toBeNull();
  });
  it('makes victory atomic: hp floor, EXP once, level update, and active battle clear', () => {
    const start = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'battle-a', now });
    const final = prepareBattleAttack({ battle: { ...start.battle, enemyHp: 5 }, profile: start.profile, actionId: 'attack-final', now: now + 2 });
    expect(final.battle).toMatchObject({ enemyHp: 0, status: 'won', attackCount: 1 });
    expect(final.profile).toMatchObject({ totalExp: 110, level: 2, activeBattleId: null });
    expect(final.victoryLedger).toMatchObject({ type: 'victory', expGranted: 20, totalExpBefore: 90, totalExpAfter: 110, levelAfter: 2 });
    expect(() => prepareBattleAttack({ battle: final.battle, profile: final.profile, actionId: 'later', now })).toThrow('BATTLE_ALREADY_COMPLETED');
  });
  it('keeps a Campaign victory on the Campaign path without changing Tower progress', () => {
    const start = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'campaign-regression', now, chapter: getChapter('chapter_1') });
    const final = prepareBattleAttack({ battle: { ...start.battle, enemyHp: 1 }, profile: start.profile, progress: { currentChapterId: 'chapter_1', normalWins: 0 }, towerProgress: { currentFloor: 7, highestFloor: 6, totalWins: 6 }, actionId: 'campaign-regression-win', now });
    expect(final.battle.battleMode).toBe('campaign'); expect(final.progress).toMatchObject({ currentChapterId: 'chapter_1', normalWins: 1 }); expect(final.towerProgress).toBeNull();
  });
  it('snapshots starter skills and applies weak skill damage atomically', () => {
    const start = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'battle-skill', now });
    expect(start.battle).toMatchObject({ schemaVersion: 7, skillUses: { flame_slash: 0, aqua_edge: 0, thunder_strike: 0, healing_light: 0, guard_stance: 0 } });
    const skill = start.battle.playerSnapshot.skills.flame_slash;
    const elementResult = getElementMultiplier({ attackElement: skill.element, weaknesses: start.battle.enemySnapshot.weaknesses, resistances: start.battle.enemySnapshot.resistances });
    const damage = calculateSkillDamage({ playerAttack: 10, powerPercent: skill.powerPercent, elementPercent: elementResult.percent });
    expect(damage).toEqual({ poweredDamage: 12, damage: 18 });
    const result = prepareBattleAttack({ battle: start.battle, profile: start.profile, actionId: 'skill-1', now, action: { kind: 'skill', damage: damage.damage, poweredDamage: damage.poweredDamage, elementResult, skill: { ...skill, useNumber: 1 } } });
    expect(result.battle).toMatchObject({ enemyHp: 2, skillUses: { flame_slash: 1 } });
    expect(result.attackLedger).toMatchObject({ actionKind: 'skill', elementResult: { type: 'weak', percent: 150 }, skill: { id: 'flame_slash', useNumber: 1 } });
  });
  it('snapshots five v4 skills and applies heal and guard through the shared action path', () => {
    const start = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'battle-v4', now });
    expect(start.battle).toMatchObject({ schemaVersion: 7, skillUses: { flame_slash: 0, aqua_edge: 0, thunder_strike: 0, healing_light: 0, guard_stance: 0 } });
    const heal = prepareBattleAttack({ battle: { ...start.battle, playerHp: 20 }, profile: start.profile, actionId: 'heal-1', now, action: { kind: 'skill', healing: { playerHpBefore: 20, calculatedHeal: 14, actualHeal: 14, playerHpAfterHeal: 34 }, skill: { ...start.battle.playerSnapshot.skills.healing_light, useNumber: 1 } } });
    expect(heal.battle).toMatchObject({ enemyHp: 20, playerHp: 31, skillUses: { healing_light: 1 }, attackCount: 1 });
    expect(heal.attackLedger).toMatchObject({ healing: { actualHeal: 14 }, playerAttack: null, enemyCounter: { damage: 3, playerHpBefore: 34, playerHpAfter: 31 } });
    const guard = prepareBattleAttack({ battle: { ...start.battle, playerHp: 10 }, profile: start.profile, actionId: 'guard-1', now, action: { kind: 'skill', skill: { ...start.battle.playerSnapshot.skills.guard_stance, useNumber: 1 } } });
    expect(guard.battle).toMatchObject({ enemyHp: 20, playerHp: 9, skillUses: { guard_stance: 1 } });
    expect(guard.attackLedger).toMatchObject({ guard: { baseDamage: 3, reductionPercent: 50, finalDamage: 1 }, enemyCounter: { damage: 1 } });
  });
  it('keeps v3 skill snapshots attack-only while supplying their missing kind', () => {
    const legacy = { schemaVersion: 3, battleId: 'legacy', enemyId: 'slime', enemyHp: 20, status: 'active', playerHp: 40, playerSnapshot: { attack: 5, maxHp: 40, skills: { flame_slash: { id: 'flame_slash', maxUses: 2 } } }, enemySnapshot: { maxHp: 20, attack: 1 } };
    const turn = prepareBattleAttack({ battle: legacy, profile, actionId: 'legacy-a', now });
    expect(turn.battle.playerSnapshot.skills).toEqual({ flame_slash: { id: 'flame_slash', maxUses: 2, kind: 'attack' } });
    expect(turn.battle.playerSnapshot.skills.healing_light).toBeUndefined();
  });
  it('keeps every Firestore battle payload free of undefined optional fields', () => {
    const start = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'persist', now });
    const attack = prepareBattleAttack({ battle: start.battle, profile: start.profile, actionId: 'normal', now });
    const flame = prepareBattleAttack({ battle: start.battle, profile: start.profile, actionId: 'flame', now, action: { kind: 'skill', damage: 12, poweredDamage: 12, elementResult: { type: 'normal', percent: 100 }, skill: { ...start.battle.playerSnapshot.skills.flame_slash, useNumber: 1 } } });
    const heal = prepareBattleAttack({ battle: { ...start.battle, playerHp: 20 }, profile: start.profile, actionId: 'heal', now, action: { kind: 'skill', healing: { playerHpBefore: 20, calculatedHeal: 14, actualHeal: 14, playerHpAfterHeal: 34 }, skill: { ...start.battle.playerSnapshot.skills.healing_light, useNumber: 1 } } });
    const guard = prepareBattleAttack({ battle: start.battle, profile: start.profile, actionId: 'guard', now, action: { kind: 'skill', skill: { ...start.battle.playerSnapshot.skills.guard_stance, useNumber: 1 } } });
    const victory = prepareBattleAttack({ battle: { ...start.battle, enemyHp: 1 }, profile: start.profile, actionId: 'victory', now });
    const defeat = prepareBattleAttack({ battle: { ...start.battle, playerHp: 1 }, profile: start.profile, actionId: 'defeat', now });
    [start.battle, start.ledger, start.profile, attack.attackLedger, flame.attackLedger, heal.attackLedger, guard.attackLedger, victory.attackLedger, victory.victoryLedger, victory.profile, defeat.attackLedger, defeat.defeatLedger, defeat.profile].forEach((payload) => expect(findUndefinedPaths(payload)).toEqual([]));
  });
  it('applies a boss final hit once with reward and chapter progress in the returned atomic change', () => {
    const start = prepareBattleStart({ profile: { ...profile, battleEnergy: 3 }, enemy: BOSS_CATALOG.orc_chief, battleId: 'boss-a', now, battleKind: 'boss', bossId: 'orc_chief', chapter: getChapter('chapter_1') });
    const final = prepareBattleAttack({ battle: { ...start.battle, enemyHp: 1 }, profile: start.profile, progress: { currentChapterId: 'chapter_1', normalWins: 3 }, actionId: 'boss-final', now });
    expect(final.battle).toMatchObject({ status: 'won', victory: { bossClear: { chapterAfter: 'chapter_2', reward: { gold: 150, materials: { iron: 5, wisdom_scroll: 2 } } } } });
    expect(final.profile).toMatchObject({ gold: 150, materials: { iron: 5, wisdom_scroll: 2 }, activeBattleId: null });
    expect(final.progress).toMatchObject({ currentChapterId: 'chapter_2', normalWins: 0, completedChapterIds: ['chapter_1'] });
    expect(final.bossClearLedger).toMatchObject({ type: 'boss_clear', chapterId: 'chapter_1', bossId: 'orc_chief' });
    [final.battle, final.profile, final.progress, final.victoryLedger, final.bossClearLedger].forEach((payload) => expect(findUndefinedPaths(payload)).toEqual([]));
  });
  it('snapshots deterministic enemy actions for normal, skill, guard, heal, victory, and defeat turns', () => {
    const defensiveProfile = { battleEnergy: 20, ownedEquipment: { iron_sword: {}, mineral_armor: {}, history_charm: {} }, equipped: { weapon: 'iron_sword', armor: 'mineral_armor', accessory: 'history_charm' } };
    const normalStart = prepareBattleStart({ profile: defensiveProfile, enemy: ENEMY_CATALOG.slime, battleId: 'normal-actions', now });
    const normal = prepareBattleAttack({ battle: normalStart.battle, profile: normalStart.profile, actionId: 'normal-actions-1', now });
    expect(normal.attackLedger.enemyCounter).toMatchObject({ actionId: 'normal_attack', actionName: '通常攻撃', powerPercent: 100, attack: 3, poweredAttack: 3, playerDefense: 4, damage: 1 });

    const orcStart = prepareBattleStart({ profile: defensiveProfile, enemy: BOSS_CATALOG.orc_chief, battleId: 'orc-actions', now, battleKind: 'boss', bossId: 'orc_chief', chapter: getChapter('chapter_1') });
    expect(orcStart.battle).toMatchObject({ schemaVersion: 7, enemySnapshot: { actionPattern: [{ id: 'normal_attack' }, { id: 'normal_attack' }, { id: 'orc_heavy_strike', powerPercent: 150 }] } });
    const healSkill = orcStart.battle.playerSnapshot.skills.healing_light;
    const heal = prepareBattleAttack({ battle: { ...orcStart.battle, attackCount: 2, playerHp: 20 }, profile: orcStart.profile, actionId: 'orc-heal', now, action: { kind: 'skill', healing: { playerHpBefore: 20, calculatedHeal: 14, actualHeal: 14, playerHpAfterHeal: 34 }, skill: { ...healSkill, useNumber: 1 } } });
    expect(heal.attackLedger.enemyCounter).toMatchObject({ actionId: 'orc_heavy_strike', actionName: '豪腕撃', poweredAttack: 7, damage: 3, playerHpBefore: 34, playerHpAfter: 31 });

    const golemStart = prepareBattleStart({ profile: defensiveProfile, enemy: BOSS_CATALOG.ancient_golem, battleId: 'golem-actions', now, battleKind: 'boss', bossId: 'ancient_golem', chapter: getChapter('chapter_2') });
    const rockCrush = prepareBattleAttack({ battle: { ...golemStart.battle, attackCount: 1 }, profile: golemStart.profile, actionId: 'golem-rock', now });
    expect(rockCrush.attackLedger.enemyCounter).toMatchObject({ actionId: 'golem_rock_crush', actionName: '岩砕き', poweredAttack: 10, damage: 6 });
    const guardSkill = golemStart.battle.playerSnapshot.skills.guard_stance;
    const earthquakeGuard = prepareBattleAttack({ battle: { ...golemStart.battle, attackCount: 3 }, profile: golemStart.profile, actionId: 'golem-guard', now, action: { kind: 'skill', skill: { ...guardSkill, useNumber: 1 } } });
    expect(earthquakeGuard.attackLedger.enemyCounter).toMatchObject({ actionId: 'golem_earthquake', actionName: '大地震', poweredAttack: 12, damage: 4 });
    expect(earthquakeGuard.attackLedger.guard).toMatchObject({ baseDamage: 8, reductionPercent: 50, finalDamage: 4 });

    const victory = prepareBattleAttack({ battle: { ...orcStart.battle, enemyHp: 1, attackCount: 2 }, profile: orcStart.profile, progress: { currentChapterId: 'chapter_1', normalWins: 3 }, actionId: 'orc-victory', now });
    expect(victory.attackLedger.enemyCounter).toBeNull();
    const defeat = prepareBattleAttack({ battle: { ...golemStart.battle, attackCount: 3, playerHp: 8 }, profile: golemStart.profile, progress: { currentChapterId: 'chapter_2', normalWins: 4 }, actionId: 'golem-defeat', now });
    expect(defeat).toMatchObject({ battle: { status: 'lost' }, profile: { activeBattleId: null, totalExp: 0 }, defeatLedger: { expGranted: 0 } });
    expect(defeat.progress).toBeUndefined();
    expect(defeat.bossClearLedger).toBeUndefined();
    [normalStart.battle, normalStart.ledger, normal.attackLedger, orcStart.battle, orcStart.ledger, heal.attackLedger, golemStart.battle, golemStart.ledger, rockCrush.attackLedger, earthquakeGuard.attackLedger, victory.attackLedger, victory.victoryLedger, defeat.attackLedger, defeat.defeatLedger, defeat.profile].forEach((payload) => expect(findUndefinedPaths(payload)).toEqual([]));
  });
  it('keeps the bare Orc Chief beatable with the existing two Heals and deterministic skill sequence', () => {
    const start = prepareBattleStart({ profile: { battleEnergy: 3 }, enemy: BOSS_CATALOG.orc_chief, battleId: 'bare-orc', now, battleKind: 'boss', bossId: 'orc_chief' });
    let battle = start.battle;
    const skillTurn = (skillId, useNumber, actionId) => {
      const skill = battle.playerSnapshot.skills[skillId];
      const elementResult = getElementMultiplier({ attackElement: skill.element, weaknesses: battle.enemySnapshot.weaknesses, resistances: battle.enemySnapshot.resistances });
      const damage = calculateSkillDamage({ playerAttack: battle.playerSnapshot.attack, powerPercent: skill.powerPercent, elementPercent: elementResult.percent });
      const result = prepareBattleAttack({ battle, profile: start.profile, actionId, now, action: { kind: 'skill', damage: damage.damage, poweredDamage: damage.poweredDamage, elementResult, skill: { ...skill, useNumber } } });
      battle = result.battle;
      return result;
    };
    const healTurn = (useNumber, actionId) => {
      const skill = battle.playerSnapshot.skills.healing_light;
      const healing = { playerHpBefore: battle.playerHp, calculatedHeal: 14, actualHeal: 14, playerHpAfterHeal: Math.min(40, battle.playerHp + 14) };
      const result = prepareBattleAttack({ battle, profile: start.profile, actionId, now, action: { kind: 'skill', healing, skill: { ...skill, useNumber } } });
      battle = result.battle;
      return result;
    };
    skillTurn('aqua_edge', 1, 'bare-aqua-1'); skillTurn('aqua_edge', 2, 'bare-aqua-2'); skillTurn('thunder_strike', 1, 'bare-thunder-1'); skillTurn('thunder_strike', 2, 'bare-thunder-2'); skillTurn('flame_slash', 1, 'bare-flame-1');
    healTurn(1, 'bare-heal-1'); skillTurn('flame_slash', 2, 'bare-flame-2');
    let result = prepareBattleAttack({ battle, profile: start.profile, actionId: 'bare-normal-1', now }); battle = result.battle;
    healTurn(2, 'bare-heal-2'); result = prepareBattleAttack({ battle, profile: start.profile, actionId: 'bare-normal-2', now }); battle = result.battle;
    result = prepareBattleAttack({ battle, profile: start.profile, actionId: 'bare-normal-3', now }); battle = result.battle;
    result = prepareBattleAttack({ battle, profile: start.profile, actionId: 'bare-normal-final', now });
    expect(result.battle).toMatchObject({ status: 'won', enemyHp: 0, playerHp: 7 });
    expect(result.attackLedger.enemyCounter).toBeNull();
  });
});
