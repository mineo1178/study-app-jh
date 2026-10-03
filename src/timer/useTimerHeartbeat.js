import { useEffect, useEffectEvent } from 'react';
import { isStaleActiveTimer } from './timerEngine.js';
import { startTimerHeartbeat } from './timerHeartbeat.js';

export default function useTimerHeartbeat({ timer, enabled, onHeartbeat }) {
  const timerId = timer?.timerId;
  const running = timer?.state === 'running';
  const send = useEffectEvent(() => {
    if (!isStaleActiveTimer(timer)) return onHeartbeat(timerId);
  });
  useEffect(() => {
    if (!enabled || !timerId || !running) return;
    return startTimerHeartbeat({ send, onError: (error) => console.error('Timer heartbeat failed:', error) });
  }, [enabled, timerId, running]);
}
