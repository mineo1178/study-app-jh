/* global process */
import fs from 'node:fs';
import { inferLegacyActivityType, needsLegacyActivityTypeReview, normalizeActivityType } from '../../src/integrity/activityTypes.js';
import { validateStudySession } from '../../src/integrity/studyValidation.js';
import { buildLegacyMigrationCandidates } from './legacyMigrationCandidates.js';

export { applyLegacyReviewOverride, buildLegacyMigrationCandidates } from './legacyMigrationCandidates.js';

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
  const { tasks, sessions, legacy, alreadyMigrated, candidates } = buildLegacyMigrationCandidates(data);
  const typeCounts = ['reading', 'language_app', 'programming', 'other'].reduce((counts, activityType) => ({
    ...counts,
    [activityType]: tasks.filter((task) => normalizeActivityType(task.activityType || inferLegacyActivityType(task.subjectId, task.title)) === activityType).length,
  }), {});
  const needsClassificationCount = tasks.filter((task) => !task.activityType && needsLegacyActivityTypeReview(task.subjectId, task.title)).length;
  const classified = tasks.filter((task) => !task.activityType
    && !needsLegacyActivityTypeReview(task.subjectId, task.title)
    && inferLegacyActivityType(task.subjectId, task.title) !== 'other').length;
  const legacyReadingUncertain = candidates.filter((session) => session.taskSnapshot?.activityType === 'reading' && session.recordedSeconds >= 5 * 60 * 60);
  const evaluated = [...sessions.map((session) => ({ ...session, validation: validateStudySession(session) })), ...candidates];
  const manualInvalidCount = candidates.filter((session) => session.migrationReview?.decision === 'invalid').length;
  const manualValidCount = candidates.filter((session) => session.migrationReview?.decision === 'valid').length;
  const unresolvedPendingReviewCount = candidates.filter((session) => session.validation.status === 'pending_review').length;
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
    manualInvalidCount,
    manualValidCount,
    pendingReviewCandidateCount: unresolvedPendingReviewCount,
    unresolvedPendingReviewCount,
    invalidCandidateCount: evaluated.filter((session) => session.validation.status === 'invalid').length,
    durationMismatchCount: evaluated.filter((session) => session.validation.reasonCodes.includes('clock_mismatch')).length,
    startsAfterEndCount: evaluated.filter((session) => session.validation.reasonCodes.includes('starts_after_end')).length,
    notes: ['Legacy history has no PAUSE segments. A five-hour legacy reading is reported for review and is not automatically invalidated.'],
  };
}
