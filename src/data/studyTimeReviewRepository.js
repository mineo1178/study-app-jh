import { doc, runTransaction } from 'firebase/firestore';
import { validateStudySession } from '../integrity/studyValidation.js';
import { applyRewardToPlayerProfile, emptyPlayerProfile, playerProfileRef, prepareCanonicalStudySessionReward, rewardLedgerRef } from './rewardLedgerRepository.js';
import { REWARD_POLICY_VERSION, REWARD_SCHEMA_VERSION } from '../rpg/rewardConfig.js';
import { diagnosticErrorCode, recordTimerDiagnostic } from '../timer/timerDiagnostics.js';

export const isPendingStudyTimeReview = (session) => session?.timeReview?.status === 'pending'
  && session.validation?.status === 'pending_review';

const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export function prepareStudyTimeConfirmation(session, targetSeconds, confirmedBy, now) {
  if (!isPendingStudyTimeReview(session)) fail('STUDY_TIME_NOT_PENDING');
  if (!Number.isInteger(targetSeconds) || targetSeconds < 0 || targetSeconds > session.timeReview.measuredSeconds
    || targetSeconds > session.recordedSeconds) fail('STUDY_TIME_OUT_OF_RANGE');
  // Self-reporting cannot override stale/invalid evidence or unrelated validation.
  const originalValidation = session.timeReview.validationBeforeReview;
  if (originalValidation?.status === 'invalid'
    || originalValidation?.reasonCodes?.some((code) => !['long_session', 'review_session', 'high_risk_session'].includes(code))) {
    fail('STUDY_TIME_VALIDATION_REQUIRED');
  }
  let remaining = targetSeconds;
  const segments = [];
  for (const segment of session.segments || []) {
    if (!remaining) break;
    const seconds = Math.min(remaining, segment.durationSeconds);
    if (!Number.isInteger(seconds) || seconds <= 0) fail('STUDY_TIME_VALIDATION_REQUIRED');
    segments.push({ ...segment, endedAt: segment.startedAt + seconds * 1000, durationSeconds: seconds });
    remaining -= seconds;
  }
  if (remaining) fail('STUDY_TIME_VALIDATION_REQUIRED');
  const validation = validateStudySession({ ...session, recordedSeconds: targetSeconds, segments });
  if (validation.status !== 'valid') fail('STUDY_TIME_VALIDATION_REQUIRED');
  return { recordedSeconds: targetSeconds, segments, validation, updatedAt: now,
    timeReview: { ...session.timeReview, status: 'confirmed', confirmedSeconds: targetSeconds, confirmedBy, confirmedAt: now, source: 'self_report' } };
}

export async function confirmStudyTime({ db, familyId, sessionId, targetSeconds, confirmedBy }) {
  if (typeof confirmedBy !== 'string' || !confirmedBy.trim()) fail('REVIEWER_NOT_AUTHORIZED');
  const sessionRef = doc(db, 'families', familyId, 'apps', 'junior-high', 'studySessions', sessionId);
  const ledgerRef = rewardLedgerRef(db, familyId, sessionId);
  const profileRef = playerProfileRef(db, familyId);
  try {
    const result = await runTransaction(db, async (transaction) => {
      const [sessionSnap, ledgerSnap, profileSnap] = await Promise.all([
        transaction.get(sessionRef), transaction.get(ledgerRef), transaction.get(profileRef),
      ]);
      if (!sessionSnap.exists()) fail('SESSION_NOT_FOUND');
      const session = { ...sessionSnap.data(), id: sessionId };
      if (session.timeReview?.status === 'confirmed') return { session, alreadyConfirmed: true, applied: false };
      if (ledgerSnap.exists()) fail('STUDY_TIME_REWARD_ALREADY_EXISTS');
      const now = Date.now();
      const patch = prepareStudyTimeConfirmation(session, targetSeconds, confirmedBy, now);
      const confirmed = { ...session, ...patch };
      const prepared = prepareCanonicalStudySessionReward(confirmed);
      transaction.update(sessionRef, patch);
      if (targetSeconds > 0 && prepared.eligible) {
        transaction.set(profileRef, applyRewardToPlayerProfile(profileSnap.exists() ? profileSnap.data() : emptyPlayerProfile(), prepared.rewards, now));
        transaction.set(ledgerRef, { schemaVersion: REWARD_SCHEMA_VERSION, studySessionId: sessionId,
          timerId: session.timerId || null, rewardPolicyVersion: REWARD_POLICY_VERSION,
          basis: prepared.basis, rewards: prepared.rewards, status: 'applied', appliedAt: now, reversal: null });
      }
      return { session: confirmed, alreadyConfirmed: false, applied: targetSeconds > 0 && prepared.eligible, rewards: prepared.rewards || null };
    });
    recordTimerDiagnostic('review_confirmed', { timerId: sessionId, recordedSeconds: result.session.recordedSeconds, alreadyFinished: result.alreadyConfirmed });
    return result;
  } catch (error) {
    recordTimerDiagnostic('review_failed', { timerId: sessionId, errorCode: diagnosticErrorCode(error) });
    throw error;
  }
}
