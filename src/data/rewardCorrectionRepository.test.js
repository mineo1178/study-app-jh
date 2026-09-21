import { describe, expect, it } from 'vitest';
import { assertNoPendingRewardCorrections, preparePendingRewardCorrectionRetry, prepareRewardCorrection } from './rewardCorrectionRepository.js';
import { findUndefinedPaths } from '../test/findUndefinedPaths.js';

const now = 1_000;
const session = (overrides = {}) => ({
  id: 'session-1', recordedSeconds: 3_600, rewardPolicyVersion: 'rpg-reward-v1',
  validation: { status: 'valid', reasonCodes: [] }, taskSnapshot: { subjectId: 's_math', activityType: 'problem_solving' },
  ...overrides,
});
const ledger = (overrides = {}) => ({
  studySessionId: 'session-1', status: 'applied', rewards: { gold: 60, battleEnergy: 4, material: { key: 'iron', quantity: 6 } }, basis: { recordedSeconds: 3_600, subjectId: 's_math' },
  ...overrides,
});
const profile = (overrides = {}) => ({ gold: 100, battleEnergy: 10, materials: { iron: 10 }, ...overrides });
const shorten = { correctionId: 'shorten-1', recordedSeconds: 1_200, validation: { status: 'valid', reasonCodes: [] }, reason: 'duration_corrected' };

