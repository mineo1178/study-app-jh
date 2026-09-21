import { doc, runTransaction } from 'firebase/firestore';
import { calculateStudyReward, materialForSubject } from '../rpg/rewardCalculator.js';
import { normalizePlayerProfile } from '../rpg/playerProfile.js';
import { playerProfileRef, rewardLedgerRef } from './rewardLedgerRepository.js';
import { assertAuthorizedRewardReviewer, assertReviewerUid, reviewerMemberRef } from './reviewerAuthorization.js';

const appPath = (familyId, collectionName, id) => ['families', familyId, 'apps', 'junior-high', collectionName, id];
const correctionFailure = (code) => Object.assign(new Error(code), { code });
const number = (value) => Math.max(0, Number(value) || 0);

export const REWARD_ADJUSTMENT_SCHEMA_VERSION = 1;
export const REWARD_INTEGRITY_SCHEMA_VERSION = 1;
export const studySessionRef = (db, familyId, sessionId) => doc(db, ...appPath(familyId, 'studySessions', sessionId));
export const rewardAdjustmentLedgerRef = (db, familyId, adjustmentId) => doc(db, ...appPath(familyId, 'rewardAdjustmentLedger', adjustmentId));
export const rewardIntegrityRef = (db, familyId) => doc(db, ...appPath(familyId, 'rewardIntegrity', 'current'));

const emptyIntegrityState = () => ({ schemaVersion: REWARD_INTEGRITY_SCHEMA_VERSION, pendingSessionIds: [] });
export const normalizeRewardIntegrityState = (state = {}) => ({
  ...emptyIntegrityState(),
  ...state,
  schemaVersion: REWARD_INTEGRITY_SCHEMA_VERSION,
  pendingSessionIds: [...new Set((state.pendingSessionIds || []).filter(Boolean))],
});
export const hasPendingRewardCorrections = (state = {}) => normalizeRewardIntegrityState(state).pendingSessionIds.length > 0;
export const assertNoPendingRewardCorrections = (state = {}) => {
  if (hasPendingRewardCorrections(state)) throw correctionFailure('REWARD_CORRECTION_PENDING');
};

const normalizeRewards = (rewards = {}, fallbackMaterialKey = 'general_essence') => ({
  gold: number(rewards.gold),
  battleEnergy: number(rewards.battleEnergy),
  material: {
    key: rewards.material?.key || fallbackMaterialKey,
    quantity: number(rewards.material?.quantity),
  },
});
const zeroRewards = (materialKey) => ({ gold: 0, battleEnergy: 0, material: { key: materialKey, quantity: 0 } });
const deductionFor = (before, target) => ({
  gold: number(before.gold) - number(target.gold),
  battleEnergy: number(before.battleEnergy) - number(target.battleEnergy),
  material: { key: before.material.key, quantity: number(before.material.quantity) - number(target.material.quantity) },
});
const wouldIncreaseReward = (deduction) => deduction.gold < 0 || deduction.battleEnergy < 0 || deduction.material.quantity < 0;
const canDeduct = (profile, deduction) => number(profile.gold) >= deduction.gold
  && number(profile.battleEnergy) >= deduction.battleEnergy
  && number(profile.materials?.[deduction.material.key]) >= deduction.material.quantity;
const deductFromProfile = (profile, deduction, now) => {
  const current = normalizePlayerProfile(profile);
  return {
    ...current,
    gold: current.gold - deduction.gold,
    battleEnergy: current.battleEnergy - deduction.battleEnergy,
    materials: { ...current.materials, [deduction.material.key]: number(current.materials?.[deduction.material.key]) - deduction.material.quantity },
    updatedAt: now,
  };
};
const correctionIdFor = (sessionId, correction = {}) => correction.correctionId || `correction-${sessionId}-${correction.recordedSeconds ?? 'same'}-${correction.validation?.status || 'same'}`;
const updatedValidation = (current, requested) => ({ ...current, ...requested, status: requested.status });

