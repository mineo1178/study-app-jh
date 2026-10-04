import { consecutiveDays, timestampForStudyDate } from '../rpg/achievementSelectors.js';
import { getNextWeeklyBossResetAt, getWeeklyBossWeekId } from '../rpg/weeklyBossCatalog.js';
import { monthlyStudyDate } from './monthlyStudySelectors.js';
import { personalStudyTargets } from '../personalStudyGoals.js';

const DAY = 86400000, WEEK = 7 * DAY;
const dateLabel = date => `${Number(date.slice(5,7))}/${Number(date.slice(8))}`;

// Reuses the calendar's one-pass effective-record index. Period switches only
// traverse date/subject aggregates, never the original session array.
export function deriveStudyAnalytics(index, now, period = 4, studyGoals) {
  if (index.status !== 'ready' || !Number.isFinite(now)) return { status: 'loading' };
  const count = period === 8 ? 8 : 4;
  const monday = getNextWeeklyBossResetAt(now) - WEEK;
  const allWeeks = Array.from({ length: 8 },(_,offset) => {
    const startAt = monday - (7-offset) * WEEK;
    const startDate = monthlyStudyDate(startAt), endDate = monthlyStudyDate(startAt + 6 * DAY);
    return { id: getWeeklyBossWeekId(startAt), startAt, label: `${dateLabel(startDate)}〜${dateLabel(endDate)}`, seconds: 0, studyDays: 0, records: 0, current: offset === 7 };
  });
  const weekById = new Map(allWeeks.map(week => [week.id,week]));
  const weekdays = ['月','火','水','木','金','土','日'].map(label => ({ label, seconds: 0, studyDays: 0, averageSeconds: 0 }));
  const subjects = new Map(), recentSubjects = new Map(), previousSubjects = new Map(), comparisonDefinitions = new Map();
  const dates = [...index.days.keys()].sort();
  const earliest = dates.length ? timestampForStudyDate(dates[0]) : null;
  const oldestWeek = earliest === null ? null : getNextWeeklyBossResetAt(earliest) - WEEK;
  const periodStart = monday - (count-1) * WEEK;
  const { dailyTargetSeconds } = personalStudyTargets(studyGoals);
  let seconds = 0, studyDays = 0, achievedDays = 0;
  for (const day of index.days.values()) {
    const timestamp = timestampForStudyDate(day.date);
    const week = weekById.get(getWeeklyBossWeekId(timestamp));
    if (!week) continue;
    week.seconds += day.seconds; week.records += day.count;
    if (day.seconds > 0) week.studyDays++;
    const comparisonSubjects = timestamp >= monday - 3 * WEEK ? recentSubjects : previousSubjects;
    for (const subject of day.subjects.values()) {
      comparisonSubjects.set(subject.id,(comparisonSubjects.get(subject.id) || 0) + subject.seconds);
      comparisonDefinitions.set(subject.id,subject);
    }
    if (timestamp < periodStart) continue;
    seconds += day.seconds;
    if (day.seconds > 0) studyDays++;
    if (day.seconds >= dailyTargetSeconds) achievedDays++;
    const weekday = weekdays[(new Date(timestamp + 9 * 3600000).getUTCDay() + 6) % 7];
    weekday.seconds += day.seconds;
    if (day.seconds > 0) weekday.studyDays++;
    for (const subject of day.subjects.values()) {
      const total = subjects.get(subject.id) || { ...subject, seconds: 0, studyDays: 0 };
      total.seconds += subject.seconds;
      if (subject.seconds > 0) total.studyDays++;
      subjects.set(subject.id,total);
    }
  }
  const weeks = oldestWeek === null ? [] : allWeeks.slice(8-count).filter(week => week.startAt >= oldestWeek);
  const current = allWeeks[7], previous = allWeeks[6];
  const recordWeeks = weeks.filter(week => week.records > 0).length;
  let currentStreak = 0;
  const dateSet = new Set(dates);
  let cursor = timestampForStudyDate(index.today);
  if (!dateSet.has(index.today)) cursor -= DAY;
  while (dateSet.has(monthlyStudyDate(cursor))) { currentStreak++; cursor -= DAY; }
  const comparisonAvailable = oldestWeek !== null && oldestWeek <= monday - 7 * WEEK && previousSubjects.size > 0;
  const subjectRows = [...subjects.values()].filter(subject => subject.seconds > 0)
    .map(subject => ({ ...subject, percent: seconds > 0 ? subject.seconds / seconds * 100 : 0, recentSeconds: recentSubjects.get(subject.id) || 0, previousSeconds: previousSubjects.get(subject.id) || 0 }))
    .sort((a,b) => b.seconds - a.seconds || a.order - b.order);
  return {
    status: 'ready', period: count, weeks, weekdays: weekdays.map(day => ({ ...day, averageSeconds: day.studyDays ? day.seconds / day.studyDays : 0 })), subjects: subjectRows,
    seconds, studyDays, recordWeeks, averageDaySeconds: studyDays ? seconds / studyDays : 0, averageWeekSeconds: weeks.length ? seconds / weeks.length : 0,
    averageWeekDays: weeks.length ? studyDays / weeks.length : 0,
    achievedDays, goalPercent: studyDays ? achievedDays / studyDays * 100 : 0, dailyTargetSeconds,
    current, previous: previous.records ? previous : null, difference: previous.records ? { seconds: current.seconds - previous.seconds, days: current.studyDays - previous.studyDays } : null,
    currentStreak, longestStreak: consecutiveDays(dates), comparisonAvailable,
    subjectComparison: comparisonAvailable ? [...comparisonDefinitions.values()].map(subject => ({ id: subject.id, name: subject.name, order: subject.order, recentSeconds: recentSubjects.get(subject.id) || 0, previousSeconds: previousSubjects.get(subject.id) || 0 })).filter(subject => subject.recentSeconds || subject.previousSeconds).sort((a,b) => b.recentSeconds - a.recentSeconds || a.order - b.order) : [],
  };
}
