import { getTitle } from '../../rpg/achievementCatalog.js';

export default function AchievementPanel({ achievements, unlockedTitles, selectedTitle, onSelectTitle, savingTitle }) {
  const completedCount = achievements.filter((achievement) => achievement.completed).length;
  return <section className="space-y-6">
    <div>
      <p className="text-[10px] font-black tracking-widest text-violet-600">ACHIEVEMENTS & TITLES</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <h2 className="text-xl font-black text-slate-800">実績・称号</h2>
        <p className="text-sm font-black text-violet-700">達成 {completedCount} / {achievements.length}</p>
      </div>
    </div>

    <div className="grid gap-3 md:grid-cols-2">
      {achievements.map((achievement) => {
        const title = achievement.unlocksTitleId ? getTitle(achievement.unlocksTitleId) : null;
        return <article key={achievement.id} className={`rounded-2xl border p-4 ${achievement.completed ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-black text-slate-800">{achievement.name}</h3>
              <p className="mt-1 text-xs font-bold text-slate-500">{achievement.description}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${achievement.completed ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{achievement.completed ? '達成' : '未達'}</span>
          </div>
          <p className="mt-3 text-sm font-black text-slate-700">{achievement.progressText}</p>
          {title && <p className={`mt-2 text-xs font-bold ${achievement.completed ? 'text-violet-700' : 'text-slate-400'}`}>称号「{title.name}」を解放</p>}
        </article>;
      })}
    </div>

    <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
      <h3 className="font-black text-violet-900">解放済み称号</h3>
      <p className="mt-1 text-xs font-bold text-violet-700">選択した称号はRPG見出しに表示されます。能力や報酬には影響しません。</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={savingTitle} onClick={() => onSelectTitle(null)} className={`rounded-xl px-3 py-2 text-xs font-black disabled:opacity-50 ${selectedTitle === null ? 'bg-violet-700 text-white' : 'bg-white text-slate-600 ring-1 ring-violet-200'}`}>称号なし{selectedTitle === null ? '（選択中）' : ''}</button>
        {unlockedTitles.map((title) => <button type="button" key={title.id} disabled={savingTitle} onClick={() => onSelectTitle(title.id)} className={`rounded-xl px-3 py-2 text-xs font-black disabled:opacity-50 ${selectedTitle?.id === title.id ? 'bg-violet-700 text-white' : 'bg-white text-violet-700 ring-1 ring-violet-200'}`}>{title.name}{selectedTitle?.id === title.id ? '（選択中）' : ''}</button>)}
      </div>
      {unlockedTitles.length === 0 && <p className="mt-3 text-xs font-bold text-slate-500">実績を達成すると称号が解放されます。</p>}
      {savingTitle && <p className="mt-3 text-xs font-black text-violet-700">保存中...</p>}
    </div>
  </section>;
}