export function prepareRewardCorrection({ session, ledger = null, profile = {}, integrity = {}, correction = {}, reviewerUid, now = Date.now() }) {
  const reviewerId = assertReviewerUid(reviewerUid);
  if (!session) throw correctionFailure('SESSION_NOT_FOUND');
  const correctionId = correctionIdFor(session.id, correction);
  if (ledger?.lastCorrectionId === correctionId) return { alreadyApplied: true, revision: number(ledger.revision) };
  const sourceStatus = session.validation?.status || 'valid';
  const targetStatus = correction.validation?.status;
  const currentSeconds = number(session.recordedSeconds);
  const targetSeconds = correction.recordedSeconds === undefined ? currentSeconds : number(correction.recordedSeconds);
  if (!['valid', 'pending_review'].includes(sourceStatus)) throw correctionFailure('CORRECTION_SOURCE_STATUS_NOT_SUPPORTED');
  if (sourceStatus === 'pending_review' && targetStatus !== 'invalid') throw correctionFailure('CORRECTION_TRANSITION_NOT_SUPPORTED');
  if (sourceStatus === 'valid' && !['valid', 'invalid'].includes(targetStatus)) throw correctionFailure('CORRECTION_TRANSITION_NOT_SUPPORTED');
  if (targetSeconds > currentSeconds) throw correctionFailure('CORRECTION_REWARD_INCREASE_NOT_ALLOWED');
  if (sourceStatus === 'valid' && targetStatus === 'valid' && targetSeconds >= currentSeconds) throw correctionFailure('CORRECTION_REWARD_INCREASE_NOT_ALLOWED');
  if (ledger?.correctionStatus === 'reversal_pending') throw correctionFailure('REWARD_CORRECTION_PENDING');
  if (ledger?.status === 'reversed') throw correctionFailure('REWARD_ALREADY_REVERSED');

  const revision = number(ledger?.revision) + 1;
  const validation = updatedValidation(session.validation || {}, correction.validation);
  const sessionPatch = {
    recordedSeconds: targetSeconds,
    validation,
    correction: {
      revision,
      correctionId,
      reason: correction.reason || 'manual',
      requestedAt: now,
      requestedBy: reviewerId,
      before: { recordedSeconds: currentSeconds, validationStatus: sourceStatus },
      after: { recordedSeconds: targetSeconds, validationStatus: targetStatus },
    },
    updatedAt: now,
  };
  // Legacy migration sessions are deliberately outside the study-reward economy.
  // Their validation may still be corrected, but no reward adjustment is created.
  if (session.legacySource) {
    if (ledger) throw correctionFailure('LEGACY_REWARD_CORRECTION_NOT_SUPPORTED');
    return { sessionPatch, ledger: null, adjustment: null, profile: null, integrity: null, result: { applied: true, status: 'legacy_no_reward', revision: 0 } };
  }
  if (!ledger) return { sessionPatch, ledger: null, adjustment: null, profile: null, integrity: null, result: { applied: true, status: 'no_reward_ledger', revision } };

  const originalRewards = normalizeRewards(ledger.rewards, materialForSubject(session.taskSnapshot?.subjectId || session.subjectId));
  const effectiveRewards = normalizeRewards(ledger.effectiveRewards || ledger.rewards, originalRewards.material.key);
  const calculatedTarget = calculateStudyReward({ ...session, recordedSeconds: targetSeconds, validation: { ...validation, status: 'valid' } });
  if (calculatedTarget.material.key !== originalRewards.material.key) throw correctionFailure('CORRECTION_MATERIAL_CHANGE_NOT_SUPPORTED');
  const targetRewards = targetStatus === 'invalid'
    ? zeroRewards(originalRewards.material.key)
    : normalizeRewards(calculatedTarget, originalRewards.material.key);
  const deduction = deductionFor(effectiveRewards, targetRewards);
  if (wouldIncreaseReward(deduction)) throw correctionFailure('CORRECTION_REWARD_INCREASE_NOT_ALLOWED');
  const sufficient = canDeduct(profile, deduction);
  const adjustmentId = `${session.id}-revision-${revision}`;
  const status = sufficient ? 'applied' : 'pending';
  const nextIntegrity = normalizeRewardIntegrityState(integrity);
  nextIntegrity.pendingSessionIds = sufficient
    ? nextIntegrity.pendingSessionIds.filter((id) => id !== session.id)
    : [...new Set([...nextIntegrity.pendingSessionIds, session.id])];
  nextIntegrity.updatedAt = now;
  const adjustment = {
    schemaVersion: REWARD_ADJUSTMENT_SCHEMA_VERSION,
    type: 'reward_correction',
    adjustmentId,
    studySessionId: session.id,
    revision,
    beforeReward: effectiveRewards,
    targetReward: targetRewards,
    deduction,
    status,
    reason: correction.reason || 'manual',
    requestedAt: now,
    requestedBy: reviewerId,
    appliedAt: sufficient ? now : null,
    appliedBy: sufficient ? reviewerId : null,
  };
  const nextLedger = {
    ...ledger,
    revision,
    effectiveRewards: sufficient ? targetRewards : effectiveRewards,
    correctionStatus: sufficient ? 'applied' : 'reversal_pending',
    lastCorrectionId: correctionId,
    pendingCorrection: sufficient ? null : { adjustmentId, targetRewards, deduction, reason: correction.reason || 'manual', requestedAt: now, requestedBy: reviewerId },
  };
  return {
    sessionPatch,
    ledger: nextLedger,
    adjustment,
    profile: sufficient ? deductFromProfile(profile, deduction, now) : null,
    integrity: nextIntegrity,
    result: { applied: true, status, revision, adjustmentId, deduction },
  };
}

