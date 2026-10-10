export const BACKGROUND_REVIEW_SECONDS = 5 * 60;

// Observations belong to the owner and running segment. Keep completed evidence
// across PAUSE/RESUME, but never extend a hidden interval through a pause.
export function mergeTimerBackground(timer, observation = null) {
  const saved = timer?.backgroundObservation || {};
  const accepts = observation?.timerId === timer?.timerId
    && observation?.ownerClientId === timer?.ownerClientId
    && observation?.segmentStartedAt === timer?.segmentStartedAt
    && Number.isFinite(observation?.observedAt);
  const latest = accepts && observation.observedAt >= (saved.observedAt || 0) ? observation : saved;
  return {
    ...latest,
    longestHiddenSeconds: Math.max(0, saved.longestHiddenSeconds || 0, accepts ? observation.longestHiddenSeconds || 0 : 0),
  };
}

export function closeTimerBackground(timer, observation, endAt) {
  const merged = mergeTimerBackground(timer, observation);
  const hiddenStart = merged.ownerClientId === timer.ownerClientId
    && merged.segmentStartedAt === timer.segmentStartedAt ? merged.hiddenStartedAt : null;
  // Cross-device callers can only use a time actually observed by the owner.
  const observedEnd = Math.min(endAt, Math.max(timer.lastHeartbeatAt || 0, merged.observedAt || 0));
  const hiddenSeconds = hiddenStart > 0 ? Math.max(0, Math.floor((observedEnd - hiddenStart) / 1000)) : 0;
  return { ...merged, hiddenStartedAt: null, longestHiddenSeconds: Math.max(merged.longestHiddenSeconds, hiddenSeconds) };
}
