import { describe, expect, it } from 'vitest';
import { buildMigrationReport } from './migrationUtils';

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
});
