import { describe, expect, it } from 'vitest';
import { applyRewardToPlayerProfile } from '../data/rewardLedgerRepository.js';
import { prepareBattleAttack, prepareBattleStart } from '../data/rpgBattleRepository.js';
import { prepareEquip, preparePurchase } from '../data/rpgShopRepository.js';
import { findUndefinedPaths } from '../test/findUndefinedPaths.js';
import { calculateEnemyCounterDamage, calculatePlayerAttack, calculatePlayerDefense, calculateSkillDamage } from './battleCalculator.js';
import { BOSS_CATALOG } from './bossCatalog.js';
import { getChapter } from './chapterCatalog.js';
import { EQUIPMENT_CATALOG } from './equipmentCatalog.js';
import { ENEMY_CATALOG } from './enemyCatalog.js';
import { levelForTotalExp } from './levelSystem.js';
import { createEmptyPlayerProfile } from './playerProfile.js';
import { calculateStudyReward, isStudySessionRewardEligible } from './rewardCalculator.js';
import { isBossUnlocked, normalizeRpgProgress } from './rpgProgress.js';
import { normalizeBattle } from './battleState.js';

const now = 1_000;
const validStudySession = (id, subjectId, minutes) => ({
  id,
  recordedSeconds: minutes * 60,
  rewardPolicyVersion: 'rpg-reward-v1',
  validation: { status: 'valid' },
  taskSnapshot: { subjectId },
});
const applyStudyReward = (profile, session, updatedAt) => applyRewardToPlayerProfile(profile, calculateStudyReward(session), updatedAt);

const winBattle = ({ profile, progress, enemy, battleId, battleKind = 'normal', chapter, bossId, updatedAt }) => {
  const start = prepareBattleStart({ profile, enemy, battleId, now: updatedAt, battleKind, chapter, bossId });
  const final = prepareBattleAttack({
    battle: { ...start.battle, enemyHp: start.battle.playerSnapshot.attack },
    profile: start.profile,
    progress,
    actionId: `${battleId}-final`,
    now: updatedAt + 1,
  });
  return { start, final };
};

