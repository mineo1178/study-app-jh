import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findUndefinedPaths } from '../test/findUndefinedPaths.js';
const store = vi.hoisted(() => new Map());
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => parts.join('/'),
  runTransaction: async (_db, callback) => {
    const writes = [];
    const result = await callback({
      get: async (ref) => ({ exists: () => store.has(ref), data: () => store.get(ref) }),
      set: (ref, value) => { expect(findUndefinedPaths(value)).toEqual([]); writes.push(() => store.set(ref, value)); },
      delete: (ref) => writes.push(() => store.delete(ref)),
    });
    writes.forEach((write) => write());
    return result;
  },
}));
import { finishActiveTimer } from './activeTimerRepository.js';
const base = 'families/f/apps/junior-high';
const timerRef = base + '/activeTimers/current';
const sessionRef = base + '/studySessions/t';
const start = 1_000_000;
const task = { id: 'math', activityType: 'problem_solving' };
const finish = (endAt, extra = {}) => finishActiveTimer({ db: {}, familyId: 'f', task, timerId: 't', endAt, ...extra });
beforeEach(() => store.clear());
describe('canonical STOP transaction', () => {
  it('invalidates stale STOP, caps seconds at heartbeat, deletes the timer, and remains idempotent', async () => {
    store.set(timerRef, { timerId: 't', taskId: 'math', state: 'running', startedAt: start, segmentStartedAt: start, lastHeartbeatAt: start + 60_000, segments: [] });
    const result = await finish(start + 16 * 60_000, { validation: { status: 'valid' } });
    expect(result.session).toMatchObject({ recordedSeconds: 60, validation: { status: 'invalid', reasonCodes: ['stale_timer_forced_invalid'] } });
    expect(store.has(timerRef)).toBe(false);
    expect(store.get(sessionRef)).toEqual(result.session);
    expect(await finish(start + 17 * 60_000)).toEqual({ session: result.session, alreadyFinished: true });
  });
  it('revalidates latest paused segments instead of accepting stale client validation', async () => {
    const seconds = 180 * 60;
    store.set(timerRef, { timerId: 't', taskId: 'math', state: 'paused', segments: [{ startedAt: start, endedAt: start + seconds * 1000, durationSeconds: seconds }] });
    const result = await finish(start + seconds * 1000 + 60_000, { validation: { status: 'valid' } });
    expect(result.session.recordedSeconds).toBe(seconds);
    expect(result.session.validation.status).toBe('pending_review');
  });
  it('saves a normal cross-device STOP with no caller validation or undefined payload', async () => {
    store.set(timerRef, { timerId: 't', taskId: 'math', ownerClientId: 'other-device', state: 'running', startedAt: start, segmentStartedAt: start, lastHeartbeatAt: start, segments: [] });
    const result = await finish(start + 120_000);
    expect(result.session).toMatchObject({ recordedSeconds: 120, validation: { status: 'valid' } });
  });
  it('retains legacy reading inference when validating canonical segments', async () => {
    const seconds = 5 * 60 * 60;
    store.set(timerRef, { timerId: 't', taskId: 'math', state: 'paused', segments: [{ startedAt: start, endedAt: start + seconds * 1000, durationSeconds: seconds }] });
    const result = await finish(start + seconds * 1000, { task: { id: 'math', subjectId: 'e_news' } });
    expect(result.session.validation.reasonCodes).toContain('reading_continuous_5h');
  });
});
