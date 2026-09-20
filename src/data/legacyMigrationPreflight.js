import { isActiveTimer } from '../timer/timerEngine.js';
import { getEffectiveStudySeconds, getUnifiedStudySessions } from './studySessionSelectors.js';
import { buildLegacyMigrationCandidates, normalizeMigrationInput } from '../../scripts/migrations/legacyMigrationCandidates.js';

export const REVIEWED_LEGACY_CANDIDATE_COUNT = 292;

const sourceKey = (source) => `${source?.taskId || ''}:${source?.historyId || ''}`;
const duplicateValues = (values) => [...values.reduce((duplicates, value, index, all) => {
  if (value && all.indexOf(value) !== index) duplicates.add(value);
  return duplicates;
}, new Set())];

const sessionStats = (sessions) => ({
  effectiveSessionCount: sessions.filter((session) => session.validation?.status === 'valid').length,
  effectiveStudySeconds: getEffectiveStudySeconds(sessions),
  invalidCount: sessions.filter((session) => session.validation?.status === 'invalid').length,
});

export function migrationConfirmationText(candidateCount) {
  return `MIGRATE ${candidateCount}`;
}

export function buildLegacyMigrationPreflight({ tasks = [], studySessions = [], activeTimers = [] } = {}) {
  try {
    const input = normalizeMigrationInput({ tasks, studySessions });
    const normalizedTasks = input.tasks || [];
    const normalizedStudySessions = input.studySessions || [];
    const { legacy, alreadyMigrated, candidates } = buildLegacyMigrationCandidates(input);
    const existingSourceDuplicates = duplicateValues(normalizedStudySessions.map((session) => session.legacySource?.taskId ? sourceKey(session.legacySource) : null));
    const candidateSourceDuplicates = duplicateValues(candidates.map((session) => sourceKey(session.legacySource)));
    const candidateIdDuplicates = duplicateValues(candidates.map((session) => session.id));
    const existingDocumentIds = new Set(normalizedStudySessions.map((session) => session.id));
    const existingDocumentIdCollisions = candidates.filter((session) => existingDocumentIds.has(session.id)).map((session) => session.id);
    const activeTimerCount = activeTimers.filter(isActiveTimer).length;
    const beforeSessions = getUnifiedStudySessions(normalizedTasks, normalizedStudySessions);
    const projectedSessions = getUnifiedStudySessions(normalizedTasks, [...normalizedStudySessions, ...candidates]);
    const blockers = [];
    if (candidates.some((session) => session.validation.status === 'pending_review')) blockers.push('UNRESOLVED_PENDING_REVIEW');
    if (activeTimerCount > 0) blockers.push('ACTIVE_TIMER_EXISTS');
    if (existingSourceDuplicates.length > 0 || candidateSourceDuplicates.length > 0) blockers.push('LEGACY_SOURCE_DUPLICATE');
    if (candidateIdDuplicates.length > 0 || existingDocumentIdCollisions.length > 0) blockers.push('DOCUMENT_ID_COLLISION');
    if (candidates.length !== REVIEWED_LEGACY_CANDIDATE_COUNT) blockers.push('CANDIDATE_COUNT_CHANGED');
    return {
      ok: true,
      taskCount: normalizedTasks.length,
      legacyHistoryCount: legacy.length,
      existingStudySessionCount: normalizedStudySessions.length,
      migrationCandidateCount: candidates.length,
      alreadyMigratedCount: alreadyMigrated.length,
      manualInvalidCount: [...normalizedStudySessions, ...candidates].filter((session) => session.migrationReview?.decision === 'invalid').length,
      manualValidCount: [...normalizedStudySessions, ...candidates].filter((session) => session.migrationReview?.decision === 'valid').length,
      unresolvedPendingReviewCount: candidates.filter((session) => session.validation.status === 'pending_review').length,
      activeTimerCount,
      candidates,
      before: sessionStats(beforeSessions),
      projected: sessionStats(projectedSessions),
      effectiveSessionCountDelta: sessionStats(projectedSessions).effectiveSessionCount - sessionStats(beforeSessions).effectiveSessionCount,
      effectiveStudySecondsDelta: sessionStats(projectedSessions).effectiveStudySeconds - sessionStats(beforeSessions).effectiveStudySeconds,
      existingSourceDuplicates,
      candidateSourceDuplicates,
      candidateIdDuplicates,
      existingDocumentIdCollisions,
      candidateCountChanged: candidates.length !== REVIEWED_LEGACY_CANDIDATE_COUNT,
      blockers,
      canApply: blockers.length === 0,
    };
  } catch (error) {
    return { ok: false, candidates: [], blockers: ['CANDIDATE_GENERATION_ERROR'], canApply: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function isMigrationConfirmationValid(preflight, confirmation) {
  return Boolean(preflight?.canApply && confirmation === migrationConfirmationText(preflight.migrationCandidateCount));
}
