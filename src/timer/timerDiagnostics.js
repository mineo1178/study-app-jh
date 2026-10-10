import { isActiveTimer, isStaleActiveTimer } from './timerEngine.js';

export const TIMER_DIAGNOSTICS_KEY = 'study-jh-timer-diagnostics-v1';
export const TIMER_DIAGNOSTICS_LIMIT = 300;
const fields = new Set(['timerId', 'status', 'startedAt', 'segmentStartedAt', 'lastHeartbeatAt', 'heartbeatAgeMs', 'stale', 'exists', 'fromCache', 'hasPendingWrites', 'subscriptionId', 'reason', 'source', 'errorCode', 'authenticated', 'authChanged', 'sampleMode', 'activeTab', 'hasTimerTask', 'owner', 'alreadyFinished', 'invalidated', 'switched', 'resumed', 'validationStatus', 'recordedSeconds', 'hadActiveTimer', 'startedAtType', 'heartbeatType', 'caller', 'enabled']);
for (const field of ['activityEvent', 'lastUserActivityAt', 'elapsedIdleSeconds', 'focus', 'idleDeadline', 'idleThresholdSeconds', 'pending']) fields.add(field);
for (const field of ['hiddenStartedAt', 'lastHiddenAt', 'lastVisibleAt', 'longestHiddenSeconds', 'reviewRequired']) fields.add(field);
fields.add('heartbeatFingerprint');
for (const field of ['progressObservedAtMs', 'staleElapsedMs', 'staleThresholdMs', 'synced']) fields.add(field);
const scalar = (value) => typeof value === 'boolean' || value === null ? value : typeof value === 'number' ? (Number.isFinite(value) ? value : null) : typeof value === 'string' ? value.slice(0, 96) : undefined;
const typeOfTime = (value) => value?.toMillis ? 'firestore_timestamp' : typeof value;
const timeValue = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function diagnosticTimerState(timer, now = Date.now()) {
  return {
    ...diagnosticUserActivity(now),
    timerId: timer?.timerId || null, status: timer?.state || 'missing',
    startedAt: timeValue(timer?.startedAt), segmentStartedAt: timeValue(timer?.segmentStartedAt),
    lastHeartbeatAt: timeValue(timer?.lastHeartbeatAt), heartbeatAgeMs: timeValue(timer?.lastHeartbeatAt) === null ? null : now - timer.lastHeartbeatAt,
    startedAtType: typeOfTime(timer?.startedAt), heartbeatType: typeOfTime(timer?.lastHeartbeatAt),
    stale: isStaleActiveTimer(timer),
  };
}

export function diagnosticErrorCode(error) {
  return typeof error?.code === 'string' ? error.code.slice(0, 64) : /^[A-Z_]+$/.test(error?.message || '') ? error.message : 'ERROR';
}

export function createTimerDiagnostics({ storage = () => typeof window === 'undefined' ? null : window.localStorage, now = Date.now, monotonic = () => globalThis.performance?.now?.() ?? 0, environment = () => ({ visibility: typeof document === 'undefined' ? 'unknown' : document.visibilityState, focus: typeof document === 'undefined' ? null : document.hasFocus(), online: typeof navigator === 'undefined' ? null : navigator.onLine }) } = {}) {
  const instance = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  let sequence = 0;
  let previousWall = null;
  let previousMonotonic = null;
  let unsaved = [];
  const listeners = new Set();
  const sanitize = (entry) => {
    if (!entry || typeof entry.event !== 'string' || typeof entry.timestamp !== 'number') return null;
    const output = { timestamp: entry.timestamp, event: entry.event.slice(0, 64) };
    for (const [key, value] of Object.entries(entry)) {
      if (!fields.has(key) && !['id', 'instance', 'visibility', 'online', 'monotonicMs', 'clockDeltaMs'].includes(key)) continue;
      const safe = scalar(value); if (safe !== undefined) output[key] = safe;
    }
    return output;
  };
  const read = () => {
    try {
      const target = storage();
      if (!target) return null;
      const saved = JSON.parse(target.getItem(TIMER_DIAGNOSTICS_KEY) || '[]');
      return Array.isArray(saved) ? saved.slice(-TIMER_DIAGNOSTICS_LIMIT).map(sanitize).filter(Boolean) : [];
    } catch { return null; }
  };
  let entries = read() || [];
  return {
    getSnapshot: () => entries,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    record(event, details = {}) {
      // Diagnostics must never change or prevent a timer operation, including quota failures.
      try {
        const wall = now(); const elapsed = monotonic();
        const entry = sanitize({ ...details, ...environment(), id: `${instance}:${++sequence}`, instance, event, timestamp: wall, monotonicMs: elapsed, clockDeltaMs: previousWall === null ? 0 : wall - previousWall - (elapsed - previousMonotonic) });
        if (!entry) return;
        previousWall = wall; previousMonotonic = elapsed;
        const merged = new Map([...(read() || entries), ...unsaved].map((item) => [item.id, item]));
        entries = [...merged.values(), entry].slice(-TIMER_DIAGNOSTICS_LIMIT);
        try { storage()?.setItem(TIMER_DIAGNOSTICS_KEY, JSON.stringify(entries)); unsaved = []; } catch { unsaved = [...unsaved, entry].slice(-TIMER_DIAGNOSTICS_LIMIT); }
        for (const listener of listeners) { try { listener(); } catch { /* An observer cannot break a timer. */ } }
      } catch { /* Diagnostic failures are isolated. */ }
    },
    export: () => JSON.stringify({ version: 1, entries }, null, 2),
  };
}

