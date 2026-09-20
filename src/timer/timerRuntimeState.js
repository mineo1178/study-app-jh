import { isActiveTimer } from './timerEngine.js';

export function hasAnyRunningTimer({ isSampleMode, activeTimer, tasks = [] }) {
  return isSampleMode ? tasks.some((task) => task.isRunning) : isActiveTimer(activeTimer);
}

export function getRunningTimerTask({ isSampleMode, activeTimerTask, tasks = [] }) {
  return isSampleMode ? tasks.find((task) => task.isRunning) || null : activeTimerTask || null;
}

export function getTimerViewTask({ task, isSampleMode, activeTimer }) {
  if (isActiveTimer(activeTimer) && activeTimer.taskId === task.id) {
    return {
      ...task,
      isRunning: activeTimer.state === 'running',
      sessionStartTime: activeTimer.segmentStartedAt,
      currentDuration: activeTimer.accumulatedSeconds || 0,
      lastHeartbeatAt: activeTimer.lastHeartbeatAt,
      lastUpdatedAt: activeTimer.updatedAt,
    };
  }
  if (isSampleMode) return task;
  return {
    ...task,
    isRunning: false,
    sessionStartTime: null,
    currentDuration: 0,
    lastHeartbeatAt: null,
    lastUpdatedAt: null,
  };
}
