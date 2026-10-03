export default function RewardProgressCard({ progress, onOpenRpg }) {
  return <section className="min-w-0 rounded-[2rem] border border-violet-100 bg-white p-5 sm:p-6 text-left shadow-sm" aria-label="次の報酬">
    <h3 className="text-lg font-black text-slate-800">次の報酬に向けて</h3>
    <p className="mt-2 text-xs font-bold leading-relaxed text-slate-500">有効な学習を記録するとGOLDと素材が増えます。確定済みの所持数を表示し、計測中の時間は含みません。</p>
    {progress.status === 'loading' ? <p role="status" className="mt-4 text-sm text-slate-500">報酬を確認しています。読み込み後に次の目標を表示します。</p> : <>
      {progress.status === 'blocked' && <p className="mt-4 text-sm text-amber-700">報酬の訂正が確認待ちです。「確認」画面で内容を確認してください。完了するまで購入・ガチャは利用できません。</p>}
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
        {progress.goals.map((goal) => <article key={goal.id} className="min-w-0 rounded-2xl bg-violet-50 p-4">
          <h4 className="break-words text-sm font-black text-violet-900">{goal.id === 'gacha' ? '次のガチャ' : '次の装備'}：{goal.name}</h4>
          {goal.hasTicket ? <p className="mt-2 text-xs font-bold text-slate-600">ガチャ券を所持しています</p> : goal.requirements.map((entry) => <p key={entry.id} className="mt-2 break-words text-xs font-bold text-slate-600">{entry.unit} {entry.current} / {entry.target}{entry.remaining > 0 && `（あと${entry.remaining}）`}</p>)}
          <progress aria-label={`${goal.name}の進捗`} max="1" value={goal.progress} className="mt-3 block h-2 w-full max-w-full accent-violet-600"/>
          <p className="mt-3 text-sm font-black text-violet-800">{goal.available ? goal.id === 'gacha' ? 'ガチャできます' : '装備を購入できます' : progress.status === 'blocked' ? '報酬の確認をお待ちください' : goal.id === 'gacha' ? `GOLD獲得には有効な学習あと${goal.remainingMinutes}分が目安` : '表示されたGOLDと素材を集めましょう'}</p>
          {goal.id === 'gacha' && !goal.available && progress.status !== 'blocked' && <p className="mt-2 text-xs leading-relaxed text-slate-500">ほかにGOLDを使わない場合の目安です。短い記録に分けた場合、1分未満の端数は合算されません。</p>}
        </article>)}
      </div>
      {!progress.goals.some((goal) => goal.id !== 'gacha') && <p className="mt-3 text-xs text-slate-500">ショップの装備はすべて所持しています。</p>}
      <button type="button" onClick={onOpenRpg} className="mt-4 min-h-11 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white sm:w-auto">RPGで報酬を使う</button>
    </>}
  </section>;
}
