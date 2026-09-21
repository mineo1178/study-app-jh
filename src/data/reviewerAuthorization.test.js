import { describe, expect, it } from 'vitest';
import { assertAuthorizedRewardReviewer, assertReviewerUid, isAuthorizedRewardReviewer, normalizeReviewerMember } from './reviewerAuthorization.js';

describe('reward reviewer authorization', () => {
  it('authorizes only active parents and admins', () => {
    expect(isAuthorizedRewardReviewer({ role: 'parent', active: true })).toBe(true);
    expect(isAuthorizedRewardReviewer({ role: 'admin', active: true })).toBe(true);
    expect(isAuthorizedRewardReviewer({ role: 'student', active: true })).toBe(false);
    expect(isAuthorizedRewardReviewer({ role: 'parent', active: false })).toBe(false);
    expect(isAuthorizedRewardReviewer()).toBe(false);
    expect(normalizeReviewerMember({ role: 'unknown', active: true })).toEqual({ role: 'student', active: true });
  });

  it('uses a single explicit error for unauthenticated or unauthorized reviewers', () => {
    expect(() => assertAuthorizedRewardReviewer({ role: 'student', active: true })).toThrow('REVIEWER_NOT_AUTHORIZED');
    expect(() => assertReviewerUid('')).toThrow('REVIEWER_NOT_AUTHORIZED');
  });
});
