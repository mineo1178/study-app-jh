import { doc, runTransaction } from 'firebase/firestore';
import { VALIDATION_VERSION } from '../integrity/validationConfig.js';
import { validateStudySession } from '../integrity/studyValidation.js';
import { closeSegment, isActiveTimer, isStaleActiveTimer, timerRecordedSeconds, timerSegmentsAtEnd } from '../timer/timerEngine.js';

const ACTIVE_TIMER_ID = 'current';
export const activeTimerRef = (db, familyId) => doc(db, 'families', familyId, 'apps', 'junior-high', 'activeTimers', ACTIVE_TIMER_ID);
export const staleTimerSessionId = (timer) => timer.timerId;
export const canForceInvalidateStaleTimer = (timer, now = Date.now()) => isStaleActiveTimer(timer, now);
export const canFinishActiveTimer = (timer, timerId) => Boolean(timer && timer.timerId === timerId && isActiveTimer(timer));
export const canHeartbeatActiveTimer = (timer, timerId, ownerClientId) => Boolean(timer && timer.timerId === timerId && timer.ownerClientId === ownerClientId && timer.state === 'running');

export function buildActiveTimer({ task, timerId, ownerClientId, now = Date.now() }) {
  return {
    timerId,
    taskId: task.id,
    ownerClientId,
    state: 'running',
    segments: [],
    segmentStartedAt: now,
    accumulatedSeconds: 0,
    startedAt: now,
    lastHeartbeatAt: now,
    updatedAt: now,
  };
}

export async function startActiveTimer({ db, familyId, task, timerId, ownerClientId, now = Date.now() }) {
  const ref = activeTimerRef(db, familyId);
  return runTransaction(db, async (transaction) => {
    const existing = (await transaction.get(ref)).data();
    if (isActiveTimer(existing)) throw new Error('ACTIVE_TIMER_EXISTS');
    const timer = buildActiveTimer({ task, timerId, ownerClientId, now });
    transaction.set(ref, timer);
    return timer;
  });
}

export async function pauseActiveTimer({ db, familyId, timerId, ownerClientId, now = Date.now() }) {
  const ref = activeTimerRef(db, familyId);
  return runTransaction(db, async (transaction) => {
    const timer = (await transaction.get(ref)).data();
    if (!timer || timer.timerId !== timerId || timer.ownerClientId !== ownerClientId) throw new Error('TIMER_NOT_OWNER');
    if (timer.state !== 'running') return timer;
    const segment = closeSegment(timer.segmentStartedAt, now);
    const accumulatedSeconds = timerRecordedSeconds(timer, now);
    transaction.update(ref, {
      state: 'paused',
      segments: segment ? [...(timer.segments || []), segment] : (timer.segments || []),
      segmentStartedAt: null,
      accumulatedSeconds,
      lastHeartbeatAt: now,
      updatedAt: now,
    });
    return { ...timer, state: 'paused', accumulatedSeconds, segmentStartedAt: null };
  });
}

export async function resumeActiveTimer({ db, familyId, timerId, ownerClientId, now = Date.now() }) {
  const ref = activeTimerRef(db, familyId);
  return runTransaction(db, async (transaction) => {
    const timer = (await transaction.get(ref)).data();
    if (!timer || timer.timerId !== timerId || timer.ownerClientId !== ownerClientId) throw new Error('TIMER_NOT_OWNER');
    if (timer.state !== 'paused') return timer;
    transaction.update(ref, { state: 'running', segmentStartedAt: now, lastHeartbeatAt: now, updatedAt: now });
    return { ...timer, state: 'running', segmentStartedAt: now, lastHeartbeatAt: now };
  });
}

export async function heartbeatActiveTimer({ db, familyId, timerId, ownerClientId, now = Date.now() }) {
  const ref = activeTimerRef(db, familyId);
  return runTransaction(db, async (transaction) => {
    const timer = (await transaction.get(ref)).data();
    if (!canHeartbeatActiveTimer(timer, timerId, ownerClientId)) return false;
    transaction.update(ref, { lastHeartbeatAt: now, updatedAt: now });
    return true;
  });
}

