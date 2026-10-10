import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findUndefinedPaths } from '../test/findUndefinedPaths.js';
const state = vi.hoisted(() => ({ store: new Map(), version: 0, fail: false, race: null }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => parts.join('/'),
  runTransaction: async (_db, callback) => {
    for (;;) {
      const version = state.version;
      const writes = [];
      const result = await callback({
        get: async (ref) => {
          const value = structuredClone(state.store.get(ref));
          return { id: ref.split('/').at(-1), exists: () => value !== undefined, data: () => value };
        },
        set: (ref, value) => { expect(findUndefinedPaths(value)).toEqual([]); writes.push(() => state.store.set(ref, value)); },
        update: (ref, value) => { expect(findUndefinedPaths(value)).toEqual([]); writes.push(() => state.store.set(ref, { ...state.store.get(ref), ...value })); },
        delete: (ref) => writes.push(() => state.store.delete(ref)),
      });
      if (state.fail) throw new Error('SAVE_FAILED');
      if (state.race) { const race = state.race; state.race = null; race(); state.version++; }
      if (state.version !== version) continue;
      writes.forEach((write) => write());
      if (writes.length) state.version++;
      return result;
    }
  },
}));
import { buildFinishedTimerSession, finishActiveTimer, heartbeatActiveTimer, observeActiveTimerBackground, pauseActiveTimer, resumeActiveTimer, startActiveTimer, startOrSwitchActiveTimer } from './activeTimerRepository.js';
import { confirmStudyTime } from './studyTimeReviewRepository.js';
import { applyStudySessionReward, prepareCanonicalStudySessionReward } from './rewardLedgerRepository.js';
import { prepareRewardCorrection } from './rewardCorrectionRepository.js';
import { getEffectiveStudySeconds, getUnifiedStudySessions } from './studySessionSelectors.js';
import { staleObservation } from '../test/staleObservation.js';

const start = 1_000_000;
const base = 'families/f/apps/junior-high';
const timerRef = `${base}/activeTimers/current`;
const sessionRef = `${base}/studySessions/t`;
const ledgerRef = `${base}/rewardLedger/t`;
const profileRef = `${base}/rpg/playerProfile`;
const task = { id: 'math', subjectId: 's_math', title: '数学', activityType: 'problem_solving' };
const args = { db: {}, familyId: 'f', task, timerId: 't', ownerClientId: 'owner' };
const idle = { ownerClientId: 'owner', segmentStartedAt: start, lastUserActivityAt: start };
const confirm = (targetSeconds = 900, confirmedBy = 'student') => confirmStudyTime({ ...args, sessionId: 't', targetSeconds, confirmedBy });
const observation = (hiddenStartedAt, observedAt, extra = {}) => ({ timerId: 't', ownerClientId: 'owner', segmentStartedAt: start, hiddenStartedAt, observedAt, longestHiddenSeconds: 0, ...extra });
const pending = async () => {
  await startActiveTimer({ ...args, now: start });
  return finishActiveTimer({ ...args, endAt: start + 900_000, idle });
};
beforeEach(() => { state.store.clear(); state.version = 0; state.fail = false; state.race = null; });

