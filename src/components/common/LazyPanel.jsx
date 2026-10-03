import { Component, Suspense } from 'react';

export default class LazyPanel extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    const { label, children } = this.props;
    if (this.state.failed) return <div role="alert" className="rounded-2xl bg-amber-50 p-5 text-sm leading-relaxed text-amber-900">
      <p>{label}を読み込めませんでした。通信状態を確認して、画面を再読み込みしてください。学習タイマーは停止されません。</p>
      <button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-11 rounded-xl bg-slate-900 px-4 font-bold text-white">画面を再読み込み</button>
    </div>;
    return <Suspense fallback={<div role="status" className="flex min-h-32 items-center justify-center rounded-2xl bg-slate-50 p-5 text-sm font-bold leading-relaxed text-slate-500">{label}を準備しています。少しお待ちください。学習タイマーはそのまま続きます。</div>}>{children}</Suspense>;
  }
}
