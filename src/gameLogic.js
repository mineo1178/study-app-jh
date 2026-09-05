export const RPG_START_DATE = '2026-09-05';
export const MAX_SESSION_EXP = 60;
export const LONG_SESSION_MINUTES = 90;
export const REVIEW_SESSION_MINUTES = 120;
export const HIGH_RISK_SESSION_MINUTES = 180;
export const CLOCK_MISMATCH_TOLERANCE_SECONDS = 5 * 60;
export const FOCUS_BONUS_LIMIT_PER_DAY = 3;
export const STALE_RUNNING_THRESHOLD_MS = 15 * 60 * 1000;
export const MAJOR_SUBJECT_IDS = ['s_math', 's_japanese', 's_social', 's_science', 's_english', 'j_math', 'j_japanese', 'j_social', 'j_science', 'j_english'];

export const BOSSES = [
  { chapter: 1, name: 'スライムキング', hp: 600, weaknesses: ['s_math', 'j_math'] },
  { chapter: 2, name: 'オーク将軍', hp: 900, weaknesses: ['s_japanese', 'j_japanese'] },
  { chapter: 3, name: '炎のゴーレム', hp: 1200, weaknesses: ['s_english', 'j_english'] },
  { chapter: 4, name: '氷の魔女', hp: 1500, weaknesses: ['s_science', 'j_science'] },
  { chapter: 5, name: 'ドラゴン', hp: 1900, weaknesses: ['s_social', 'j_social'] },
  { chapter: 6, name: '魔王軍四天王', hp: 2400, weaknesses: ['e_programming', 'e_news'] },
  { chapter: 7, name: '魔王', hp: 3200, weaknesses: ['s_math', 's_english', 'j_math', 'j_english'] },
];

export const ITEMS = [
  { id: 'wooden-sword', name: '木の剣', description: 'Lv.3で獲得', unlock: ({ level }) => level >= 3 },
  { id: 'iron-sword', name: '鉄の剣', description: 'Lv.5で獲得', unlock: ({ level }) => level >= 5 },
  { id: 'magic-shield', name: '魔法の盾', description: 'Lv.8で獲得', unlock: ({ level }) => level >= 8 },
  { id: 'flame-sword', name: '炎の剣', description: 'Lv.10で獲得', unlock: ({ level }) => level >= 10 },
  { id: 'wisdom-sword', name: '知恵の剣', description: '数学120分で獲得', unlock: ({ subjectMinutes }) => subjectMinutes.math >= 120 },
  { id: 'grimoire', name: '魔導書', description: '英語120分で獲得', unlock: ({ subjectMinutes }) => subjectMinutes.english >= 120 },
];

export const SKILLS = [
  { id: 'double-strike', name: '連続攻撃', description: 'Lv.5で解放', unlock: ({ level }) => level >= 5 },
  { id: 'exp-boost', name: 'EXPブースト', description: 'Lv.10で解放', unlock: ({ level }) => level >= 10 },
  { id: 'calculation-mastery', name: '計算の極意', description: '数学300分で解放', unlock: ({ subjectMinutes }) => subjectMinutes.math >= 300 },
  { id: 'magic-awakening', name: '魔力覚醒', description: '英語300分で解放', unlock: ({ subjectMinutes }) => subjectMinutes.english >= 300 },
];

export function recordedStudyMinutes(record) {
  return Math.max(0, Math.floor((Number(record?.duration) || 0) / 60));
}

export function sessionExp(durationSeconds) {
  return Math.min(MAX_SESSION_EXP, Math.max(0, Math.floor((Number(durationSeconds) || 0) / 60)));
}

export function elapsedSeconds(sessionStartTime, now = Date.now(), isRunning = true) {
  if (!isRunning || !sessionStartTime) return 0;
  return Math.max(0, Math.floor((Number(now) - Number(sessionStartTime)) / 1000));
}

function validTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function localDateString(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}

export function getLastHeartbeatTime(task) {
  return validTimestamp(task?.lastHeartbeatAt) || validTimestamp(task?.lastUpdatedAt) || validTimestamp(task?.sessionStartTime);
}

