import { describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({ docs: new Map(), writes: [] }));

vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => ({ path: parts.join('/') }),
  runTransaction: async (_db, callback) => callback({
    get: async (reference) => ({
      id: reference.path.split('/').at(-1),
      exists: () => firestore.docs.has(reference.path),
      data: () => firestore.docs.get(reference.path),
    }),
    set: (reference, value) => {
      firestore.writes.push(reference.path);
      firestore.docs.set(reference.path, value);
    },
    update: (reference, patch) => {
      firestore.writes.push(reference.path);
      firestore.docs.set(reference.path, { ...firestore.docs.get(reference.path), ...patch });
    },
  }),
}));

import { correctStudySessionReward, retryPendingRewardCorrection } from './rewardCorrectionRepository.js';

const familyId = 'family';
const appPath = (collection, id) => `families/${familyId}/apps/junior-high/${collection}/${id}`;
const sessionPath = (id = 'session-1') => appPath('studySessions', id);
const ledgerPath = (id = 'session-1') => appPath('rewardLedger', id);
const profilePath = appPath('rpg', 'playerProfile');
const integrityPath = appPath('rewardIntegrity', 'current');
const memberPath = (uid) => `families/${familyId}/members/${uid}`;
const adjustmentPath = (id = 'session-1-revision-1') => appPath('rewardAdjustmentLedger', id);
const correction = { correctionId: 'shorten-1', recordedSeconds: 1_200, validation: { status: 'valid', reasonCodes: [] }, reason: 'duration_corrected' };

const seed = ({ session = {}, ledger = {}, profile = {}, integrity = {} } = {}) => {
  firestore.docs.clear();
  firestore.writes.length = 0;
  firestore.docs.set(sessionPath(), {
    recordedSeconds: 3_600,
    rewardPolicyVersion: 'rpg-reward-v1',
    validation: { status: 'valid', reasonCodes: [] },
    taskSnapshot: { subjectId: 's_math', activityType: 'problem_solving' },
    ...session,
  });
  if (ledger !== null) firestore.docs.set(ledgerPath(), {
    studySessionId: 'session-1', status: 'applied', revision: 0,
    rewards: { gold: 60, battleEnergy: 4, material: { key: 'iron', quantity: 6 } },
    basis: { recordedSeconds: 3_600, subjectId: 's_math' },
    ...ledger,
  });
  firestore.docs.set(profilePath, { gold: 100, battleEnergy: 10, materials: { iron: 10 }, ...profile });
  firestore.docs.set(integrityPath, { pendingSessionIds: [], ...integrity });
};
const authorize = (uid, role = 'parent', active = true) => firestore.docs.set(memberPath(uid), { role, active });
const snapshot = () => JSON.stringify([...firestore.docs.entries()]);

