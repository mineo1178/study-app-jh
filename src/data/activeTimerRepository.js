import { doc, runTransaction } from 'firebase/firestore';
import { VALIDATION_VERSION } from '../integrity/validationConfig.js';
import { closeSegment, isActiveTimer, isStaleActiveTimer, timerRecordedSeconds, timerSegmentsAtEnd } from '../timer/timerEngine.js';

const ACTIVE_TIMER_ID = 'current';
export const activeTimerRef = (db, familyId) => doc(db, 'families', familyId, 'apps', 'junior-high', 'activeTimers', ACTIVE_TIMER_ID);
export const staleTimerSessionId = (timer) => timer.timerId;
export const canForceInvalidateStaleTimer = (timer, now = Date.now()) => isStaleActiveTimer(timer, now);

export async function startActiveTimer({ db, familyId, task, timerId, ownerClientId, now = Date.now() }) {
  const ref = activeTimerRef(db, familyId);
  return runTransaction(db, async (transaction) => {
    const existing = (await transaction.get(ref)).data();
    if (isActiveTimer(existing)) throw new Error('ACTIVE_TIMER_EXISTS');
    const timer = {
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
    if (!timer || timer.timerId !== timerId || timer.ownerClientId !== ownerClientId || timer.state !== 'running') return false;
    transaction.update(ref, { lastHeartbeatAt: now, updatedAt: now });
    return true;
  });
}

export function buildStaleTimerInvalidSession(timer, task = {}, now = Date.now()) {
  const endAt = Number(timer.lastHeartbeatAt) || Number(timer.segmentStartedAt) || Number(timer.startedAt) || now;
  const segments = timerSegmentsAtEnd(timer, endAt);
  return {
    timerId: timer.timerId,
    taskId: timer.taskId,
    taskSnapshot: {
      categoryId: task.categoryId || null,
      subjectId: task.subjectId || null,
      activityType: task.activityType || 'other',
      title: task.title || '',
      type: task.type || 'self',
    },
    date: new Date(endAt).toLocaleDateString('sv-SE'),
    segments,
    recordedSeconds: timerRecordedSeconds(timer, endAt),
    validation: {
      status: 'invalid',
      reasonCodes: ['stale_timer_forced_invalid'],
      validationVersion: VALIDATION_VERSION,
    },
    memo: '長時間停止した計測を自動的に無効化',
    legacySource: null,
    createdAt: now,
    updatedAt: now,
  };
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

export async function finishActiveTimer({ db, familyId, task, timerId, ownerClientId, endAt = Date.now(), validation, memo = '' }) {
  const timerRef = activeTimerRef(db, familyId);
  const sessionRef = doc(db, 'families', familyId, 'apps', 'junior-high', 'studySessions', timerId);
  return runTransaction(db, async (transaction) => {
    const [timerSnap, existingSession] = await Promise.all([transaction.get(timerRef), transaction.get(sessionRef)]);
    if (existingSession.exists()) return { session: existingSession.data(), alreadyFinished: true };
    const timer = timerSnap.data();
    if (!timer || timer.timerId !== timerId || timer.ownerClientId !== ownerClientId) throw new Error('TIMER_NOT_OWNER');
    const stale = timer.state === 'running' && isStaleActiveTimer(timer, endAt);
    const safeEndAt = stale
      ? Number(timer.lastHeartbeatAt) || endAt
      : endAt;
    const segments = timerSegmentsAtEnd(timer, safeEndAt);
    const recordedSeconds = segments.reduce((sum, segment) => sum + (Number(segment.durationSeconds) || 0), 0);
    const session = {
      timerId,
      taskId: task.id,
      taskSnapshot: {
        categoryId: task.categoryId,
        subjectId: task.subjectId,
        activityType: task.activityType || 'other',
        title: task.title || '',
        type: task.type || 'self',
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
    transaction.set(sessionRef, session);
    if (stale) transaction.delete(timerRef);
    else transaction.set(timerRef, { ...timer, state: 'finished', segmentStartedAt: null, accumulatedSeconds: recordedSeconds, updatedAt: endAt, finishedAt: endAt }, { merge: true });
    return { session, alreadyFinished: false };
  });
}
