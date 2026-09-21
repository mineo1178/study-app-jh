import { describe, expect, it } from 'vitest';
import { formatHms, getEffectiveStudySeconds, getLiveStudySession, getUnifiedStudySessions, normalizeLegacyHistory } from './studySessionSelectors';

const task = { id: 'math', categoryId: 'school', subjectId: 's_math', title: '問題集', history: [{ id: 'h1', date: '2026-09-19', duration: 600, startedAt: 1_000, endedAt: 601_000 }] };
describe('study session selectors', () => {
  it('legacy historyのみをsessionとして読める', () => {
    expect(getEffectiveStudySeconds(getUnifiedStudySessions([task], []))).toBe(600);
  });
  it('migration済みlegacy重複を二重集計しない', () => {
    const sessions = getUnifiedStudySessions([task], [{ id: 's1', recordedSeconds: 600, legacySource: { taskId: 'math', historyId: 'h1' }, validation: { status: 'valid' } }]);
    expect(sessions).toHaveLength(1);
  });
  it('invalidとpending_reviewを有効時間から除外する', () => {
    expect(getEffectiveStudySeconds([{ recordedSeconds: 60, validation: { status: 'invalid' } }, { recordedSeconds: 60, validation: { status: 'pending_review' } }, { recordedSeconds: 60, validation: { status: 'valid' } }])).toBe(60);
  });
  it('重複sessionをpending_reviewとして有効時間から除外する', () => {
    const sessions = getUnifiedStudySessions([], [
      { id: 'a', recordedSeconds: 600, segments: [{ startedAt: 1_000, endedAt: 601_000, durationSeconds: 600 }], validation: { status: 'valid' } },
      { id: 'b', recordedSeconds: 600, segments: [{ startedAt: 301_000, endedAt: 901_000, durationSeconds: 600 }], validation: { status: 'valid' } },
    ]);
    expect(sessions[1].validation.status).toBe('pending_review');
    expect(getEffectiveStudySeconds(sessions)).toBe(600);
  });
  it('HH:MM:SSで表示する', () => {
    expect(formatHms(2262)).toBe('00:37:42');
  });
  it('PAUSE済みActiveTimerをライブのストップウォッチとして扱わない', () => {
    const pausedTimer = {
      timerId: 'paused', taskId: 'math', state: 'paused', startedAt: 1_000,
      accumulatedSeconds: 60, segments: [{ startedAt: 1_000, endedAt: 61_000, durationSeconds: 60 }],
    };
    expect(getLiveStudySession(pausedTimer, task, 120_000)).toBeNull();
  });
  it('legacyの5時間読書は連続性不明としてpending_reviewにする', () => {
    const readingTask = { id: 'news', categoryId: 'etc', subjectId: 'e_news', history: [] };
    const session = normalizeLegacyHistory(readingTask, { id: 'old', date: '2026-09-19', duration: 5 * 60 * 60, startedAt: 1_000, endedAt: 18_001_000 });
    expect(session.validation.status).toBe('pending_review');
    expect(session.validation.reasonCodes).toContain('legacy_reading_continuity_unknown');
  });
  it('legacyの5時間読書でも既存invalidをpending_reviewへ格下げしない', () => {
    const readingTask = { id: 'news', categoryId: 'etc', subjectId: 'e_news', history: [] };
    const session = normalizeLegacyHistory(readingTask, { id: 'broken', date: '2026-09-19', duration: 5 * 60 * 60, startedAt: 18_001_000, endedAt: 1_000 });
    expect(session.validation.status).toBe('invalid');
    expect(session.validation.reasonCodes).toContain('starts_after_end');
    expect(new Set(session.validation.reasonCodes).size).toBe(session.validation.reasonCodes.length);
  });
});
