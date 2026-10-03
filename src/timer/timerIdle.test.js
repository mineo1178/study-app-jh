import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_AUTO_STOP_SECONDS, rememberTimerIdleStart, startTimerIdle, TIMER_IDLE_STORAGE_KEY } from './timerIdle.js';
import { TIMER_ACTIVITY_EVENTS } from './timerDiagnostics.js';

const start = 1_000_000;
const timer = { timerId: 't', state: 'running', ownerClientId: 'owner', segmentStartedAt: start };
const surface = () => {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    emit(type, isTrusted = true) { listeners.get(type)?.forEach((listener) => listener({ type, isTrusted })); },
    count: () => [...listeners.values()].reduce((sum, value) => sum + value.size, 0),
  };
};
const memory = () => {
  const items = new Map();
  return { getItem: (key) => items.get(key) || null, setItem: vi.fn((key, value) => items.set(key, value)) };
};
let controllers;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(start); controllers = []; });
afterEach(() => { controllers.forEach((controller) => controller?.dispose()); vi.useRealTimers(); });
function setup(extra = {}) {
  const activityTarget = surface(); const visibilityTarget = surface(); const storage = memory();
  const onStop = vi.fn().mockResolvedValue({ session: { timerId: 't' }, alreadyFinished: false });
  const record = vi.fn();
  const options = { timer, ownerClientId: 'owner', activityTarget, visibilityTarget, storage, onStop, record,
    now: Date.now, monotonic: () => Date.now() - start, ...extra };
  const controller = startTimerIdle(options); controllers.push(controller);
  return { ...options, controller };
}

