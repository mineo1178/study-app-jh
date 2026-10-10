import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TimerDiagnosticsPanel from './TimerDiagnosticsPanel.jsx';

describe('TimerDiagnosticsPanel', () => {
  it('exposes numeric timer state and a copy action without learning contents', () => {
    const html = renderToStaticMarkup(<TimerDiagnosticsPanel timer={{ timerId: 'test', state: 'running', startedAt: 1_000_000, lastHeartbeatAt: 1_000_000, title: 'private learning' }} authenticated={true} isOwner={false}/>);
    expect(html).toContain('heartbeat fingerprint');
    expect(html).toContain('fromCache / hasPendingWrites');
    expect(html).toContain('stale candidate');
    expect(html).toContain('running'); expect(html).toContain('startedAt'); expect(html).toContain('lastHeartbeatAt');
    expect(html).toContain('visibility'); expect(html).toContain('online'); expect(html).toContain('ログをコピー');
    expect(html).toContain('lastUserActivityAt'); expect(html).toContain('15分・開始したタブのみ'); expect(html).toContain('idle deadline'); expect(html).toContain('focus'); expect(html).toContain('直近終了理由');
    expect(html).toContain('非表示開始 / 復帰'); expect(html).toContain('学習時間確認対象');
    expect(html).not.toContain('private learning');
  });
  it('can render while auth, profile or the active timer have not loaded', () => {
    const html = renderToStaticMarkup(<TimerDiagnosticsPanel timer={null} authenticated={false} isOwner={false}/>);
    expect(html).toContain('missing'); expect(html).not.toContain('NaN');
  });
});
