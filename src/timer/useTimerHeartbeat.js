import { useEffect, useEffectEvent } from 'react';
import { startTimerHeartbeat } from './timerHeartbeat.js';
import { diagnosticTimerState, recordTimerDiagnostic } from './timerDiagnostics.js';

export default function useTimerHeartbeat({ timer, enabled, onHeartbeat }) {
  const timerId = timer?.timerId;
  const running = timer?.state === 'running';
  const send = useEffectEvent(() => {
    recordTimerDiagnostic('heartbeat_due', { ...diagnosticTimerState(timer), enabled, source: 'heartbeat.scheduler' });
    return onHeartbeat(timerId);
  });
  useEffect(() => {
    recordTimerDiagnostic('heartbeat_lifecycle', { timerId, status: running ? 'running' : 'not_running', enabled, source: 'heartbeat.effect' });
    if (!enabled || !timerId || !running) return;
    const cleanup = startTimerHeartbeat({ send, onError: (error) => console.error('Timer heartbeat failed:', error) });
    return () => { recordTimerDiagnostic('heartbeat_cleanup', { timerId, reason: 'EFFECT_CLEANUP_NO_STOP', source: 'heartbeat.effect' }); cleanup(); };
  }, [enabled, timerId, running]);
}
