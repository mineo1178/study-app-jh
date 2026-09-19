/* global process */
import fs from 'node:fs';
import { inferLegacyActivityType, normalizeActivityType } from '../../src/integrity/activityTypes.js';
import { validateStudySession } from '../../src/integrity/studyValidation.js';
import { normalizeLegacyHistory } from '../../src/data/studySessionSelectors.js';

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
  const tasks = data.tasks || [];
  const sessions = data.studySessions || [];
  const legacy = tasks.flatMap((task) => (task.history || []).map((history) => ({ task, history })));
  const classified = tasks.filter((task) => !task.activityType && inferLegacyActivityType(task.subjectId) !== 'other').length;
  const candidates = legacy.map(({ task, history }) => normalizeLegacyHistory({ ...task, activityType: normalizeActivityType(task.activityType || inferLegacyActivityType(task.subjectId)) }, history));
  const legacyReadingUncertain = candidates.filter((session) => session.taskSnapshot.activityType === 'reading' && session.recordedSeconds >= 5 * 60 * 60);
  const evaluated = [...sessions, ...candidates].map((session) => {
    const validation = validateStudySession(session);
    // Legacy history has no pause boundaries, so duration alone cannot prove five hours were continuous.
    if (session.legacySource && session.taskSnapshot.activityType === 'reading' && session.recordedSeconds >= 5 * 60 * 60) {
      return { ...session, validation: { ...validation, status: 'pending_review', reasonCodes: [...validation.reasonCodes.filter((code) => code !== 'reading_continuous_5h'), 'legacy_reading_continuity_unknown'] } };
    }
    return { ...session, validation };
  });
  return {
    dryRun: true,
    taskCount: tasks.length,
    legacyHistoryCount: legacy.length,
    migrationCandidateCount: candidates.length,
    activityTypeClassificationCount: classified,
    readingFiveHourCandidateCount: legacyReadingUncertain.length,
    pendingReviewCandidateCount: evaluated.filter((session) => session.validation.status === 'pending_review').length,
    invalidCandidateCount: evaluated.filter((session) => session.validation.status === 'invalid').length,
    notes: ['Legacy history has no PAUSE segments. A five-hour legacy reading is reported for review and is not automatically invalidated.'],
  };
}
