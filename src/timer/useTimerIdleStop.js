import { useEffect, useEffectEvent, useRef } from 'react';
import { startTimerIdle } from './timerIdle.js';

export default function useTimerIdleStop({ timer, ownerClientId, enabled, onStop, onObservation }) {
  const controller = useRef(null);
  const stop = useEffectEvent(onStop);
  const observation = useEffectEvent(onObservation);
  const background = useEffectEvent(() => timer?.backgroundObservation);
  const timerId = timer?.timerId;
  const segmentStartedAt = timer?.segmentStartedAt;
  const running = timer?.state === 'running';
  const timerOwner = timer?.ownerClientId;
  useEffect(() => {
    if (!enabled || !running) return;
    controller.current = startTimerIdle({
      timer: { timerId, segmentStartedAt, state: 'running', ownerClientId: timerOwner, backgroundObservation: background() },
      ownerClientId, onStop: stop, onObservation: observation,
    });
    return () => { controller.current?.dispose(); controller.current = null; };
  }, [enabled, running, timerId, segmentStartedAt, timerOwner, ownerClientId]);
  return controller;
}
