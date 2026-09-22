import { describe, expect, it } from 'vitest';
import { buildReviewQueue, durationFieldsFromSeconds, durationSecondsFromFields, isCanonicalHistoryCorrectionTarget, isDurationCorrectionAllowed } from './manualReviewUi.js';

describe('manual review UI helpers', () => {
  it('parses exact duration fields without losing seconds and rejects an increase', () => {
    expect(durationSecondsFromFields({ hours: 1, minutes: 20, seconds: 30 })).toBe(4830);
    expect(durationFieldsFromSeconds(4830)).toEqual({ hours: 1, minutes: 20, seconds: 30 });
    expect(durationSecondsFromFields({ hours: 0, minutes: 60, seconds: 0 })).toBeNull();
    expect(isDurationCorrectionAllowed(4830, 4831)).toBe(false);
  });
  it('builds review counts and accepts persisted sessions only', () => {
    const queue = buildReviewQueue({ studySessions: [{ id: 'pending', validation: { status: 'pending_review' } }, { id: 'valid', validation: { status: 'valid' } }], integrity: { pendingSessionIds: ['pending-reward', 'pending-reward'] } });
    expect(queue).toMatchObject({ pendingCorrectionSessionIds: ['pending-reward'], badgeCount: 2 });
    expect(isCanonicalHistoryCorrectionTarget({ id: 'persisted' })).toBe(true);
    expect(isCanonicalHistoryCorrectionTarget({ id: 'live', isLive: true })).toBe(false);
    expect(isCanonicalHistoryCorrectionTarget({ id: 'legacy', isVirtualLegacy: true })).toBe(false);
  });
});
