import { goalSubjects, SUBJECT_DEFS } from './subjectCatalog.js';

export function normalizeSubjectWeeklyTargets(value, definitions = SUBJECT_DEFS) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(goalSubjects(definitions).flatMap(subject => {
    const minutes = Object.hasOwn(value, subject.id) ? value[subject.id] : undefined;
    return Number.isInteger(minutes) && minutes > 0 && minutes <= 600 && minutes % 15 === 0 ? [[subject.id, minutes]] : [];
  }));
}

// Uses the existing weekly aggregation, never filters sessions per subject.
export function deriveSubjectGoalProgress(targets, subjects, definitions = SUBJECT_DEFS) {
  const normalized = normalizeSubjectWeeklyTargets(targets, definitions);
  return goalSubjects(definitions).flatMap(subject => {
    const minutes = normalized[subject.id];
    if (!minutes) return [];
    const targetSeconds = minutes * 60;
    const seconds = subjects.get(subject.id)?.seconds || 0;
    const remaining = Math.max(0, targetSeconds - seconds);
    return [{ id: subject.id, name: subject.name, seconds, targetSeconds, remaining, achieved: remaining === 0, percent: Math.round(seconds / targetSeconds * 100), barPercent: Math.min(100, seconds / targetSeconds * 100) }];
  });
}

// Stable sort preserves catalog order when the simple numeric priorities tie.
export function prioritizeSubjectGoals(goals) {
  return [...goals].sort((a, b) => Number(a.achieved) - Number(b.achieved)
    || b.seconds / b.targetSeconds - a.seconds / a.targetSeconds
    || a.remaining - b.remaining);
}
