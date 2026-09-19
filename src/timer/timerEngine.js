import { READING_CONTINUOUS_LIMIT_SECONDS } from '../integrity/validationConfig.js';

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function isActiveTimer(timer) {
  return Boolean(timer && (timer.state === 'running' || timer.state === 'paused'));
}

export function isTimerOwner(timer, currentClientId) {
  return Boolean(timer?.ownerClientId && currentClientId && timer.ownerClientId === currentClientId);
}

export function isStaleActiveTimer(timer, now = Date.now(), thresholdMs = 15 * 60 * 1000) {
  if (!timer || timer.state !== 'running') return false;
  const heartbeat = number(timer.lastHeartbeatAt) || number(timer.segmentStartedAt);
  return heartbeat > 0 && now - heartbeat >= thresholdMs;
}

export function closeSegment(startedAt, endedAt) {
  const start = number(startedAt);
  const end = number(endedAt);
  if (!start || end < start) return null;
  return { startedAt: start, endedAt: end, durationSeconds: Math.floor((end - start) / 1000) };
}

export function timerRecordedSeconds(timer, now = Date.now()) {
  const accumulated = Math.max(0, number(timer?.accumulatedSeconds));
  if (!timer || timer.state !== 'running') return accumulated;
  const end = isStaleActiveTimer(timer, now) ? number(timer.lastHeartbeatAt) : now;
  const open = closeSegment(timer.segmentStartedAt, end);
  return accumulated + (open?.durationSeconds || 0);
}

export function timerSegmentsAtEnd(timer, endAt) {
  const segments = [...(timer?.segments || [])];
  if (timer?.state === 'running') {
    const segment = closeSegment(timer.segmentStartedAt, endAt);
    if (segment) segments.push(segment);
  }
  return segments;
}

export function shouldAutoFinishReading(timer, activityType, now = Date.now()) {
  if (activityType !== 'reading' || timer?.state !== 'running') return false;
  const end = isStaleActiveTimer(timer, now) ? number(timer.lastHeartbeatAt) : now;
  const segment = closeSegment(timer.segmentStartedAt, end);
  return (segment?.durationSeconds || 0) >= READING_CONTINUOUS_LIMIT_SECONDS;
}
