import { inferLegacyActivityType, normalizeActivityType } from '../integrity/activityTypes.js';
import { isEffectiveValidation, validateStudySession } from '../integrity/studyValidation.js';
import { isStaleActiveTimer, timerRecordedSeconds, timerSegmentsAtEnd } from '../timer/timerEngine.js';

const getDateFromTimestamp = (timestamp) => {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
};

export function normalizeLegacyHistory(task, history) {
  const startedAt = Number(history?.startedAt) || 0;
  const endedAt = Number(history?.endedAt) || (startedAt + (Number(history?.duration) || 0) * 1000);
  const durationSeconds = Math.max(0, Number(history?.duration) || 0);
  const activityType = normalizeActivityType(task.activityType || inferLegacyActivityType(task.subjectId, task.title));
  const baseValidation = validateStudySession({
    recordedSeconds: durationSeconds,
    segments: startedAt ? [{ startedAt, endedAt, durationSeconds }] : [],
    taskSnapshot: { activityType },
    legacySource: { taskId: task.id, historyId: history?.id || null },
  });
  // Legacy history has no pause boundaries; duration alone cannot prove a five-hour continuous reading.
  const validation = activityType === 'reading' && durationSeconds >= 5 * 60 * 60
    ? { ...baseValidation, status: 'pending_review', reasonCodes: [...baseValidation.reasonCodes.filter((code) => code !== 'reading_continuous_5h'), 'legacy_reading_continuity_unknown'] }
    : baseValidation;
  return {
    id: `legacy-${task.id}-${history?.id || `${startedAt}-${durationSeconds}`}`,
    timerId: null,
    taskId: task.id,
    date: history?.date || getDateFromTimestamp(endedAt),
    taskSnapshot: {
      categoryId: task.categoryId,
      subjectId: task.subjectId,
      activityType,
      title: task.title,
      type: task.type,
    },
    segments: startedAt ? [{ startedAt, endedAt, durationSeconds }] : [],
    recordedSeconds: durationSeconds,
    validation,
    legacySource: { taskId: task.id, historyId: history?.id || null },
    memo: history?.memo || '',
  };
}

export function getUnifiedStudySessions(tasks = [], studySessions = []) {
  const migrated = new Set(studySessions
    .filter((session) => session.legacySource?.taskId)
    .map((session) => `${session.legacySource.taskId}:${session.legacySource.historyId || ''}`));
  const legacy = tasks.flatMap((task) => (task.history || [])
    .filter((history) => !migrated.has(`${task.id}:${history.id || ''}`))
    .map((history) => normalizeLegacyHistory(task, history)));
  const normalized = [...legacy, ...studySessions].map((session) => ({
    ...session,
    validation: session.validation || validateStudySession(session),
    recordedSeconds: Number(session.recordedSeconds ?? session.duration) || 0,
  })).sort((a, b) => (a.segments?.[0]?.startedAt || 0) - (b.segments?.[0]?.startedAt || 0));
  const previousIntervals = [];
  return normalized.map((session) => {
    const computed = validateStudySession(session, { previousIntervals });
    const existing = session.validation || { status: 'valid', reasonCodes: [] };
    const validation = session.migrationReview?.reviewed
      ? existing
      : existing.status === 'invalid' || existing.status === 'pending_review'
      ? existing
      : computed;
    if (validation.status === 'valid') {
      (session.segments || []).forEach((segment) => previousIntervals.push({ start: segment.startedAt, end: segment.endedAt }));
    }
    return { ...session, validation };
  });
}

export function getValidStudySessions(sessions = []) {
  return sessions.filter((session) => isEffectiveValidation(session.validation));
}

export function getSessionsForDate(sessions = [], date) {
  return sessions.filter((session) => session.date === date);
}

export function getSessionsForTask(sessions = [], taskId) {
  return sessions.filter((session) => session.taskId === taskId);
}

export function getEffectiveStudySeconds(sessions = []) {
  return getValidStudySessions(sessions).reduce((sum, session) => sum + (Number(session.recordedSeconds) || 0), 0);
}

export function getLiveStudySession(activeTimer, task, now = Date.now()) {
  // A paused timer remains stored only so its owner can resume or finish it.
  // It must not be rendered as a live stopwatch or contribute live seconds.
  if (!activeTimer || activeTimer.state !== 'running' || !task || activeTimer.taskId !== task.id) return null;
  const recordedSeconds = timerRecordedSeconds(activeTimer, now);
  const segments = timerSegmentsAtEnd(activeTimer, isStaleActiveTimer(activeTimer, now) ? activeTimer.lastHeartbeatAt : now);
  const base = {
    id: `live-${activeTimer.timerId}`,
    timerId: activeTimer.timerId,
    taskId: task.id,
    date: getDateFromTimestamp(activeTimer.startedAt || activeTimer.segmentStartedAt),
    taskSnapshot: {
      categoryId: task.categoryId,
      subjectId: task.subjectId,
      activityType: normalizeActivityType(task.activityType || inferLegacyActivityType(task.subjectId, task.title)),
      title: task.title,
      type: task.type,
    },
    segments,
    recordedSeconds,
    isLive: true,
    isStale: isStaleActiveTimer(activeTimer, now),
  };
  return { ...base, validation: validateStudySession(base) };
}

export function formatHms(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = `${Math.floor(value / 3600)}`.padStart(2, '0');
  const minutes = `${Math.floor((value % 3600) / 60)}`.padStart(2, '0');
  const secs = `${value % 60}`.padStart(2, '0');
  return `${hours}:${minutes}:${secs}`;
}
