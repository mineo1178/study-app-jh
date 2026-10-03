import { dashboardDuration as duration } from '../../data/dashboardSelectors.js';
const box = 'min-w-0 rounded-[2rem] border border-slate-100 bg-white p-5 sm:p-6 text-left shadow-sm';
const link = 'mt-3 min-h-11 rounded-xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-700';
export default function LearningDashboard({ summary, onNavigate }) {
  if (summary.status === 'loading') return <section className={box} role="status">学習状況を読み込んでいます…</section>;
  const s = summary;
  return <section aria-label="学習ダッシュボード" className="min-w-0 space-y-4">
    <p className="text-xs font-bold leading-relaxed text-slate-500">今日と今週の学習状況、次に取り組む目標をまとめています。</p>
    <div className={box}>
      <h2 className="text-lg font-black text-slate-800">今日の学習</h2>
      <p className="mt-2 text-2xl font-black text-blue-700">{duration(s.todaySeconds)} / {duration(s.target)}</p>
      <progress aria-label="今日の達成率" value={s.percent} max="100" className="mt-3 block h-3 w-full accent-blue-600"/>
      <p className="mt-2 text-sm font-black">{s.remaining ? `あと${duration(s.remaining)}` : '今日の目標達成！'} ・ {s.percent}%</p>
      <p className="mt-2 text-xs text-slate-500">{s.todaySubjects}教科 ・ 有効な学習記録{s.todayCount}回（確定した記録）</p>
    </div>
    <div className={box}>
      <h2 className="text-lg font-black">次にやること</h2>
      <ul className="mt-3 divide-y divide-slate-100">{s.actions.map(a => <li key={a.id} className="py-3 break-words"><h3 className="text-sm font-black text-blue-700">{a.title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">{a.detail}</p><button type="button" className={link} onClick={() => onNavigate(a.tab)}>{a.action}</button></li>)}</ul>
      {!s.actions.length && <p className="mt-3 text-sm">学習目標を達成しました。次の学習を続けましょう。</p>}
    </div>
    <div className={box}>
      <h2 className="text-lg font-black">次の報酬</h2>
      {s.rewardProgress.status === 'loading' ? <p role="status">報酬を確認しています…</p> : s.rewardProgress.status === 'blocked' ? <p className="mt-2 text-sm">報酬の訂正が確認待ちです。確認画面をご覧ください。</p> : <div className="mt-3 space-y-3">{s.rewardProgress.goals.map(g => <p key={g.id} className="break-words text-sm"><b>{g.name}</b>：{g.available ? g.id === 'gacha' ? 'ガチャできます' : '装備を入手できます' : g.requirements.filter(r => r.remaining > 0).map(r => `あと${r.remaining}${r.unit}`).join('・')}</p>)}{!s.rewardProgress.goals.length && <p>次の報酬はありません。</p>}{!s.rewardProgress.goals.some(g => g.id !== 'gacha') && <p className="text-xs text-slate-500">次の未所持装備はありません。</p>}</div>}
      <button type="button" className={link} onClick={() => onNavigate('rpg')}>報酬の詳細はRPGへ</button>
    </div>
    <div className={box}><h2 className="text-lg font-black">今週の進み具合</h2><p className="mt-3 text-sm font-bold">{s.weekDays}日 ・ {s.weekSubjects}教科 ・ {duration(s.weekSeconds)}</p>{s.achievement && <p className="mt-3 text-xs text-slate-500">もうすぐ達成できる実績：{s.achievement.name}（{s.achievement.progressText}）</p>}</div>
    <div className={box}><h2 className="text-lg font-black">RPG進行</h2>{s.rpg ? <div className="mt-3 space-y-2 text-sm font-bold"><p>{s.rpg.campaign}</p><p>{s.rpg.tower}</p><p>{s.rpg.weekly}</p></div> : <p role="status">RPGの進行を確認しています…</p>}<button type="button" className={link} onClick={() => onNavigate('rpg')}>RPGで次の挑戦を確認</button></div>
    <div className={box}><h2 className="text-lg font-black">最新成績</h2>{s.latestGrade === undefined ? <p role="status">成績を確認しています…</p> : s.latestGrade ? <p className="mt-3 break-words text-sm">{s.latestGrade.name || 'テスト'} ・ {s.latestGrade.date} ・ 総合偏差値 {Number.isFinite(s.latestGrade.average) ? s.latestGrade.average : '未登録'}</p> : <p className="mt-3 text-sm">まだ成績の記録がありません。</p>}<button type="button" className={link} onClick={() => onNavigate('tests')}>成績の詳細へ</button></div>
  </section>;
}
