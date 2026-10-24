import { useEffect, useRef } from 'react';
import { resourceTransactionState } from '../../rpg/resourceTransactions.js';
import ResourceOfferDetails from './ResourceOfferDetails.jsx';

export default function CommerceConfirmModal({ open, title, offer, profile, pending, allowed = true, onCancel, onConfirm, confirmLabel, error, children }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, [open]);
  if (!open || !offer) return null;
  const state = resourceTransactionState(profile, offer);
  const keyDown = event => {
    if (event.key === 'Escape' && !pending) onCancel?.();
    if (event.key !== 'Tab') return;
    const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled)')];
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
  };
  return <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/60 p-4"><section ref={dialogRef} tabIndex={-1} onKeyDown={keyDown} role="dialog" aria-modal="true" aria-labelledby="commerce-confirm-title" aria-busy={pending} className="max-h-[90dvh] w-full min-w-0 max-w-md space-y-4 overflow-y-auto break-words rounded-3xl bg-white p-4 shadow-2xl sm:p-6"><h2 id="commerce-confirm-title" className="text-xl font-black text-slate-800">{title}</h2>{children}<ResourceOfferDetails profile={profile} offer={offer}/>{!state.available && <p role="alert" className="text-sm font-bold text-rose-700">所持数が足りません。残高を確認してください。</p>}{error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}<div className="grid grid-cols-2 gap-3"><button type="button" disabled={pending} onClick={onCancel} className="rounded-xl bg-slate-100 py-3 text-sm font-black text-slate-600 disabled:opacity-50">キャンセル</button><button type="button" disabled={pending || !allowed || !state.available} onClick={onConfirm} className="rounded-xl bg-blue-600 py-3 text-sm font-black text-white disabled:bg-slate-300">{pending ? '処理中…' : confirmLabel}</button></div></section></div>;
}
