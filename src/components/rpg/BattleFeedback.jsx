export default function BattleFeedback({ feedback }) {
  return feedback?.length > 0 ? <div role="status" aria-live="polite" className="mt-4 break-words rounded-xl bg-indigo-950 p-3 text-left text-sm font-bold text-white"><p className="mb-1 text-xs text-indigo-200">直前の行動結果</p>{feedback.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div> : null;
}