describe('study time confirmation and canonical rewards', () => {
  it('idle STOP persists one pending session, no credit and no rewards, including after reload/defer', async () => {
    const result = await pending();
    expect(result.session).toMatchObject({ recordedSeconds: 900, validation: { status: 'pending_review' }, timeReview: { status: 'pending', measuredSeconds: 900, reasons: ['idle_auto_stop'] } });
    expect(state.store.has(timerRef)).toBe(false);
    const reloaded = JSON.parse(JSON.stringify(state.store.get(sessionRef)));
    expect(getEffectiveStudySeconds(getUnifiedStudySessions([], [reloaded]))).toBe(0);
    expect(await applyStudySessionReward({ ...args, session: { ...reloaded, id: 't' } })).toMatchObject({ applied: false, reason: 'INELIGIBLE' });
    expect(state.store.has(profileRef)).toBe(false);
    expect(state.store.has(ledgerRef)).toBe(false);
  });
  it.each([900, 600, 0])('confirms %s seconds atomically, uses existing rewards, keeps original measured evidence', async (seconds) => {
    const original = (await pending()).session;
    const result = await confirm(seconds);
    expect(result.session).toMatchObject({ recordedSeconds: seconds, validation: { status: 'valid' }, timeReview: { status: 'confirmed', measuredSeconds: 900, confirmedSeconds: seconds, source: 'self_report', originalSegments: original.segments } });
    expect(getEffectiveStudySeconds(getUnifiedStudySessions([], [result.session]))).toBe(seconds);
    expect(state.store.get(profileRef)?.gold || 0).toBe(Math.floor(seconds / 60));
    expect(state.store.get(profileRef)?.battleEnergy || 0).toBe(Math.floor(seconds / 900));
    expect(state.store.has(ledgerRef)).toBe(seconds > 0);
    expect((await confirm(0, 'second-device')).alreadyConfirmed).toBe(true);
    expect(state.store.get(sessionRef).recordedSeconds).toBe(seconds);
    expect((await applyStudySessionReward({ ...args, session: result.session })).applied).toBe(false);
  });
  it('shortens only the original running segments and never adds the paused gap', async () => {
    const timer = { timerId: 't', taskId: task.id, ownerClientId: 'owner', state: 'running', startedAt: start,
      segments: [{ startedAt: start, endedAt: start + 120_000, durationSeconds: 120 }],
      segmentStartedAt: start + 720_000, lastHeartbeatAt: start + 720_000 };
    state.store.set(timerRef, timer);
    await finishActiveTimer({ ...args, endAt: start + 1620_000, idle: { ...idle, segmentStartedAt: timer.segmentStartedAt, lastUserActivityAt: timer.segmentStartedAt } });
    const result = await confirm(180);
    expect(result.session.segments).toEqual([{ startedAt: start, endedAt: start + 120_000, durationSeconds: 120 }, { startedAt: start + 720_000, endedAt: start + 780_000, durationSeconds: 60 }]);
  });
  it.each([-1, 901, 1.5, NaN, Infinity])('rejects unsafe duration %s without committing', async (seconds) => {
    await pending();
    await expect(confirm(seconds)).rejects.toThrow('STUDY_TIME_OUT_OF_RANGE');
    expect(state.store.get(sessionRef).timeReview.status).toBe('pending');
    expect(state.store.has(ledgerRef)).toBe(false);
  });
  it('failed save keeps review pending and the original profile unchanged; a later retry succeeds', async () => {
    await pending(); state.store.set(profileRef, { gold: 5 }); state.fail = true;
    await expect(confirm()).rejects.toThrow('SAVE_FAILED');
    expect(state.store.get(sessionRef).timeReview.status).toBe('pending');
    expect(state.store.get(profileRef)).toEqual({ gold: 5 });
    expect(state.store.has(ledgerRef)).toBe(false);
    state.fail = false; await confirm(); expect(state.store.get(profileRef).gold).toBe(20);
  });
  it('concurrent devices, different submitted durations, and reward reconciliation award once', async () => {
    await pending();
    const results = await Promise.all([confirm(600, 'device-a'), confirm(900, 'device-b'), applyStudySessionReward({ ...args, session: { id: 't' } })]);
    expect(results.filter((result) => result.alreadyConfirmed === false)).toHaveLength(1);
    expect(state.store.get(sessionRef).recordedSeconds).toBe(600);
    expect(state.store.get(profileRef).gold).toBe(10);
    expect([...state.store.keys()].filter((key) => key.includes('/rewardLedger/'))).toEqual([ledgerRef]);
  });
  it('rechecks a session that became invalid during the transaction', async () => {
    await pending();
    state.race = () => state.store.set(sessionRef, { ...state.store.get(sessionRef), validation: { status: 'invalid' } });
    await expect(confirm()).rejects.toThrow('STUDY_TIME_NOT_PENDING');
    expect(state.store.has(ledgerRef)).toBe(false);
  });
  it('generic history correction cannot bypass this confirmation or its validation', async () => {
    const result = await pending();
    expect(() => prepareRewardCorrection({ session: { ...result.session, id: 't' }, reviewerUid: 'student', correction: { correctionId: 'bypass', validation: { status: 'valid' } } })).toThrow('STUDY_TIME_CONFIRMATION_REQUIRED');
  });
  it('stale wins over idle when the transaction has clock-safe stale proof', async () => {
    await startActiveTimer({ ...args, now: start });
    const result = await finishActiveTimer({ ...args, endAt: start + 900_000, idle, staleProof: staleObservation(state.store.get(timerRef)) });
    expect(result.session.validation).toMatchObject({ status: 'invalid', reasonCodes: ['stale_timer_forced_invalid'] });
    expect(result.session.timeReview).toBeUndefined();
    await expect(confirm(0)).rejects.toThrow('STUDY_TIME_NOT_PENDING');
    expect(prepareCanonicalStudySessionReward(result.session).eligible).toBe(false);
  });
  it('retains high-risk validation until a safely shortened time passes existing validation', async () => {
    await pending();
    const long = { ...state.store.get(sessionRef), recordedSeconds: 180 * 60, segments: [{ startedAt: start, endedAt: start + 180 * 60_000, durationSeconds: 180 * 60 }] };
    long.timeReview = { ...long.timeReview, measuredSeconds: long.recordedSeconds, originalSegments: long.segments, validationBeforeReview: { status: 'pending_review', reasonCodes: ['long_session', 'review_session', 'high_risk_session'] } };
    state.store.set(sessionRef, long);
    await expect(confirm(long.recordedSeconds)).rejects.toThrow('STUDY_TIME_VALIDATION_REQUIRED');
    expect(state.store.get(sessionRef).timeReview.status).toBe('pending');
    expect((await confirm(179 * 60 + 59)).session.validation.status).toBe('valid');
  });
});