export const timerDiagnostics = createTimerDiagnostics();
export const recordTimerDiagnostic = (event, details) => timerDiagnostics.record(event, details);

// Diagnostics observe the same explicit inputs as the owner idle scheduler.
export const TIMER_ACTIVITY_EVENTS = ['pointerdown', 'click', 'keydown', 'touchstart', 'wheel'];
let lastUserActivityAt = null;
export function diagnosticUserActivity(now = Date.now()) {
  return { lastUserActivityAt, elapsedIdleSeconds: lastUserActivityAt === null ? null : Math.max(0, Math.floor((now - lastUserActivityAt) / 1000)) };
}
export function listenTimerUserActivity(record, target = window, now = Date.now) {
  lastUserActivityAt = null;
  let lastLoggedAt = null;
  const listener = (event) => {
    if (!event.isTrusted) return;
    lastUserActivityAt = now();
    if (lastLoggedAt !== null && lastUserActivityAt - lastLoggedAt < 60_000) return;
    lastLoggedAt = lastUserActivityAt;
    record('user_activity', { ...diagnosticUserActivity(lastUserActivityAt), activityEvent: event.type });
  };
  const options = { passive: true, capture: true };
  TIMER_ACTIVITY_EVENTS.forEach((event) => target.addEventListener(event, listener, options));
  return () => TIMER_ACTIVITY_EVENTS.forEach((event) => target.removeEventListener(event, listener, options));
}

export function recordTimerSnapshot(previous, next, metadata, subscriptionId, record = recordTimerDiagnostic) {
  record('active_timer_snapshot', { ...diagnosticTimerState(next), exists: Boolean(next), fromCache: metadata.fromCache, hasPendingWrites: metadata.hasPendingWrites, subscriptionId, source: 'app.active_timer_snapshot' });
  if (!next) {
    record('local_timer_reset', { ...diagnosticTimerState(previous), subscriptionId, hadActiveTimer: isActiveTimer(previous), reason: metadata.fromCache ? 'CACHE_MISSING' : metadata.hasPendingWrites ? 'LOCAL_PENDING_MISSING' : 'SERVER_MISSING_UNKNOWN_CALLER', source: 'app.active_timer_snapshot' });
    if (isActiveTimer(previous)) record('active_timer_disappearance', { ...diagnosticTimerState(previous), subscriptionId, fromCache: metadata.fromCache, hasPendingWrites: metadata.hasPendingWrites, reason: metadata.fromCache ? 'CACHE_MISSING' : 'SERVER_MISSING_UNKNOWN_CALLER' });
    if (isActiveTimer(previous) && !metadata.fromCache && !metadata.hasPendingWrites) record('active_timer_delete_observed', { ...diagnosticTimerState(previous), subscriptionId, reason: 'SERVER_MISSING_UNKNOWN_CALLER', source: 'app.active_timer_snapshot' });
  } else if (previous?.timerId && previous.timerId !== next.timerId) {
    record('active_timer_replaced', { ...diagnosticTimerState(previous), subscriptionId, reason: 'NEW_TIMER_SNAPSHOT' });
  }
}

export async function traceTimerOperation(operation, details, run) {
  recordTimerDiagnostic(`${operation}_request`, details);
  try {
    const result = await run();
    try {
      const timer = result?.timer || (result?.state ? result : null);
      recordTimerDiagnostic(`${operation}_success`, { ...details, ...(timer ? diagnosticTimerState(timer) : {}), alreadyFinished: result?.alreadyFinished ?? false, invalidated: result?.invalidated ?? false, switched: result?.switched ?? false, resumed: result?.resumed ?? false, reason: result?.reason || (result === false ? 'NO_OP' : 'COMMITTED') });
      if (result?.session && !result.alreadyFinished) {
        recordTimerDiagnostic('session_finalized', { timerId: result.session.timerId, validationStatus: result.session.validation?.status, recordedSeconds: result.session.recordedSeconds, reason: result.session.validation?.reasonCodes?.join(',') || operation, source: details.source });
        recordTimerDiagnostic('active_timer_delete_committed', { timerId: result.session.timerId, reason: operation, source: details.source });
      }
      if (result?.previousSession) recordTimerDiagnostic('session_finalized_or_existing', { timerId: result.previousSession.timerId, validationStatus: result.previousSession.validation?.status, reason: 'TASK_SWITCH', source: details.source });
      } catch { /* A committed operation must remain successful if diagnostics fail. */ }
    return result;
  } catch (error) {
    recordTimerDiagnostic(`${operation}_failure`, { ...details, errorCode: diagnosticErrorCode(error) });
    throw error;
  }
}

export function listenTimerDiagnosticEnvironment(record, windowTarget = window, documentTarget = document) {
  const callbacks = [];
  for (const [target, events] of [[documentTarget, ['visibilitychange']], [windowTarget, ['focus', 'blur', 'online', 'offline']]]) {
    for (const event of events) { const listener = () => record(event, { focus: documentTarget.hasFocus?.() ?? null }); target.addEventListener(event, listener); callbacks.push(() => target.removeEventListener(event, listener)); }
  }
  record('component_mount');
  return () => { callbacks.forEach((remove) => remove()); record('component_unmount'); };
}
