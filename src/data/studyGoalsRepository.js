import { setDoc } from 'firebase/firestore';
import { playerProfileRef } from './rewardLedgerRepository.js';
import { normalizeStudyGoals } from '../personalStudyGoals.js';

export function saveStudyGoals({ db, familyId, studyGoals }) {
  const goals = normalizeStudyGoals(studyGoals);
  return setDoc(playerProfileRef(db, familyId), { studyGoals: goals }, {
    mergeFields: ['studyGoals.dailyTargetMinutes', 'studyGoals.weeklyStudyDays'],
  });
}
