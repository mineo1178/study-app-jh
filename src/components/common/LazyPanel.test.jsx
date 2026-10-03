import { lazy } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LazyPanel from './LazyPanel.jsx';

describe('LazyPanel', () => {
  it('renders a helpful fallback for deferred screens', () => {
    const Deferred = lazy(() => new Promise(() => {}));
    const html = renderToString(<LazyPanel label="RPG"><Deferred/></LazyPanel>).replaceAll('<!-- -->', '');
    expect(html).toContain('RPGを準備しています'); expect(html).toContain('学習タイマーはそのまま続きます');
  });
  it('isolates load errors and offers an explicit reload', () => {
    const boundary = new LazyPanel({ label: '成績グラフ' });
    boundary.state = LazyPanel.getDerivedStateFromError(new Error('network'));
    const html = renderToString(boundary.render()).replaceAll('<!-- -->', '');
    expect(html).toContain('成績グラフを読み込めませんでした'); expect(html).toContain('画面を再読み込み');
  });
});
