import { describe, expect, it } from 'vitest';
import { applyBossClearProgress, applyNormalVictoryProgress, isBossUnlocked, normalizeRpgProgress, scaleCampaignEnemy } from './rpgProgress.js';
it('scales a normal enemy from the fifth campaign win, including wins from completed chapters', () => {
  const enemy = { maxHp: 100, attack: 50, expReward: 5 };
  const progress = { currentChapterId: 'chapter_2', completedChapterIds: ['chapter_1'], normalWins: 1 };
  expect(scaleCampaignEnemy(enemy, progress)).toBe(enemy);
  const next = applyNormalVictoryProgress(progress, 'chapter_2', 1);
  expect(scaleCampaignEnemy(enemy, next)).toEqual({ maxHp: 103, attack: 51, expReward: 5 });
  expect(scaleCampaignEnemy(enemy, { ...next, normalWins: 4 })).toEqual(scaleCampaignEnemy(enemy, next));
});

describe('rpg progress', () => { it('normalizes and clamps chapter wins', () => { let progress = normalizeRpgProgress(); expect(progress).toMatchObject({ currentChapterId: 'chapter_1', normalWins: 0 }); progress = applyNormalVictoryProgress(progress, 'chapter_1', 1); progress = applyNormalVictoryProgress(progress, 'chapter_1', 2); progress = applyNormalVictoryProgress(progress, 'chapter_1', 3); progress = applyNormalVictoryProgress(progress, 'chapter_1', 4); expect(progress.normalWins).toBe(3); expect(isBossUnlocked(progress)).toBe(true); }); it('advances chapter 1 then completes chapter 2 without duplicates', () => { const first = applyBossClearProgress({ currentChapterId: 'chapter_1', normalWins: 3 }, 'chapter_1', 1); expect(first).toMatchObject({ currentChapterId: 'chapter_2', normalWins: 0, completedChapterIds: ['chapter_1'], campaignCompleted: false }); const final = applyBossClearProgress({ ...first, normalWins: 4 }, 'chapter_2', 2); expect(final).toMatchObject({ currentChapterId: 'chapter_2', normalWins: 4, completedChapterIds: ['chapter_1', 'chapter_2'], campaignCompleted: true }); }); });
