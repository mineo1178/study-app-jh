import { describe, expect, it } from 'vitest';
import { createMigrationExport, migrationExportFilename, toMigrationTimestamp } from './exportMigrationData';
import { buildMigrationReport } from '../../scripts/migrations/migrationUtils';

describe('migration export', () => {
  const task = {
    id: 'task-1', categoryId: 'school', subjectId: 's_math', title: '問題集', password: 'never-export',
    history: [{ id: 'h1', date: '2026-09-19', duration: 600, startedAt: 1_000, endedAt: 601_000 }],
  };
  const session = {
    id: 'timer-1', timerId: 'timer-1', taskId: 'task-1', taskSnapshot: { subjectId: 's_math', activityType: 'problem_solving', token: 'never-export' },
    date: '2026-09-19', segments: [{ startedAt: 1_000, endedAt: 601_000, durationSeconds: 600 }], recordedSeconds: 600,
    validation: { status: 'valid' }, legacySource: { taskId: 'task-1', historyId: 'h1' }, createdAt: 1_000, updatedAt: 601_000,
  };

  it('Task、legacy history、StudySessionの必要データをISO日時で出力する', () => {
    const payload = createMigrationExport({ tasks: [task], studySessions: [session] }, new Date('2026-09-19T00:00:00.000Z'));
    expect(payload.tasks[0].history[0]).toMatchObject({ id: 'h1', duration: 600, startedAt: '1970-01-01T00:00:01.000Z' });
    expect(payload.studySessions[0]).toMatchObject({ timerId: 'timer-1', recordedSeconds: 600, legacySource: { taskId: 'task-1', historyId: 'h1' } });
    expect(payload.studySessions[0].segments[0].endedAt).toBe('1970-01-01T00:10:01.000Z');
  });

  it('認証情報やundefinedを出力しない', () => {
    const payload = createMigrationExport({ tasks: [task], studySessions: [session] });
    expect(JSON.stringify(payload)).not.toContain('never-export');
    expect(JSON.stringify(payload)).not.toContain('undefined');
  });

  it('既存migration scriptがexport形式を読める', () => {
    const payload = createMigrationExport({ tasks: [task], studySessions: [session] });
    expect(buildMigrationReport(payload)).toMatchObject({ taskCount: 1, legacyHistoryCount: 1 });
  });

  it('ファイル名とTimestamp変換はWindowsで利用できる', () => {
    expect(migrationExportFilename(new Date('2026-09-19T08:35:42'))).toBe('study-app-jh-migration-export-20260919-083542.json');
    expect(toMigrationTimestamp(undefined)).toBeNull();
  });
});