export function isStaleRunningTask(task, now = Date.now()) {
  if (!task?.isRunning || !task?.sessionStartTime) return false;
  const lastHeartbeat = getLastHeartbeatTime(task);
  if (!lastHeartbeat) return false;
  return Number(now) - lastHeartbeat >= STALE_RUNNING_THRESHOLD_MS;
}

export function getStaleSessionRecoveryDuration(task, recoveryEndTime) {
  if (!task?.sessionStartTime) return Math.max(0, Number(task?.currentDuration) || 0);
  return (Number(task?.currentDuration) || 0) + elapsedSeconds(task.sessionStartTime, recoveryEndTime, true);
}

export function validateStaleRecoveryEndTime(task, recoveryEndTime, now = Date.now()) {
  const endTime = validTimestamp(recoveryEndTime);
  const startedAt = validTimestamp(task?.sessionStartTime);
  if (!endTime || !startedAt) return { valid: false, reason: 'invalid' };
  if (endTime < startedAt) return { valid: false, reason: 'beforeStart' };
  if (endTime > Number(now)) return { valid: false, reason: 'future' };
  return { valid: true, endTime };
}

export function timerStateAfterContinueRunning(task, now) {
  if (!task?.isRunning || !task?.sessionStartTime) return task;
  return { ...task, lastHeartbeatAt: now, lastUpdatedAt: now };
}

export function staleRecoveryHistoryId(task, recoveryEndTime) {
  return `recovered-${task?.id || 'task'}-${task?.sessionStartTime || 'unknown'}-${Number(recoveryEndTime) || 0}`;
}

export function taskStateAfterStaleRecovery(task, recoveryEndTime, memo = '', now = Date.now()) {
  const validation = validateStaleRecoveryEndTime(task, recoveryEndTime, now);
  if (!validation.valid) return { valid: false, reason: validation.reason, task };
  const endedAt = validation.endTime;
  const historyItem = {
    id: staleRecoveryHistoryId(task, endedAt),
    date: localDateString(endedAt),
    duration: getStaleSessionRecoveryDuration(task, endedAt),
    memo,
    startedAt: task.sessionStartTime,
    endedAt,
  };
  const history = task.history || [];
  const alreadySaved = history.some((item) => item.id === historyItem.id);
  return {
    valid: true,
    alreadySaved,
    historyItem,
    task: {
      ...task,
      history: alreadySaved ? history : [...history, historyItem],
      currentDuration: 0,
      isRunning: false,
      sessionStartTime: null,
      lastUpdatedAt: now,
      lastHeartbeatAt: endedAt,
    },
  };
}

export function timerStateAfterStart(task, now, hasOtherRunning = false) {
  if (hasOtherRunning || task?.isRunning) return task;
  return { ...task, isRunning: true, sessionStartTime: now, lastUpdatedAt: now, lastHeartbeatAt: now };
}

export function timerStateAfterPause(task, now) {
  if (!task?.isRunning || !task?.sessionStartTime) return task;
  return {
    ...task,
    isRunning: false,
    currentDuration: (task.currentDuration || 0) + elapsedSeconds(task.sessionStartTime, now),
    sessionStartTime: null,
    lastUpdatedAt: now,
    lastHeartbeatAt: now,
  };
}

export function totalSecondsForFinish(task, now) {
  return (task?.currentDuration || 0) + elapsedSeconds(task?.sessionStartTime, now, task?.isRunning !== false);
}

export function levelRequirement(level) {
  return 100 + Math.max(0, level - 1) * 20;
}

export function levelFromExp(totalExp) {
  let remaining = Math.max(0, Math.floor(totalExp));
  let level = 1;
  while (remaining >= levelRequirement(level)) {
    remaining -= levelRequirement(level);
    level += 1;
  }
  const expForNext = levelRequirement(level);
  return { level, totalExp: Math.max(0, Math.floor(totalExp)), expIntoLevel: remaining, expForNext, expToNext: expForNext - remaining };
}

