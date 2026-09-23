import { describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({ docs: new Map(), writes: [] }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => ({ path: parts.join('/') }),
  runTransaction: async (_db, callback) => callback({
    get: async (reference) => ({ id: reference.path.split('/').at(-1), exists: () => firestore.docs.has(reference.path), data: () => firestore.docs.get(reference.path) }),
    set: (reference, value) => { firestore.writes.push(reference.path); firestore.docs.set(reference.path, value); },
    update: (reference, patch) => { firestore.writes.push(reference.path); firestore.docs.set(reference.path, { ...firestore.docs.get(reference.path), ...patch }); },
  }),
}));

import { correctStudySessionReward, retryPendingRewardCorrection } from './rewardCorrectionRepository.js';

const familyId = 'oomine-study-2026';
const appPath = (collection, id) => `families/${familyId}/apps/junior-high/${collection}/${id}`;
const sessionPath = (id = 'session-1') => appPath('studySessions', id);
const ledgerPath = (id = 'session-1') => appPath('rewardLedger', id);
const profilePath = appPath('rpg', 'playerProfile');
const integrityPath = appPath('rewardIntegrity', 'current');
const adjustmentPath = (id = 'session-1-revision-1') => appPath('rewardAdjustmentLedger', id);
const correction = { correctionId: 'shorten-1', recordedSeconds: 1_200, validation: { status: 'valid', reasonCodes: [] }, reason: 'duration_corrected' };

const seed = ({ session = {}, ledger = {}, profile = {}, integrity = {} } = {}) => {
  firestore.docs.clear(); firestore.writes.length = 0;
  firestore.docs.set(sessionPath(), { recordedSeconds: 3_600, rewardPolicyVersion: 'rpg-reward-v1', validation: { status: 'valid', reasonCodes: [] }, taskSnapshot: { subjectId: 's_math', activityType: 'problem_solving' }, ...session });
  if (ledger !== null) firestore.docs.set(ledgerPath(), { studySessionId: 'session-1', status: 'applied', revision: 0, rewards: { gold: 60, battleEnergy: 4, material: { key: 'iron', quantity: 6 } }, basis: { recordedSeconds: 3_600, subjectId: 's_math' }, ...ledger });
  firestore.docs.set(profilePath, { gold: 100, battleEnergy: 10, materials: { iron: 10 }, ...profile });
  firestore.docs.set(integrityPath, { pendingSessionIds: [], ...integrity });
};

describe('reward correction transactions', () => {
  it('uses the reviewer UID only as audit identity without member reads', async () => {
    seed();
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction, reviewerUid: 'user-1' })).resolves.toMatchObject({ applied: true, status: 'applied' });
    expect(firestore.docs.get(sessionPath()).correction.requestedBy).toBe('user-1');
    expect(firestore.docs.get(adjustmentPath())).toMatchObject({ requestedBy: 'user-1', appliedBy: 'user-1' });
    expect([...firestore.docs.keys()].some((path) => path.includes('/members/'))).toBe(false);
  });

  it('rejects a missing reviewer UID before writing anything', async () => {
    seed(); const before = JSON.stringify([...firestore.docs.entries()]);
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction, reviewerUid: '' })).rejects.toThrow('REVIEWER_NOT_AUTHORIZED');
    expect(JSON.stringify([...firestore.docs.entries()])).toBe(before); expect(firestore.writes).toEqual([]);
  });

  it('keeps pending reversal retry, audit identities, and negative-asset prevention intact', async () => {
    seed({ profile: { materials: { iron: 1 } } });
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction, reviewerUid: 'requester' })).resolves.toMatchObject({ status: 'pending' });
    expect(firestore.docs.get(ledgerPath()).pendingCorrection.requestedBy).toBe('requester');
    firestore.docs.set(profilePath, { gold: 100, battleEnergy: 10, materials: { iron: 10 } });
    await expect(retryPendingRewardCorrection({ db: {}, familyId, sessionId: 'session-1', reviewerUid: 'resolver' })).resolves.toMatchObject({ applied: true });
    expect(firestore.docs.get(adjustmentPath())).toMatchObject({ requestedBy: 'requester', resolvedBy: 'resolver', appliedBy: 'resolver' });
  });

  it('preserves no-ledger manual review, legacy handling, and idempotency', async () => {
    seed({ session: { validation: { status: 'pending_review', reasonCodes: ['clock_mismatch'] } }, ledger: null });
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction: { correctionId: 'approve-1', validation: { status: 'valid' }, reason: 'manual_review_approved' }, reviewerUid: 'user-1' })).resolves.toMatchObject({ status: 'no_reward_ledger' });
    expect(firestore.docs.get(sessionPath()).manualReview).toMatchObject({ reviewedBy: 'user-1', decision: 'valid' });
    seed();
    await correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction, reviewerUid: 'user-1' });
    await expect(correctStudySessionReward({ db: {}, familyId, sessionId: 'session-1', correction, reviewerUid: 'user-1' })).resolves.toEqual({ applied: false, reason: 'ALREADY_APPLIED', revision: 1 });
  });
});
