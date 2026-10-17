import { dashboardDuration as duration } from './dashboardSelectors.js';
import { personalGoalProgress, personalStudyTargets } from '../personalStudyGoals.js';
import { deriveSubjectGoalProgress, prioritizeSubjectGoals } from '../subjectStudyGoals.js';
import { deriveTodayPlanProgress } from '../weeklyStudyPlan.js';

// Only consumes the existing effective-record index and Analytics aggregates.
// No session scans, clock reads, persistence, or reward calculations.
export function deriveStudyGuidance(index, analytics, studyGoals, subjectDefinitions) {
  if (index.status !== 'ready' || analytics.status !== 'ready') return [];
  const candidates = [], plannedSubjects = new Set();
  const add = (id, title, tab, subjectId) => candidates.push({ id, title, tab, subjectId });
  const today = index.days.get(index.today);
  const plan = prioritizeSubjectGoals(deriveTodayPlanProgress(studyGoals?.weeklyPlan, index.today, today?.subjects || new Map(), subjectDefinitions));
  for (const goal of plan.filter(goal => !goal.achieved)) {
    plannedSubjects.add(goal.id);
    add(`plan-${goal.id}`, `${goal.name}はあと${duration(goal.remaining)}で今日の予定達成です`, 'daily', goal.id);
  }
  const { dailyTargetSeconds, weeklyStudyDays } = personalStudyTargets(studyGoals);
  const { remaining } = personalGoalProgress(today?.seconds || 0, dailyTargetSeconds);
  if (remaining > 0) add('daily', `あと${duration(remaining)}で今日の目標です`, 'daily');
  if (analytics.current.studyDays < weeklyStudyDays) add('days', `あと${weeklyStudyDays - analytics.current.studyDays}日で今週${weeklyStudyDays}日の目標です`, 'weekly-report');
  for (const goal of prioritizeSubjectGoals(deriveSubjectGoalProgress(studyGoals?.subjectWeeklyTargets, analytics.weeklySubjects, subjectDefinitions))) {
    if (!goal.achieved && !plannedSubjects.has(goal.id)) add(`subject-${goal.id}`, `${goal.name}はあと${duration(goal.remaining)}で今週の目標です`, 'weekly-report', goal.id);
  }
  const completed = analytics.weeks.filter(week => !week.current).slice(-2);
  if (completed.length === 2 && completed.every(week => week.records > 0)) {
    const [older, recent] = completed;
    add('completed-weeks', `完了した週の学習時間：${older.label}は${duration(older.seconds)}、${recent.label}は${duration(recent.seconds)}でした`);
  }
  if (analytics.currentStreak > 0) add('streak', `現在${analytics.currentStreak}日連続で学習を記録しています`);
  const top = analytics.recentSubjects[0];
  if (top) add('subject-fact', `直近4週間で最も多く学習した科目は${top.name}です（${duration(top.seconds)}）`);
  const weekday = [...analytics.weekdays].sort((a,b) => b.seconds - a.seconds)[0];
  if (weekday?.seconds > 0) add('weekday-fact', `表示中の期間の${weekday.label}曜日の学習記録は${weekday.studyDays}日、合計${duration(weekday.seconds)}です`);
  return candidates.slice(0,3);
}
