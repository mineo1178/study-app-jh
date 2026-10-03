import { useEffect, useEffectEvent } from 'react';
import { diagnosticTimerState, listenTimerDiagnosticEnvironment, recordTimerDiagnostic } from './timerDiagnostics.js';

export default function useTimerDiagnostics({ timer, isOwner, activeTab, sampleMode, hasTimerTask }) {
  const record = useEffectEvent((event) => recordTimerDiagnostic(event, { ...diagnosticTimerState(timer), owner: isOwner, sampleMode, hasTimerTask, source: 'app.lifecycle' }));
  useEffect(() => listenTimerDiagnosticEnvironment(record), []);
  useEffect(() => {
    recordTimerDiagnostic('timer_ui_state', { ...diagnosticTimerState(timer), owner: isOwner, sampleMode, hasTimerTask, activeTab, source: 'app.state' });
  }, [timer, isOwner, activeTab, sampleMode, hasTimerTask]);
}
