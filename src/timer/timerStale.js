export const TIMER_STALE_MS = 15 * 60 * 1000;
export const heartbeatFingerprint = (timer) => String(timer?.lastHeartbeatAt ?? timer?.segmentStartedAt ?? 'missing');
const identity = (timer) => JSON.stringify([timer?.timerId, timer?.ownerClientId, timer?.segmentStartedAt]);

// Remote timestamps are opaque fingerprints, never compared with this device's clock.
export function createTimerStaleObserver({ monotonic = () => performance.now(), online = () => typeof navigator === 'undefined' || navigator.onLine, record = () => {} } = {}) {
  let observation = null;
  let synced = false;
  let interrupted = false;
  let candidateLogged = false;
  let lastReason = 'NO_OBSERVATION';
  let observedTimer = null;
  let fromCache = null;
  let hasPendingWrites = null;
  const emit = (event, reason) => {
    lastReason = reason;
    try {
      record(event, { timerId: observation?.timerId, reason, heartbeatFingerprint: observation?.fingerprint,
        progressObservedAtMs: observation?.observedAt, staleElapsedMs: observation ? Math.max(0, monotonic() - observation.observedAt) : 0,
        staleThresholdMs: TIMER_STALE_MS, synced, fromCache, hasPendingWrites });
    } catch { /* Local diagnostics cannot affect timer safety. */ }
  };
  const reset = () => { observation = null; observedTimer = null; synced = false; interrupted = false; candidateLogged = false; fromCache = null; hasPendingWrites = null; lastReason = 'NO_OBSERVATION'; };
  const disconnect = () => {
    if (!interrupted) emit('stale_skipped_offline', 'AWAIT_SERVER_SYNC');
    synced = false; interrupted = true;
  };
  const observe = (timer, metadata = {}) => {
    fromCache = Boolean(metadata.fromCache);
    hasPendingWrites = Boolean(metadata.hasPendingWrites);
    if (!online()) { disconnect(); return; }
    if (fromCache || hasPendingWrites) { synced = false; interrupted = true; lastReason = 'AWAIT_SERVER_SYNC'; return; }
    synced = true;
    observedTimer = timer;
    if (timer?.state !== 'running') { observation = null; candidateLogged = false; interrupted = false; return; }
    const fingerprint = heartbeatFingerprint(timer);
    const changed = observation && observation.fingerprint !== fingerprint;
    if (!observation || observation.identity !== identity(timer) || interrupted || changed) {
      const previous = observation;
      observation = { identity: identity(timer), timerId: timer.timerId, ownerClientId: timer.ownerClientId, fingerprint, observedAt: monotonic() };
      candidateLogged = false;
      if (changed && previous?.identity === identity(timer)) emit('heartbeat_progress_observed', 'HEARTBEAT_CHANGED');
      emit(previous ? 'stale_observation_reset' : 'stale_observation_started', interrupted ? 'SERVER_SYNC_RECOVERED' : 'SERVER_HEARTBEAT_OBSERVED');
    }
    interrupted = false;
  };
  const state = () => {
    const elapsedMs = observation ? Math.max(0, monotonic() - observation.observedAt) : 0;
    return { ...observation, elapsedMs, thresholdMs: TIMER_STALE_MS, synced, fromCache, hasPendingWrites, online: online(), candidate: Boolean(observation && synced && online() && elapsedMs >= TIMER_STALE_MS), lastReason };
  };
  const proof = (timer = observedTimer) => {
    const current = state();
    if (!current.candidate || current.identity !== identity(timer) || current.fingerprint !== heartbeatFingerprint(timer) || timer?.state !== 'running') return null;
    const captured = observation;
    return { ...current, isCurrent: () => synced && online() && observation === captured };
  };
  const check = () => {
    if (!online()) { disconnect(); return null; }
    const candidate = proof();
    if (candidate && !candidateLogged) { emit('stale_candidate', 'NO_HEARTBEAT_PROGRESS_15_MINUTES'); candidateLogged = true; }
    return candidate;
  };
  const heartbeatSucceeded = (timer, lastHeartbeatAt) => {
    if (synced && observation?.identity === identity(timer)) observe({ ...timer, lastHeartbeatAt }, {});
  };
  return { observe, disconnect, reset, state, proof, check, heartbeatSucceeded, setRecorder: (next) => { record = next; } };
}

export function matchesStaleProof(timer, proof) {
  return Boolean(timer?.state === 'running' && proof?.candidate && proof.synced && proof.online
    && proof.elapsedMs >= TIMER_STALE_MS && proof.identity === identity(timer)
    && proof.fingerprint === heartbeatFingerprint(timer) && proof.isCurrent?.());
}

export const timerStaleObserver = createTimerStaleObserver();
