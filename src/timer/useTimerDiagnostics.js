import { useEffect, useEffectEvent } from 'react';
import { diagnosticTimerState, diagnosticUserActivity, listenTimerDiagnosticEnvironment, listenTimerUserActivity, recordTimerDiagnostic } from './timerDiagnostics.js';

export default function useTimerDiagnostics({ timer, isOwner, activeTab, sampleMode, hasTimerTask }) {
  const record = useEffectEvent((event, details = {}) => recordTimerDiagnostic(event, { ...diagnosticTimerState(timer), ...diagnosticUserActivity(), ...details, owner: isOwner, sampleMode, hasTimerTask, source: 'app.lifecycle' }));
  useEffect(() => listenTimerDiagnosticEnvironment(record), []);
  useEffect(() => listenTimerUserActivity(record), []);
  useEffect(() => {
    recordTimerDiagnostic('timer_ui_state', { ...diagnosticTimerState(timer), owner: isOwner, sampleMode, hasTimerTask, activeTab, source: 'app.state' });
  }, [timer, isOwner, activeTab, sampleMode, hasTimerTask]);
}
