import { describe, expect, it } from 'vitest';
import { buildFinishedTimerSession, buildStaleTimerInvalidSession, buildTimerSwitchPlan, canFinishActiveTimer, canForceInvalidateStaleTimer, canHeartbeatActiveTimer, staleTimerSessionId } from './activeTimerRepository';
import { getEffectiveStudySeconds } from './studySessionSelectors';
import { gameProgress } from '../gameLogic';

const start = 1_000_000;
const staleTimer = {
  timerId: 'timer-stale-1', taskId: 'math', state: 'running', startedAt: start,
  segmentStartedAt: start, lastHeartbeatAt: start + 60 * 1000, accumulatedSeconds: 0, segments: [],
};
const task = { id: 'math', categoryId: 'school', subjectId: 's_math', activityType: 'problem_solving', title: '問題集', type: 'self' };

describe('forced stale timer invalidation', () => {
  it('stale timerからinvalid StudySessionを監査用duration付きで生成する', () => {
    const session = buildStaleTimerInvalidSession(staleTimer, task, start + 16 * 60 * 1000);
    expect(session).toMatchObject({
      timerId: 'timer-stale-1', taskId: 'math', recordedSeconds: 60,
      validation: { status: 'invalid', reasonCodes: ['stale_timer_forced_invalid'] },
    });
    expect(session.segments).toEqual([{ startedAt: start, endedAt: start + 60 * 1000, durationSeconds: 60 }]);
  });

  it('invalid sessionはeffective学習時間とRPG対象外になる', () => {
    const session = buildStaleTimerInvalidSession(staleTimer, task, start + 16 * 60 * 1000);
    expect(getEffectiveStudySeconds([session])).toBe(0);
    expect(gameProgress([], session.date, [session]).rawExp).toBe(0);
  });

  it('同じtimerIdは常に同じStudySession document IDを使う', () => {
    expect(staleTimerSessionId(staleTimer)).toBe('timer-stale-1');
    expect(staleTimerSessionId({ ...staleTimer })).toBe('timer-stale-1');
  });

  it('transaction直前にheartbeatが更新されていれば強制invalid化しない', () => {
    const now = start + 16 * 60 * 1000;
    expect(canForceInvalidateStaleTimer(staleTimer, now)).toBe(true);
    expect(canForceInvalidateStaleTimer({ ...staleTimer, lastHeartbeatAt: now - 30 * 1000 }, now)).toBe(false);
  });
});

describe('cross-device timer finish', () => {
  it('ownerClientIdが異なる端末でもrunning timerをSTOPでき、Firestore上のsegmentから時間を確定する', () => {
    const timer = { ...staleTimer, lastHeartbeatAt: start + 30 * 1000, ownerClientId: 'device-a' };
    const endAt = start + 120 * 1000;
    expect(canFinishActiveTimer(timer, 'timer-stale-1')).toBe(true);
    const session = buildFinishedTimerSession(timer, task, {
      endAt,
      validation: { status: 'valid', reasonCodes: [] },
      memo: '端末Bで停止',
    });
    expect(session).toMatchObject({ timerId: 'timer-stale-1', recordedSeconds: 120, validation: { status: 'valid' } });
    expect(session.validation.reasonCodes).not.toContain('stale_timer_forced_invalid');
  });

  it('PAUSE中は保存済みsegmentだけを確定し、pause後の時間を加算しない', () => {
    const paused = {
      ...staleTimer,
      state: 'paused',
      ownerClientId: 'device-a',
      segmentStartedAt: null,
      accumulatedSeconds: 75,
      segments: [{ startedAt: start, endedAt: start + 75 * 1000, durationSeconds: 75 }],
    };
    const session = buildFinishedTimerSession(paused, task, { endAt: start + 600 * 1000, validation: { status: 'valid', reasonCodes: [] } });
    expect(session.recordedSeconds).toBe(75);
    expect(session.segments).toEqual(paused.segments);
  });

  it('10秒未満でもSTOP transactionの対象としてSessionを確定できる', () => {
    const shortTimer = { ...staleTimer, ownerClientId: 'device-a', lastHeartbeatAt: start + 5_000 };
    expect(canFinishActiveTimer(shortTimer, shortTimer.timerId)).toBe(true);
    const session = buildFinishedTimerSession(shortTimer, task, {
      endAt: start + 9_000,
      validation: { status: 'pending_review', reasonCodes: ['too_short'] },
    });
    expect(session.recordedSeconds).toBe(9);
  });

  it('stale timerをSTOPした場合もinvalid SessionとしてActiveTimer解消へ進める', () => {
    const session = buildFinishedTimerSession(staleTimer, task, {
      endAt: start + 16 * 60 * 1000,
      validation: { status: 'valid', reasonCodes: [] },
    });
    expect(session.validation).toMatchObject({ status: 'invalid', reasonCodes: ['stale_timer_forced_invalid'] });
  });

  it('決定的timerIdにより二重STOPは既存Sessionを検出してno-opにできる', () => {
    expect(staleTimerSessionId(staleTimer)).toBe('timer-stale-1');
    expect(canFinishActiveTimer(null, 'timer-stale-1')).toBe(false);
  });

  it('heartbeatは引き続きownerだけが送信でき、STOP後はno-opになる', () => {
    const running = { ...staleTimer, ownerClientId: 'device-a' };
    expect(canHeartbeatActiveTimer(running, 'timer-stale-1', 'device-a')).toBe(true);
    expect(canHeartbeatActiveTimer(running, 'timer-stale-1', 'device-b')).toBe(false);
    expect(canHeartbeatActiveTimer(null, 'timer-stale-1', 'device-a')).toBe(false);
  });
});

