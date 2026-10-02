import { describe, expect, it } from 'vitest';
import { formatHms, getEffectiveSessionsForDate, getEffectiveStudySeconds, getEffectiveStudySecondsForTask, getLiveStudySession, getUnifiedStudySessions, normalizeLegacyHistory } from './studySessionSelectors';

const task = { id: 'math', categoryId: 'school', subjectId: 's_math', title: '問題集', history: [{ id: 'h1', date: '2026-09-19', duration: 600, startedAt: 1_000, endedAt: 601_000 }] };
describe('study session selectors', () => {
  it('legacy historyのみをsessionとして読める', () => {
    expect(getEffectiveStudySeconds(getUnifiedStudySessions([task], []))).toBe(600);
  });
  it('keeps a reviewer-approved validation canonical instead of recalculating it', () => {
    const sessions = getUnifiedStudySessions([], [{ id: 'approved', recordedSeconds: 5 * 60 * 60, taskSnapshot: { activityType: 'reading' }, legacySource: { taskId: 'news', historyId: 'h1' }, validation: { status: 'valid', reasonCodes: [] }, manualReview: { reviewed: true, decision: 'valid' } }]);
    expect(sessions[0].validation.status).toBe('valid');
  });
  it('migration済みlegacy重複を二重集計しない', () => {
    const sessions = getUnifiedStudySessions([task], [{ id: 's1', recordedSeconds: 600, legacySource: { taskId: 'math', historyId: 'h1' }, validation: { status: 'valid' } }]);
    expect(sessions).toHaveLength(1);
  });
  it('invalidとpending_reviewを有効時間から除外する', () => {
    expect(getEffectiveStudySeconds([{ recordedSeconds: 60, validation: { status: 'invalid' } }, { recordedSeconds: 60, validation: { status: 'pending_review' } }, { recordedSeconds: 60, validation: { status: 'valid' } }])).toBe(60);
  });
  it('Today TimelineのTotal・task別・バーに同じ有効sessionだけを渡す', () => {
    const date = '2026-09-27';
    const sessions = [
      { id: 'math-1', taskId: 'math', date, recordedSeconds: 600, validation: { status: 'valid' } },
      { id: 'english-1', taskId: 'english', date, recordedSeconds: 300, validation: { status: 'valid' } },
      { id: 'stale-1', taskId: 'science', date, recordedSeconds: 900, validation: { status: 'invalid', reasonCodes: ['stale_timer_forced_invalid'] } },
      { id: 'pending-1', taskId: 'social', date, recordedSeconds: 120, validation: { status: 'pending_review', reasonCodes: ['overlap'] } },
    ];
    const timelineSessions = getEffectiveSessionsForDate(sessions, date);
    const taskSeconds = timelineSessions.reduce((totals, session) => ({
      ...totals,
      [session.taskId]: (totals[session.taskId] || 0) + session.recordedSeconds,
    }), {});

    expect(timelineSessions.map((session) => session.id)).toEqual(['math-1', 'english-1']);
    expect(getEffectiveStudySeconds(timelineSessions)).toBe(900);
    expect(Object.values(taskSeconds).reduce((sum, seconds) => sum + seconds, 0)).toBe(900);
  });
  it('PAUSE区間を含めずsegmentsで確定したrecordedSecondsだけを集計する', () => {
    const date = '2026-09-27';
    const pausedAndResumed = {
      id: 'pause-resume', taskId: 'math', date, recordedSeconds: 180,
      segments: [
        { startedAt: 1_000, endedAt: 61_000, durationSeconds: 60 },
        { startedAt: 121_000, endedAt: 241_000, durationSeconds: 120 },
      ],
      validation: { status: 'valid' },
    };

    expect(getEffectiveStudySeconds(getEffectiveSessionsForDate([pausedAndResumed], date))).toBe(180);
  });
  it('stale live sessionとinvalid化後の保存sessionをどちらもToday Timelineから除外する', () => {
    const date = '2026-09-27';
    const staleLive = { id: 'live-stale', timerId: 'stale-timer', taskId: 'math', date, recordedSeconds: 900, isStale: true, validation: { status: 'valid' } };
    const invalidated = { id: 'stale-timer', timerId: 'stale-timer', taskId: 'math', date, recordedSeconds: 900, validation: { status: 'invalid', reasonCodes: ['stale_timer_forced_invalid'] } };

    expect(getEffectiveSessionsForDate([invalidated], date, staleLive)).toEqual([]);
  });
  it('同じtimerの保存sessionとlive sessionを重複表示しない', () => {
    const date = '2026-09-27';
    const saved = { id: 'timer-1', timerId: 'timer-1', taskId: 'math', date, recordedSeconds: 60, validation: { status: 'valid' } };
    const live = { id: 'live-timer-1', timerId: 'timer-1', taskId: 'math', date, recordedSeconds: 61, validation: { status: 'valid' } };

    expect(getEffectiveSessionsForDate([saved], date, live)).toEqual([saved]);
  });
  it('指定した当日のsessionだけをToday Timelineへ渡す', () => {
    const today = '2026-09-27';
    const sessions = [
      { id: 'previous', taskId: 'math', date: '2026-09-26', recordedSeconds: 60, validation: { status: 'valid' } },
      { id: 'today', taskId: 'math', date: today, recordedSeconds: 120, validation: { status: 'valid' } },
    ];

    expect(getEffectiveSessionsForDate(sessions, today).map((session) => session.id)).toEqual(['today']);
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

describe('task totals share Timeline effective sessions', () => {
  const date = '2026-10-03';
  const saved = { id: 't', timerId: 't', taskId: 'math', date, recordedSeconds: 60, validation: { status: 'valid' } };
  it('does not double count live data while STOP listeners arrive separately', () => {
    const live = { ...saved, id: 'live-t', recordedSeconds: 61 };
    expect(getEffectiveStudySecondsForTask([saved], date, 'math', live)).toBe(60);
  });
  it('does not credit a previous-day live timer to today', () => {
    expect(getEffectiveStudySecondsForTask([saved], date, 'math', { ...saved, timerId: 'other', date: '2026-10-02' })).toBe(60);
  });
  it('excludes stale, invalid and pending live data from task totals', () => {
    for (const live of [{ ...saved, isStale: true }, { ...saved, validation: { status: 'invalid' } }, { ...saved, validation: { status: 'pending_review' } }]) {
      expect(getEffectiveStudySecondsForTask([], date, 'math', live)).toBe(0);
    }
  });
});
