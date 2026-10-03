import { PLAN_DAYS, normalizeWeeklyStudyPlan } from '../weeklyStudyPlan.js';
import { deleteField, setDoc } from 'firebase/firestore';
import { playerProfileRef } from './rewardLedgerRepository.js';
import { normalizeStudyGoals } from '../personalStudyGoals.js';
import { goalSubjects } from '../subjectCatalog.js';
import { normalizeSubjectWeeklyTargets } from '../subjectStudyGoals.js';

export function saveStudyGoals({ db, familyId, studyGoals }) {
  const goals = normalizeStudyGoals(studyGoals);
  const mergeFields = ['studyGoals.dailyTargetMinutes', 'studyGoals.weeklyStudyDays'];
  if (Object.hasOwn(studyGoals || {}, 'subjectWeeklyTargets')) {
    const targets = normalizeSubjectWeeklyTargets(studyGoals.subjectWeeklyTargets);
    // Merge individual known IDs so orphan entries survive catalog changes.
    goals.subjectWeeklyTargets = Object.fromEntries(goalSubjects().map(subject => {
      mergeFields.push(`studyGoals.subjectWeeklyTargets.${subject.id}`);
      return [subject.id, targets[subject.id] || deleteField()];
    }));
  }
  if (Object.hasOwn(studyGoals || {}, 'weeklyPlan')) {
    const plan = normalizeWeeklyStudyPlan(studyGoals.weeklyPlan);
    goals.weeklyPlan = Object.fromEntries(PLAN_DAYS.map(day => [day, Object.fromEntries(goalSubjects().map(subject => {
      mergeFields.push(`studyGoals.weeklyPlan.${day}.${subject.id}`);
      return [subject.id, plan[day]?.[subject.id] || deleteField()];
    }))]));
  }
  return setDoc(playerProfileRef(db, familyId), { studyGoals: goals }, {
    mergeFields,
  });
}
