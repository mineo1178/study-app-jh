import { beforeEach, expect, it, vi } from 'vitest';

// Exercise event handlers with retained hook state; layout/focus need a browser.
const hooks = vi.hoisted(() => ({ values: [], cursor: 0 }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal(),
  useId: () => 'editor-test',
  useState: initial => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.values[index], value => { hooks.values[index] = typeof value === 'function' ? value(hooks.values[index]) : value; }];
  },
  useRef: initial => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
}));
import StudyGoalEditor from './StudyGoalEditor.jsx';

const nodes = element => !element || typeof element !== 'object' ? [] : Array.isArray(element) ? element.flatMap(nodes) : [element, ...nodes(element.props?.children)];
const text = element => element == null || typeof element === 'boolean' ? '' : typeof element !== 'object' ? String(element) : Array.isArray(element) ? element.map(text).join('') : text(element.props?.children);
const button = (tree, name) => nodes(tree).find(node => node.type === 'button' && text(node) === name);
const form = tree => nodes(tree).find(node => node.type === 'form');
const submitEvent = () => ({ preventDefault: vi.fn() });
const goals = { dailyTargetMinutes: 90, weeklyStudyDays: 3, subjectWeeklyTargets: { s_math: 120 }, weeklyPlan: { mon: { s_math: 30 } } };
const focus = vi.fn();
function editor(onSave = vi.fn(), suggestions = []) {
  const props = { studyGoals: goals, onSave, reviewSuggestions: suggestions };
  const render = () => { hooks.cursor = 0; return StudyGoalEditor(props); };
  const open = () => { button(render(), 'プランを見直す').props.onClick({ currentTarget: { focus } }); return render(); };
  const change = (tree, value, subject = '中学校・数学') => {
    const fieldset = nodes(tree).find(node => node.type === 'fieldset' && text(node).includes('週間プラン（毎週繰り返す予定）'));
    const label = nodes(fieldset).find(node => node.type === 'label' && text(node).startsWith(subject));
    nodes(label).find(node => node.type === 'select').props.onChange({ target: { value: String(value) } });
    return render();
  };
  return { props, render, open, change };
}
beforeEach(() => { hooks.values = []; hooks.cursor = 0; focus.mockClear(); vi.stubGlobal('requestAnimationFrame', callback => callback()); });

it('switches weekdays, retains entries, and offers 0..360 in 15-minute steps', () => {
  const e = editor(); let tree = e.open();
  const fieldset = nodes(tree).find(n => n.type === 'fieldset' && text(n).includes('週間プラン（毎週繰り返す予定）'));
  const select = nodes(fieldset).find(n => n.type === 'select');
  expect(nodes(select).filter(n => n.type === 'option').map(n => n.props.value)).toEqual(Array.from({ length: 25 }, (_, i) => i * 15));
  tree = e.change(tree, 360);
  nodes(tree).find(n => n.props?.['aria-label'] === '水曜日').props.onClick();
  tree = e.change(e.render(), 15, '中学校・英語');
  nodes(tree).find(n => n.props?.['aria-label'] === '月曜日').props.onClick();
  tree = e.change(e.render(), 0);
  form(tree).props.onSubmit(submitEvent());
  const preview = text(e.render());
  expect(preview).toContain('月曜日：中学校・数学 30分 → 0分');
  expect(preview).toContain('水曜日：中学校・英語 0分 → 15分');
  expect(preview).toContain('週間予定：30分 → 15分');
});

it('previews before saving, returns to edit, and cancels without writes with focus restoration', async () => {
  const onSave = vi.fn(), e = editor(onSave);
  let tree = e.change(e.open(), 45);
  await form(tree).props.onSubmit(submitEvent());
  expect(onSave).not.toHaveBeenCalled();
  expect(text(e.render())).toContain('変更内容の確認');
  button(e.render(), '編集へ戻る').props.onClick();
  expect(text(e.render())).toContain('この日の予定：45分');
  button(e.render(), 'キャンセル').props.onClick();
  expect(form(e.render())).toBeUndefined();
  expect(focus).toHaveBeenCalledOnce();
  expect(text(e.open())).toContain('この日の予定：30分');
});

it('skips unchanged saves and prevents duplicate submissions while saving', async () => {
  let resolve;
  const onSave = vi.fn(() => new Promise(done => { resolve = done; })), e = editor(onSave);
  await form(e.open()).props.onSubmit(submitEvent());
  expect(onSave).not.toHaveBeenCalled();
  await form(e.change(e.open(), 45)).props.onSubmit(submitEvent());
  const save = form(e.render()).props.onSubmit;
  const pending = save(submitEvent());
  await save(submitEvent());
  expect(onSave).toHaveBeenCalledExactlyOnceWith({ weeklyPlan: { mon: { s_math: 45 } } });
  expect(button(e.render(), '保存中…').props.disabled).toBe(true);
  expect(button(e.render(), 'キャンセル').props.disabled).toBe(true);
  resolve(); await pending;
  expect(form(e.render())).toBeUndefined();
  expect(text(e.render())).toContain('更新しました');
});

it('retains draft on save failure and retries only after confirmation', async () => {
  const onSave = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(), e = editor(onSave);
  await form(e.change(e.open(), 45)).props.onSubmit(submitEvent());
  await form(e.render()).props.onSubmit(submitEvent());
  expect(text(e.render())).toContain('編集内容は保持されています');
  expect(text(e.render())).toContain('30分 → 45分');
  await form(e.render()).props.onSubmit(submitEvent());
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(form(e.render())).toBeUndefined();
});

it('opens candidate subject/day without writing and handles Escape in preview and editor', async () => {
  const onSave = vi.fn(), e = editor(onSave, [{ id: 'day-wed', day: 'wed', subjectId: 's_english', text: '確認' }]);
  button(e.render(), 'この候補から見直す').props.onClick({ currentTarget: { focus } });
  let tree = e.render();
  expect(nodes(tree).find(n => n.props?.['aria-label'] === '水曜日').props['aria-pressed']).toBe(true);
  expect(nodes(tree).find(n => n.type === 'select' && n.props.autoFocus).props.value).toBe(0);
  tree = e.change(tree, 30, '中学校・英語');
  await form(tree).props.onSubmit(submitEvent());
  form(e.render()).props.onKeyDown({ key: 'Escape', preventDefault() {} });
  expect(text(e.render())).toContain('この日の予定：30分');
  form(e.render()).props.onKeyDown({ key: 'Escape', preventDefault() {} });
  expect(form(e.render())).toBeUndefined();
  expect(onSave).not.toHaveBeenCalled();
});

it('returns focus to the main trigger when a saved candidate disappears', () => {
  const e = editor(vi.fn(), [{ id: 'subject', text: '確認' }]), fallbackFocus = vi.fn();
  button(e.render(), 'プランを見直す').props.ref.current = { focus: fallbackFocus };
  button(e.render(), 'この候補から見直す').props.onClick({ currentTarget: { isConnected: false, focus } });
  button(e.render(), 'キャンセル').props.onClick();
  expect(fallbackFocus).toHaveBeenCalledOnce();
  expect(focus).not.toHaveBeenCalled();
});
