import { describe, expect, it } from 'vitest';
import { buildLegacyMigrationCandidates } from '../../scripts/migrations/legacyMigrationCandidates';
import { buildLegacyMigrationPreflight, isLegacyMigrationCompleted, isMigrationConfirmationValid, migrationConfirmationText } from './legacyMigrationPreflight';
import { legacyMigrationDocument } from './studySessionRepository';
import { findUndefinedPaths } from '../test/findUndefinedPaths.js';

const histories = (count) => Array.from({ length: count }, (_, index) => ({ id: `h${index}`, duration: 60, startedAt: index * 60_000 + 1_000, endedAt: (index + 1) * 60_000 + 1_000 }));
const reviewedSizeTask = { id: 'task', subjectId: 's_math', title: '数学', history: histories(292) };

describe('legacy migration preflight', () => {
  it('292件・未計測・重複なしなら適用可能で、前後の有効学習時間は一致する', () => {
    const preflight = buildLegacyMigrationPreflight({ tasks: [reviewedSizeTask] });
    expect(preflight.canApply).toBe(true);
    expect(preflight.migrationCandidateCount).toBe(292);
    expect(preflight.before).toEqual(preflight.projected);
  });
  it('pending_review、ActiveTimer、件数変化では適用不可にする', () => {
    const pending = buildLegacyMigrationPreflight({ tasks: [{ id: 'news', subjectId: 'e_news', history: [{ id: 'h1', duration: 5 * 60 * 60, startedAt: 1_000, endedAt: 18_001_000 }] }] });
    expect(pending.canApply).toBe(false);
    expect(pending.blockers).toContain('UNRESOLVED_PENDING_REVIEW');
    expect(pending.blockers).toContain('CANDIDATE_COUNT_CHANGED');
    const active = buildLegacyMigrationPreflight({ tasks: [reviewedSizeTask], activeTimers: [{ state: 'running' }] });
    expect(active.canApply).toBe(false);
    expect(active.blockers).toContain('ACTIVE_TIMER_EXISTS');
  });
  it('確認文字列は現在の候補数と完全一致しなければならない', () => {
    const preflight = buildLegacyMigrationPreflight({ tasks: [reviewedSizeTask] });
    expect(migrationConfirmationText(292)).toBe('MIGRATE 292');
    expect(isMigrationConfirmationValid(preflight, 'MIGRATE 291')).toBe(false);
    expect(isMigrationConfirmationValid(preflight, 'MIGRATE 292')).toBe(true);
  });
  it('決定的IDの既存documentは上書きせず適用を停止する', () => {
    const preflight = buildLegacyMigrationPreflight({
      tasks: [reviewedSizeTask],
      studySessions: [{ id: 'legacy-task-h0', legacySource: null }],
    });
    expect(preflight.blockers).toContain('DOCUMENT_ID_COLLISION');
  });
  it('既存StudySessionのlegacySource重複は適用を停止する', () => {
    const preflight = buildLegacyMigrationPreflight({
      tasks: [reviewedSizeTask],
      studySessions: [
        { id: 'existing-1', legacySource: { taskId: 'old', historyId: 'h1' } },
        { id: 'existing-2', legacySource: { taskId: 'old', historyId: 'h1' } },
      ],
    });
    expect(preflight.blockers).toContain('LEGACY_SOURCE_DUPLICATE');
  });
  it('migration後想定ではlegacySourceにより候補が0件になる', () => {
    const { candidates } = buildLegacyMigrationCandidates({ tasks: [{ id: 'math', subjectId: 's_math', history: [{ id: 'h1', duration: 600 }] }] });
    const preflight = buildLegacyMigrationPreflight({ tasks: [{ id: 'math', subjectId: 's_math', history: [{ id: 'h1', duration: 600 }] }], studySessions: candidates });
    expect(preflight.migrationCandidateCount).toBe(0);
    expect(preflight.alreadyMigratedCount).toBe(1);
    expect(isLegacyMigrationCompleted(preflight)).toBe(true);
    expect(isMigrationConfirmationValid(preflight, 'MIGRATE 0')).toBe(false);
  });
  it('書込みdocumentはcandidateの監査情報を保持する', () => {
    const candidate = buildLegacyMigrationCandidates({
      tasks: [{ id: 'PDZbVzVBXO4rThP2zgnp', subjectId: 'e_duolingo', history: [{ id: '1777954827448', duration: 23_822 }] }],
    }).candidates[0];
    const document = legacyMigrationDocument(candidate, 123);
    expect(candidate.id).toBe('legacy-PDZbVzVBXO4rThP2zgnp-1777954827448');
    expect(document).toMatchObject({ taskId: candidate.taskId, duration: 23_822, migrationVersion: 1, migratedAt: 123, legacySource: candidate.legacySource, migrationReview: { decision: 'invalid' } });
    expect(document.validation.status).toBe('invalid');
    expect(findUndefinedPaths(document)).toEqual([]);
  });
});
