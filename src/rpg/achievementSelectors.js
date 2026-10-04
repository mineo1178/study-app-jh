import { getValidStudySessions } from '../data/studySessionSelectors.js';
import { ACHIEVEMENT_CATALOG, getTitle } from './achievementCatalog.js';
import { CHAPTER_CATALOG } from './chapterCatalog.js';
import { levelForTotalExp } from './levelSystem.js';
import { PARTY_MEMBER_CATALOG } from './partyMemberCatalog.js';
import { getWeeklyBossWeekId } from './weeklyBossCatalog.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const chapterOneId = Object.values(CHAPTER_CATALOG).find((chapter) => chapter.number === 1)?.id || null;

export const timestampForStudyDate = (date) => {
  if (!DATE_PATTERN.test(date || '')) return null;
  const utcTimestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(utcTimestamp) && new Date(utcTimestamp).toISOString().slice(0, 10) === date
    ? Date.parse(`${date}T00:00:00+09:00`)
    : null;
};

const formatHours = (seconds) => {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return minutes ? `${hours}時間${minutes}分` : `${hours}時間`;
};

export const consecutiveDays = (dates) => {
  const sorted = [...dates].sort();
  let longest = 0;
  let current = 0;
  let previous = null;
  for (const date of sorted) {
    const day = Date.parse(`${date}T00:00:00Z`) / 86400000;
    current = previous !== null && day === previous + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = day;
  }
  return longest;
};

const summarizeStudy = (sessions) => {
  const days = new Map();
  const weeks = new Map();
  const seen = new Set();
  let sessionCount = 0;
  let totalSeconds = 0;

  for (const session of getValidStudySessions(sessions)) {
    if (session?.isStale) continue;
    const key = session.timerId || session.id;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const seconds = Math.max(0, Number(session.recordedSeconds) || 0);
    sessionCount += 1;
    totalSeconds += seconds;
    const dateTimestamp = timestampForStudyDate(session.date);
    if (dateTimestamp === null) continue;
    days.set(session.date, (days.get(session.date) || 0) + seconds);
    const weekId = getWeeklyBossWeekId(dateTimestamp);
    const week = weeks.get(weekId) || { dates: new Set(), subjects: new Set() };
    week.dates.add(session.date);
    const subjectId = session.taskSnapshot?.subjectId;
    if (typeof subjectId === 'string' && subjectId.trim() && subjectId !== 'unknown') week.subjects.add(subjectId);
    weeks.set(weekId, week);
  }

  return {
    sessionCount,
    totalSeconds,
    bestDaySeconds: Math.max(0, ...days.values()),
    longestStreak: consecutiveDays(days.keys()),
    bestWeekDays: Math.max(0, ...[...weeks.values()].map((week) => week.dates.size)),
    bestWeekSubjects: Math.max(0, ...[...weeks.values()].map((week) => week.subjects.size)),
  };
};

const makeResult = (id, current, progressText, targetOverride) => {
  const definition = ACHIEVEMENT_CATALOG.find((item) => item.id === id);
  const target = targetOverride ?? definition.target;
  return { ...definition, target, current, completed: current >= target, progressText };
};

export const deriveWeeklyGoalProgress = ({ days = 0, subjects = 0 } = {}) => [
  makeResult('achievement_week_5days', days, `${days} / 5日`),
  makeResult('achievement_week_3subjects', subjects, `${subjects} / 3教科`),
];

export function deriveAchievements({ sessions = [], playerProfile = {}, rpgProgress = {}, towerProgress = {} } = {}) {
  const study = summarizeStudy(sessions);
  const level = levelForTotalExp(playerProfile.totalExp);
  const equipmentCount = Object.keys(playerProfile.ownedEquipment || {}).length;
  const chapterOneComplete = chapterOneId && (rpgProgress.completedChapterIds || []).includes(chapterOneId) ? 1 : 0;
  const campaignComplete = rpgProgress.campaignCompleted === true ? 1 : 0;
  const highestFloor = Math.max(0, Math.floor(Number(towerProgress.highestFloor) || 0));
  const bossWins = Math.max(0, Math.floor(Number(towerProgress.bossWins) || 0));
  const weeklyBossClears = Math.max(0, Math.floor(Number(playerProfile.weeklyBoss?.totalClears) || 0));
  const partyIds = Object.keys(PARTY_MEMBER_CATALOG);
  const unlockedIds = new Set((playerProfile.unlockedPartyMemberIds || []).filter((id) => PARTY_MEMBER_CATALOG[id]));

  return [
    makeResult('achievement_first_session', study.sessionCount, `${study.sessionCount} / 1回`),
    makeResult('achievement_study_10h', study.totalSeconds, `${formatHours(study.totalSeconds)} / 10時間`),
    makeResult('achievement_daily_2h', study.bestDaySeconds, `${formatHours(study.bestDaySeconds)} / 2時間`),
    makeResult('achievement_streak_3', study.longestStreak, `${study.longestStreak} / 3日`),
    ...deriveWeeklyGoalProgress({ days: study.bestWeekDays, subjects: study.bestWeekSubjects }),
    makeResult('achievement_level_5', level, `Lv.${level} / Lv.5`),
    makeResult('achievement_first_equipment', equipmentCount, `${equipmentCount} / 1個`),
    makeResult('achievement_chapter1', chapterOneComplete, `${chapterOneComplete} / 1章`),
    makeResult('achievement_campaign_complete', campaignComplete, `${campaignComplete} / 1回`),
    makeResult('achievement_tower_10', highestFloor, `${highestFloor} / 10階`),
    makeResult('achievement_tower_boss', bossWins, `${bossWins} / 1体`),
    makeResult('achievement_weekly_boss', weeklyBossClears, `${weeklyBossClears} / 1体`),
    makeResult('achievement_all_party', unlockedIds.size, `${unlockedIds.size} / ${partyIds.length}人`, partyIds.length),
  ];
}

export const deriveUnlockedTitles = (achievements = []) => achievements
  .filter((achievement) => achievement.completed && achievement.unlocksTitleId)
  .map((achievement) => getTitle(achievement.unlocksTitleId))
  .filter(Boolean);

export const getSelectedUnlockedTitle = (selectedTitleId, unlockedTitles = []) => unlockedTitles.find((title) => title.id === selectedTitleId) || null;

export const isTitleUnlocked = (titleId, achievements = []) => titleId === null || achievements.some((achievement) => achievement.completed && achievement.unlocksTitleId === titleId);
