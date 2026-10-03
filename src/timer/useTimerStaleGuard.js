import { useEffect } from 'react';
import { timerStaleObserver } from './timerStale.js';
import { recordTimerDiagnostic } from './timerDiagnostics.js';

export default function useTimerStaleGuard(enabled) {
  useEffect(() => {
    timerStaleObserver.reset();
    timerStaleObserver.setRecorder(recordTimerDiagnostic);
    if (!enabled) return;
    // Reconnection must receive a server snapshot before any destructive decision.
    const interrupt = () => timerStaleObserver.disconnect();
    window.addEventListener('offline', interrupt);
    window.addEventListener('online', interrupt);
    return () => {
      window.removeEventListener('offline', interrupt);
      window.removeEventListener('online', interrupt);
      timerStaleObserver.reset();
    };
  }, [enabled]);
  return timerStaleObserver;
}