export function recordIntegrity(record) {
  const recordedSeconds = Math.max(0, Number(record?.duration) || 0);
  const recordedMinutes = Math.floor(recordedSeconds / 60);
  const startedAt = Number(record?.startedAt) || 0;
  const endedAt = Number(record?.endedAt) || 0;
  const hasClockRange = startedAt > 0 && endedAt > 0;
  const clockSeconds = hasClockRange ? Math.floor((endedAt - startedAt) / 1000) : null;
  const startsAfterEnd = hasClockRange && clockSeconds < 0;
  const durationMismatch = hasClockRange && !startsAfterEnd && Math.abs(recordedSeconds - clockSeconds) > CLOCK_MISMATCH_TOLERANCE_SECONDS;
  const flags = [];

  if (recordedMinutes > LONG_SESSION_MINUTES) flags.push('longSession');
  if (recordedMinutes > REVIEW_SESSION_MINUTES) flags.push('reviewSession');
  if (recordedMinutes > HIGH_RISK_SESSION_MINUTES) flags.push('highRiskSession');
  if (startsAfterEnd) flags.push('startsAfterEnd');
  if (durationMismatch) flags.push('clockMismatch');

  return {
    recordedDuration: recordedSeconds,
    recordedMinutes,
    hasClockRange,
    clockSeconds,
    startsAfterEnd,
    durationMismatch,
    needsReview: flags.length > 0,
    flags,
  };
}

function overlapSeconds(start, end, intervals) {
  if (!start || !end || end <= start) return 0;
  return intervals.reduce((total, interval) => {
    const overlapStart = Math.max(start, interval.start);
    const overlapEnd = Math.min(end, interval.end);
    return total + Math.max(0, overlapEnd - overlapStart);
  }, 0);
}

export function getCreditedStudySeconds(record, previousIntervals = []) {
  const integrity = recordIntegrity(record);
  if (!record?.date || record.date < RPG_START_DATE || integrity.startsAfterEnd) {
    return { creditedDuration: 0, integrity, overlapDuration: 0 };
  }

  const capSeconds = MAX_SESSION_EXP * 60;
  let eligibleSeconds = Math.min(integrity.recordedDuration, capSeconds);
  if (integrity.hasClockRange && integrity.clockSeconds !== null) {
    eligibleSeconds = Math.min(eligibleSeconds, Math.max(0, integrity.clockSeconds));
  }

  let overlapDuration = 0;
  if (integrity.hasClockRange && eligibleSeconds > 0) {
    const creditStart = Number(record.startedAt);
    const creditEnd = creditStart + eligibleSeconds * 1000;
    overlapDuration = Math.min(eligibleSeconds, Math.floor(overlapSeconds(creditStart, creditEnd, previousIntervals) / 1000));
  }

  return {
    creditedDuration: Math.max(0, eligibleSeconds - overlapDuration),
    integrity: {
      ...integrity,
      needsReview: integrity.needsReview || overlapDuration > 0,
      flags: overlapDuration > 0 ? [...integrity.flags, 'overlap'] : integrity.flags,
    },
    overlapDuration,
  };
}

export function collectStudyRecords(tasks = []) {
  const rawRecords = tasks.flatMap((task) => (task.history || []).map((history) => ({
    ...history,
    taskId: task.id,
    taskTitle: task.title,
    categoryId: task.categoryId,
    subjectId: task.subjectId,
  }))).sort((a, b) => (a.startedAt || a.endedAt || 0) - (b.startedAt || b.endedAt || 0));

  const creditedIntervals = [];
  return rawRecords.map((record) => {
    const credited = getCreditedStudySeconds(record, creditedIntervals);
    if (credited.creditedDuration > 0 && record.startedAt) {
      creditedIntervals.push({ start: Number(record.startedAt), end: Number(record.startedAt) + credited.creditedDuration * 1000 });
    }
    return {
      ...record,
      recordedDuration: Math.max(0, Number(record.duration) || 0),
      creditedDuration: credited.creditedDuration,
      exp: sessionExp(credited.creditedDuration),
      integrity: credited.integrity,
      overlapDuration: credited.overlapDuration,
    };
  });
}

function uniqueDates(records) {
  return [...new Set(records.map((record) => record.date).filter(Boolean))];
}

function subjectFamily(subjectId) {
  if (subjectId?.endsWith('_math')) return 'math';
  if (subjectId?.endsWith('_english')) return 'english';
  if (subjectId?.endsWith('_japanese')) return 'japanese';
  if (subjectId?.endsWith('_science')) return 'science';
  if (subjectId?.endsWith('_social')) return 'social';
  return subjectId || 'other';
}

