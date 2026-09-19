import {
  CLOCK_MISMATCH_TOLERANCE_SECONDS,
  HIGH_RISK_SESSION_SECONDS,
  LONG_SESSION_SECONDS,
  READING_CONTINUOUS_LIMIT_SECONDS,
  REVIEW_SESSION_SECONDS,
  VALIDATION_VERSION,
} from './validationConfig';

const asNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function segmentDurationSeconds(segment) {
  const explicit = asNumber(segment?.durationSeconds);
  if (explicit > 0) return Math.floor(explicit);
  const startedAt = asNumber(segment?.startedAt);
  const endedAt = asNumber(segment?.endedAt);
  return startedAt > 0 && endedAt >= startedAt ? Math.floor((endedAt - startedAt) / 1000) : 0;
}

export function getRecordedSeconds(session) {
  const supplied = session?.recordedSeconds ?? session?.duration;
  if (supplied !== undefined && supplied !== null && Number.isFinite(Number(supplied))) return Math.max(0, Math.floor(Number(supplied)));
  return (session?.segments || []).reduce((sum, segment) => sum + segmentDurationSeconds(segment), 0);
}

export function getLongestSegmentSeconds(segments = []) {
  return Math.max(0, ...segments.map(segmentDurationSeconds));
}

export function validateStudySession(session, { previousIntervals = [] } = {}) {
  const segments = session?.segments || [];
  const recordedSeconds = getRecordedSeconds(session);
  const reasonCodes = [];
  let status = 'valid';

  const hasBadSegment = segments.some((segment) => {
    const startedAt = asNumber(segment?.startedAt);
    const endedAt = asNumber(segment?.endedAt);
    return startedAt > 0 && endedAt > 0 && endedAt < startedAt;
  });
  if (hasBadSegment) {
    reasonCodes.push('starts_after_end');
    status = 'invalid';
  }

  const segmentTotal = segments.reduce((sum, segment) => sum + segmentDurationSeconds(segment), 0);
  if (segments.length > 0 && Math.abs(recordedSeconds - segmentTotal) > CLOCK_MISMATCH_TOLERANCE_SECONDS && status !== 'invalid') {
    reasonCodes.push('clock_mismatch');
    status = 'pending_review';
  }

  if (recordedSeconds > LONG_SESSION_SECONDS) reasonCodes.push('long_session');
  if (recordedSeconds > REVIEW_SESSION_SECONDS) reasonCodes.push('review_session');
  if (recordedSeconds >= HIGH_RISK_SESSION_SECONDS && status !== 'invalid') {
    reasonCodes.push('high_risk_session');
    status = 'pending_review';
  }

  if (session?.taskSnapshot?.activityType === 'reading'
    && getLongestSegmentSeconds(segments) >= READING_CONTINUOUS_LIMIT_SECONDS) {
    reasonCodes.push('reading_continuous_5h');
    status = 'invalid';
  }

  const hasOverlap = segments.some((segment) => {
    const start = asNumber(segment?.startedAt);
    const end = asNumber(segment?.endedAt);
    return previousIntervals.some((interval) => start < asNumber(interval?.end) && end > asNumber(interval?.start));
  });
  if (hasOverlap && status !== 'invalid') {
    reasonCodes.push('overlap');
    status = 'pending_review';
  }

  return {
    status,
    reasonCodes,
    validationVersion: VALIDATION_VERSION,
  };
}

export function isEffectiveValidation(validation) {
  return (validation?.status || 'valid') === 'valid';
}
