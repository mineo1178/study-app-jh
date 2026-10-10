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
import { buildFinishedTimerSession, finishActiveTimer, heartbeatActiveTimer, invalidateStaleActiveTimer, pauseActiveTimer, resumeActiveTimer, startActiveTimer, startOrSwitchActiveTimer } from './activeTimerRepository.js';
import { startTimerIdle } from '../timer/timerIdle.js';
import { applyStudySessionReward, prepareCanonicalStudySessionReward } from './rewardLedgerRepository.js';
import { getEffectiveStudySecondsForTask } from './studySessionSelectors.js';
import { staleObservation } from '../test/staleObservation.js';
import { createTimerStaleObserver } from '../timer/timerStale.js';
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
  it('prevents early stale deletion when a different client clock is fifteen minutes ahead', async () => {
    await startActiveTimer({ ...args, now: start });
    const observerNow = start + 30_000 + 15 * 60_000;
    const result = await invalidateStaleActiveTimer({ ...args, now: observerNow });
    expect(result.invalidated).toBe(false);
    expect(state.store.has(ref)).toBe(true);
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
    const result = await invalidateStaleActiveTimer({ ...args, now: start + 900_000, staleProof: staleObservation(state.store.get(ref)) });
    expect(result.session.validation.status).toBe('invalid'); expect(state.store.has(ref)).toBe(false);
    expect(prepareCanonicalStudySessionReward(result.session).eligible).toBe(false);
  });
  it('rechecks a recovered heartbeat when stale invalidation retries', async () => {
    await startActiveTimer({ ...args, now: start });
    const now = start + 900_000;
    state.race = () => state.store.set(ref, { ...state.store.get(ref), lastHeartbeatAt: now });
    expect(await invalidateStaleActiveTimer({ ...args, now, staleProof: staleObservation(state.store.get(ref)) })).toMatchObject({ invalidated: false });
    expect(state.store.get(ref).state).toBe('running');
  });
  it('does not revive a timer when heartbeat retries after a concurrent STOP', async () => {
    await startActiveTimer({ ...args, now: start });
    state.race = () => state.store.delete(ref);
    expect(await heartbeatActiveTimer({ ...args, now: start + 60_000 })).toBe(false);
    expect(state.store.has(ref)).toBe(false); expect(state.attempts).toBe(3);
  });
});

