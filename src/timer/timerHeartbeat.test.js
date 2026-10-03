import { afterEach, describe, expect, it, vi } from 'vitest';
import { startTimerHeartbeat, TIMER_HEARTBEAT_MS } from './timerHeartbeat.js';
import { buildActiveTimer, canForceInvalidateStaleTimer } from '../data/activeTimerRepository.js';
import { isActiveTimer, isStaleActiveTimer, shouldAutoFinishReading, timerRecordedSeconds } from './timerEngine.js';
import { staleObservation } from '../test/staleObservation.js';

afterEach(() => vi.useRealTimers());
describe('short-running timers', () => {
  const start = 1_000_000;
  it.each([30, 60, 299, 301])('remains active at %s seconds even with no heartbeat/background suspension', (seconds) => {
    const timer = buildActiveTimer({ task: { id: 'math' }, timerId: 't', ownerClientId: 'owner', now: start });
    const now = start + seconds * 1000;
    expect(isActiveTimer(timer)).toBe(true);
    expect(canForceInvalidateStaleTimer(timer, now)).toBe(false);
    expect(shouldAutoFinishReading(timer, 'reading', now)).toBe(false);
    expect(timerRecordedSeconds(timer, now)).toBe(seconds);
  });
  it('retains the exact fifteen-minute stale boundary', () => {
    const timer = buildActiveTimer({ task: { id: 'math' }, timerId: 't', ownerClientId: 'owner', now: start });
    expect(isStaleActiveTimer(timer, staleObservation(timer, 899_999))).toBe(false);
    expect(isStaleActiveTimer(timer, staleObservation(timer, 900_000))).toBe(true);
  });
});

describe('heartbeat clock', () => {
  it('keeps the timer active after three heartbeat failures and four-minute background suspension', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    const timer = buildActiveTimer({ task: { id: 'math' }, timerId: 't', ownerClientId: 'owner', now: Date.now() });
    const target = new EventTarget(); const error = vi.fn();
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    const stop = startTimerHeartbeat({ send, visibilityTarget: target, onError: error });
    await vi.advanceTimersByTimeAsync(90_000);
    expect(error).toHaveBeenCalledTimes(3);
    // A wall-clock jump alone cannot advance the monotonic heartbeat cadence.
    vi.setSystemTime(1_000_000 + 240_000);
    target.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(isActiveTimer(timer)).toBe(true);
    expect(canForceInvalidateStaleTimer(timer, Date.now())).toBe(false);
    expect(send).toHaveBeenCalledTimes(3);
    stop();
  });
  it('keeps the cadence across frequent snapshot updates and visibility changes', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    const target = new EventTarget(); let snapshot = { version: 0 };
    const send = vi.fn(() => snapshot.version);
    const stop = startTimerHeartbeat({ send, visibilityTarget: target });
    for (let second = 1; second <= 61; second++) {
      snapshot = { version: second };
      target.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.results.map((result) => result.value)).toEqual([30, 60]);
    stop(); await vi.advanceTimersByTimeAsync(TIMER_HEARTBEAT_MS);
    target.dispatchEvent(new Event('visibilitychange')); expect(send).toHaveBeenCalledTimes(2);
  });
  it('does not overlap writes on temporary network delay and recovers after errors', async () => {
    vi.useFakeTimers(); const target = new EventTarget(); let finish;
    const error = vi.fn(); const send = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const stop = startTimerHeartbeat({ send, visibilityTarget: target, onError: error });
    await vi.advanceTimersByTimeAsync(90_000); expect(send).toHaveBeenCalledTimes(1);
    finish(); await vi.advanceTimersByTimeAsync(0);
    send.mockRejectedValueOnce(new Error('offline'));
    await vi.advanceTimersByTimeAsync(30_000); expect(error).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000); expect(send).toHaveBeenCalledTimes(3);
    stop();
  });
  it('does not send or stop a timer during StrictMode cleanup/remount', async () => {
    vi.useFakeTimers(); const target = new EventTarget(); const send = vi.fn();
    startTimerHeartbeat({ send, visibilityTarget: target })();
    const stop = startTimerHeartbeat({ send, visibilityTarget: target });
    await vi.advanceTimersByTimeAsync(30_000); expect(send).toHaveBeenCalledTimes(1); stop();
  });
});
