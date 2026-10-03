export const TIMER_HEARTBEAT_MS = 30 * 1000;

// A single clock for interval and visibility events keeps the existing write cadence.
export function startTimerHeartbeat({ send, visibilityTarget = document, now = () => performance.now(), onError = console.error }) {
  let lastAttempt = now();
  let pending = false;
  let disposed = false;
  const tick = () => {
    if (disposed || pending || now() - lastAttempt < TIMER_HEARTBEAT_MS) return;
    lastAttempt = now();
    pending = true;
    Promise.resolve().then(send).catch(onError).finally(() => { pending = false; });
  };
  const interval = setInterval(tick, TIMER_HEARTBEAT_MS);
  visibilityTarget.addEventListener('visibilitychange', tick);
  return () => {
    disposed = true;
    clearInterval(interval);
    visibilityTarget.removeEventListener('visibilitychange', tick);
  };
}