export function subjectBalance(records, date) {
  const today = records.filter((record) => record.date === date && record.creditedDuration > 0);
  const subjectCount = new Set(today.map((record) => subjectFamily(record.subjectId))).size;
  return {
    subjectCount,
    expMultiplier: subjectCount >= 3 ? 1.1 : subjectCount >= 2 ? 1.05 : 1,
    chest: subjectCount >= 3,
    damageMultiplier: subjectCount >= 4 ? 1.1 : 1,
  };
}

export function unstudiedMajorQuest(records, date) {
  const studied = new Set(records.filter((record) => record.date === date && record.creditedDuration > 0).map((record) => record.subjectId));
  const candidate = MAJOR_SUBJECT_IDS.find((id) => !studied.has(id));
  if (!candidate) return null;
  return { id: 'unstudiedMajor', label: '今日まだの主要教科を15分', reward: 'EXP +5', subjectId: candidate, achieved: false, remaining: 15 };
}

export function dailyQuestStatus(records, date) {
  const today = records.filter((record) => record.date === date);
  const minutes = Math.floor(today.reduce((sum, record) => sum + (Number(record.creditedDuration ?? record.duration) || 0), 0) / 60);
  const subjectCount = new Set(today.filter((record) => (record.creditedDuration ?? record.duration) > 0).map((record) => subjectFamily(record.subjectId))).size;
  const baseQuests = [
    { id: 'start', label: '10分以上勉強する', reward: 'EXP +5', achieved: minutes >= 10, remaining: Math.max(0, 10 - minutes) },
    { id: 'subjects', label: '2教科勉強する', reward: 'ボスへ +50 DAMAGE', achieved: subjectCount >= 2, remaining: Math.max(0, 2 - subjectCount) },
    { id: 'focus', label: '合計30分勉強する', reward: '宝箱', achieved: minutes >= 30, remaining: Math.max(0, 30 - minutes) },
  ];
  const dynamicQuest = unstudiedMajorQuest(records, date);
  const quests = dynamicQuest ? [...baseQuests, dynamicQuest] : baseQuests;
  return { date, minutes, subjectCount, quests, completedCount: quests.filter((quest) => quest.achieved).length };
}

export function focusBonus(records) {
  return uniqueDates(records).reduce((sum, date) => {
    const count = records.filter((record) => {
      const minutes = Math.floor((Number(record.creditedDuration) || 0) / 60);
      return record.date === date && minutes >= 10 && minutes <= 60 && !record.integrity?.needsReview;
    }).length;
    return sum + Math.min(FOCUS_BONUS_LIMIT_PER_DAY, count) * 3;
  }, 0);
}

export function questBonuses(records) {
  return uniqueDates(records).reduce((total, date) => {
    const status = dailyQuestStatus(records, date);
    const balance = subjectBalance(records, date);
    return {
      exp: total.exp + (status.quests[0].achieved ? 5 : 0) + (status.quests.some((quest) => quest.id === 'unstudiedMajor' && quest.achieved) ? 5 : 0),
      damage: total.damage + (status.quests[1].achieved ? 50 : 0),
      chests: total.chests + (status.quests[2].achieved ? 1 : 0) + (balance.chest ? 1 : 0),
    };
  }, { exp: focusBonus(records), damage: 0, chests: 0 });
}

export function subjectMinutes(records) {
  const totals = { math: 0, english: 0 };
  records.forEach((record) => {
    const minutes = (Number(record.creditedDuration ?? record.duration) || 0) / 60;
    if (record.subjectId === 's_math' || record.subjectId === 'j_math') totals.math += minutes;
    if (record.subjectId === 's_english' || record.subjectId === 'j_english') totals.english += minutes;
  });
  return totals;
}

export function damageForRecord(record, boss, balance = { damageMultiplier: 1 }) {
  const base = sessionExp(record.creditedDuration ?? record.duration) * 5;
  const weaknessMultiplier = boss?.weaknesses?.includes(record.subjectId) ? 1.5 : 1;
  return Math.floor(base * weaknessMultiplier * (balance.damageMultiplier || 1));
}