export function buildStaleTimerInvalidSession(timer, task = {}, now = Date.now()) {
  return buildForcedInvalidTimerSession(timer, task, 'stale_timer_forced_invalid', now);
}

export function buildForcedInvalidTimerSession(timer, task = {}, reasonCode, now = Date.now()) {
  const taskSnapshot = task || {};
  const endAt = Number(timer.lastHeartbeatAt) || Number(timer.segmentStartedAt) || Number(timer.startedAt) || now;
  const segments = timerSegmentsAtEnd(timer, endAt);
  return {
    timerId: timer.timerId,
    taskId: timer.taskId,
    taskSnapshot: {
      categoryId: taskSnapshot.categoryId || null,
      subjectId: taskSnapshot.subjectId || null,
      activityType: taskSnapshot.activityType || 'other',
      title: taskSnapshot.title || '',
      type: taskSnapshot.type || 'self',
    },
    date: new Date(endAt).toLocaleDateString('sv-SE'),
    segments,
    recordedSeconds: timerRecordedSeconds(timer, endAt),
    validation: {
      status: 'invalid',
      reasonCodes: [reasonCode],
      validationVersion: VALIDATION_VERSION,
    },
    memo: '長時間停止した計測を自動的に無効化',
    legacySource: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildTimerSwitchPlan({ existingTimer, existingTask, nextTask, nextTimerId, nextOwnerClientId, now = Date.now() }) {
  const nextTimer = buildActiveTimer({ task: nextTask, timerId: nextTimerId, ownerClientId: nextOwnerClientId, now });
  if (!isActiveTimer(existingTimer)) return { nextTimer, previousSession: null, switched: false, resumed: false };
  if (existingTimer.taskId === nextTask.id) {
    if (existingTimer.state === 'paused') return { nextTimer: null, previousSession: null, switched: false, resumed: true };
    return { nextTimer: null, previousSession: null, switched: false, resumed: false };
  }
  const orphan = !existingTask;
  const stale = existingTimer.state === 'running' && isStaleActiveTimer(existingTimer, now);
  const reasonCode = orphan ? 'orphan_timer_forced_invalid' : stale ? 'stale_timer_forced_invalid' : null;
  const previousSession = reasonCode
    ? buildForcedInvalidTimerSession(existingTimer, existingTask, reasonCode, now)
    : buildFinishedTimerSession(existingTimer, existingTask, { endAt: now });
  return { nextTimer, previousSession, switched: true, resumed: false, invalidatedPrevious: Boolean(reasonCode) };
}

export async function startOrSwitchActiveTimer({ db, familyId, task, tasks = [], timerId, ownerClientId, now = Date.now() }) {
  const ref = activeTimerRef(db, familyId);
  return runTransaction(db, async (transaction) => {
    const timerSnap = await transaction.get(ref);
    const existingTimer = timerSnap.exists() ? timerSnap.data() : null;
    const existingTask = tasks.find((item) => item.id === existingTimer?.taskId) || null;
    const plan = buildTimerSwitchPlan({ existingTimer, existingTask, nextTask: task, nextTimerId: timerId, nextOwnerClientId: ownerClientId, now });
    if (plan.resumed) {
      if (existingTimer.ownerClientId !== ownerClientId) throw new Error('TIMER_NOT_OWNER');
      transaction.update(ref, { state: 'running', segmentStartedAt: now, lastHeartbeatAt: now, updatedAt: now });
      return { ...plan, timer: { ...existingTimer, state: 'running', segmentStartedAt: now, lastHeartbeatAt: now } };
    }
    if (!plan.nextTimer) return { ...plan, timer: existingTimer };
    if (plan.previousSession) {
      const previousSessionRef = doc(db, 'families', familyId, 'apps', 'junior-high', 'studySessions', existingTimer.timerId);
      const previousSessionSnap = await transaction.get(previousSessionRef);
      if (!previousSessionSnap.exists()) {
        const validation = plan.invalidatedPrevious
          ? plan.previousSession.validation
          : validateStudySession(plan.previousSession);
        transaction.set(previousSessionRef, { ...plan.previousSession, validation });
      }
    }
    transaction.set(ref, plan.nextTimer);
    return { ...plan, timer: plan.nextTimer };
  });
}

export async function invalidateStaleActiveTimer({ db, familyId, task, now = Date.now() }) {
  const timerRef = activeTimerRef(db, familyId);
  return runTransaction(db, async (transaction) => {
    const timerSnap = await transaction.get(timerRef);
    if (!timerSnap.exists()) return { invalidated: false, reason: 'NO_ACTIVE_TIMER' };
    const timer = timerSnap.data();
    if (!canForceInvalidateStaleTimer(timer, now)) return { invalidated: false, reason: 'TIMER_HEARTBEAT_RECOVERED' };
    const sessionRef = doc(db, 'families', familyId, 'apps', 'junior-high', 'studySessions', staleTimerSessionId(timer));
    const existingSession = await transaction.get(sessionRef);
    if (existingSession.exists()) return { invalidated: false, reason: 'SESSION_ALREADY_EXISTS' };
    const session = buildStaleTimerInvalidSession(timer, task, now);
    transaction.set(sessionRef, session);
    transaction.delete(timerRef);
    return { invalidated: true, session };
  });
}

export function buildFinishedTimerSession(timer, task = {}, { endAt = Date.now(), validation, memo = '' } = {}) {
  const taskSnapshot = task || {};
  const stale = timer.state === 'running' && isStaleActiveTimer(timer, endAt);
  const safeEndAt = stale
    ? Number(timer.lastHeartbeatAt) || endAt
    : endAt;
  const segments = timerSegmentsAtEnd(timer, safeEndAt);
  const recordedSeconds = segments.reduce((sum, segment) => sum + (Number(segment.durationSeconds) || 0), 0);
  return {
    timerId: timer.timerId,
    taskId: timer.taskId,
    taskSnapshot: {
      categoryId: taskSnapshot.categoryId,
      subjectId: taskSnapshot.subjectId,
      activityType: taskSnapshot.activityType || 'other',
      title: taskSnapshot.title || '',
      type: taskSnapshot.type || 'self',
    },
    date: new Date(safeEndAt).toLocaleDateString('sv-SE'),
    segments,
    recordedSeconds,
    validation: stale ? { status: 'invalid', reasonCodes: ['stale_timer_forced_invalid'], validationVersion: VALIDATION_VERSION } : validation,
    memo,
    legacySource: null,
    createdAt: endAt,
    updatedAt: endAt,
  };
}

export async function finishActiveTimer({ db, familyId, task, timerId, endAt = Date.now(), validation, memo = '' }) {
  const timerRef = activeTimerRef(db, familyId);
  const sessionRef = doc(db, 'families', familyId, 'apps', 'junior-high', 'studySessions', timerId);
  return runTransaction(db, async (transaction) => {
    const [timerSnap, existingSession] = await Promise.all([transaction.get(timerRef), transaction.get(sessionRef)]);
    if (existingSession.exists()) return { session: existingSession.data(), alreadyFinished: true };
    const timer = timerSnap.data();
    if (!canFinishActiveTimer(timer, timerId)) throw new Error('TIMER_NOT_ACTIVE');
    const session = buildFinishedTimerSession(timer, task, { endAt, validation, memo });
    transaction.set(sessionRef, session);
    // Delete only after the Session write is part of this same transaction. This also
    // makes an owner heartbeat that races after STOP a no-op rather than a revival.
    transaction.delete(timerRef);
    return { session, alreadyFinished: false };
  });
}
