import { useEffect, useRef } from 'react';

// Focus behavior only; callers retain all save and timer state.
export default function GuiDialog({ className, label, onClose, onClick, children }) {
  const root = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = root.current;
    (dialog.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled])') || dialog).focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const onKeyDown = event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose?.(); }
    if (event.key !== 'Tab') return;
    const controls = [...root.current.querySelectorAll('button, input, select, textarea, summary, [tabindex]')]
      .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); root.current.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <div ref={root} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={className + ' jh-dialog'} onKeyDown={onKeyDown} onClick={onClick}>{children}</div>;
}
