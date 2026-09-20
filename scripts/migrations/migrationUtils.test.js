import { describe, expect, it } from 'vitest';
import { getEffectiveStudySeconds } from '../../src/data/studySessionSelectors';
import { LEGACY_REVIEW_OVERRIDES } from './legacyReviewOverrides';
import { buildLegacyMigrationCandidates, buildMigrationReport } from './migrationUtils';

describe('migration dry-run report', () => {
  it('曖昧なlegacy 5時間読書をinvalidではなくreview候補として数える', () => {
    const report = buildMigrationReport({
      tasks: [{ id: 'news', subjectId: 'e_news', history: [{ id: 'h1', date: '2026-09-19', duration: 5 * 60 * 60, startedAt: 1_000, endedAt: 18_001_000 }] }],
      studySessions: [],
    });
    expect(report.dryRun).toBe(true);
    expect(report.migrationCandidateCount).toBe(1);
    expect(report.readingFiveHourCandidateCount).toBe(1);
    expect(report.invalidCandidateCount).toBe(0);
    expect(report.pendingReviewCandidateCount).toBe(1);
  });
  it('migration済みlegacyをlegacySourceで除外する', () => {
    const report = buildMigrationReport({
      tasks: [{ id: 'math', subjectId: 's_math', history: [{ id: 'h1', duration: 600 }] }],
      studySessions: [{ id: 'legacy-math-h1', legacySource: { taskId: 'math', historyId: 'h1' } }],
    });
    expect(report.migrationCandidateCount).toBe(0);
    expect(report.alreadyMigratedCount).toBe(1);
    expect(report.duplicateExcludedCount).toBe(1);
    expect(report.expectedStudySessionCount).toBe(1);
  });
  it('10件のレビューoverrideを候補に監査情報付きで反映し、invalidも保持する', () => {
    const tasks = Object.keys(LEGACY_REVIEW_OVERRIDES).map((key) => {
      const [id, historyId] = key.split(':');
      return { id, subjectId: 's_math', history: [{ id: historyId, duration: 600 }] };
    });
    const { candidates } = buildLegacyMigrationCandidates({ tasks, studySessions: [] });
    expect(candidates).toHaveLength(10);
    expect(candidates.filter((session) => session.migrationReview?.decision === 'invalid')).toHaveLength(3);
    expect(candidates.filter((session) => session.migrationReview?.decision === 'valid')).toHaveLength(7);
    expect(candidates.every((session) => session.migrationReview?.reviewed)).toBe(true);
    expect(getEffectiveStudySeconds(candidates)).toBe(7 * 600);
  });
  it('overrideはtaskIdだけではなくhistoryIdまで照合する', () => {
    const task = {
      id: 'PDZbVzVBXO4rThP2zgnp', subjectId: 'e_duolingo', history: [
        { id: '1777954827448', duration: 23_822 },
        { id: 'another-history', duration: 23_822 },
      ],
    };
    const { candidates } = buildLegacyMigrationCandidates({ tasks: [task], studySessions: [] });
    expect(candidates.find((session) => session.legacySource.historyId === '1777954827448').validation.status).toBe('invalid');
    expect(candidates.find((session) => session.legacySource.historyId === 'another-history').validation.status).toBe('pending_review');
  });
  it('valid overrideはclock mismatchでもrecorded durationと元の時刻を保持する', () => {
    const { candidates } = buildLegacyMigrationCandidates({
      tasks: [{ id: '8XmPF1TJGBs9W7RmP08D', subjectId: 'e_manga', title: '歴史', history: [{ id: '1779504538581', duration: 498, startedAt: 1_000, endedAt: 3_000 }] }],
      studySessions: [],
    });
    expect(candidates[0].validation.status).toBe('valid');
    expect(candidates[0].validation.reasonCodes).toContain('clock_mismatch');
    expect(candidates[0].recordedSeconds).toBe(498);
    expect(candidates[0].segments[0]).toMatchObject({ startedAt: 1_000, endedAt: 3_000, durationSeconds: 498 });
  });
});
