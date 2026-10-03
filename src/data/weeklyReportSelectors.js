import { getValidStudySessions } from './studySessionSelectors.js';
import { deriveWeeklyGoalProgress, timestampForStudyDate } from '../rpg/achievementSelectors.js';
import { getNextWeeklyBossResetAt, getWeeklyBossWeekId } from '../rpg/weeklyBossCatalog.js';
import { personalStudyTargets } from '../personalStudyGoals.js';

const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;
const studyDate = timestamp => new Date(timestamp + 9 * 3600000).toISOString().slice(0, 10);
export const reportDuration = value => {
  const seconds = Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60;
  return `${hours ? `${hours}時間` : ''}${minutes ? `${minutes}分` : ''}${rest ? `${rest}秒` : ''}` || '0分';
};
const dateLabel = date => date.split('-').map(Number).join('/');
const createWeek = (startAt, today) => {
  const days = Array.from({ length: 7 }, (_, index) => ({ date: studyDate(startAt + index * DAY_MS), weekday: ['月','火','水','木','金','土','日'][index], seconds: 0, count: 0, achieved: false }));
  return { id: getWeeklyBossWeekId(startAt), startAt, label: `${dateLabel(days[0].date)} - ${dateLabel(days[6].date)}`, days, seconds: 0, count: 0, subjectIds: new Set(), subjects: new Map(), today };
};

// Effective-record filtering once, followed by one aggregation for all displayed weeks.
export function deriveWeeklyReport({ sessions = [], now, ready = false, subjectDefinitions = {}, studyGoals } = {}) {
  if (!ready || !Number.isFinite(now)) return { status: 'loading', weeks: [] };
  const { dailyTargetSeconds, weeklyTargetSeconds, weeklyStudyDays } = personalStudyTargets(studyGoals);
  const today = studyDate(now);
  const monday = getNextWeeklyBossResetAt(now) - WEEK_MS;
  // The fifth week supplies the previous-week comparison for the oldest selectable week.
  const allWeeks = Array.from({ length: 5 }, (_, offset) => createWeek(monday - offset * WEEK_MS, today));
  const byId = new Map(allWeeks.map(week => [week.id, week]));
  const definitions = Object.values(subjectDefinitions).flat();
  const subjectById = new Map(definitions.map(subject => [subject.id, subject]));
  const seen = new Set();
  for (const session of getValidStudySessions(sessions)) {
    if (session.isStale || session.isLive) continue;
    const key = session.timerId || session.id;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const timestamp = timestampForStudyDate(session.date);
    const seconds = Number(session.recordedSeconds);
    if (timestamp === null || session.date > today || !Number.isFinite(seconds) || seconds < 0) continue;
    const week = byId.get(getWeeklyBossWeekId(timestamp));
    if (!week) continue;
    const day = week.days[Math.floor((timestamp - week.startAt) / DAY_MS)];
    if (!day) continue;
    week.seconds += seconds; week.count += 1; day.seconds += seconds; day.count += 1;
    const subjectId = session.taskSnapshot?.subjectId;
    if (typeof subjectId === 'string' && subjectId.trim() && subjectId !== 'unknown') week.subjectIds.add(subjectId);
    const definition = subjectById.get(subjectId);
    const id = definition ? subjectId : 'other';
    const subject = week.subjects.get(id) || { id, name: definition?.label || 'その他', color: definition?.hex || '#64748b', seconds: 0 };
    subject.seconds += seconds;
    week.subjects.set(id, subject);
  }
  const weeks = allWeeks.map(week => {
    const days = week.days.map(day => ({ ...day, achieved: day.seconds >= dailyTargetSeconds }));
    const learningDays = days.filter(day => day.count > 0).length;
    const goals = deriveWeeklyGoalProgress({ days: learningDays, subjects: week.subjectIds.size });
    const subjects = [...week.subjects.values()].map(subject => ({ ...subject, percent: week.seconds > 0 ? subject.seconds / week.seconds * 100 : 0 })).sort((a,b) => b.seconds - a.seconds);
    const highlights = [];
    const topDay = [...days].sort((a,b) => b.seconds - a.seconds)[0];
    if (topDay.seconds > 0) highlights.push(`最も学習した日：${topDay.weekday}曜日（${reportDuration(topDay.seconds)}）`);
    if (subjects[0]?.seconds > 0) highlights.push(`最も学習した教科：${subjects[0].name}（${reportDuration(subjects[0].seconds)}）`);
    const achievedDays = days.filter(day => day.achieved).length;
    if (achievedDays > 0) highlights.push(`${reportDuration(dailyTargetSeconds)}を達成した日：${achievedDays}日`);
    for (const goal of goals) if (goal.completed) highlights.push(`${goal.name}達成`);
    const hints = goals.map((goal,index) => ({ id: goal.id, text: goal.completed ? `${goal.name}達成` : `あと${goal.target - goal.current}${index === 0 ? '日' : '教科'}で${goal.name}` }));
    const currentDay = days.find(day => day.date === today);
    if (currentDay) hints.push({ id: 'daily', text: currentDay.achieved ? `今日の${reportDuration(dailyTargetSeconds)}目標達成` : `今日あと${reportDuration(dailyTargetSeconds - currentDay.seconds)}で${reportDuration(dailyTargetSeconds)}目標` });
    return { dailyTargetSeconds, weeklyTargetSeconds, weeklyStudyDays, id: week.id, startAt: week.startAt, label: week.label, days, seconds: week.seconds, count: week.count, learningDays, subjectCount: week.subjectIds.size, subjects, highlights: highlights.slice(0,3), hints: hints.slice(0,3) };
  });
  return { status: 'ready', weeks: weeks.slice(0,4).map((week,index) => {
    const previous = weeks[index + 1];
    return { ...week, previous, comparison: previous.count ? { seconds: week.seconds - previous.seconds, learningDays: week.learningDays - previous.learningDays, subjectCount: week.subjectCount - previous.subjectCount, count: week.count - previous.count } : null };
  }) };
}

export const moveReportWeek = (index, direction, weekCount = 4) => Math.max(0, Math.min(weekCount - 1, index + direction));