describe('reward correction preparation', () => {
  it('shortens 60 minutes to 20 minutes and atomically prepares the full deduction', () => {
    const change = prepareRewardCorrection({ session: session(), ledger: ledger(), profile: profile(), correction: shorten, reviewerUid: 'parent-1', now });
    expect(change.result).toMatchObject({ status: 'applied', revision: 1, deduction: { gold: 40, battleEnergy: 3, material: { key: 'iron', quantity: 4 } } });
    expect(change.sessionPatch).toMatchObject({ recordedSeconds: 1_200, validation: { status: 'valid' } });
    expect(change.profile).toMatchObject({ gold: 60, battleEnergy: 7, materials: { iron: 6 } });
    expect(change.ledger).toMatchObject({ revision: 1, effectiveRewards: { gold: 20, battleEnergy: 1, material: { key: 'iron', quantity: 2 } }, correctionStatus: 'applied' });
    expect(change.adjustment).toMatchObject({ status: 'applied', beforeReward: ledger().rewards, targetReward: { gold: 20, battleEnergy: 1, material: { key: 'iron', quantity: 2 } } });
    expect(change.integrity.pendingSessionIds).toEqual([]);
  });
  it('invalidates a valid rewarded session down to zero rewards when assets are sufficient', () => {
    const change = prepareRewardCorrection({ session: session(), ledger: ledger(), profile: profile(), correction: { correctionId: 'invalid-1', validation: { status: 'invalid', reasonCodes: ['manual_invalid'] }, reason: 'manual_invalid' }, reviewerUid: 'parent-1', now });
    expect(change.result.deduction).toEqual({ gold: 60, battleEnergy: 4, material: { key: 'iron', quantity: 6 } });
    expect(change.profile).toMatchObject({ gold: 40, battleEnergy: 6, materials: { iron: 4 } });
    expect(change.ledger.effectiveRewards).toEqual({ gold: 0, battleEnergy: 0, material: { key: 'iron', quantity: 0 } });
  });
  it('persists the session correction but performs no partial deduction when any asset is insufficient', () => {
    const change = prepareRewardCorrection({ session: session(), ledger: ledger(), profile: profile({ gold: 100, battleEnergy: 10, materials: { iron: 2 } }), correction: shorten, reviewerUid: 'parent-1', now });
    expect(change.sessionPatch.recordedSeconds).toBe(1_200);
    expect(change.profile).toBeNull();
    expect(change.result.status).toBe('pending');
    expect(change.ledger).toMatchObject({ correctionStatus: 'reversal_pending', effectiveRewards: ledger().rewards });
    expect(change.adjustment).toMatchObject({ status: 'pending', appliedAt: null });
    expect(change.integrity.pendingSessionIds).toEqual(['session-1']);
  });
  it('keeps a pending correction pending until the whole deduction is affordable, then clears it once', () => {
    const pending = prepareRewardCorrection({ session: session(), ledger: ledger(), profile: profile({ materials: { iron: 2 } }), correction: shorten, reviewerUid: 'parent-1', now });
    const insufficient = preparePendingRewardCorrectionRetry({ sessionId: 'session-1', ledger: pending.ledger, adjustment: pending.adjustment, profile: profile({ materials: { iron: 3 } }), integrity: pending.integrity, reviewerUid: 'parent-1', now: now + 1 });
    expect(insufficient).toEqual({ applied: false, reason: 'REWARD_PROFILE_INSUFFICIENT' });
    const resolved = preparePendingRewardCorrectionRetry({ sessionId: 'session-1', ledger: pending.ledger, adjustment: pending.adjustment, profile: profile(), integrity: pending.integrity, reviewerUid: 'parent-1', now: now + 2 });
    expect(resolved).toMatchObject({ applied: true, profile: { gold: 60, battleEnergy: 7, materials: { iron: 6 } }, ledger: { correctionStatus: 'applied', lastResolvedBy: 'parent-1' }, adjustment: { status: 'applied', requestedBy: 'parent-1', resolvedBy: 'parent-1' }, integrity: { pendingSessionIds: [] } });
  });
  it('does not apply the same correction revision twice', () => {
    const first = prepareRewardCorrection({ session: session(), ledger: ledger(), profile: profile(), correction: shorten, reviewerUid: 'parent-1', now });
    const repeated = prepareRewardCorrection({ session: { ...session(), recordedSeconds: 1_200 }, ledger: first.ledger, profile: first.profile, correction: shorten, reviewerUid: 'parent-1', now: now + 1 });
    expect(repeated).toEqual({ alreadyApplied: true, revision: 1 });
  });
  it('rejects reward increases and material-key changes, while correcting legacy validation without reward handling', () => {
    expect(() => prepareRewardCorrection({ session: session(), ledger: ledger(), profile: profile(), correction: { ...shorten, recordedSeconds: 4_000 }, reviewerUid: 'parent-1', now })).toThrow('CORRECTION_REWARD_INCREASE_NOT_ALLOWED');
    expect(() => prepareRewardCorrection({ session: session({ taskSnapshot: { subjectId: 's_science' } }), ledger: ledger(), profile: profile(), correction: shorten, reviewerUid: 'parent-1', now })).toThrow('CORRECTION_MATERIAL_CHANGE_NOT_SUPPORTED');
    const legacy = prepareRewardCorrection({ session: session({ legacySource: { taskId: 'legacy', historyId: 'h1' }, validation: { status: 'pending_review' } }), correction: { correctionId: 'legacy-invalid', validation: { status: 'invalid', reasonCodes: ['manual_invalid'] } }, reviewerUid: 'parent-1', now });
    expect(legacy).toMatchObject({ sessionPatch: { validation: { status: 'invalid' } }, ledger: null, adjustment: null, profile: null, result: { status: 'legacy_no_reward' } });
  });
  it('allows a pending_review to invalid correction with no reward ledger', () => {
    const change = prepareRewardCorrection({ session: session({ validation: { status: 'pending_review', reasonCodes: ['clock_mismatch'] } }), correction: { correctionId: 'pending-invalid', validation: { status: 'invalid', reasonCodes: ['manual_invalid'] } }, reviewerUid: 'parent-1', now });
    expect(change).toMatchObject({ sessionPatch: { validation: { status: 'invalid' } }, result: { status: 'no_reward_ledger' } });
  });
  it('blocks new asset spending while pending but does not impose a lock when clear', () => {
    expect(() => assertNoPendingRewardCorrections({ pendingSessionIds: ['session-1'] })).toThrow('REWARD_CORRECTION_PENDING');
    expect(() => assertNoPendingRewardCorrections({ pendingSessionIds: [] })).not.toThrow();
  });
  it('keeps correction persistence payloads free of undefined values', () => {
    const applied = prepareRewardCorrection({ session: session(), ledger: ledger(), profile: profile(), correction: shorten, reviewerUid: 'parent-1', now });
    const pending = prepareRewardCorrection({ session: session(), ledger: ledger(), profile: profile({ materials: { iron: 1 } }), correction: shorten, reviewerUid: 'parent-1', now });
    const resolved = preparePendingRewardCorrectionRetry({ sessionId: 'session-1', ledger: pending.ledger, adjustment: pending.adjustment, profile: profile(), integrity: pending.integrity, reviewerUid: 'parent-1', now });
    [applied.sessionPatch, applied.ledger, applied.adjustment, applied.profile, applied.integrity, pending.sessionPatch, pending.ledger, pending.adjustment, pending.integrity, resolved.profile, resolved.ledger, resolved.adjustment, resolved.integrity].forEach((payload) => expect(findUndefinedPaths(payload)).toEqual([]));
  });
});