export async function correctStudySessionReward({ db, familyId, sessionId, correction, reviewerUid }) {
  const reviewerId = assertReviewerUid(reviewerUid);
  const sessionReference = studySessionRef(db, familyId, sessionId);
  const ledgerReference = rewardLedgerRef(db, familyId, sessionId);
  const profileReference = playerProfileRef(db, familyId);
  const integrityReference = rewardIntegrityRef(db, familyId);
  const reviewerReference = reviewerMemberRef(db, familyId, reviewerId);
  const now = Date.now();
  return runTransaction(db, async (transaction) => {
    const [sessionSnap, ledgerSnap, profileSnap, integritySnap, reviewerSnap] = await Promise.all([transaction.get(sessionReference), transaction.get(ledgerReference), transaction.get(profileReference), transaction.get(integrityReference), transaction.get(reviewerReference)]);
    assertAuthorizedRewardReviewer(reviewerSnap.exists() ? reviewerSnap.data() : null);
    if (!sessionSnap.exists()) return { applied: false, reason: 'SESSION_NOT_FOUND' };
    const session = { id: sessionSnap.id, ...sessionSnap.data() };
    const ledger = ledgerSnap.exists() ? ledgerSnap.data() : null;
    const change = prepareRewardCorrection({ session, ledger, profile: profileSnap.exists() ? profileSnap.data() : {}, integrity: integritySnap.exists() ? integritySnap.data() : {}, correction, reviewerUid: reviewerId, now });
    if (change.alreadyApplied) return { applied: false, reason: 'ALREADY_APPLIED', revision: change.revision };
    const adjustmentReference = change.adjustment ? rewardAdjustmentLedgerRef(db, familyId, change.adjustment.adjustmentId) : null;
    const adjustmentSnap = adjustmentReference ? await transaction.get(adjustmentReference) : null;
    if (adjustmentSnap?.exists()) return { applied: false, reason: 'ALREADY_APPLIED', revision: change.adjustment.revision };
    transaction.update(sessionReference, change.sessionPatch);
    if (change.profile) transaction.set(profileReference, change.profile);
    if (change.ledger) transaction.set(ledgerReference, change.ledger);
    if (change.adjustment) transaction.set(adjustmentReference, change.adjustment);
    if (change.integrity) transaction.set(integrityReference, change.integrity);
    return change.result;
  });
}

