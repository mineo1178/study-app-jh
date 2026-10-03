import { describe, expect, it } from 'vitest';
import { battleFeedback, createFeedbackQueue, idleStopFeedback, progressFeedback, studyFeedback } from './feedbackEvents.js';

const event = (key, type = 'study_complete') => ({ key, type });
const state = (completed = false, level = 4) => ({ level, achievements: [{ id: 'a', name: '3日連続', completed }], titles: completed ? [{ id: 't', name: '継続の芽' }] : [] });
const study = (status = 'valid') => ({ session: { timerId: 'session-1', recordedSeconds: 600, validation: { status } }, alreadyFinished: false });
const active = { battleId: 'b', status: 'active' };

describe('feedback queue', () => {
  it('shows one event and advances on close', () => {
    const queue = createFeedbackQueue(); queue.enqueue([event('1'), event('2'), event('3')]);
    expect(queue.getSnapshot().map((item) => item.key)).toEqual(['1', '2', '3']);
    queue.close('1'); expect(queue.getSnapshot()[0].key).toBe('2');
    queue.close('2'); queue.close('3'); expect(queue.getSnapshot()).toEqual([]);
  });
  it('dedupes repeated state, renders and closed events', () => {
    const queue = createFeedbackQueue(); queue.enqueue([event('1'), event('1')]);
    const snapshot = queue.getSnapshot(); queue.enqueue([event('1')]);
    expect(queue.getSnapshot()).toBe(snapshot); queue.close('1'); queue.enqueue([event('1')]);
    expect(queue.getSnapshot()).toEqual([]);
  });
  it('orders concurrent operation results without interrupting visible feedback', () => {
    const queue = createFeedbackQueue(); queue.hold();
    queue.enqueue([event('t', 'title_unlocked'), event('a', 'achievement_complete'), event('l', 'level_up')]);
    queue.enqueue([event('s')]); expect(queue.getSnapshot()).toEqual([]);
    queue.release(); expect(queue.getSnapshot().map((item) => item.key)).toEqual(['s', 'l', 'a', 't']);
    queue.enqueue([event('s2')]); expect(queue.getSnapshot()[0].key).toBe('s');
  });
  it('notifies subscribers and unsubscribes', () => {
    const queue = createFeedbackQueue(); let calls = 0;
    const unsubscribe = queue.subscribe(() => calls++);
    queue.enqueue([event('1')]); unsubscribe(); queue.close('1'); expect(calls).toBe(1);
  });
});

describe('initial state and progress transitions', () => {
  it('does not replay existing level, achievements or titles on initial load', () => {
    expect(progressFeedback(null, state(true, 5))).toEqual([]);
  });
  it('detects false to true, title unlock and level increase in order', () => {
    const before = state(); const after = state(true, 5);
    expect(progressFeedback(before, after).map((item) => item.type)).toEqual(['level_up', 'achievement_complete', 'title_unlocked']);
    expect(before).toEqual(state()); expect(after).toEqual(state(true, 5));
  });
  it('ignores unchanged achievements, existing titles and unchanged level', () => {
    expect(progressFeedback(state(true, 5), state(true, 5))).toEqual([]);
  });
  it('does not modify selected title', () => {
    const after = { ...state(true), selectedTitleId: 'existing' }; progressFeedback(state(), after);
    expect(after.selectedTitleId).toBe('existing');
  });
  it('dedupes a transition reapplied after remount', () => {
    const queue = createFeedbackQueue(); const events = progressFeedback(state(), state(true, 5));
    queue.enqueue(events); queue.enqueue(events); expect(queue.getSnapshot()).toHaveLength(3);
  });
});

describe('STOP feedback', () => {
  it('shows idle reason before study completion, without duplicate results', () => {
    const queue = createFeedbackQueue(); queue.hold();
    queue.enqueue(studyFeedback(study(), '数学'));
    queue.enqueue(idleStopFeedback(study())); queue.enqueue(idleStopFeedback(study())); queue.release();
    expect(queue.getSnapshot().map((item) => item.type)).toEqual(['idle_stop', 'study_complete']);
    expect(queue.getSnapshot()[0].name).toContain('5分間操作がなかった');
    queue.close('idle:session-1'); expect(queue.getSnapshot()[0].type).toBe('study_complete');
    expect(idleStopFeedback({ ...study(), alreadyFinished: true })).toEqual([]);
  });
  it.each(['invalid', 'pending_review'])('idle %s feedback never claims credited study time', (status) => {
    const feedback = idleStopFeedback(study(status))[0];
    expect(feedback.details.join()).toContain('実績と報酬には含めていません');
    expect(studyFeedback(study(status), '数学')).toEqual([]);
  });
  it('uses successful confirmed duration and task name', () => {
    const feedback = studyFeedback(study(), '数学')[0];
    expect(feedback.name).toBe('数学'); expect(feedback.details[0]).toContain('10');
  });
  it.each(['invalid', 'pending_review', 'stale'])('does not celebrate %s', (status) => {
    expect(studyFeedback(study(status), '数学')).toEqual([]);
  });
  it('does not celebrate a failed transaction or repeated STOP', () => {
    expect(studyFeedback(null, '数学')).toEqual([]);
    expect(studyFeedback({ ...study(), alreadyFinished: true }, '数学')).toEqual([]);
  });
  it('only displays returned rewards and never guesses EXP', () => {
    const feedback = studyFeedback(study(), '数学', { applied: true, rewards: { gold: 7, battleEnergy: 2 } })[0];
    expect(feedback.details.join()).toContain('GOLD +7'); expect(feedback.details.join()).not.toContain('EXP');
  });
});

describe('confirmed battle results', () => {
  it('ignores historical victories, losses and other battles', () => {
    expect(battleFeedback(null, { ...active, status: 'won' })).toEqual([]);
    expect(battleFeedback(active, { ...active, status: 'lost' })).toEqual([]);
    expect(battleFeedback(active, { battleId: 'other', status: 'won' })).toEqual([]);
  });
  it('combines Chapter Boss defeat and clear, then Campaign clear', () => {
    const won = { ...active, status: 'won', chapterSnapshot: { name: '最終章', nextChapterId: null }, victory: { expGranted: 12, bossClear: { reward: { gold: 34 } } } };
    expect(battleFeedback(active, won).map((item) => item.type)).toEqual(['chapter_clear', 'campaign_clear']);
  });
  it.each(['normal', 'boss'])('combines Tower %s clear and highest floor into one event', (battleKind) => {
    const won = { ...active, status: 'won', battleMode: 'tower', battleKind, towerFloor: 10, victory: { expGranted: 15 } };
    const events = battleFeedback(active, won, 9); expect(events).toHaveLength(1);
    expect(events[0].type).toBe(battleKind === 'boss' ? 'tower_boss_clear' : 'tower_floor_clear');
    expect(events[0].details.join()).toContain('最高到達階 10階');
    expect(battleFeedback(active, won, 10)[0].details.join()).not.toContain('最高到達階');
  });
  it('uses confirmed Weekly Boss reward snapshot', () => {
    const won = { ...active, status: 'won', battleMode: 'weekly_boss', victory: { weeklyBoss: { expReward: 123, goldTicket: 2, starFragments: 4, alchemyItemId: 'item', alchemyItemQuantity: 1 } } };
    expect(battleFeedback(active, won)[0].details.join()).toContain('EXP +123');
  });
});
