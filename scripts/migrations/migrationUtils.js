/* global process */
import fs from 'node:fs';
import { inferLegacyActivityType, needsLegacyActivityTypeReview, normalizeActivityType } from '../../src/integrity/activityTypes.js';
import { validateStudySession } from '../../src/integrity/studyValidation.js';
import { normalizeLegacyHistory } from '../../src/data/studySessionSelectors.js';

function epochMillis(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
}

function reviveExportInput(data) {
  return {
    ...data,
    tasks: (data.tasks || []).map((task) => ({
      ...task,
      history: (task.history || []).map((history) => ({ ...history, startedAt: epochMillis(history.startedAt), endedAt: epochMillis(history.endedAt) })),
    })),
    studySessions: (data.studySessions || []).map((session) => ({
      ...session,
      segments: (session.segments || []).map((segment) => ({ ...segment, startedAt: epochMillis(segment.startedAt), endedAt: epochMillis(segment.endedAt) })),
      createdAt: epochMillis(session.createdAt),
      updatedAt: epochMillis(session.updatedAt),
    })),
  };
}

export function readMigrationInput(argv) {
  const inputIndex = argv.indexOf('--input');
  if (inputIndex < 0 || !argv[inputIndex + 1]) throw new Error('Usage: --input <export.json> [--output <report.json>]');
  return JSON.parse(fs.readFileSync(argv[inputIndex + 1], 'utf8'));
}

export function writeReport(argv, report) {
  const outputIndex = argv.indexOf('--output');
  if (outputIndex >= 0 && argv[outputIndex + 1]) fs.writeFileSync(argv[outputIndex + 1], `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

export function buildMigrationReport(data) {
  const input = reviveExportInput(data);
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
    }, history));
  const typeCounts = ['reading', 'language_app', 'programming', 'other'].reduce((counts, activityType) => ({
    ...counts,
    [activityType]: tasks.filter((task) => normalizeActivityType(task.activityType || inferLegacyActivityType(task.subjectId, task.title)) === activityType).length,
  }), {});
  const needsClassificationCount = tasks.filter((task) => !task.activityType && needsLegacyActivityTypeReview(task.subjectId, task.title)).length;
  const classified = tasks.filter((task) => !task.activityType
    && !needsLegacyActivityTypeReview(task.subjectId, task.title)
    && inferLegacyActivityType(task.subjectId, task.title) !== 'other').length;
  const legacyReadingUncertain = candidates.filter((session) => session.taskSnapshot?.activityType === 'reading' && session.recordedSeconds >= 5 * 60 * 60);
  const evaluated = [...sessions, ...candidates].map((session) => {
    const validation = validateStudySession(session);
    // Legacy history has no pause boundaries, so duration alone cannot prove five hours were continuous.
    if (session.legacySource && session.taskSnapshot?.activityType === 'reading' && session.recordedSeconds >= 5 * 60 * 60) {
      return { ...session, validation: { ...validation, status: 'pending_review', reasonCodes: [...validation.reasonCodes.filter((code) => code !== 'reading_continuous_5h'), 'legacy_reading_continuity_unknown'] } };
    }
    return { ...session, validation };
  });
  return {
    dryRun: true,
    taskCount: tasks.length,
    legacyHistoryCount: legacy.length,
    existingStudySessionCount: sessions.length,
    migrationCandidateCount: candidates.length,
    alreadyMigratedCount: alreadyMigrated.length,
    duplicateExcludedCount: alreadyMigrated.length,
    expectedStudySessionCount: sessions.length + candidates.length,
    activityTypeClassificationCount: classified,
    activityTypeTaskCounts: typeCounts,
    needsClassificationCount,
    over90MinutesCount: evaluated.filter((session) => session.recordedSeconds > 90 * 60).length,
    over120MinutesCount: evaluated.filter((session) => session.recordedSeconds > 120 * 60).length,
    atLeast180MinutesCount: evaluated.filter((session) => session.recordedSeconds >= 180 * 60).length,
    fiveHourOrMoreCount: evaluated.filter((session) => session.recordedSeconds >= 5 * 60 * 60).length,
    tenHourOrMoreCount: evaluated.filter((session) => session.recordedSeconds >= 10 * 60 * 60).length,
    readingFiveHourCandidateCount: legacyReadingUncertain.length,
    pendingReviewCandidateCount: evaluated.filter((session) => session.validation.status === 'pending_review').length,
    invalidCandidateCount: evaluated.filter((session) => session.validation.status === 'invalid').length,
    durationMismatchCount: evaluated.filter((session) => session.validation.reasonCodes.includes('clock_mismatch')).length,
    startsAfterEndCount: evaluated.filter((session) => session.validation.reasonCodes.includes('starts_after_end')).length,
    notes: ['Legacy history has no PAUSE segments. A five-hour legacy reading is reported for review and is not automatically invalidated.'],
  };
}
