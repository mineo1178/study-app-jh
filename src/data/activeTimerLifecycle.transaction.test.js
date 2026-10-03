import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ store: new Map(), race: null, attempts: 0 }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => parts.join('/'),
  runTransaction: async (_db, callback) => {
    for (;;) {
      state.attempts++;
      const writes = [];
      const result = await callback({
        get: async (ref) => {
          const value = state.store.get(ref);
          return { id: ref.split('/').at(-1), exists: () => value !== undefined, data: () => value === undefined ? undefined : structuredClone(value) };
        },
        set: (ref, value) => writes.push(() => state.store.set(ref, value)),
        update: (ref, value) => writes.push(() => state.store.set(ref, { ...state.store.get(ref), ...value })),
        delete: (ref) => writes.push(() => state.store.delete(ref)),
      });
      if (state.race) { const race = state.race; state.race = null; race(); continue; }
      writes.forEach((write) => write()); return result;
    }
  },
}));
import { buildFinishedTimerSession, finishActiveTimer, heartbeatActiveTimer, invalidateStaleActiveTimer, pauseActiveTimer, resumeActiveTimer, startActiveTimer } from './activeTimerRepository.js';
import { startTimerIdle } from '../timer/timerIdle.js';
import { applyStudySessionReward, prepareCanonicalStudySessionReward } from './rewardLedgerRepository.js';
import { getEffectiveStudySecondsForTask } from './studySessionSelectors.js';
const start = 1_000_000;
const ref = 'families/f/apps/junior-high/activeTimers/current';
const task = { id: 'math', categoryId: 'school', subjectId: 's_math', title: '数学', activityType: 'problem_solving' };
const args = { db: {}, familyId: 'f', task, timerId: 't', ownerClientId: 'owner' };
beforeEach(() => { state.store.clear(); state.race = null; state.attempts = 0; });

describe('active timer transaction lifecycle', () => {
  it('manual STOP repository itself stays independent of the owner idle scheduler', async () => {
    vi.useFakeTimers(); vi.setSystemTime(start);
    try {
      await startActiveTimer({ ...args, now: Date.now() });
      for (let seconds = 30; seconds <= 3600; seconds += 30) {
        vi.advanceTimersByTime(30_000);
        await heartbeatActiveTimer({ ...args, now: Date.now() });
        expect(await invalidateStaleActiveTimer({ ...args, now: Date.now() })).toMatchObject({ invalidated: false });
      }
      const result = await finishActiveTimer({ ...args, endAt: Date.now() });
      expect(result.session).toMatchObject({ recordedSeconds: 3600, validation: { status: 'valid' }, segments: [{ startedAt: start, endedAt: start + 3600_000, durationSeconds: 3600 }] });
    } finally { vi.useRealTimers(); }
  });
  it('reproduces early stale deletion when a different client clock is fifteen minutes ahead', async () => {
    await startActiveTimer({ ...args, now: start });
    const observerNow = start + 30_000 + 15 * 60_000;
    const result = await invalidateStaleActiveTimer({ ...args, now: observerNow });
    expect(result.invalidated).toBe(true);
    expect(result.session.validation.status).toBe('invalid');
    expect(state.store.has(ref)).toBe(false);
  });
  it.each([30, 60, 299, 301])('does not delete a STARTed timer after %s seconds with delayed heartbeats', async (seconds) => {
    await startActiveTimer({ ...args, now: start });
    expect(await invalidateStaleActiveTimer({ ...args, now: start + seconds * 1000 })).toMatchObject({ invalidated: false });
    expect(state.store.get(ref).state).toBe('running');
  });
  it('PAUSE does not STOP, RESUME excludes the pause, and cross-device STOP commits once', async () => {
    await startActiveTimer({ ...args, now: start });
    await pauseActiveTimer({ ...args, now: start + 60_000 });
    expect(await invalidateStaleActiveTimer({ ...args, now: start + 1200_000 })).toMatchObject({ invalidated: false });
    expect(state.store.get(ref).state).toBe('paused');
    await resumeActiveTimer({ ...args, now: start + 1200_000 });
    const result = await finishActiveTimer({ ...args, ownerClientId: 'another-device', endAt: start + 1260_000 });
    expect(result.session).toMatchObject({ recordedSeconds: 120, validation: { status: 'valid' } });
    expect(state.store.has(ref)).toBe(false);
    expect(await finishActiveTimer({ ...args, endAt: start + 1300_000 })).toMatchObject({ alreadyFinished: true, session: result.session });
  });
  it('only invalidates when the existing stale threshold is reached', async () => {
    await startActiveTimer({ ...args, now: start });
    expect(await invalidateStaleActiveTimer({ ...args, now: start + 900_000 - 1 })).toMatchObject({ invalidated: false });
    const result = await invalidateStaleActiveTimer({ ...args, now: start + 900_000 });
    expect(result.session.validation.status).toBe('invalid'); expect(state.store.has(ref)).toBe(false);
  });
  it('rechecks a recovered heartbeat when stale invalidation retries', async () => {
    await startActiveTimer({ ...args, now: start });
    const now = start + 900_000;
    state.race = () => state.store.set(ref, { ...state.store.get(ref), lastHeartbeatAt: now });
    expect(await invalidateStaleActiveTimer({ ...args, now })).toMatchObject({ invalidated: false });
    expect(state.store.get(ref).state).toBe('running');
  });
  it('does not revive a timer when heartbeat retries after a concurrent STOP', async () => {
    await startActiveTimer({ ...args, now: start });
    state.race = () => state.store.delete(ref);
    expect(await heartbeatActiveTimer({ ...args, now: start + 60_000 })).toBe(false);
    expect(state.store.has(ref)).toBe(false); expect(state.attempts).toBe(3);
  });
});

