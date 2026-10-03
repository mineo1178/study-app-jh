import { useEffect, useEffectEvent, useRef } from 'react';
import { startTimerIdle } from './timerIdle.js';

export default function useTimerIdleStop({ timer, ownerClientId, enabled, onStop }) {
  const controller = useRef(null);
  const stop = useEffectEvent(onStop);
  const timerId = timer?.timerId;
  const segmentStartedAt = timer?.segmentStartedAt;
  const running = timer?.state === 'running';
  const timerOwner = timer?.ownerClientId;
  useEffect(() => {
    if (!enabled || !running) return;
    controller.current = startTimerIdle({
      timer: { timerId, segmentStartedAt, state: 'running', ownerClientId: timerOwner },
      ownerClientId, onStop: stop,
    });
    return () => { controller.current?.dispose(); controller.current = null; };
  }, [enabled, running, timerId, segmentStartedAt, timerOwner, ownerClientId]);
  return controller;
}
