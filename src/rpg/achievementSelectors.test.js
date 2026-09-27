import { describe, expect, it } from 'vitest';
import { PARTY_MEMBER_CATALOG } from './partyMemberCatalog.js';
import { totalExpForLevel } from './levelSystem.js';
import { TITLE_CATALOG } from './achievementCatalog.js';
import { deriveAchievements, deriveUnlockedTitles, getSelectedUnlockedTitle, isTitleUnlocked } from './achievementSelectors.js';

const validSession = (id, date, recordedSeconds = 60, subjectId = 's_math', extra = {}) => ({
  id,
  date,
  recordedSeconds,
  taskSnapshot: { subjectId },
  validation: { status: 'valid', reasonCodes: [] },
  ...extra,
});
const byId = (result, id) => result.find((achievement) => achievement.id === id);

describe('study achievements', () => {
  it('handles zero sessions and completes first session from one valid record', () => {
    expect(byId(deriveAchievements(), 'achievement_first_session')).toMatchObject({ current: 0, completed: false });
    expect(byId(deriveAchievements({ sessions: [validSession('one', '2026-09-01')] }), 'achievement_first_session')).toMatchObject({ current: 1, completed: true });
  });

  it('evaluates cumulative ten hours and daily two hours on both sides of the boundary', () => {
    const below = deriveAchievements({ sessions: Array.from({ length: 6 }, (_, index) => validSession(`below-${index}`, `2026-09-0${index + 1}`, 5_999)) });
    expect(byId(below, 'achievement_study_10h').completed).toBe(false);
    expect(byId(below, 'achievement_daily_2h').completed).toBe(false);
    const reached = deriveAchievements({ sessions: Array.from({ length: 5 }, (_, index) => validSession(`reached-${index}`, `2026-09-0${index + 1}`, 7_200)) });
    expect(byId(reached, 'achievement_study_10h')).toMatchObject({ current: 36_000, completed: true });
    expect(byId(reached, 'achievement_daily_2h')).toMatchObject({ current: 7_200, completed: true });
  });

  it('finds the longest streak and resets it when a date is skipped', () => {
    const two = [validSession('1', '2026-09-01'), validSession('2', '2026-09-02'), validSession('4', '2026-09-04')];
    expect(byId(deriveAchievements({ sessions: two }), 'achievement_streak_3')).toMatchObject({ current: 2, completed: false });
    const three = [...two, validSession('5', '2026-09-05'), validSession('6', '2026-09-06')];
    expect(byId(deriveAchievements({ sessions: three }), 'achievement_streak_3')).toMatchObject({ current: 3, completed: true });
  });

  it('counts study days and known subjects within the existing ISO week boundary', () => {
    const weekdays = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'];
    const fourDays = weekdays.map((date, index) => validSession(`d${index}`, date, 60, index < 2 ? 's_math' : 's_english'));
    const below = deriveAchievements({ sessions: [...fourDays, validSession('sunday', '2026-09-27', 60, 's_science'), validSession('unknown', '2026-09-30', 60, 'unknown'), validSession('missing', '2026-10-01', 60, null)] });
    expect(byId(below, 'achievement_week_5days')).toMatchObject({ current: 4, completed: false });
    expect(byId(below, 'achievement_week_3subjects')).toMatchObject({ current: 2, completed: false });
    const reached = deriveAchievements({ sessions: [...fourDays, validSession('friday', '2026-10-02', 60, 's_science')] });
    expect(byId(reached, 'achievement_week_5days')).toMatchObject({ current: 5, completed: true });
    expect(byId(reached, 'achievement_week_3subjects')).toMatchObject({ current: 3, completed: true });
  });

  it('excludes invalid, pending-review and stale live sessions and uses recorded time after pauses', () => {
    const sessions = [
      validSession('paused', '2026-09-01', 120, 's_math', { segments: [{ durationSeconds: 60 }, { durationSeconds: 60 }] }),
      validSession('invalid', '2026-09-01', 10_000, 's_math', { validation: { status: 'invalid' } }),
      validSession('pending', '2026-09-01', 10_000, 's_math', { validation: { status: 'pending_review' } }),
      validSession('stale', '2026-09-01', 10_000, 's_math', { isLive: true, isStale: true }),
    ];
    const results = deriveAchievements({ sessions });
    expect(byId(results, 'achievement_first_session').current).toBe(1);
    expect(byId(results, 'achievement_study_10h').current).toBe(120);
  });
});

describe('RPG achievements', () => {
  it('evaluates level, equipment, campaign, tower and weekly boss boundaries', () => {
    const below = deriveAchievements({
      playerProfile: { totalExp: totalExpForLevel(5) - 1, ownedEquipment: {}, weeklyBoss: { totalClears: 0 } },
      rpgProgress: { completedChapterIds: [], campaignCompleted: false },
      towerProgress: { highestFloor: 9, bossWins: 0 },
    });
    ['achievement_level_5', 'achievement_first_equipment', 'achievement_chapter1', 'achievement_campaign_complete', 'achievement_tower_10', 'achievement_tower_boss', 'achievement_weekly_boss'].forEach((id) => expect(byId(below, id).completed).toBe(false));

    const reached = deriveAchievements({
      playerProfile: { totalExp: totalExpForLevel(5), ownedEquipment: { iron_sword: {} }, weeklyBoss: { totalClears: 1 } },
      rpgProgress: { completedChapterIds: ['chapter_1'], campaignCompleted: true },
      towerProgress: { highestFloor: 10, bossWins: 1 },
    });
    ['achievement_level_5', 'achievement_first_equipment', 'achievement_chapter1', 'achievement_campaign_complete', 'achievement_tower_10', 'achievement_tower_boss', 'achievement_weekly_boss'].forEach((id) => expect(byId(reached, id).completed).toBe(true));
  });

  it('derives party completion from the current party catalog size', () => {
    const allIds = Object.keys(PARTY_MEMBER_CATALOG);
    expect(byId(deriveAchievements({ playerProfile: { unlockedPartyMemberIds: allIds.slice(0, -1) } }), 'achievement_all_party').completed).toBe(false);
    expect(byId(deriveAchievements({ playerProfile: { unlockedPartyMemberIds: allIds } }), 'achievement_all_party')).toMatchObject({ current: allIds.length, target: allIds.length, completed: true });
  });
});

describe('achievement titles', () => {
  it('unlocks titles only through completed achievements and hides invalid selections', () => {
    const incomplete = deriveAchievements();
    expect(incomplete).toHaveLength(14);
    expect(Object.keys(TITLE_CATALOG)).toHaveLength(8);
    expect(deriveUnlockedTitles(incomplete)).toEqual([]);
    expect(isTitleUnlocked('title_first_step', incomplete)).toBe(false);
    expect(getSelectedUnlockedTitle('title_first_step', [])).toBeNull();
    expect(getSelectedUnlockedTitle(null, [])).toBeNull();

    const completed = deriveAchievements({ sessions: [validSession('one', '2026-09-01')] });
    const titles = deriveUnlockedTitles(completed);
    expect(titles).toContainEqual({ id: 'title_first_step', name: '駆け出し学習者' });
    expect(isTitleUnlocked('title_first_step', completed)).toBe(true);
    expect(getSelectedUnlockedTitle('title_first_step', titles)?.name).toBe('駆け出し学習者');
  });
});
