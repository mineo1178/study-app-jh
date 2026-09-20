import { describe, expect, it } from 'vitest';
import { buildStaleTimerInvalidSession, canForceInvalidateStaleTimer, staleTimerSessionId } from './activeTimerRepository';
import { getEffectiveStudySeconds } from './studySessionSelectors';
import { gameProgress } from '../gameLogic';

const start = 1_000_000;
const staleTimer = {
  timerId: 'timer-stale-1', taskId: 'math', state: 'running', startedAt: start,
  segmentStartedAt: start, lastHeartbeatAt: start + 60 * 1000, accumulatedSeconds: 0, segments: [],
};
const task = { id: 'math', categoryId: 'school', subjectId: 's_math', activityType: 'problem_solving', title: '問題集', type: 'self' };

describe('forced stale timer invalidation', () => {
  it('stale timerからinvalid StudySessionを監査用duration付きで生成する', () => {
    const session = buildStaleTimerInvalidSession(staleTimer, task, start + 16 * 60 * 1000);
    expect(session).toMatchObject({
      timerId: 'timer-stale-1', taskId: 'math', recordedSeconds: 60,
      validation: { status: 'invalid', reasonCodes: ['stale_timer_forced_invalid'] },
    });
    expect(session.segments).toEqual([{ startedAt: start, endedAt: start + 60 * 1000, durationSeconds: 60 }]);
  });

  it('invalid sessionはeffective学習時間とRPG対象外になる', () => {
    const session = buildStaleTimerInvalidSession(staleTimer, task, start + 16 * 60 * 1000);
    expect(getEffectiveStudySeconds([session])).toBe(0);
    expect(gameProgress([], session.date, [session]).rawExp).toBe(0);
  });

  it('同じtimerIdは常に同じStudySession document IDを使う', () => {
    expect(staleTimerSessionId(staleTimer)).toBe('timer-stale-1');
    expect(staleTimerSessionId({ ...staleTimer })).toBe('timer-stale-1');
  });

  it('transaction直前にheartbeatが更新されていれば強制invalid化しない', () => {
    const now = start + 16 * 60 * 1000;
    expect(canForceInvalidateStaleTimer(staleTimer, now)).toBe(true);
    expect(canForceInvalidateStaleTimer({ ...staleTimer, lastHeartbeatAt: now - 30 * 1000 }, now)).toBe(false);
  });
});