export function bossProgress(records) {
  let bossIndex = 0;
  let damageOnBoss = 0;
  const defeated = [];
  records.forEach((record) => {
    const balance = subjectBalance(records, record.date);
    let damage = damageForRecord(record, BOSSES[bossIndex], balance);
    while (damage > 0 && bossIndex < BOSSES.length) {
      const boss = BOSSES[bossIndex];
      const needed = boss.hp - damageOnBoss;
      if (damage < needed) {
        damageOnBoss += damage;
        damage = 0;
      } else {
        damage -= needed;
        defeated.push(boss);
        bossIndex += 1;
        damageOnBoss = 0;
      }
    }
  });
  let bonus = questBonuses(records).damage;
  while (bonus > 0 && bossIndex < BOSSES.length) {
    const boss = BOSSES[bossIndex];
    const needed = boss.hp - damageOnBoss;
    if (bonus < needed) {
      damageOnBoss += bonus;
      break;
    }
    bonus -= needed;
    defeated.push(boss);
    bossIndex += 1;
    damageOnBoss = 0;
  }
  const boss = BOSSES[bossIndex] || null;
  return { boss, bossIndex, defeated, damageOnBoss, hpRemaining: boss ? boss.hp - damageOnBoss : 0 };
}

export function weeklyAdventureDays(records, today) {
  const current = new Date(`${today}T12:00:00`);
  const mondayOffset = (current.getDay() + 6) % 7;
  const weekStart = new Date(current);
  weekStart.setDate(current.getDate() - mondayOffset);
  const start = weekStart.toISOString().slice(0, 10);
  const end = new Date(weekStart);
  end.setDate(weekStart.getDate() + 6);
  const finish = end.toISOString().slice(0, 10);
  const days = uniqueDates(records.filter((record) => record.creditedDuration > 0)).filter((date) => date >= start && date <= finish && date <= today).length;
  return { days, target: 5, remaining: Math.max(0, 5 - days), start, end: finish };
}

export function weeklyMissions(records, today) {
  const weekly = weeklyAdventureDays(records, today);
  const weekRecords = records.filter((record) => record.date >= weekly.start && record.date <= weekly.end && record.date <= today && record.creditedDuration > 0);
  const subjectCount = new Set(weekRecords.map((record) => subjectFamily(record.subjectId))).size;
  const focusSessions = weekRecords.filter((record) => {
    const minutes = Math.floor((Number(record.creditedDuration) || 0) / 60);
    return minutes >= 10 && minutes <= 60 && !record.integrity?.needsReview;
  }).length;
  return [
    { id: 'weekly-days', label: '今週5日冒険', achieved: weekly.days >= 5, remaining: Math.max(0, 5 - weekly.days) },
    { id: 'weekly-subjects', label: '今週3教科以上を学習', achieved: subjectCount >= 3, remaining: Math.max(0, 3 - subjectCount) },
    { id: 'weekly-focus', label: '今週5回FOCUS SESSION', achieved: focusSessions >= 5, remaining: Math.max(0, 5 - focusSessions) },
  ];
}

export function gameProgress(tasks, today) {
  const records = collectStudyRecords(tasks);
  const bonuses = questBonuses(records);
  const rawExp = records.reduce((sum, record) => sum + record.exp, 0);
  const balancedExp = uniqueDates(records).reduce((sum, date) => {
    const dateRecords = records.filter((record) => record.date === date);
    const dayExp = dateRecords.reduce((daySum, record) => daySum + record.exp, 0);
    return sum + Math.floor(dayExp * subjectBalance(records, date).expMultiplier);
  }, 0);
  const levelInfo = levelFromExp(balancedExp + bonuses.exp);
  const subjectTotals = subjectMinutes(records);
  const unlockContext = { level: levelInfo.level, subjectMinutes: subjectTotals };
  return {
    records,
    rawExp,
    levelInfo,
    boss: bossProgress(records),
    daily: dailyQuestStatus(records, today),
    weekly: weeklyAdventureDays(records, today),
    weeklyMissions: weeklyMissions(records, today),
    balance: subjectBalance(records, today),
    items: ITEMS.filter((item) => item.unlock(unlockContext)),
    skills: SKILLS.filter((skill) => skill.unlock(unlockContext)),
    chests: bonuses.chests,
    reviewRecords: records.filter((record) => record.integrity?.needsReview),
  };
}