describe('clock-safe stale transaction races', () => {
  const sessionRef = 'families/f/apps/junior-high/studySessions/t';
  it.each([15, 30, -30, 60])('heartbeat on an owner with observer offset %s minutes stays active; manual STOP needs no observation wait', async (offset) => {
    await startActiveTimer({ ...args, now: start });
    let elapsed = 0;
    const observer = createTimerStaleObserver({ monotonic: () => elapsed, online: () => true });
    observer.observe(state.store.get(ref));
    for (let tick = 1; tick <= 40; tick++) {
      elapsed = tick * 30_000;
      await heartbeatActiveTimer({ ...args, now: start + elapsed });
      observer.observe(state.store.get(ref));
      expect(await invalidateStaleActiveTimer({ ...args, now: start + elapsed + offset * 60_000, staleProof: observer.proof() })).toMatchObject({ invalidated: false });
    }
    const result = await finishActiveTimer({ ...args, endAt: start + elapsed + offset * 60_000, staleProof: observer.proof() });
    expect(result.session.validation.reasonCodes).not.toContain('stale_timer_forced_invalid');
    expect(state.store.has(ref)).toBe(false);
  });
  it('START switch on a clock thirty minutes ahead does not force a fresh timer invalid', async () => {
    await startActiveTimer({ ...args, now: start });
    const result = await startOrSwitchActiveTimer({ ...args, task: { ...task, id: 'other' }, tasks: [task], timerId: 'next', ownerClientId: 'observer', now: start + 1800_000 });
    expect(result.invalidatedPrevious).toBe(false);
    expect(state.store.get(sessionRef).validation.reasonCodes).not.toContain('stale_timer_forced_invalid');
    expect(state.store.get(ref).timerId).toBe('next');
  });
  it.each(['heartbeat', 'pause', 'resume', 'owner', 'replace', 'offline'])('latest transaction cancels stale cleanup on concurrent %s', async (change) => {
    await startActiveTimer({ ...args, now: start });
    let elapsed = 0; let online = true;
    const observer = createTimerStaleObserver({ monotonic: () => elapsed, online: () => online });
    observer.observe(state.store.get(ref)); elapsed = 900_000;
    const proof = observer.proof();
    state.race = () => {
      const current = state.store.get(ref);
      if (change === 'offline') { online = false; return; }
      const changes = { heartbeat: { lastHeartbeatAt: start + 900_000 }, pause: { state: 'paused' }, resume: { segmentStartedAt: start + 500_000 }, owner: { ownerClientId: 'new-owner' }, replace: { timerId: 'new-timer' } };
      state.store.set(ref, { ...current, ...changes[change] });
    };
    expect(await invalidateStaleActiveTimer({ ...args, now: start + elapsed, staleProof: proof })).toMatchObject({ invalidated: false });
    expect(state.store.has(ref)).toBe(true); expect(state.store.has(sessionRef)).toBe(false);
  });
  it.each(['manual', 'idle'])('a %s STOP racing stale cleanup commits only its existing session and rewards once', async (kind) => {
    await startActiveTimer({ ...args, now: start });
    const proof = staleObservation(state.store.get(ref));
    state.race = () => {
      state.store.set(sessionRef, buildFinishedTimerSession(state.store.get(ref), task, { endAt: start + 300_000, staleProof: null }));
      state.store.delete(ref);
    };
    expect(await invalidateStaleActiveTimer({ ...args, now: start + 900_000, staleProof: proof })).toMatchObject({ invalidated: false });
    const result = await finishActiveTimer({ ...args, endAt: start + 300_000,
      idle: kind === 'idle' ? { ownerClientId: 'owner', segmentStartedAt: start, lastUserActivityAt: start } : null });
    expect(result.alreadyFinished).toBe(true);
    const session = { id: 't', ...result.session };
    expect(await applyStudySessionReward({ ...args, session })).toMatchObject({ applied: true });
    expect(await applyStudySessionReward({ ...args, session })).toEqual({ applied: false, reason: 'ALREADY_APPLIED' });
    expect([...state.store.keys()].filter((key) => key.includes('/studySessions/'))).toEqual([sessionRef]);
    expect([...state.store.keys()].filter((key) => key.includes('/rewardLedger/'))).toHaveLength(1);
  });
  it('stale-first cleanup prevents a following manual or idle STOP from creating a valid session or rewards', async () => {
    await startActiveTimer({ ...args, now: start });
    const result = await invalidateStaleActiveTimer({ ...args, now: start + 900_000, staleProof: staleObservation(state.store.get(ref)) });
    expect(result.invalidated).toBe(true);
    for (const idle of [null, { ownerClientId: 'owner', segmentStartedAt: start, lastUserActivityAt: start }]) {
      expect(await finishActiveTimer({ ...args, endAt: start + 300_000, idle })).toMatchObject({ alreadyFinished: true, session: { validation: { status: 'invalid' } } });
    }
    expect(prepareCanonicalStudySessionReward(result.session).eligible).toBe(false);
    expect([...state.store.keys()].filter((key) => key.includes('/studySessions/'))).toEqual([sessionRef]);
    expect([...state.store.keys()].filter((key) => key.includes('/rewardLedger/'))).toHaveLength(0);
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
  it('Case B: fifteen idle minutes save 900 pending seconds and flow through the common Timeline total', async () => {
    await startActiveTimer({ ...args, now: start }); watch();
    await vi.advanceTimersByTimeAsync(900_000);
    const session = state.store.get(sessionRef);
    expect(session).toMatchObject({ recordedSeconds: 900, validation: { status: 'pending_review' },
      segments: [{ startedAt: start, endedAt: start + 900_000, durationSeconds: 900 }] });
    expect(state.store.has(ref)).toBe(false);
    expect(getEffectiveStudySecondsForTask([{ ...session, id: 't' }], session.date, task.id)).toBe(0);
  });
  it('Case C: last operation at two minutes saves seventeen minutes', async () => {
    await startActiveTimer({ ...args, now: start }); const owner = watch();
    await vi.advanceTimersByTimeAsync(120_000); owner.emit('click');
    await vi.advanceTimersByTimeAsync(900_000);
    expect(state.store.get(sessionRef)).toMatchObject({ recordedSeconds: 1020, validation: { status: 'pending_review' } });
  });
  it('Case D: PAUSE ten minutes is excluded and RESUME idle saves seventeen minutes', async () => {
    await startActiveTimer({ ...args, now: start }); const owner = watch();
    await vi.advanceTimersByTimeAsync(120_000); await pauseActiveTimer({ ...args, now: Date.now() });
    owner.controller.dispose();
    const paused = watch(); expect(paused.controller).toBeNull();
    await vi.advanceTimersByTimeAsync(600_000); expect(state.store.has(sessionRef)).toBe(false);
    await resumeActiveTimer({ ...args, now: Date.now() }); watch();
    await vi.advanceTimersByTimeAsync(899_000); expect(state.store.has(sessionRef)).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.store.get(sessionRef)).toMatchObject({ recordedSeconds: 1020, validation: { status: 'pending_review' },
      segments: [{ startedAt: start, endedAt: start + 120_000, durationSeconds: 120 },
        { startedAt: start + 720_000, endedAt: start + 1620_000, durationSeconds: 900 }] });
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
  it.each([1000_000, 1200_000])('JS delayed to %sms still saves the fifteen-minute deadline ahead of stale', async (delay) => {
    await startActiveTimer({ ...args, now: start }); const owner = watch();
    vi.setSystemTime(start + delay); owner.emit('visibilitychange');
    expect(owner.controller.blocksStale()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(state.store.get(sessionRef)).toMatchObject({ recordedSeconds: 900, validation: { status: 'pending_review' } });
    expect(await invalidateStaleActiveTimer({ ...args, now: Date.now() })).toMatchObject({ invalidated: false });
  });
  it('secondary idle cannot STOP; secondary manual STOP remains allowed', async () => {
    await startActiveTimer({ ...args, now: start }); const secondary = watch({ ownerClientId: 'secondary' });
    expect(secondary.controller).toBeNull(); await vi.advanceTimersByTimeAsync(900_000);
    expect(state.store.has(ref)).toBe(true); expect(secondary.onStop).not.toHaveBeenCalled();
    const result = await finishActiveTimer({ ...args, ownerClientId: 'secondary', endAt: Date.now() });
    expect(result.session.recordedSeconds).toBe(900); expect(state.store.has(ref)).toBe(false);
  });
  it.each(['paused', 'resumed', 'changed_owner', 'replaced'])('transaction recheck prevents overdue callbacks after %s', async (change) => {
    await startActiveTimer({ ...args, now: start });
    state.race = () => {
      const latest = state.store.get(ref);
      state.store.set(ref, change === 'paused' ? { ...latest, state: 'paused' }
        : change === 'resumed' ? { ...latest, segmentStartedAt: start + 100_000 }
          : change === 'changed_owner' ? { ...latest, ownerClientId: 'other' } : { ...latest, timerId: 'new' });
    };
    const result = await finishActiveTimer({ ...args, endAt: start + 900_000,
      idle: { ownerClientId: 'owner', segmentStartedAt: start, lastUserActivityAt: start } });
    expect(result).toEqual({ skipped: true, reason: 'IDLE_STATE_CHANGED' });
    expect(state.store.has(sessionRef)).toBe(false); expect(state.store.has(ref)).toBe(true);
  });
  it('idle/manual STOP transaction retry writes one session and rewards it only once', async () => {
    await startActiveTimer({ ...args, now: start });
    state.race = () => {
      const session = buildFinishedTimerSession(state.store.get(ref), task, { endAt: start + 900_000 });
      state.store.set(sessionRef, session); state.store.delete(ref);
    };
    const result = await finishActiveTimer({ ...args, endAt: start + 900_000,
      idle: { ownerClientId: 'owner', segmentStartedAt: start, lastUserActivityAt: start } });
    expect(result.alreadyFinished).toBe(true);
    expect([...state.store.keys()].filter((key) => key.includes('/studySessions/'))).toEqual([sessionRef]);
    const session = { id: 't', ...result.session };
    expect(await applyStudySessionReward({ ...args, session })).toMatchObject({ applied: true });
    expect(await applyStudySessionReward({ ...args, session })).toEqual({ applied: false, reason: 'ALREADY_APPLIED' });
    expect([...state.store.keys()].filter((key) => key.includes('/rewardLedger/'))).toHaveLength(1);
  });
  it('idle-first STOP cannot be counted again by a subsequent manual STOP', async () => {
    await startActiveTimer({ ...args, now: start }); watch(); await vi.advanceTimersByTimeAsync(900_000);
    const session = state.store.get(sessionRef);
    expect(await finishActiveTimer({ ...args, endAt: start + 901_000 })).toEqual({ alreadyFinished: true, session });
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
    const result = await finishActiveTimer({ ...args, task: { ...task, activityType }, endAt: latest.segmentStartedAt + 900_000,
      idle: { ownerClientId: 'owner', segmentStartedAt: latest.segmentStartedAt, lastUserActivityAt: latest.segmentStartedAt } });
    expect(result.session).toMatchObject({ recordedSeconds: seconds + 900, validation: { status } });
    expect(prepareCanonicalStudySessionReward(result.session).eligible).toBe(false);
  });
});
