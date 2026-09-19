import { describe, expect, it } from 'vitest';
import { isStaleActiveTimer, isTimerOwner, timerRecordedSeconds, timerSegmentsAtEnd } from './timerEngine';

const start = 1_000_000;
describe('active timer engine', () => {
  it('PAUSE済みsegmentとRESUME中の時間を合計する', () => {
    const timer = { state: 'running', accumulatedSeconds: 1800, segmentStartedAt: start + 2400 * 1000, lastHeartbeatAt: start + 3600 * 1000 };
    expect(timerRecordedSeconds(timer, start + 3600 * 1000)).toBe(3000);
    expect(timerSegmentsAtEnd(timer, start + 3600 * 1000)).toEqual([{ startedAt: start + 2400 * 1000, endedAt: start + 3600 * 1000, durationSeconds: 1200 }]);
  });

  it('stale timerは最後のheartbeatで時間を固定する', () => {
    const timer = { state: 'running', accumulatedSeconds: 0, segmentStartedAt: start, lastHeartbeatAt: start + 60 * 1000 };
    expect(isStaleActiveTimer(timer, start + 16 * 60 * 1000)).toBe(true);
    expect(timerRecordedSeconds(timer, start + 16 * 60 * 1000)).toBe(60);
  });

  it('observerはownerではない', () => {
    expect(isTimerOwner({ ownerClientId: 'device:tab-a' }, 'device:tab-a')).toBe(true);
    expect(isTimerOwner({ ownerClientId: 'device:tab-a' }, 'device:tab-b')).toBe(false);
  });
});
