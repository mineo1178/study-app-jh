import { useEffect, useSyncExternalStore } from 'react';
import { feedbackSession } from '../../feedback/feedbackEvents.js';
import './feedback.css';

export default function FeedbackOverlay() {
  const queue = feedbackSession.queue;
  const events = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  const event = events[0];
  useEffect(() => {
    if (!event) return;
    const timeout = setTimeout(() => queue.close(event.key), 15000);
    return () => clearTimeout(timeout);
  }, [event, queue]);
  if (!event) return null;
  return <aside className="result-feedback" aria-label="成果フィードバック">
    <div role="status" aria-live="polite" aria-atomic="true">
      <p className="text-xs font-black text-amber-300">{event.title}</p>
      <p className="mt-2 text-lg font-black">{event.name}</p>
      {event.details?.map((detail, index) => <p key={index} className="mt-2 text-sm">{detail}</p>)}
    </div>
    <button type="button" className="mt-3 min-h-11 w-full rounded-xl bg-white/15 px-4 font-bold" onClick={() => queue.close(event.key)}>閉じる{events.length > 1 ? `（次の成果 ${events.length - 1}件）` : ''}</button>
  </aside>;
}
