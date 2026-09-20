import { describe, expect, it } from 'vitest';
import { getRunningTimerTask, getTaskLiveSession, getTimerViewTask, hasAnyRunningTimer } from './timerRuntimeState';

const legacyRunningTask = { id: 'legacy', isRunning: true, sessionStartTime: 1_000, currentDuration: 300 };
const newTask = { id: 'new', isRunning: false };

describe('canonical timer runtime state', () => {
  it('non-Sample Modeではlegacy task.isRunningを無視する', () => {
    expect(hasAnyRunningTimer({ isSampleMode: false, activeTimer: null, tasks: [legacyRunningTask] })).toBe(false);
    expect(getRunningTimerTask({ isSampleMode: false, activeTimerTask: null, tasks: [legacyRunningTask] })).toBeNull();
  });

  it('ActiveTimerがなければlegacy runtime値が残っていても新しいTaskをSTART可能な表示にする', () => {
    const viewTask = getTimerViewTask({ task: legacyRunningTask, isSampleMode: false, activeTimer: null });
    expect(viewTask).toMatchObject({ isRunning: false, sessionStartTime: null, currentDuration: 0 });
    expect(hasAnyRunningTimer({ isSampleMode: false, activeTimer: null, tasks: [legacyRunningTask, newTask] })).toBe(false);
  });

  it('通常・stale・cross-device STOP後のActiveTimer削除は直ちにSTART可能状態にする', () => {
    [null, null, null].forEach((activeTimer) => {
      expect(hasAnyRunningTimer({ isSampleMode: false, activeTimer, tasks: [legacyRunningTask, newTask] })).toBe(false);
    });
  });

  it('ActiveTimerがある間だけ他TaskのSTARTを禁止する', () => {
    const activeTimer = { timerId: 'current', taskId: 'legacy', state: 'running', segmentStartedAt: 2_000, accumulatedSeconds: 0 };
    expect(hasAnyRunningTimer({ isSampleMode: false, activeTimer, tasks: [legacyRunningTask, newTask] })).toBe(true);
  });

  it('Sample Modeは従来どおりlocal task.isRunningを利用する', () => {
    expect(hasAnyRunningTimer({ isSampleMode: true, activeTimer: null, tasks: [legacyRunningTask] })).toBe(true);
    expect(getTimerViewTask({ task: legacyRunningTask, isSampleMode: true, activeTimer: null })).toBe(legacyRunningTask);
  });

  it('running ActiveTimerだけをLIVE表示し、paused ActiveTimerではnullを返す', () => {
    const runningLiveSession = { taskId: 'legacy', recordedSeconds: 120, isStale: false };
    expect(getTaskLiveSession(runningLiveSession, 'legacy')).toBe(runningLiveSession);
    // paused ActiveTimerではgetLiveStudySessionがnullを返すため、カードはLIVE扱いにしない。
    expect(getTaskLiveSession(null, 'legacy')).toBeNull();
    expect(getTaskLiveSession(null, 'new')).toBeNull();
  });
});
