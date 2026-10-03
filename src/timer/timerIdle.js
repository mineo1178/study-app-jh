import { isTimerOwner } from './timerEngine.js';
import { diagnosticErrorCode, recordTimerDiagnostic, TIMER_ACTIVITY_EVENTS } from './timerDiagnostics.js';

export const IDLE_AUTO_STOP_SECONDS = 5 * 60;
export const TIMER_IDLE_STORAGE_KEY = 'study-jh-timer-idle-v1';
const thresholdMs = IDLE_AUTO_STOP_SECONDS * 1000;
let currentIdle = null;
export const getTimerIdleDiagnostic = () => currentIdle?.getState() || null;
const getIdleStorage = () => {
  try { return globalThis.window?.sessionStorage || null; } catch { return null; }
};

export function rememberTimerIdleStart(timer, ownerClientId, storage = getIdleStorage(), now = Date.now()) {
  if (timer?.state !== 'running' || !isTimerOwner(timer, ownerClientId)) return;
  if (currentIdle?.getState().timerId === timer.timerId
    && currentIdle.segmentStartedAt === timer.segmentStartedAt) {
    currentIdle.startSucceeded(now);
    return;
  }
  try { storage?.setItem(TIMER_IDLE_STORAGE_KEY, JSON.stringify({ timerId: timer.timerId,
    ownerClientId, segmentStartedAt: timer.segmentStartedAt, lastUserActivityAt: now })); } catch { /* Optional persistence. */ }
}

function restoreActivity(timer, ownerClientId, storage, now) {
  try {
    const saved = JSON.parse(storage?.getItem(TIMER_IDLE_STORAGE_KEY) || 'null');
    if (saved?.timerId === timer.timerId && saved.ownerClientId === ownerClientId
      && saved.segmentStartedAt === timer.segmentStartedAt
      && Number.isFinite(saved.lastUserActivityAt)
      && saved.lastUserActivityAt >= timer.segmentStartedAt && saved.lastUserActivityAt <= now) {
      return saved.lastUserActivityAt;
    }
  } catch { /* Storage is optional; never disable the idle guard. */ }
  return timer.segmentStartedAt;
}

