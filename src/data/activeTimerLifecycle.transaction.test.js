import { beforeEach, describe, expect, it, vi } from 'vitest';
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
          return { exists: () => value !== undefined, data: () => value === undefined ? undefined : structuredClone(value) };
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
import { finishActiveTimer, heartbeatActiveTimer, invalidateStaleActiveTimer, pauseActiveTimer, resumeActiveTimer, startActiveTimer } from './activeTimerRepository.js';
const start = 1_000_000;
const ref = 'families/f/apps/junior-high/activeTimers/current';
const task = { id: 'math', categoryId: 'school', subjectId: 's_math', title: '数学', activityType: 'problem_solving' };
const args = { db: {}, familyId: 'f', task, timerId: 't', ownerClientId: 'owner' };
beforeEach(() => { state.store.clear(); state.race = null; state.attempts = 0; });

describe('active timer transaction lifecycle', () => {
  it('records all sixty minutes without user activity while owner heartbeats continue (no idle-stop policy)', async () => {
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
