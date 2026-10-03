import { getValidStudySessions } from '../data/studySessionSelectors.js';
import { timestampForStudyDate } from '../rpg/achievementSelectors.js';
import { DAILY_TARGET_SECONDS } from '../studyTargets.js';
import { ACHIEVEMENT_CATALOG } from '../rpg/achievementCatalog.js';
import { getWeeklyBossWeekId, isWeeklyBossCleared } from '../rpg/weeklyBossCatalog.js';
import { getChapter } from '../rpg/chapterCatalog.js';
import { battleEnergyState, battleIsActive } from '../rpg/battleUiLogic.js';
import { ENEMY_CATALOG } from '../rpg/enemyCatalog.js';
import { buildTowerEncounter } from '../rpg/towerCatalog.js';
import { getWeeklyBossDefinition } from '../rpg/weeklyBossCatalog.js';

export const dashboardDuration = (seconds) => {
  const minutes = Math.ceil(Math.max(0, Number(seconds) || 0) / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ''}` : `${minutes}分`;
};

export function deriveDashboardSummary({ sessions = [], now, ready = false, rewardProgress = { status: 'loading', goals: [] }, rpgProgress, towerProgress, playerProfile, achievements = [], grades = [], rpgReady = false, gradesReady = false, battle, pendingBattle = false } = {}) {
  if (!ready || !Number.isFinite(now)) return { status: 'loading', actions: [] };
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(now));
  const weekId = getWeeklyBossWeekId(now);
  const dates = new Set(), subjects = new Set(), todaySubjects = new Set(), seen = new Set();
  let todaySeconds = 0, weekSeconds = 0, todayCount = 0;
  // One pass over effective records; recordedSeconds already excludes pauses.
  for (const session of getValidStudySessions(sessions)) {
    if (session.isStale || session.isLive) continue;
    const key = session.timerId || session.id;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const timestamp = timestampForStudyDate(session.date);
    const seconds = Number(session.recordedSeconds);
    if (timestamp === null || !Number.isFinite(seconds) || seconds < 0) continue;
    const subject = session.taskSnapshot?.subjectId;
    const knownSubject = typeof subject === 'string' && subject.trim() && subject !== 'unknown';
    if (session.date === today) {
      todaySeconds += seconds; todayCount += 1;
      if (knownSubject) todaySubjects.add(subject);
    }
    if (getWeeklyBossWeekId(timestamp) === weekId) {
      weekSeconds += seconds; dates.add(session.date);
      if (knownSubject) subjects.add(subject);
    }
  }
  const daysTarget = ACHIEVEMENT_CATALOG.find(a => a.id === 'achievement_week_5days').target;
  const subjectsTarget = ACHIEVEMENT_CATALOG.find(a => a.id === 'achievement_week_3subjects').target;
  const remaining = Math.max(0, DAILY_TARGET_SECONDS - todaySeconds);
  const actions = [];
  const add = (id, title, detail, action, tab) => actions.push({ id, title, detail, action, tab });
  if (remaining) add('daily', `今日の目標まであと${dashboardDuration(remaining)}`, '今日の目標は未達成です。学習を積み重ねましょう', '学習項目を選ぶ', 'study');
  if (dates.size < daysTarget) add('days', `週5日学習まであと${daysTarget - dates.size}日`, 'まだ学習していない日に取り組みましょう', '学習を記録する', 'study');
  if (subjects.size < subjectsTarget) add('subjects', `週3教科まであと${subjectsTarget - subjects.size}教科`, '今週まだ取り組んでいない教科を選びましょう', '教科を選ぶ', 'study');
  const goals = rewardProgress.goals || [];
  if (rewardProgress.status === 'ready') {
    for (const goal of [...goals].sort((a, b) => Number(b.available) - Number(a.available))) {
      const missing = goal.requirements.filter(r => r.remaining > 0).map(r => `${r.remaining}${r.unit}`).join('・');
      add(goal.id, goal.available ? goal.id === 'gacha' ? 'ガチャできます' : '装備を入手できます' : goal.id === 'gacha' ? `次のガチャまであと${goal.remainingMinutes}分が目安` : `次の装備：${goal.name}`, goal.available ? goal.name : `あと${missing}（ほかに使わない場合）`, 'RPGで確認する', 'rpg');
    }
  }
  const chapter = rpgReady && getChapter(rpgProgress?.currentChapterId);
  const cleared = rpgReady && isWeeklyBossCleared(playerProfile, weekId);
  const towerKnown = Number.isFinite(towerProgress?.highestFloor) && Number.isFinite(towerProgress?.currentFloor) && towerProgress.currentFloor >= 1;
  const rpg = rpgReady ? {
    campaign: rpgProgress?.campaignCompleted ? 'Campaignクリア！' : chapter ? `Chapter ${chapter.number}進行中` : 'RPG未開始',
    tower: rpgProgress?.campaignCompleted ? towerKnown ? `最高${towerProgress.highestFloor}F / 次は${towerProgress.currentFloor}F` : 'Towerの進行を確認しています…' : 'Tower：Campaignクリアで解放',
    weekly: cleared ? '今週のWeekly Bossは討伐済み' : rpgProgress?.campaignCompleted ? '今週のWeekly Bossは未討伐' : '今週のWeekly Bossは未討伐（Campaignクリアで解放）',
  } : null;
  if (rpg && !battleIsActive(battle) && !playerProfile?.activeBattleId && !pendingBattle) {
    const available = enemy => battleEnergyState(playerProfile, enemy).sufficient;
    if (!rpgProgress?.campaignCompleted && chapter?.normalEnemyIds.some(id => available(ENEMY_CATALOG[id]))) add('campaign', 'Campaignの次戦に挑戦できます', rpg.campaign, 'RPGへ', 'rpg');
    if (rpgProgress?.campaignCompleted) {
      if (!cleared && available(getWeeklyBossDefinition(now))) add('weekly', '今週のWeekly Bossに挑戦できます', '今週は未討伐', 'RPGへ', 'rpg');
      if (towerKnown && available(buildTowerEncounter({ floor: towerProgress.currentFloor }))) add('tower', `Tower ${towerProgress.currentFloor}Fに挑戦できます`, rpg.tower, 'RPGへ', 'rpg');
    }
  }
  const achievement = (rpgReady ? achievements : []).filter(a => !a.completed && Number.isFinite(a.current) && Number.isFinite(a.target) && a.target > 0 && a.current > 0).sort((a,b) => b.current / b.target - a.current / a.target)[0] || null;
  return { status: 'ready', todaySeconds, todayCount, todaySubjects: todaySubjects.size, target: DAILY_TARGET_SECONDS, remaining, percent: Math.min(100, Math.round(todaySeconds / DAILY_TARGET_SECONDS * 100)), weekSeconds, weekDays: dates.size, weekSubjects: subjects.size, actions: actions.slice(0,3), rewardProgress, rpg, achievement, latestGrade: gradesReady ? grades.find(g => g.date) || null : undefined };
}
