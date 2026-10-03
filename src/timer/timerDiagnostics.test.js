import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTimerDiagnostics, diagnosticErrorCode, diagnosticTimerState, diagnosticUserActivity, listenTimerUserActivity, TIMER_ACTIVITY_EVENTS, listenTimerDiagnosticEnvironment, recordTimerSnapshot, timerDiagnostics, traceTimerOperation, TIMER_DIAGNOSTICS_KEY, TIMER_DIAGNOSTICS_LIMIT } from './timerDiagnostics.js';
import { buildActiveTimer, canForceInvalidateStaleTimer } from '../data/activeTimerRepository.js';
import { getTimerViewTask } from './timerRuntimeState.js';

const memory = () => {
  const map = new Map();
  return { getItem: (key) => map.get(key) || null, setItem: (key, value) => map.set(key, value) };
};
const startedAt = 1_000_000;
const timer = buildActiveTimer({ task: { id: 't' }, timerId: 'timer', ownerClientId: 'owner', now: startedAt });
describe('user activity observation has no timer side effects', () => {
  const target = () => {
    const listeners = new Map();
    return {
      addEventListener: (event, listener) => listeners.set(event, listener),
      removeEventListener: (event, listener) => { if (listeners.get(event) === listener) listeners.delete(event); },
      emit: (type, isTrusted = true) => listeners.get(type)?.({ type, isTrusted }),
      listeners,
    };
  };
  it.each(TIMER_ACTIVITY_EVENTS)('observes trusted %s without changing the active timer', (event) => {
    const surface = target(); const record = vi.fn();
    const cleanup = listenTimerUserActivity(record, surface, () => startedAt);
    surface.emit(event);
    expect(diagnosticUserActivity(startedAt + 1000)).toEqual({ lastUserActivityAt: startedAt, elapsedIdleSeconds: 1 });
    expect(record).toHaveBeenCalledWith('user_activity', { activityEvent: event, lastUserActivityAt: startedAt, elapsedIdleSeconds: 0 });
    expect(timer.state).toBe('running'); cleanup(); expect(surface.listeners.size).toBe(0);
  });
  it('samples high frequency activity but retains the latest actual operation', () => {
    const surface = target(); const record = vi.fn(); let now = startedAt;
    const cleanup = listenTimerUserActivity(record, surface, () => now);
    for (let index = 0; index < 60_000; index++) { now = startedAt + index; surface.emit('wheel'); }
    expect(record).toHaveBeenCalledTimes(1);
    expect(diagnosticUserActivity(now).lastUserActivityAt).toBe(now);
    now = startedAt + 60_000; surface.emit('click'); expect(record).toHaveBeenCalledTimes(2); cleanup();
  });
  it('internal, synthetic, visibility and focus events never count as user activity; remount cleans up', () => {
    const surface = target(); const record = vi.fn();
    const cleanup = listenTimerUserActivity(record, surface, () => startedAt);
    surface.emit('click', false);
    for (const event of ['heartbeat', 'snapshot', 'render', 'state_update', 'tick', 'feedback', 'lazy_load', 'network_response', 'visibilitychange', 'focus', 'poll', 'pointermove', 'mousemove', 'scroll']) surface.emit(event);
    expect(diagnosticUserActivity().lastUserActivityAt).toBeNull(); expect(record).not.toHaveBeenCalled();
    cleanup(); const cleanupAgain = listenTimerUserActivity(record, surface, () => startedAt);
    expect(surface.listeners.size).toBe(TIMER_ACTIVITY_EVENTS.length); cleanupAgain();
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('local diagnostic ring', () => {
  it('bounds persisted and in-memory events to the latest 300', () => {
    const storage = memory(); const log = createTimerDiagnostics({ storage: () => storage });
    for (let index = 0; index < TIMER_DIAGNOSTICS_LIMIT + 20; index++) log.record('event', { recordedSeconds: index });
    expect(log.getSnapshot()).toHaveLength(TIMER_DIAGNOSTICS_LIMIT);
    expect(log.getSnapshot()[0].recordedSeconds).toBe(20);
    expect(JSON.parse(storage.getItem(TIMER_DIAGNOSTICS_KEY))).toHaveLength(TIMER_DIAGNOSTICS_LIMIT);
    expect(createTimerDiagnostics({ storage: () => storage }).getSnapshot()).toEqual(log.getSnapshot());
  });
  it('omits task names, memos, auth identifiers and raw error messages', () => {
    const log = createTimerDiagnostics({ storage: () => memory() });
    log.record('stop', { ...diagnosticTimerState(timer), task: { title: 'secret' }, title: 'secret', memo: 'secret', uid: 'secret', email: 'secret', error: 'secret', errorCode: 'permission-denied' });
    expect(log.export()).not.toContain('secret');
    expect(log.getSnapshot()[0]).toMatchObject({ errorCode: 'permission-denied', startedAt, lastHeartbeatAt: startedAt });
    expect(diagnosticErrorCode(new Error('private learning contents'))).toBe('ERROR');
    expect(diagnosticErrorCode(new Error('TIMER_NOT_OWNER'))).toBe('TIMER_NOT_OWNER');
  });
  it('keeps recording when storage is denied, corrupt or full', () => {
    for (const storage of [null, { getItem: () => '{bad', setItem: () => { throw new Error('quota'); } }, { getItem: () => { throw new Error('denied'); } }]) {
      const log = createTimerDiagnostics({ storage: () => storage });
      expect(() => { log.record('start'); log.record('stop'); }).not.toThrow();
      expect(log.getSnapshot().map((entry) => entry.event)).toEqual(['start', 'stop']);
    }
  });
  it('merges sequential logs from separate tabs without replaying expired entries', () => {
    const storage = memory(); const a = createTimerDiagnostics({ storage: () => storage }); const b = createTimerDiagnostics({ storage: () => storage });
    a.record('a'); b.record('b'); a.record('c');
    expect(a.getSnapshot().map((entry) => entry.event)).toEqual(['a', 'b', 'c']);
  });
  it('notifies subscribers without allowing them to break timer logging', () => {
    const log = createTimerDiagnostics(); const listener = vi.fn();
    const unsubscribe = log.subscribe(listener); log.subscribe(() => { throw new Error('observer'); });
    log.record('start'); unsubscribe(); log.record('stop'); expect(listener).toHaveBeenCalledTimes(1);
  });
  it('records clock jumps relative to a monotonic clock', () => {
    let wall = startedAt; let elapsed = 0;
    const log = createTimerDiagnostics({ storage: () => null, now: () => wall, monotonic: () => elapsed });
    log.record('start'); wall += 900_000 + 30_000; elapsed += 30_000; log.record('snapshot');
    expect(log.getSnapshot()[1].clockDeltaMs).toBe(900_000);
  });
  it('reports timestamp types without treating them as canonical numeric timer fields', () => {
    const state = diagnosticTimerState({ ...timer, lastHeartbeatAt: { toMillis: () => startedAt } }, startedAt + 30_000);
    expect(state).toMatchObject({ heartbeatType: 'firestore_timestamp', lastHeartbeatAt: null });
  });
});

describe('snapshot disappearance diagnostics', () => {
  it('distinguishes cache missing from server disappearance without issuing STOP', () => {
    const record = vi.fn(); recordTimerSnapshot(timer, null, { fromCache: true, hasPendingWrites: false }, 1, record);
    expect(record.mock.calls.map(([event]) => event)).not.toContain('active_timer_delete_observed');
    expect(record.mock.calls[1][1].reason).toBe('CACHE_MISSING');
    record.mockClear(); recordTimerSnapshot(timer, null, { fromCache: false, hasPendingWrites: false }, 2, record);
    expect(record.mock.calls.map(([event]) => event)).toContain('active_timer_delete_observed');
    expect(record.mock.calls.at(-1)[1].reason).toBe('SERVER_MISSING_UNKNOWN_CALLER');
    expect(timer.state).toBe('running');
  });
  it('does not falsely label an initial missing snapshot or pending local write as a server deletion', () => {
    const record = vi.fn(); recordTimerSnapshot(null, null, { fromCache: false }, 1, record);
    recordTimerSnapshot(timer, null, { fromCache: false, hasPendingWrites: true }, 1, record);
    expect(record.mock.calls.map(([event]) => event)).not.toContain('active_timer_delete_observed');
  });
  it('records active-to-active timer replacement separately', () => {
    const record = vi.fn(); recordTimerSnapshot(timer, { ...timer, timerId: 'new' }, { fromCache: false }, 1, record);
    expect(record.mock.calls[1][0]).toBe('active_timer_replaced');
  });
  it('snapshot re-subscription preserves a running state; missing only changes the existing UI view', () => {
    const task = { id: 't' }; const record = vi.fn();
    recordTimerSnapshot(timer, timer, { fromCache: true }, 2, record);
    expect(getTimerViewTask({ task, isSampleMode: false, activeTimer: timer }).isRunning).toBe(true);
    expect(getTimerViewTask({ task, isSampleMode: false, activeTimer: null }).isRunning).toBe(false);
    expect(timer.state).toBe('running'); expect(record.mock.calls.map(([event]) => event)).not.toContain('active_timer_delete_observed');
  });
});

describe('environment events are read-only', () => {
  it('hidden four minutes, blur, offline/online and unmount/remount do not stop an active timer', () => {
    vi.useFakeTimers(); vi.setSystemTime(startedAt);
    const windowTarget = new EventTarget(); const documentTarget = new EventTarget();
    const log = createTimerDiagnostics({ storage: () => null, environment: () => ({ visibility: 'hidden', online: false }) });
    const record = (event) => log.record(event, diagnosticTimerState(timer));
    const cleanup = listenTimerDiagnosticEnvironment(record, windowTarget, documentTarget);
    documentTarget.dispatchEvent(new Event('visibilitychange')); windowTarget.dispatchEvent(new Event('blur')); windowTarget.dispatchEvent(new Event('offline'));
    vi.advanceTimersByTime(240_000);
    documentTarget.dispatchEvent(new Event('visibilitychange')); windowTarget.dispatchEvent(new Event('online')); windowTarget.dispatchEvent(new Event('focus'));
    cleanup(); listenTimerDiagnosticEnvironment(record, windowTarget, documentTarget)();
    expect(canForceInvalidateStaleTimer(timer, Date.now())).toBe(false);
    expect(timer.state).toBe('running');
    expect(log.getSnapshot().map((entry) => entry.event)).toEqual(['component_mount', 'visibilitychange', 'blur', 'offline', 'visibilitychange', 'online', 'focus', 'component_unmount', 'component_mount', 'component_unmount']);
  });
});

describe('operation diagnostics follow committed results', () => {
  it('preserves a committed result even if diagnostic formatting fails', async () => {
    const result = { session: { validation: { reasonCodes: 123 } } };
    expect(await traceTimerOperation('stop', {}, async () => result)).toBe(result);
  });
  it('records STOP and session/deletion only after successful completion', async () => {
    const record = vi.spyOn(timerDiagnostics, 'record'); let resolve;
    const result = { session: { timerId: 'timer', validation: { status: 'valid', reasonCodes: [] }, recordedSeconds: 60 }, alreadyFinished: false };
    const pending = traceTimerOperation('stop', { timerId: 'timer', source: 'test' }, () => new Promise((done) => { resolve = done; }));
    expect(record.mock.calls.map(([event]) => event)).toEqual(['stop_request']);
    resolve(result); expect(await pending).toBe(result);
    expect(record.mock.calls.map(([event]) => event)).toEqual(['stop_request', 'stop_success', 'session_finalized', 'active_timer_delete_committed']);
  });
  it('logs failure without claiming STOP or changing the thrown error', async () => {
    const record = vi.spyOn(timerDiagnostics, 'record'); const error = Object.assign(new Error('private'), { code: 'unavailable' });
    await expect(traceTimerOperation('stop', {}, async () => { throw error; })).rejects.toBe(error);
    expect(record.mock.calls.map(([event]) => event)).toEqual(['stop_request', 'stop_failure']);
  });
  it('does not claim a new deletion or session on idempotent STOP', async () => {
    const record = vi.spyOn(timerDiagnostics, 'record');
    await traceTimerOperation('stop', {}, async () => ({ session: { timerId: 'timer' }, alreadyFinished: true }));
    expect(record.mock.calls.map(([event]) => event)).toEqual(['stop_request', 'stop_success']);
  });
});
