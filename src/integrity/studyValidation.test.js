import { describe, expect, it } from 'vitest';
import { validateStudySession } from './studyValidation';

const seconds = (hours, minutes = 0, secondsPart = 0) => hours * 3600 + minutes * 60 + secondsPart;
const session = (duration, activityType = 'other') => ({
  recordedSeconds: duration,
  taskSnapshot: { activityType },
  segments: [{ startedAt: 1_000, endedAt: 1_000 + duration * 1000, durationSeconds: duration }],
});

describe('study validation', () => {
  it.each([[89 * 60 + 59, false], [90 * 60, false], [90 * 60 + 1, true]])('90分境界 %i', (duration, flagged) => {
    expect(validateStudySession(session(duration)).reasonCodes.includes('long_session')).toBe(flagged);
  });
  it.each([[119 * 60 + 59, false], [120 * 60, false], [120 * 60 + 1, true]])('120分境界 %i', (duration, flagged) => {
    expect(validateStudySession(session(duration)).reasonCodes.includes('review_session')).toBe(flagged);
  });
  it.each([[179 * 60 + 59, 'valid'], [180 * 60, 'pending_review'], [180 * 60 + 1, 'pending_review']])('180分境界 %i', (duration, status) => {
    expect(validateStudySession(session(duration)).status).toBe(status);
  });
  it.each([[seconds(4, 59, 59), 'pending_review'], [seconds(5), 'invalid'], [seconds(5, 0, 1), 'invalid']])('読書5時間境界 %i', (duration, status) => {
    expect(validateStudySession(session(duration, 'reading')).status).toBe(status);
  });
  it('休憩を挟んだ合計5時間は連続5時間ではない', () => {
    const result = validateStudySession({
      recordedSeconds: seconds(5), taskSnapshot: { activityType: 'reading' },
      segments: [
        { startedAt: 1_000, endedAt: 1_000 + seconds(2) * 1000, durationSeconds: seconds(2) },
        { startedAt: 1_000 + seconds(3) * 1000, endedAt: 1_000 + seconds(6) * 1000, durationSeconds: seconds(3) },
      ],
    });
    expect(result.status).not.toBe('invalid');
  });
  it('開始終了逆転はinvalid', () => {
    expect(validateStudySession({ recordedSeconds: 20, segments: [{ startedAt: 2_000, endedAt: 1_000, durationSeconds: 20 }] }).status).toBe('invalid');
  });
});
