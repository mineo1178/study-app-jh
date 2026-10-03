import { createTimerStaleObserver, TIMER_STALE_MS } from '../timer/timerStale.js';

export function staleObservation(timer, elapsedMs = TIMER_STALE_MS) {
  let elapsed = 0;
  const observer = createTimerStaleObserver({ monotonic: () => elapsed, online: () => true });
  observer.observe(timer, { fromCache: false, hasPendingWrites: false });
  elapsed = elapsedMs;
  return observer.proof(timer);
}
