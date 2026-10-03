import { describe, expect, it, vi } from 'vitest';
import { createTimerStaleObserver, matchesStaleProof, TIMER_STALE_MS } from './timerStale.js';

const timer = { timerId: 't', ownerClientId: 'device:tab', state: 'running', segmentStartedAt: 1_000_000, lastHeartbeatAt: 1_000_000 };
function setup() {
  let elapsed = 0;
  let online = true;
  const record = vi.fn();
  const observer = createTimerStaleObserver({ monotonic: () => elapsed, online: () => online, record });
  return { observer, record, advance: (ms) => { elapsed += ms; }, online: (value) => { online = value; } };
}

describe('monotonic heartbeat observation', () => {
  it.each([15, 30, -30, 60])('normal heartbeat stays fresh with observer wall offset %s minutes', (offset) => {
    const f = setup();
    let current = { ...timer, lastHeartbeatAt: timer.lastHeartbeatAt - offset * 60_000 };
    f.observer.observe(current);
    for (let tick = 0; tick < 120; tick++) {
      f.advance(30_000);
      current = { ...current, lastHeartbeatAt: current.lastHeartbeatAt + 30_000 };
      f.observer.observe(current);
      expect(f.observer.proof(current)).toBeNull();
    }
  });
  it('waits fifteen observed minutes even for an initially very old heartbeat; reload restarts the window', () => {
    const f = setup(); f.observer.observe(timer);
    f.advance(899_999); expect(f.observer.proof(timer)).toBeNull();
    f.advance(1); expect(matchesStaleProof(timer, f.observer.proof(timer))).toBe(true);
    f.observer.reset(); f.observer.observe(timer); expect(f.observer.proof(timer)).toBeNull();
  });
  it.each([-30, 30])('heartbeat moving %s minutes backwards/forwards is progress, without wall-age interpretation', (jump) => {
    const f = setup(); f.observer.observe(timer); f.advance(899_999);
    const current = { ...timer, lastHeartbeatAt: timer.lastHeartbeatAt + jump * 60_000 };
    f.observer.observe(current); expect(f.observer.state().elapsedMs).toBe(0);
    f.advance(899_999); expect(f.observer.proof(current)).toBeNull();
    f.advance(1); expect(matchesStaleProof(current, f.observer.proof(current))).toBe(true);
    expect(f.record.mock.calls.map(([event]) => event)).toContain('heartbeat_progress_observed');
  });
  it('unrelated snapshots/updatedAt, UI activity and checks cannot reset observation or flood candidate logs', () => {
    const f = setup(); f.observer.observe(timer);
    for (let tick = 0; tick < 30; tick++) {
      f.advance(30_000); f.observer.observe({ ...timer, updatedAt: tick }); f.observer.check();
    }
    expect(f.observer.state().elapsedMs).toBe(TIMER_STALE_MS);
    expect(f.observer.proof(timer)).not.toBeNull();
    for (let tick = 0; tick < 10; tick++) f.observer.check();
    expect(f.record.mock.calls.filter(([event]) => event === 'stale_candidate')).toHaveLength(1);
  });
  it.each([{ fromCache: true }, { hasPendingWrites: true }])('cache or pending data cannot authorize deletion: %j', (metadata) => {
    const f = setup(); f.observer.observe(timer, metadata); f.advance(TIMER_STALE_MS);
    expect(f.observer.proof(timer)).toBeNull();
    f.observer.observe(timer); expect(f.observer.state().elapsedMs).toBe(0);
  });
  it('observer outage blocks existing proof; reconnect waits for server data and restarts observation', () => {
    const f = setup(); f.observer.observe(timer); f.advance(TIMER_STALE_MS);
    const proof = f.observer.proof(timer);
    f.online(false); f.observer.check();
    expect(matchesStaleProof(timer, proof)).toBe(false);
    f.advance(TIMER_STALE_MS); f.online(true); f.observer.disconnect();
    expect(f.observer.proof(timer)).toBeNull();
    f.observer.observe(timer, { fromCache: true }); expect(f.observer.proof(timer)).toBeNull();
    f.observer.observe(timer); expect(f.observer.state().elapsedMs).toBe(0);
    f.advance(TIMER_STALE_MS); expect(f.observer.proof(timer)).not.toBeNull();
  });
  it('owner outage with a continuously online observer reaches stale; a later heartbeat cancels a captured proof', () => {
    const f = setup(); f.observer.observe(timer); f.advance(TIMER_STALE_MS);
    const proof = f.observer.proof(timer);
    expect(matchesStaleProof(timer, proof)).toBe(true);
    const current = { ...timer, lastHeartbeatAt: timer.lastHeartbeatAt + 30_000 };
    expect(matchesStaleProof(current, proof)).toBe(false);
    f.observer.observe(current); expect(matchesStaleProof(timer, proof)).toBe(false);
  });
  it.each([{ timerId: 'other' }, { ownerClientId: 'other:tab' }, { state: 'paused' }, { segmentStartedAt: 2_000_000 }])('replacement/owner/PAUSE/RESUME invalidates the previous proof: %j', (change) => {
    const f = setup(); f.observer.observe(timer); f.advance(TIMER_STALE_MS);
    const proof = f.observer.proof(timer); const current = { ...timer, ...change };
    expect(matchesStaleProof(current, proof)).toBe(false);
    f.observer.observe(current); expect(f.observer.proof(current)).toBeNull();
  });
  it('confirmed owner heartbeat resets progress without requiring wall-clock freshness', () => {
    const f = setup(); f.observer.observe(timer); f.advance(899_999);
    f.observer.heartbeatSucceeded(timer, timer.lastHeartbeatAt - 60_000);
    expect(f.observer.state().elapsedMs).toBe(0);
    f.observer.disconnect(); f.advance(TIMER_STALE_MS);
    f.observer.heartbeatSucceeded(timer, timer.lastHeartbeatAt + 60_000);
    expect(f.observer.proof()).toBeNull();
  });
  it.each([-30, 30])('a local wall jump of %s minutes cannot reach the monotonic threshold', (jump) => {
    const f = setup(); f.observer.observe(timer); f.advance(60_000);
    const wall = vi.spyOn(Date, 'now').mockReturnValue(timer.lastHeartbeatAt + jump * 60_000);
    try {
      expect(f.observer.state().elapsedMs).toBe(60_000);
      expect(f.observer.proof(timer)).toBeNull();
      f.advance(839_000); expect(f.observer.proof(timer)).toBeNull();
      f.advance(1000); expect(f.observer.proof(timer)).not.toBeNull();
    } finally { wall.mockRestore(); }
  });
  it('pending/cache interruption revokes an old proof even when the next server fingerprint is identical', () => {
    const f = setup(); f.observer.observe(timer); f.advance(TIMER_STALE_MS);
    const proof = f.observer.proof(timer);
    f.observer.observe(timer, { hasPendingWrites: true });
    expect(matchesStaleProof(timer, proof)).toBe(false);
    f.observer.observe(timer); expect(f.observer.state().elapsedMs).toBe(0);
    expect(matchesStaleProof(timer, proof)).toBe(false);
  });
});