describe('five-minute owner inactivity scheduler', () => {
  it('keeps START active at 30s, 1m, 4:59; stops at 5:00 once, with the 5:00 end time', async () => {
    const { onStop, controller } = setup();
    expect(IDLE_AUTO_STOP_SECONDS).toBe(300);
    expect(controller.getState().idleDeadline).toBe(start + 300_000);
    for (const seconds of [30, 60, 299]) {
      await vi.advanceTimersByTimeAsync(start + seconds * 1000 - Date.now());
      expect(onStop).not.toHaveBeenCalled();
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(onStop).toHaveBeenCalledExactlyOnceWith({ timerId: 't', endAt: start + 300_000,
      idle: { ownerClientId: 'owner', segmentStartedAt: start, lastUserActivityAt: start } });
    await vi.advanceTimersByTimeAsync(1000); expect(onStop).toHaveBeenCalledTimes(1);
  });
  it.each(TIMER_ACTIVITY_EVENTS)('%s at 4:00 extends the deadline to 9:00', async (type) => {
    const { controller, activityTarget, onStop } = setup();
    await vi.advanceTimersByTimeAsync(240_000); activityTarget.emit(type);
    expect(controller.getState().idleDeadline).toBe(start + 540_000);
    await vi.advanceTimersByTimeAsync(299_000); expect(onStop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000); expect(onStop.mock.calls[0][0].endAt).toBe(start + 540_000);
  });
  it('user activity at T-1 extends the deadline; synthetic and internal events do not', async () => {
    const { controller, activityTarget, visibilityTarget, onStop } = setup();
    await vi.advanceTimersByTimeAsync(299_000);
    for (const type of ['heartbeat', 'heartbeat_success', 'heartbeat_failure', 'snapshot', 'render', 'state_update',
      'effect', 'tick', 'network', 'feedback', 'lazy_load', 'pointermove', 'mousemove', 'scroll', 'focus']) activityTarget.emit(type);
    visibilityTarget.emit('visibilitychange'); activityTarget.emit('click', false);
    expect(controller.getState().idleDeadline).toBe(start + 300_000);
    activityTarget.emit('click'); expect(controller.getState().idleDeadline).toBe(start + 599_000);
    await vi.advanceTimersByTimeAsync(300_000); expect(onStop.mock.calls[0][0].endAt).toBe(start + 599_000);
  });
  it('hidden does not stop immediately; normal background callback stops at five minutes', async () => {
    const { visibilityTarget, onStop } = setup();
    visibilityTarget.emit('visibilitychange'); expect(onStop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(299_000); expect(onStop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000); expect(onStop.mock.calls[0][0].endAt).toBe(start + 300_000);
  });
  it('background callback delayed to eight minutes stops at the original five-minute deadline', async () => {
    const { visibilityTarget, onStop, controller, activityTarget } = setup();
    vi.setSystemTime(start + 480_000); // No callbacks while JS is suspended.
    visibilityTarget.emit('visibilitychange'); activityTarget.emit('click');
    expect(controller.blocksStale()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(onStop).toHaveBeenCalledTimes(1); expect(onStop.mock.calls[0][0].endAt).toBe(start + 300_000);
  });
  it('screen-lock recovery checks the wall deadline even if the mobile monotonic clock slept', async () => {
    const { visibilityTarget, onStop } = setup({ monotonic: () => 0 });
    visibilityTarget.visibilityState = 'hidden'; visibilityTarget.emit('visibilitychange');
    vi.setSystemTime(start + 480_000);
    visibilityTarget.visibilityState = 'visible'; visibilityTarget.emit('visibilitychange');
    await vi.advanceTimersByTimeAsync(0);
    expect(onStop.mock.calls[0][0].endAt).toBe(start + 300_000);
  });
  it('reload at three minutes preserves the original deadline and last activity', async () => {
    const first = setup(); await vi.advanceTimersByTimeAsync(180_000); first.controller.dispose();
    const second = setup({ storage: first.storage });
    expect(second.controller.getState().lastUserActivityAt).toBe(start);
    await vi.advanceTimersByTimeAsync(119_000); expect(second.onStop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000); expect(second.onStop.mock.calls[0][0].endAt).toBe(start + 300_000);
    expect(first.onStop).not.toHaveBeenCalled();
  });
  it('reload after user activity restores that operation rather than the timer start', async () => {
    const first = setup(); await vi.advanceTimersByTimeAsync(120_000); first.activityTarget.emit('keydown');
    await vi.advanceTimersByTimeAsync(60_000); first.controller.dispose();
    const second = setup({ storage: first.storage });
    expect(second.controller.getState().idleDeadline).toBe(start + 420_000);
    await vi.advanceTimersByTimeAsync(240_000); expect(second.onStop.mock.calls[0][0].endAt).toBe(start + 420_000);
  });
  it('pagehide flushes an operation before the throttled persistence callback', async () => {
    const first = setup(); await vi.advanceTimersByTimeAsync(120_000); first.activityTarget.emit('click');
    first.activityTarget.emit('pagehide');
    expect(JSON.parse(first.storage.getItem(TIMER_IDLE_STORAGE_KEY)).lastUserActivityAt).toBe(start + 120_000);
  });
  it('old controller cleanup cannot overwrite a newly confirmed RESUME segment', async () => {
    const first = setup(); await vi.advanceTimersByTimeAsync(120_000);
    const resumed = { ...timer, segmentStartedAt: Date.now() };
    rememberTimerIdleStart(resumed, 'owner', first.storage, Date.now()); first.controller.dispose();
    const second = setup({ timer: resumed, storage: first.storage });
    expect(second.controller.getState().idleDeadline).toBe(start + 420_000);
  });
  it('PAUSE disables detection; RESUME starts a new five-minute segment', async () => {
    const first = setup(); await vi.advanceTimersByTimeAsync(120_000); first.controller.dispose();
    const paused = setup({ timer: { ...timer, state: 'paused', segmentStartedAt: null }, storage: first.storage });
    expect(paused.controller).toBeNull(); await vi.advanceTimersByTimeAsync(600_000);
    expect(first.onStop).not.toHaveBeenCalled(); expect(paused.onStop).not.toHaveBeenCalled();
    const resumed = setup({ timer: { ...timer, segmentStartedAt: Date.now() }, storage: first.storage });
    await vi.advanceTimersByTimeAsync(299_000); expect(resumed.onStop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000); expect(resumed.onStop.mock.calls[0][0].endAt).toBe(start + 1020_000);
  });
  it.each([
    { timerId: 'old', ownerClientId: 'owner', segmentStartedAt: start, lastUserActivityAt: 1 },
    { timerId: 't', ownerClientId: 'other', segmentStartedAt: start, lastUserActivityAt: start },
    { timerId: 't', ownerClientId: 'owner', segmentStartedAt: start - 1, lastUserActivityAt: start },
    { timerId: 't', ownerClientId: 'owner', segmentStartedAt: start, lastUserActivityAt: 0 },
    { timerId: 't', ownerClientId: 'owner', segmentStartedAt: start, lastUserActivityAt: start + 900_000 },
  ])('rejects stale/wrong-owner/future stored values: %j', async (saved) => {
    const storage = memory(); storage.setItem(TIMER_IDLE_STORAGE_KEY, JSON.stringify(saved));
    const { controller, onStop } = setup({ storage });
    expect(controller.getState().idleDeadline).toBe(start + 300_000);
    await vi.advanceTimersByTimeAsync(299_000); expect(onStop).not.toHaveBeenCalled();
  });
  it('START success initializes a new timer independently of old diagnostics and storage', async () => {
    const storage = memory(); vi.setSystemTime(start + 2000);
    rememberTimerIdleStart(timer, 'owner', storage, Date.now());
    const { controller, onStop } = setup({ storage });
    expect(controller.getState().idleDeadline).toBe(start + 302_000);
    await vi.advanceTimersByTimeAsync(299_000); expect(onStop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000); expect(onStop.mock.calls[0][0].endAt).toBe(start + 302_000);
  });
  it('a successful start observed after the snapshot also initializes the same controller', async () => {
    const first = setup(); await vi.advanceTimersByTimeAsync(2000);
    rememberTimerIdleStart(timer, 'owner', first.storage, Date.now());
    expect(first.controller.getState().idleDeadline).toBe(start + 302_000);
  });
  it('secondary idle never stops the owner timer or registers listeners', async () => {
    const { controller, activityTarget, onStop } = setup({ ownerClientId: 'secondary' });
    expect(controller).toBeNull(); expect(activityTarget.count()).toBe(0);
    await vi.advanceTimersByTimeAsync(900_000); expect(onStop).not.toHaveBeenCalled();
  });
  it('cleanup/remount does not duplicate listeners or extend the deadline', async () => {
    const first = setup(); const count = first.activityTarget.count(); first.controller.dispose();
    expect(first.activityTarget.count()).toBe(0); expect(first.visibilityTarget.count()).toBe(0);
    const second = setup({ storage: first.storage, activityTarget: first.activityTarget, visibilityTarget: first.visibilityTarget });
    expect(second.activityTarget.count()).toBe(count);
    await vi.advanceTimersByTimeAsync(300_000); expect(second.onStop).toHaveBeenCalledTimes(1); expect(first.onStop).not.toHaveBeenCalled();
  });
  it('samples activity logs and persistence rather than writing or rendering for every input', async () => {
    const { activityTarget, record, storage } = setup();
    for (let index = 0; index < 1000; index++) activityTarget.emit('wheel');
    expect(record.mock.calls.filter(([event]) => event === 'idle_reset_by_user')).toHaveLength(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); expect(storage.setItem).toHaveBeenCalledTimes(2);
  });
  it('retries failed STOP with the same deadline and no overlapping requests', async () => {
    const onStop = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ session: { timerId: 't' } });
    const { activityTarget, visibilityTarget, record } = setup({ onStop });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(record.mock.calls.map(([event]) => event)).toContain('idle_stop_failed');
    activityTarget.emit('click'); visibilityTarget.emit('visibilitychange');
    await vi.advanceTimersByTimeAsync(0); expect(onStop).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000); expect(onStop).toHaveBeenCalledTimes(2);
    expect(onStop.mock.calls.map(([request]) => request.endAt)).toEqual([start + 300_000, start + 300_000]);
  });
  it('a client wall-clock jump does not trigger an early stop within the mounted scheduler', async () => {
    let elapsed = 0; const { controller, visibilityTarget, onStop } = setup({ monotonic: () => elapsed });
    elapsed = 30_000; vi.setSystemTime(start + 930_000); visibilityTarget.emit('visibilitychange');
    await vi.advanceTimersByTimeAsync(0); expect(onStop).not.toHaveBeenCalled(); expect(controller.isDue()).toBe(false);
    elapsed = 300_000; visibilityTarget.emit('visibilitychange'); await vi.advanceTimersByTimeAsync(0);
    expect(onStop.mock.calls[0][0].endAt).toBe(start + 300_000);
  });
  it('denied/corrupt storage still leaves the in-memory guard enabled', async () => {
    const { onStop } = setup({ storage: { getItem: () => '{bad', setItem: () => { throw new Error('denied'); } } });
    await vi.advanceTimersByTimeAsync(300_000); expect(onStop).toHaveBeenCalledTimes(1);
  });
});
