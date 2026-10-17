import { normalizeStudyGoals } from '../personalStudyGoals.js';
import { goalSubjects, SUBJECT_DEFS } from '../subjectCatalog.js';
import { normalizeSubjectWeeklyTargets } from '../subjectStudyGoals.js';
import { PLAN_DAYS, PLAN_DAY_LABELS, normalizeWeeklyStudyPlan, derivePlanSubjectTotals } from '../weeklyStudyPlan.js';

export function planReviewTotals(value, definitions = SUBJECT_DEFS) {
  const plan = normalizeWeeklyStudyPlan(value, definitions);
  const days = PLAN_DAYS.map((id, index) => ({ id, name: `${PLAN_DAY_LABELS[index]}曜日`, minutes: Object.values(plan[id] || {}).reduce((sum, minutes) => sum + minutes, 0) }));
  return { plan, days, subjects: derivePlanSubjectTotals(plan, definitions), minutes: days.reduce((sum, day) => sum + day.minutes, 0), studyDays: days.filter(day => day.minutes > 0).length };
}

// These candidates compare current settings only, never infer a historical plan.
export function derivePlanReview(studyGoals, definitions = SUBJECT_DEFS) {
  const goals = normalizeStudyGoals(studyGoals);
  const targets = normalizeSubjectWeeklyTargets(studyGoals?.subjectWeeklyTargets, definitions);
  const totals = planReviewTotals(studyGoals?.weeklyPlan, definitions);
  const suggestions = [];
  if (!totals.minutes) suggestions.push({ id: 'empty', text: '週間プランがまだありません。取り組む曜日と科目を決めてみましょう。' });
  else if (totals.studyDays < goals.weeklyStudyDays) suggestions.push({ id: 'days', text: `週間目標は${goals.weeklyStudyDays}日ですが、予定を設定しているのは${totals.studyDays}日です。学習する曜日を見直してみましょう。` });
  for (const subject of goalSubjects(definitions)) {
    const difference = (targets[subject.id] || 0) - (totals.subjects[subject.id] || 0);
    if (difference > 0) suggestions.push({ id: `subject-${subject.id}`, subjectId: subject.id, text: `${subject.name}は週間目標より予定が${difference}分少なく設定されています。` });
  }
  for (const day of totals.days) {
    if (day.minutes > goals.dailyTargetMinutes) suggestions.push({ id: `day-${day.id}`, day: day.id, text: `${day.name}の予定は1日の目標より${day.minutes - goals.dailyTargetMinutes}分多くなっています。負担が適切か確認しましょう。` });
  }
  return { goals, targets, totals, suggestions: suggestions.slice(0, 3) };
}

export function derivePlanChanges(before, after, definitions = SUBJECT_DEFS) {
  const current = planReviewTotals(before, definitions), next = planReviewTotals(after, definitions);
  const changes = current.days.flatMap(day => goalSubjects(definitions).flatMap(subject => {
    const from = current.plan[day.id]?.[subject.id] || 0, to = next.plan[day.id]?.[subject.id] || 0;
    return from === to ? [] : [{ day: day.id, dayName: day.name, subjectId: subject.id, subjectName: subject.name, from, to, delta: to - from }];
  }));
  return { current, next, changes };
}

export const studyGoalDraft = value => ({ ...normalizeStudyGoals(value), subjectWeeklyTargets: normalizeSubjectWeeklyTargets(value?.subjectWeeklyTargets), weeklyPlan: normalizeWeeklyStudyPlan(value?.weeklyPlan) });

// Omit untouched fields so a plan edit cannot overwrite goals updated elsewhere.
export function changedStudyGoals(before, after) {
  const current = studyGoalDraft(before), next = studyGoalDraft(after), patch = {};
  for (const field of ['dailyTargetMinutes', 'weeklyStudyDays']) if (current[field] !== next[field]) patch[field] = next[field];
  if (JSON.stringify(current.subjectWeeklyTargets) !== JSON.stringify(next.subjectWeeklyTargets)) patch.subjectWeeklyTargets = next.subjectWeeklyTargets;
  if (derivePlanChanges(current.weeklyPlan, next.weeklyPlan).changes.length) patch.weeklyPlan = next.weeklyPlan;
  return patch;
}