export function preparePendingRewardCorrectionRetry({ sessionId, ledger, adjustment, profile = {}, integrity = {}, reviewerUid, now = Date.now() }) {
  const reviewerId = assertReviewerUid(reviewerUid);
  if (ledger?.correctionStatus !== 'reversal_pending' || !ledger.pendingCorrection?.adjustmentId) throw correctionFailure('NO_PENDING_CORRECTION');
  if (!adjustment || adjustment.status !== 'pending' || adjustment.adjustmentId !== ledger.pendingCorrection.adjustmentId) throw correctionFailure('PENDING_CORRECTION_INVALID');
  const pending = ledger.pendingCorrection;
  const current = normalizePlayerProfile(profile);
  if (!canDeduct(current, pending.deduction)) return { applied: false, reason: 'REWARD_PROFILE_INSUFFICIENT' };
  const nextIntegrity = normalizeRewardIntegrityState(integrity);
  nextIntegrity.pendingSessionIds = nextIntegrity.pendingSessionIds.filter((id) => id !== sessionId);
  nextIntegrity.updatedAt = now;
  return {
    applied: true,
    profile: deductFromProfile(current, pending.deduction, now),
    ledger: { ...ledger, effectiveRewards: pending.targetRewards, correctionStatus: 'applied', pendingCorrection: null, lastResolvedBy: reviewerId, lastResolvedAt: now },
    adjustment: { ...adjustment, status: 'applied', appliedAt: now, appliedBy: reviewerId, resolvedAt: now, resolvedBy: reviewerId },
    integrity: nextIntegrity,
  };
}

export async function retryPendingRewardCorrection({ db, familyId, sessionId, reviewerUid }) {
  const reviewerId = assertReviewerUid(reviewerUid);
  const sessionReference = studySessionRef(db, familyId, sessionId);
  const ledgerReference = rewardLedgerRef(db, familyId, sessionId);
  const profileReference = playerProfileRef(db, familyId);
  const integrityReference = rewardIntegrityRef(db, familyId);
  const reviewerReference = reviewerMemberRef(db, familyId, reviewerId);
  const now = Date.now();
  return runTransaction(db, async (transaction) => {
    const [sessionSnap, ledgerSnap, profileSnap, integritySnap, reviewerSnap] = await Promise.all([transaction.get(sessionReference), transaction.get(ledgerReference), transaction.get(profileReference), transaction.get(integrityReference), transaction.get(reviewerReference)]);
    assertAuthorizedRewardReviewer(reviewerSnap.exists() ? reviewerSnap.data() : null);
    if (!sessionSnap.exists()) return { applied: false, reason: 'SESSION_NOT_FOUND' };
    if (!ledgerSnap.exists() || ledgerSnap.data().correctionStatus !== 'reversal_pending') return { applied: false, reason: 'NO_PENDING_CORRECTION' };
    const ledger = ledgerSnap.data();
    const pending = ledger.pendingCorrection;
    if (!pending?.adjustmentId) throw correctionFailure('PENDING_CORRECTION_INVALID');
    const adjustmentReference = rewardAdjustmentLedgerRef(db, familyId, pending.adjustmentId);
    const adjustmentSnap = await transaction.get(adjustmentReference);
    if (!adjustmentSnap.exists() || adjustmentSnap.data().status !== 'pending') throw correctionFailure('PENDING_CORRECTION_INVALID');
    const change = preparePendingRewardCorrectionRetry({ sessionId, ledger, adjustment: adjustmentSnap.data(), profile: profileSnap.exists() ? profileSnap.data() : {}, integrity: integritySnap.exists() ? integritySnap.data() : {}, reviewerUid: reviewerId, now });
    if (!change.applied) return change;
    transaction.set(profileReference, change.profile);
    transaction.set(ledgerReference, change.ledger);
    transaction.set(adjustmentReference, change.adjustment);
    transaction.set(integrityReference, change.integrity);
    return { applied: true, revision: ledger.revision, deduction: pending.deduction };
  });
}