describe('start or switch active timer', () => {
  const nextTask = { id: 'japanese', categoryId: 'school', subjectId: 's_japanese', activityType: 'problem_solving', title: '国語', type: 'self' };

  it('ActiveTimerがなければSTARTできる', () => {
    const plan = buildTimerSwitchPlan({ existingTimer: null, nextTask, nextTimerId: 'next', nextOwnerClientId: 'device-b', now: start });
    expect(plan).toMatchObject({ switched: false, resumed: false, nextTimer: { timerId: 'next', taskId: 'japanese', state: 'running' } });
  });

  it('別Taskのrunning timerをSession化して新TaskをSTARTする', () => {
    const plan = buildTimerSwitchPlan({ existingTimer: { ...staleTimer, ownerClientId: 'device-a', lastHeartbeatAt: start + 30_000 }, existingTask: task, nextTask, nextTimerId: 'next', nextOwnerClientId: 'device-b', now: start + 120_000 });
    expect(plan).toMatchObject({ switched: true, invalidatedPrevious: false, nextTimer: { taskId: 'japanese' }, previousSession: { timerId: 'timer-stale-1', recordedSeconds: 120 } });
  });

  it('別Taskのpaused timerはpause後を加算せずSession化して新TaskをSTARTする', () => {
    const paused = { ...staleTimer, state: 'paused', segmentStartedAt: null, accumulatedSeconds: 75, segments: [{ startedAt: start, endedAt: start + 75_000, durationSeconds: 75 }] };
    const plan = buildTimerSwitchPlan({ existingTimer: paused, existingTask: task, nextTask, nextTimerId: 'next', nextOwnerClientId: 'device-b', now: start + 600_000 });
    expect(plan.previousSession.recordedSeconds).toBe(75);
    expect(plan.nextTimer.taskId).toBe('japanese');
  });

  it('staleまたはorphan timerはinvalid化して新TaskをSTARTする', () => {
    const stalePlan = buildTimerSwitchPlan({ existingTimer: staleTimer, existingTask: task, nextTask, nextTimerId: 'next', nextOwnerClientId: 'device-b', now: start + 16 * 60_000 });
    expect(stalePlan.previousSession.validation.reasonCodes).toEqual(['stale_timer_forced_invalid']);
    const orphanPlan = buildTimerSwitchPlan({ existingTimer: staleTimer, existingTask: null, nextTask, nextTimerId: 'next', nextOwnerClientId: 'device-b', now: start + 120_000 });
    expect(orphanPlan.previousSession.validation.reasonCodes).toEqual(['orphan_timer_forced_invalid']);
  });
});
