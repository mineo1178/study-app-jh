import { goalSubjects, SUBJECT_DEFS } from './subjectCatalog.js';
import { timestampForStudyDate } from './rpg/achievementSelectors.js';
import { deriveSubjectGoalProgress } from './subjectStudyGoals.js';

export const PLAN_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const PLAN_DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];
const isMap = value => value && typeof value === 'object' && !Array.isArray(value);

// Unknown weekdays/subjects are hidden here and preserved by field-level writes.
export function normalizeWeeklyStudyPlan(value, definitions = SUBJECT_DEFS) {
  if (!isMap(value)) return {};
  return Object.fromEntries(PLAN_DAYS.flatMap(day => {
    if (!isMap(value[day])) return [];
    const entries = goalSubjects(definitions).flatMap(subject => {
      const minutes = Object.hasOwn(value[day], subject.id) ? value[day][subject.id] : undefined;
      return Number.isInteger(minutes) && minutes > 0 && minutes <= 360 && minutes % 15 === 0 ? [[subject.id, minutes]] : [];
    });
    return entries.length ? [[day, Object.fromEntries(entries)]] : [];
  }));
}

export function planWeekdayForDate(date) {
  const timestamp = timestampForStudyDate(date);
  return timestamp === null ? undefined : PLAN_DAYS[(new Date(timestamp + 9 * 3600000).getUTCDay() + 6) % 7];
}

export function deriveTodayPlanProgress(plan, date, subjects, definitions = SUBJECT_DEFS) {
  return deriveSubjectGoalProgress(normalizeWeeklyStudyPlan(plan, definitions)[planWeekdayForDate(date)], subjects, definitions);
}

export function derivePlanSubjectTotals(plan, definitions = SUBJECT_DEFS) {
  const totals = {};
  for (const day of Object.values(normalizeWeeklyStudyPlan(plan, definitions))) {
    for (const [id, minutes] of Object.entries(day)) totals[id] = (totals[id] || 0) + minutes;
  }
  return totals;
}

export function deriveWeeklyPlanProgress(plan, days, subjects, definitions = SUBJECT_DEFS) {
  const normalized = normalizeWeeklyStudyPlan(plan, definitions);
  const comparisons = days.map(day => {
    const plannedSeconds = Object.values(normalized[planWeekdayForDate(day.date)] || {}).reduce((sum, minutes) => sum + minutes * 60, 0);
    return { ...day, plannedSeconds, planAchieved: plannedSeconds > 0 && day.seconds >= plannedSeconds };
  });
  const totals = derivePlanSubjectTotals(plan, definitions);
  return {
    days: comparisons,
    plannedSeconds: comparisons.reduce((sum, day) => sum + day.plannedSeconds, 0),
    actualSeconds: days.reduce((sum, day) => sum + day.seconds, 0),
    subjects: goalSubjects(definitions).flatMap(subject => {
      const seconds = subjects.get(subject.id)?.seconds || 0;
      return totals[subject.id] || seconds ? [{ ...subject, plannedSeconds: (totals[subject.id] || 0) * 60, seconds }] : [];
    }),
  };
}