describe('RPG campaign scenario', () => {
  it('connects study rewards, equipment, two chapters, boss rewards, and campaign clear without duplicate progress', () => {
    let profile = createEmptyPlayerProfile();
    let progress = normalizeRpgProgress();
    const payloads = [profile, progress];

    const studies = [
      validStudySession('study-math', 's_math', 50),
      validStudySession('study-science', 's_science', 50),
      validStudySession('study-social', 's_social', 40),
      validStudySession('study-japanese', 's_japanese', 110),
    ];
    studies.forEach((session, index) => {
      expect(isStudySessionRewardEligible(session)).toBe(true);
      const beforeExp = profile.totalExp;
      profile = applyStudyReward(profile, session, now + index);
      expect(profile.totalExp).toBe(beforeExp);
    });
    expect(profile).toMatchObject({ gold: 250, battleEnergy: 15, totalExp: 0, level: 1, activeBattleId: null });
    expect(profile.materials).toMatchObject({ iron: 5, mineral: 5, history_seal: 4 });

    ['iron_sword', 'mineral_armor', 'history_charm'].forEach((itemId, index) => {
      const purchase = preparePurchase({ profile, item: EQUIPMENT_CATALOG[itemId], actionId: `buy-${itemId}`, now: now + 10 + index });
      profile = purchase.profile;
      payloads.push(purchase.profile, purchase.ledger);
      const equip = prepareEquip({ profile, item: EQUIPMENT_CATALOG[itemId], actionId: `equip-${itemId}`, now: now + 20 + index });
      profile = equip.profile;
      payloads.push(equip.profile, equip.ledger);
    });
    expect(profile).toMatchObject({ gold: 0, equipped: { weapon: 'iron_sword', armor: 'mineral_armor', accessory: 'history_charm' } });
    expect(calculatePlayerAttack(profile)).toBe(12);
    expect(calculatePlayerDefense(profile)).toBe(4);

    const chapter1 = getChapter('chapter_1');
    for (let index = 0; index < chapter1.normalWinsRequired; index += 1) {
      const result = winBattle({ profile, progress, enemy: ENEMY_CATALOG.slime, battleId: `chapter-1-normal-${index}`, chapter: chapter1, updatedAt: now + 100 + index * 10 });
      expect(result.start.profile.activeBattleId).toBe(`chapter-1-normal-${index}`);
      expect(result.final.profile.activeBattleId).toBeNull();
      expect(result.final.victoryLedger.expGranted).toBe(20);
      profile = result.final.profile;
      progress = result.final.progress;
      payloads.push(result.start.battle, result.start.ledger, result.start.profile, result.final.battle, result.final.attackLedger, result.final.victoryLedger, profile, progress);
      expect(progress.normalWins).toBe(index + 1);
      expect(progress.currentChapterId).toBe('chapter_1');
      expect(progress.campaignCompleted).toBe(false);
    }
    expect(isBossUnlocked(progress, chapter1)).toBe(true);

    const firstBoss = winBattle({ profile, progress, enemy: BOSS_CATALOG.orc_chief, battleId: 'orc-chief', battleKind: 'boss', chapter: chapter1, bossId: 'orc_chief', updatedAt: now + 200 });
    expect(firstBoss.final.battle).toMatchObject({ status: 'won', victory: { bossClear: { firstClear: true, chapterAfter: 'chapter_2' } } });
    expect(firstBoss.final.profile).toMatchObject({ activeBattleId: null, gold: 150, materials: { iron: 5, wisdom_scroll: 13 } });
    profile = firstBoss.final.profile;
    progress = firstBoss.final.progress;
    payloads.push(firstBoss.start.battle, firstBoss.start.ledger, firstBoss.start.profile, firstBoss.final.battle, firstBoss.final.attackLedger, firstBoss.final.victoryLedger, firstBoss.final.bossClearLedger, profile, progress);
    expect(progress).toMatchObject({ currentChapterId: 'chapter_2', normalWins: 0, completedChapterIds: ['chapter_1'], campaignCompleted: false });

    const chapter2 = getChapter('chapter_2');
    for (let index = 0; index < chapter2.normalWinsRequired; index += 1) {
      const result = winBattle({ profile, progress, enemy: ENEMY_CATALOG.goblin, battleId: `chapter-2-normal-${index}`, chapter: chapter2, updatedAt: now + 300 + index * 10 });
      profile = result.final.profile;
      progress = result.final.progress;
      payloads.push(result.start.battle, result.start.ledger, result.start.profile, result.final.battle, result.final.attackLedger, result.final.victoryLedger, profile, progress);
      expect(progress.normalWins).toBe(index + 1);
      expect(progress.currentChapterId).toBe('chapter_2');
      expect(progress.completedChapterIds).toEqual(['chapter_1']);
      expect(progress.campaignCompleted).toBe(false);
    }
    expect(isBossUnlocked(progress, chapter2)).toBe(true);

    const finalBoss = winBattle({ profile, progress, enemy: BOSS_CATALOG.ancient_golem, battleId: 'ancient-golem', battleKind: 'boss', chapter: chapter2, bossId: 'ancient_golem', updatedAt: now + 400 });
    profile = finalBoss.final.profile;
    progress = finalBoss.final.progress;
    payloads.push(finalBoss.start.battle, finalBoss.start.ledger, finalBoss.start.profile, finalBoss.final.battle, finalBoss.final.attackLedger, finalBoss.final.victoryLedger, finalBoss.final.bossClearLedger, profile, progress);
    expect(finalBoss.final.battle.victory.bossClear).toMatchObject({ chapterAfter: null, firstClear: true, reward: { gold: 250, materials: { mineral: 5, logic_core: 3 } } });
    expect(progress).toMatchObject({ currentChapterId: 'chapter_2', normalWins: 4, completedChapterIds: ['chapter_1', 'chapter_2'], campaignCompleted: true });
    expect(new Set(progress.completedChapterIds).size).toBe(progress.completedChapterIds.length);
    expect(profile.activeBattleId).toBeNull();
    expect(profile.battleEnergy).toBe(1);
    expect(profile.totalExp).toBe(20 * 3 + 120 + 35 * 4 + 180);
    expect(profile.level).toBe(levelForTotalExp(profile.totalExp));
    payloads.forEach((payload) => expect(findUndefinedPaths(payload)).toEqual([]));
  });

  it('keeps representative battle values within a solvable range using the existing skills and defense', () => {
    const bare = createEmptyPlayerProfile();
    const equipped = {
      ...bare,
      ownedEquipment: { iron_sword: {}, mineral_armor: {}, history_charm: {} },
      equipped: { weapon: 'iron_sword', armor: 'mineral_armor', accessory: 'history_charm' },
    };
    const attackCounts = Object.fromEntries([...Object.values(ENEMY_CATALOG), ...Object.values(BOSS_CATALOG)].map((enemy) => [enemy.id, {
      bare: Math.ceil(enemy.maxHp / calculatePlayerAttack(bare)),
      equipped: Math.ceil(enemy.maxHp / calculatePlayerAttack(equipped)),
    }]));
    expect(attackCounts).toEqual({ slime: { bare: 4, equipped: 2 }, goblin: { bare: 8, equipped: 4 }, stone_golem: { bare: 16, equipped: 7 }, orc_chief: { bare: 12, equipped: 5 }, ancient_golem: { bare: 18, equipped: 8 } });
    expect(attackCounts.orc_chief.bare).toBeGreaterThan(1);
    expect(attackCounts.ancient_golem.equipped).toBeLessThan(10);
    expect(calculateEnemyCounterDamage(BOSS_CATALOG.ancient_golem.attack, calculatePlayerDefense(equipped))).toBe(3);
    expect(calculateSkillDamage({ playerAttack: calculatePlayerAttack(bare), powerPercent: 125, elementPercent: 150 }).damage).toBe(9);
  });

  it('normalizes Battle v1 through v4 without applying campaign progress to legacy victories', () => {
    [1, 2, 3, 4].forEach((schemaVersion) => {
      const legacy = normalizeBattle({
        schemaVersion,
        battleId: `legacy-${schemaVersion}`,
        enemyId: 'slime',
        enemyHp: 1,
        status: 'active',
        playerSnapshot: { attack: 5, maxHp: 40, skills: {} },
        enemySnapshot: { maxHp: 20, attack: 3, expReward: 20 },
      });
      const final = prepareBattleAttack({ battle: legacy, profile: createEmptyPlayerProfile(), progress: normalizeRpgProgress(), actionId: `legacy-${schemaVersion}-final`, now });
      expect(final.battle.schemaVersion).toBe(schemaVersion);
      expect(final.battle.status).toBe('won');
      expect(final.progress).toBeNull();
    });
  });
});