describe('reward correction reviewer transaction authorization', () => {
  it('allows active parents and records their immediate correction audit identity', async () => {
    seed();
    authorize('parent-1');
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction, reviewerUid: 'parent-1' })).resolves.toMatchObject({ applied: true, status: 'applied' });
    expect(firestore.docs.get(sessionPath()).correction.requestedBy).toBe('parent-1');
    expect(firestore.docs.get(adjustmentPath()).requestedBy).toBe('parent-1');
    expect(firestore.docs.get(adjustmentPath()).appliedBy).toBe('parent-1');
  });

  it('allows active admins', async () => {
    seed();
    authorize('admin-1', 'admin');
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction, reviewerUid: 'admin-1' })).resolves.toMatchObject({ applied: true });
  });

  it('allows an authorized reviewer to approve a pending non-legacy session without creating a reward ledger', async () => {
    seed({ session: { validation: { status: 'pending_review', reasonCodes: ['legacy_reading_continuity_unknown'] } }, ledger: null });
    authorize('parent-1');
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction: { correctionId: 'approve-1', validation: { status: 'valid' }, reason: 'manual_review_approved' }, reviewerUid: 'parent-1' })).resolves.toMatchObject({ status: 'no_reward_ledger' });
    expect(firestore.docs.get(sessionPath())).toMatchObject({ validation: { status: 'valid', reasonCodes: [] }, manualReview: { reviewed: true, decision: 'valid', reviewedBy: 'parent-1', previousValidation: { reasonCodes: ['legacy_reading_continuity_unknown'] } } });
    expect(firestore.docs.has(ledgerPath())).toBe(false);
  });

  it.each([
    ['student', 'student', true],
    ['inactive parent', 'parent', false],
    ['missing member', null, null],
  ])('rejects %s without writing anything', async (_label, role, active) => {
    seed();
    if (role) authorize('reviewer-1', role, active);
    const before = snapshot();
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction, reviewerUid: 'reviewer-1' })).rejects.toThrow('REVIEWER_NOT_AUTHORIZED');
    expect(snapshot()).toBe(before);
    expect(firestore.writes).toEqual([]);
  });

  it('rejects a missing reviewer UID before it can write anything', async () => {
    seed();
    const before = snapshot();
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction, reviewerUid: '' })).rejects.toThrow('REVIEWER_NOT_AUTHORIZED');
    expect(snapshot()).toBe(before);
  });

  it('requires authorization for legacy and no-ledger corrections', async () => {
    seed({ session: { legacySource: { taskId: 'legacy-task', historyId: 'history-1' }, validation: { status: 'pending_review' } }, ledger: null });
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction: { correctionId: 'legacy-invalid', validation: { status: 'invalid', reasonCodes: ['manual_invalid'] } }, reviewerUid: 'missing' })).rejects.toThrow('REVIEWER_NOT_AUTHORIZED');
    authorize('parent-1');
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction: { correctionId: 'legacy-invalid', validation: { status: 'invalid', reasonCodes: ['manual_invalid'] } }, reviewerUid: 'parent-1' })).resolves.toMatchObject({ status: 'legacy_no_reward' });

    seed({ ledger: null });
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction, reviewerUid: 'missing' })).rejects.toThrow('REVIEWER_NOT_AUTHORIZED');
    authorize('parent-1');
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction, reviewerUid: 'parent-1' })).resolves.toMatchObject({ status: 'no_reward_ledger' });
  });

  it('keeps the request reviewer when another authorized reviewer resolves a pending correction', async () => {
    seed({ profile: { materials: { iron: 1 } } });
    authorize('parent-1');
    authorize('admin-1', 'admin');
    authorize('student-1', 'student');
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction, reviewerUid: 'parent-1' })).resolves.toMatchObject({ status: 'pending' });
    expect(firestore.docs.get(ledgerPath()).pendingCorrection.requestedBy).toBe('parent-1');
    expect(firestore.docs.get(adjustmentPath()).requestedBy).toBe('parent-1');

    firestore.docs.set(profilePath, { gold: 100, battleEnergy: 10, materials: { iron: 10 } });
    const beforeUnauthorizedRetry = snapshot();
    await expect(retryPendingRewardCorrection({ db: {}, familyId, sessionId: 'session-1', reviewerUid: 'student-1' })).rejects.toThrow('REVIEWER_NOT_AUTHORIZED');
    expect(snapshot()).toBe(beforeUnauthorizedRetry);
    await expect(retryPendingRewardCorrection({ db: {}, familyId, sessionId: 'session-1', reviewerUid: 'admin-1' })).resolves.toMatchObject({ applied: true });
    expect(firestore.docs.get(adjustmentPath())).toMatchObject({ requestedBy: 'parent-1', resolvedBy: 'admin-1', appliedBy: 'admin-1' });
    expect(firestore.docs.get(ledgerPath())).toMatchObject({ lastResolvedBy: 'admin-1' });
  });

  it('is idempotent for a repeated authorized correction request', async () => {
    seed();
    authorize('parent-1');
    await correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction, reviewerUid: 'parent-1' });
    const profileAfterFirst = JSON.stringify(firestore.docs.get(profilePath));
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction, reviewerUid: 'parent-1' })).resolves.toEqual({ applied: false, reason: 'ALREADY_APPLIED', revision: 1 });
    expect(JSON.stringify(firestore.docs.get(profilePath))).toBe(profileAfterFirst);
  });
});
