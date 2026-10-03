export const DEFAULT_STUDY_GOALS = Object.freeze({ dailyTargetMinutes: 120, weeklyStudyDays: 5 });

export function normalizeStudyGoals(value) {
  const daily = value?.dailyTargetMinutes;
  const days = value?.weeklyStudyDays;
  return {
    dailyTargetMinutes: Number.isInteger(daily) && daily >= 15 && daily <= 360 && daily % 15 === 0 ? daily : 120,
    weeklyStudyDays: Number.isInteger(days) && days >= 1 && days <= 7 ? days : 5,
  };
}

export function personalGoalProgress(seconds, targetSeconds) {
  return { remaining: Math.max(0, targetSeconds - seconds), percent: Math.min(100, Math.floor(seconds / targetSeconds * 100)) };
}

export function personalStudyTargets(value) {
  const goals = normalizeStudyGoals(value);
  const dailyTargetSeconds = goals.dailyTargetMinutes * 60;
  return { ...goals, dailyTargetSeconds, weeklyTargetSeconds: dailyTargetSeconds * goals.weeklyStudyDays };
}

// Firestore emits optimistic snapshots before a write is acknowledged.
export function confirmedGoalProfile(next, current, hasPendingWrites) {
  return hasPendingWrites ? { ...next, studyGoals: current.studyGoals } : next;
}
