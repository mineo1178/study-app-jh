import { inferLegacyActivityType, normalizeActivityType } from '../../src/integrity/activityTypes.js';
import { validateStudySession } from '../../src/integrity/studyValidation.js';
import { normalizeLegacyHistory } from '../../src/data/studySessionSelectors.js';
import { getLegacyReviewOverride } from './legacyReviewOverrides.js';

const toEpochMillis = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
};

export function normalizeMigrationInput(data = {}) {
  return {
    ...data,
    tasks: (data.tasks || []).map((task) => ({
      ...task,
      history: (task.history || []).map((history) => ({ ...history, startedAt: toEpochMillis(history.startedAt), endedAt: toEpochMillis(history.endedAt) })),
    })),
    studySessions: (data.studySessions || []).map((session) => ({
      ...session,
      segments: (session.segments || []).map((segment) => ({ ...segment, startedAt: toEpochMillis(segment.startedAt), endedAt: toEpochMillis(segment.endedAt) })),
      createdAt: toEpochMillis(session.createdAt),
      updatedAt: toEpochMillis(session.updatedAt),
    })),
  };
}

function evaluateLegacyCandidate(session) {
  const validation = validateStudySession(session);
  if (session.legacySource && session.taskSnapshot?.activityType === 'reading' && session.recordedSeconds >= 5 * 60 * 60) {
    return { ...session, validation: { ...validation, status: validation.status === 'invalid' ? 'invalid' : 'pending_review', reasonCodes: [...new Set([...validation.reasonCodes.filter((code) => code !== 'reading_continuous_5h'), 'legacy_reading_continuity_unknown'])] } };
  }
  return { ...session, validation };
}

export function applyLegacyReviewOverride(session) {
  const override = getLegacyReviewOverride(session?.legacySource?.taskId, session?.legacySource?.historyId);
  if (!override) return session;
  const reasonCodes = [...new Set([...(session.validation?.reasonCodes || []), override.reason])];
  return {
    ...session,
    validation: { ...session.validation, status: override.validationStatus, reasonCodes },
    migrationReview: { reviewed: true, decision: override.validationStatus, reason: override.reason },
  };
}

export function buildLegacyMigrationCandidates(data = {}) {
  const input = normalizeMigrationInput(data);
  const tasks = input.tasks || [];
  const sessions = input.studySessions || [];
  const legacy = tasks.flatMap((task) => (task.history || []).map((history) => ({ task, history })));
  const existingLegacySources = new Set(sessions
    .filter((session) => session.legacySource?.taskId)
    .map((session) => `${session.legacySource.taskId}:${session.legacySource.historyId || ''}`));
  const alreadyMigrated = legacy.filter(({ task, history }) => existingLegacySources.has(`${task.id}:${history.id || ''}`));
  const candidates = legacy
    .filter(({ task, history }) => !existingLegacySources.has(`${task.id}:${history.id || ''}`))
    .map(({ task, history }) => normalizeLegacyHistory({
      ...task,
      activityType: normalizeActivityType(task.activityType || inferLegacyActivityType(task.subjectId, task.title)),
    }, history))
    .map(evaluateLegacyCandidate)
    .map(applyLegacyReviewOverride);
  return { tasks, sessions, legacy, alreadyMigrated, candidates };
}