describe('background observation transactions', () => {
  it.each([299, 300])('owner-observed hidden %s seconds controls review on cross-device STOP', async (seconds) => {
    await startActiveTimer({ ...args, now: start });
    await observeActiveTimerBackground({ ...args, observation: observation(start, start) });
    await heartbeatActiveTimer({ ...args, now: start + seconds * 1000 });
    const result = await finishActiveTimer({ ...args, endAt: start + seconds * 1000 });
    expect(result.session.validation.status).toBe(seconds === 299 ? 'valid' : 'pending_review');
    expect(Boolean(result.session.timeReview)).toBe(seconds === 300);
  });
  it('a foreign clock cannot manufacture five hidden minutes without owner progress', async () => {
    await startActiveTimer({ ...args, now: start });
    await observeActiveTimerBackground({ ...args, observation: observation(start, start) });
    const result = await finishActiveTimer({ ...args, endAt: start + 600_000 });
    expect(result.session.timeReview).toBeUndefined();
  });
  it('PAUSE preserves completed evidence, excludes hidden pause time, and RESUME keeps the review', async () => {
    await startActiveTimer({ ...args, now: start });
    await observeActiveTimerBackground({ ...args, observation: observation(start, start) });
    await pauseActiveTimer({ ...args, now: start + 300_000, observation: observation(start, start + 300_000) });
    expect(state.store.get(timerRef).backgroundObservation).toMatchObject({ hiddenStartedAt: null, longestHiddenSeconds: 300 });
    await resumeActiveTimer({ ...args, now: start + 1500_000 });
    const result = await finishActiveTimer({ ...args, endAt: start + 1560_000 });
    expect(result.session).toMatchObject({ recordedSeconds: 360, validation: { status: 'pending_review' } });
    expect(result.session.timeReview.observation.longestHiddenSeconds).toBe(300);
  });
  it('short background before PAUSE never counts the later pause as hidden learning', async () => {
    await startActiveTimer({ ...args, now: start });
    await pauseActiveTimer({ ...args, now: start + 60_000, observation: observation(start, start + 60_000) });
    const result = await finishActiveTimer({ ...args, endAt: start + 1800_000 });
    expect(result.session).toMatchObject({ recordedSeconds: 60, validation: { status: 'valid' } });
  });
  it('task switch preserves review instead of revalidating it as already valid', async () => {
    await startActiveTimer({ ...args, now: start });
    await startOrSwitchActiveTimer({ ...args, task: { ...task, id: 'english' }, tasks: [task], timerId: 'next', now: start + 600_000,
      observation: observation(null, start + 600_000, { longestHiddenSeconds: 300 }) });
    expect(state.store.get(sessionRef).validation.status).toBe('pending_review');
    expect(state.store.get(timerRef).timerId).toBe('next');
  });
  it('late/wrong-owner observations cannot revive a stopped or replaced timer', async () => {
    await startActiveTimer({ ...args, now: start });
    expect(await observeActiveTimerBackground({ ...args, observation: observation(start, start, { ownerClientId: 'other' }) })).toBe(false);
    await finishActiveTimer({ ...args, endAt: start + 900_000, idle });
    expect(await observeActiveTimerBackground({ ...args, observation: observation(start, start + 900_000) })).toBe(false);
    await startActiveTimer({ ...args, timerId: 'next', now: start + 900_000 });
    expect(await observeActiveTimerBackground({ ...args, observation: observation(start, start + 900_000) })).toBe(false);
  });
  it('reading invalid evidence stays invalid even when background review applies', () => {
    const seconds = 5 * 60 * 60;
    const session = buildFinishedTimerSession({ timerId: 't', taskId: task.id, ownerClientId: 'owner', state: 'running', segments: [], startedAt: start, segmentStartedAt: start, lastHeartbeatAt: start }, { ...task, activityType: 'reading' }, { endAt: start + seconds * 1000,
      observation: observation(start, start + seconds * 1000), staleProof: null });
    expect(session.validation.status).toBe('invalid'); expect(session.timeReview).toBeUndefined();
  });
});