// One scheduler per running owner segment. Snapshots/renders never re-arm it.
export function startTimerIdle({ timer, ownerClientId, onStop, activityTarget = window,
  visibilityTarget = document, storage = getIdleStorage(), now = Date.now,
  monotonic = () => performance.now(), record = recordTimerDiagnostic }) {
  if (timer?.state !== 'running' || !isTimerOwner(timer, ownerClientId)
    || !Number.isFinite(timer.segmentStartedAt) || timer.segmentStartedAt <= 0) return null;
  let lastUserActivityAt = restoreActivity(timer, ownerClientId, storage, now());
  let deadline = lastUserActivityAt + thresholdMs;
  let monotonicDeadline = monotonic() + deadline - now();
  let timeout;
  let flushTimeout;
  let pending = false;
  let disposed = false;
  let finished = false;
  let wasHidden = visibilityTarget.visibilityState === 'hidden';
  let suspendedDeadlineReached = false;
  let lastLoggedAt = null;
  const getState = () => ({ timerId: timer.timerId, owner: true, lastUserActivityAt,
    idleDeadline: deadline, idleThresholdSeconds: IDLE_AUTO_STOP_SECONDS,
    elapsedIdleSeconds: suspendedDeadlineReached ? Math.max(IDLE_AUTO_STOP_SECONDS, Math.floor((now() - lastUserActivityAt) / 1000))
      : Math.max(0, Math.floor((thresholdMs - (monotonicDeadline - monotonic())) / 1000)), pending });
  const log = (event, details = {}) => record(event, { ...getState(), ...details, source: 'idle.scheduler' });
  const persist = (onlyIfSameSegment = false) => {
    clearTimeout(flushTimeout); flushTimeout = null;
    try {
      if (onlyIfSameSegment) {
        const saved = JSON.parse(storage?.getItem(TIMER_IDLE_STORAGE_KEY) || 'null');
        if (saved && (saved.timerId !== timer.timerId || saved.ownerClientId !== ownerClientId
          || saved.segmentStartedAt !== timer.segmentStartedAt)) return;
      }
      storage?.setItem(TIMER_IDLE_STORAGE_KEY, JSON.stringify({ timerId: timer.timerId,
        ownerClientId, segmentStartedAt: timer.segmentStartedAt, lastUserActivityAt }));
    } catch { /* In-memory detection still works. */ }
  };
  const isDue = () => !disposed && !finished && (suspendedDeadlineReached || monotonic() >= monotonicDeadline);
  const arm = () => {
    clearTimeout(timeout);
    if (!disposed && !finished && !pending) timeout = setTimeout(check, Math.max(0, monotonicDeadline - monotonic()));
  };
  const check = () => {
    if (disposed || finished || pending) return;
    if (!isDue()) { arm(); return; }
    pending = true;
    clearTimeout(timeout);
    log('idle_timeout_fired');
    log('idle_stop_requested', { reason: 'IDLE_5_MINUTES' });
    const idle = { ownerClientId, segmentStartedAt: timer.segmentStartedAt, lastUserActivityAt };
    Promise.resolve().then(() => disposed ? { skipped: true, reason: 'IDLE_DISPOSED' }
      : onStop({ timerId: timer.timerId, endAt: deadline, idle }))
      .then((result) => {
        if (!result || result.skipped) {
          if (result?.skipped) { finished = true; log('idle_stop_cancelled', { reason: result.reason }); }
          else throw new Error('IDLE_STOP_BUSY');
          return;
        }
        finished = true;
        log('idle_stop_committed', { alreadyFinished: result.alreadyFinished, reason: 'IDLE_5_MINUTES' });
      })
      .catch((error) => {
        log('idle_stop_failed', { errorCode: diagnosticErrorCode(error) });
        // Keep the original deadline on failure; retry without counting extra time.
        if (!disposed) timeout = setTimeout(check, 5000);
      })
      .finally(() => { pending = false; });
  };
  const activity = (event) => {
    if (!event.isTrusted || disposed || pending || finished) return;
    // An operation after expiry cannot revive an overdue timer.
    if (isDue()) { check(); return; }
    lastUserActivityAt = now();
    deadline = lastUserActivityAt + thresholdMs;
    monotonicDeadline = monotonic() + thresholdMs;
    if (!flushTimeout) flushTimeout = setTimeout(persist, 1000);
    if (lastLoggedAt === null || monotonic() - lastLoggedAt >= 60_000) {
      lastLoggedAt = monotonic(); log('idle_reset_by_user', { activityEvent: event.type });
    }
    arm();
  };
  const options = { passive: true, capture: true };
  const visibility = () => {
    // Some mobile monotonic clocks stop during screen lock. On return, also
    // check the persisted wall deadline; visibility itself never grants time.
    if (wasHidden && visibilityTarget.visibilityState === 'visible' && now() >= deadline) suspendedDeadlineReached = true;
    wasHidden = visibilityTarget.visibilityState === 'hidden';
    check();
  };
  const saveBeforeNavigation = () => persist();
  TIMER_ACTIVITY_EVENTS.forEach((event) => activityTarget.addEventListener(event, activity, options));
  visibilityTarget.addEventListener('visibilitychange', visibility);
  activityTarget.addEventListener('focus', check);
  activityTarget.addEventListener('pagehide', saveBeforeNavigation);
  activityTarget.addEventListener('beforeunload', saveBeforeNavigation);
  const controller = {
    segmentStartedAt: timer.segmentStartedAt, getState, isDue, blocksStale: () => pending || isDue(),
    startSucceeded(at) {
      if (disposed || pending || finished) return;
      lastUserActivityAt = at; deadline = at + thresholdMs;
      suspendedDeadlineReached = false;
      monotonicDeadline = monotonic() + thresholdMs;
      persist(); log('idle_timer_armed', { reason: 'START_OR_RESUME_SUCCESS' }); arm();
    },
    dispose() {
      disposed = true; persist(true); clearTimeout(timeout);
      TIMER_ACTIVITY_EVENTS.forEach((event) => activityTarget.removeEventListener(event, activity, options));
      visibilityTarget.removeEventListener('visibilitychange', visibility);
      activityTarget.removeEventListener('focus', check);
      activityTarget.removeEventListener('pagehide', saveBeforeNavigation);
      activityTarget.removeEventListener('beforeunload', saveBeforeNavigation);
      if (currentIdle === controller) currentIdle = null;
    },
  };
  currentIdle = controller;
  persist(); log('idle_timer_armed'); arm();
  return controller;
}