describe('idle scheduler + canonical transaction + rewards', () => {
  let controllers;
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(start); controllers = []; });
  afterEach(() => { controllers.forEach((controller) => controller?.dispose()); vi.useRealTimers(); });
  const sessionRef = 'families/f/apps/junior-high/studySessions/t';
  function watch(extra = {}) {
    const listeners = new Map();
    const activityTarget = {
      addEventListener: (event, listener) => listeners.set(event, listener),
      removeEventListener: (event, listener) => { if (listeners.get(event) === listener) listeners.delete(event); },
    };
    const onStop = vi.fn(({ endAt, idle }) => finishActiveTimer({ ...args, endAt, idle }));
    const controller = startTimerIdle({ timer: state.store.get(ref), ownerClientId: 'owner', onStop,
      activityTarget, visibilityTarget: activityTarget, storage: null,
      monotonic: () => Date.now() - start, record: vi.fn(), ...extra });
    controllers.push(controller);
    return { controller, onStop, emit: (event) => listeners.get(event)?.({ type: event, isTrusted: true }) };
  }
  it('Case B: five idle minutes save 300 valid seconds and flow through the common Timeline total', async () => {
    await startActiveTimer({ ...args, now: start }); watch();
    await vi.advanceTimersByTimeAsync(300_000);
    const session = state.store.get(sessionRef);
    expect(session).toMatchObject({ recordedSeconds: 300, validation: { status: 'valid' },
      segments: [{ startedAt: start, endedAt: start + 300_000, durationSeconds: 300 }] });
    expect(state.store.has(ref)).toBe(false);
    expect(getEffectiveStudySecondsForTask([{ ...session, id: 't' }], session.date, task.id)).toBe(300);
  });
  it('Case C: last operation at two minutes saves seven minutes', async () => {
    await startActiveTimer({ ...args, now: start }); const owner = watch();
    await vi.advanceTimersByTimeAsync(120_000); owner.emit('click');
    await vi.advanceTimersByTimeAsync(300_000);
    expect(state.store.get(sessionRef)).toMatchObject({ recordedSeconds: 420, validation: { status: 'valid' } });
  });
  it('Case D: PAUSE ten minutes is excluded and RESUME idle saves seven minutes', async () => {
    await startActiveTimer({ ...args, now: start }); const owner = watch();
    await vi.advanceTimersByTimeAsync(120_000); await pauseActiveTimer({ ...args, now: Date.now() });
    owner.controller.dispose();
    const paused = watch(); expect(paused.controller).toBeNull();
    await vi.advanceTimersByTimeAsync(600_000); expect(state.store.has(sessionRef)).toBe(false);
    await resumeActiveTimer({ ...args, now: Date.now() }); watch();
    await vi.advanceTimersByTimeAsync(299_000); expect(state.store.has(sessionRef)).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.store.get(sessionRef)).toMatchObject({ recordedSeconds: 420, validation: { status: 'valid' },
      segments: [{ startedAt: start, endedAt: start + 120_000, durationSeconds: 120 },
        { startedAt: start + 720_000, endedAt: start + 1020_000, durationSeconds: 300 }] });
  });
  it('Case A: regular operation + heartbeats allow ten-minute manual STOP with the same reward rules', async () => {
    await startActiveTimer({ ...args, now: start }); const owner = watch();
    for (let minute = 1; minute <= 10; minute++) {
      await vi.advanceTimersByTimeAsync(60_000); owner.emit('keydown');
      await heartbeatActiveTimer({ ...args, now: Date.now() });
    }
    expect(owner.onStop).not.toHaveBeenCalled();
    const result = await finishActiveTimer({ ...args, endAt: Date.now() }); owner.controller.dispose();
    expect(result.session.recordedSeconds).toBe(600);
    const sameTimeIdle = await finishActiveTimer({ ...args, endAt: Date.now(), idle: { ownerClientId: 'owner', segmentStartedAt: start, lastUserActivityAt: start + 300_000 } });
    expect(prepareCanonicalStudySessionReward(sameTimeIdle.session)).toEqual(prepareCanonicalStudySessionReward(result.session));
  });
  it.each([480_000, 1200_000])('JS delayed to %sms still saves the five-minute deadline ahead of stale', async (delay) => {
    await startActiveTimer({ ...args, now: start }); const owner = watch();
    vi.setSystemTime(start + delay); owner.emit('visibilitychange');
    expect(owner.controller.blocksStale()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(state.store.get(sessionRef)).toMatchObject({ recordedSeconds: 300, validation: { status: 'valid' } });
    expect(await invalidateStaleActiveTimer({ ...args, now: Date.now() })).toMatchObject({ invalidated: false });
  });
  it('secondary idle cannot STOP; secondary manual STOP remains allowed', async () => {
    await startActiveTimer({ ...args, now: start }); const secondary = watch({ ownerClientId: 'secondary' });
    expect(secondary.controller).toBeNull(); await vi.advanceTimersByTimeAsync(300_000);
    expect(state.store.has(ref)).toBe(true); expect(secondary.onStop).not.toHaveBeenCalled();
    const result = await finishActiveTimer({ ...args, ownerClientId: 'secondary', endAt: Date.now() });
    expect(result.session.recordedSeconds).toBe(300); expect(state.store.has(ref)).toBe(false);
  });
  it.each(['paused', 'resumed', 'changed_owner', 'replaced'])('transaction recheck prevents overdue callbacks after %s', async (change) => {
    await startActiveTimer({ ...args, now: start });
    state.race = () => {
      const latest = state.store.get(ref);
      state.store.set(ref, change === 'paused' ? { ...latest, state: 'paused' }
        : change === 'resumed' ? { ...latest, segmentStartedAt: start + 100_000 }
          : change === 'changed_owner' ? { ...latest, ownerClientId: 'other' } : { ...latest, timerId: 'new' });
    };
    const result = await finishActiveTimer({ ...args, endAt: start + 300_000,
      idle: { ownerClientId: 'owner', segmentStartedAt: start, lastUserActivityAt: start } });
    expect(result).toEqual({ skipped: true, reason: 'IDLE_STATE_CHANGED' });
    expect(state.store.has(sessionRef)).toBe(false); expect(state.store.has(ref)).toBe(true);
  });
  it('idle/manual STOP transaction retry writes one session and rewards it only once', async () => {
    await startActiveTimer({ ...args, now: start });
    state.race = () => {
      const session = buildFinishedTimerSession(state.store.get(ref), task, { endAt: start + 300_000 });
      state.store.set(sessionRef, session); state.store.delete(ref);
    };
    const result = await finishActiveTimer({ ...args, endAt: start + 300_000,
      idle: { ownerClientId: 'owner', segmentStartedAt: start, lastUserActivityAt: start } });
    expect(result.alreadyFinished).toBe(true);
    expect([...state.store.keys()].filter((key) => key.includes('/studySessions/'))).toEqual([sessionRef]);
    const session = { id: 't', ...result.session };
    expect(await applyStudySessionReward({ ...args, session })).toMatchObject({ applied: true });
    expect(await applyStudySessionReward({ ...args, session })).toEqual({ applied: false, reason: 'ALREADY_APPLIED' });
    expect([...state.store.keys()].filter((key) => key.includes('/rewardLedger/'))).toHaveLength(1);
  });
  it('idle-first STOP cannot be counted again by a subsequent manual STOP', async () => {
    await startActiveTimer({ ...args, now: start }); watch(); await vi.advanceTimersByTimeAsync(300_000);
    const session = state.store.get(sessionRef);
    expect(await finishActiveTimer({ ...args, endAt: start + 301_000 })).toEqual({ alreadyFinished: true, session });
  });
  it.each([
    [180 * 60, 'problem_solving', 'pending_review'],
    [5 * 60 * 60, 'reading', 'invalid'],
  ])('idle STOP preserves existing validation for %s prior seconds of %s', async (seconds, activityType, status) => {
    const priorEnd = start + seconds * 1000;
    const latest = { timerId: 't', taskId: task.id, ownerClientId: 'owner', state: 'running',
      startedAt: start, segmentStartedAt: priorEnd + 600_000, lastHeartbeatAt: priorEnd + 600_000,
      segments: [{ startedAt: start, endedAt: priorEnd, durationSeconds: seconds }], accumulatedSeconds: seconds };
    state.store.set(ref, latest);
    const result = await finishActiveTimer({ ...args, task: { ...task, activityType }, endAt: latest.segmentStartedAt + 300_000,
      idle: { ownerClientId: 'owner', segmentStartedAt: latest.segmentStartedAt, lastUserActivityAt: latest.segmentStartedAt } });
    expect(result.session).toMatchObject({ recordedSeconds: seconds + 300, validation: { status } });
    expect(prepareCanonicalStudySessionReward(result.session).eligible).toBe(false);
  });
});
