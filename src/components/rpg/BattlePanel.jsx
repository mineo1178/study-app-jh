import { useEffect, useState } from 'react';
import { ENEMY_CATALOG } from '../../rpg/enemyCatalog.js';
import BattleArena from './BattleArena.jsx';
import EnemyCard from './EnemyCard.jsx';
import VictoryResult from './VictoryResult.jsx';
import DefeatResult from './DefeatResult.jsx';
import { getChapter } from '../../rpg/chapterCatalog.js';
import { getBoss } from '../../rpg/bossCatalog.js';
import { isBossUnlocked, normalizeRpgProgress } from '../../rpg/rpgProgress.js';
import { isTowerBossFloor, buildTowerEncounter } from '../../rpg/towerCatalog.js';
import { normalizeTowerProgress } from '../../rpg/towerProgress.js';
import PartyBattleArena from './PartyBattleArena.jsx';
import { ALCHEMY_ITEMS } from '../../rpg/gachaCatalog.js';
import { getNextWeeklyBossResetAt, getWeeklyBossDefinition, isWeeklyBossCleared } from '../../rpg/weeklyBossCatalog.js';

export default function BattlePanel({ profile, progress, towerProgress, battle, onStartRequest, onAttack, onSkill, startingEnemyId, attacking, onBack, feedback }) {
  const [weeklyClock, setWeeklyClock] = useState({ now: null, resetLabel: null });
  useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      const resetAt = getNextWeeklyBossResetAt(now);
      setWeeklyClock({ now, resetLabel: new Date(resetAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) });
    };
    refresh();
    const id = window.setInterval(refresh, 60000);
    return () => window.clearInterval(id);
  }, []);

  if (battle?.status === 'won') return <VictoryResult battle={battle} onBack={onBack}/>;
  if (battle?.status === 'lost') return <DefeatResult battle={battle} onBack={onBack}/>;
  if (battle?.status === 'active') return Number(battle.schemaVersion) >= 8 ? <PartyBattleArena battle={battle} onAttack={onAttack} onSkill={onSkill} attacking={attacking} feedback={feedback}/> : <BattleArena battle={battle} onAttack={onAttack} onSkill={onSkill} attacking={attacking} feedback={feedback}/>;

  const safe = normalizeRpgProgress(progress);
  const chapter = getChapter(safe.currentChapterId);
  const boss = getBoss(chapter.bossId);
  const unlocked = isBossUnlocked(safe, chapter);
  const remaining = Math.max(0, chapter.normalWinsRequired - safe.normalWins);
  const energy = Number(profile.battleEnergy) || 0;

  if (safe.campaignCompleted) {
    const tower = normalizeTowerProgress(towerProgress);
    const encounter = buildTowerEncounter({ floor: tower.currentFloor });
    const weekly = weeklyClock.now === null ? null : getWeeklyBossDefinition(weeklyClock.now);
    const cleared = weekly && isWeeklyBossCleared(profile, weekly.weekId);
    const towerStarting = startingEnemyId === 'tower';
    return <section className="rounded-2xl bg-emerald-50 p-6 font-black text-emerald-700">
      <p>CAMPAIGN CLEAR!</p><p className="mt-1 text-sm">Chapter 1・Chapter 2 をクリアしました</p><p className="mt-5 text-[10px] tracking-widest">END CONTENT</p>
      <div className="mt-2 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border-2 border-violet-300 bg-white p-5 text-slate-700">
          <h2 className="text-xl font-black">無限の塔</h2><p className="mt-2 text-sm">現在 {tower.currentFloor}F ・ 最高到達 {tower.highestFloor}F ・ ボス撃破 {tower.bossWins}回</p>
          <p className="mt-2 text-xs">{encounter.boss ? 'BOSS FLOOR' : 'NORMAL FLOOR'} ・ 敵 {encounter.enemies.length}体 ・ {encounter.enemies.map((enemy) => enemy.name).join(' / ')}</p><p className="mt-2 text-sm">Energy {encounter.energyCost} ・ EXP +{encounter.expReward}</p>
          <button type="button" disabled={energy < encounter.energyCost || towerStarting} onClick={() => onStartRequest?.({ id: 'tower', name: `無限の塔 ${tower.currentFloor}F`, energyCost: encounter.energyCost, isTower: true, isBoss: isTowerBossFloor(tower.currentFloor) })} className="mt-4 w-full rounded-xl bg-violet-600 py-3 text-sm font-black text-white disabled:bg-slate-300">{towerStarting ? '開始中…' : '無限の塔へ'}</button>
        </article>
        {weekly ? <article className="rounded-2xl border-2 border-amber-300 bg-white p-5 text-slate-700">
          <p className="text-[10px] tracking-widest text-amber-700">WEEKLY BOSS</p><p className="mt-1 text-sm">{weekly.weekId}</p><h2 className="text-xl font-black">{weekly.name}</h2><p className="mt-2 text-xs">属性：{weekly.element} / 弱点：{weekly.weaknesses.join('・')} / 耐性：{weekly.resistances.join('・')}</p><p className="mt-2 text-sm">HP {weekly.maxHp} ・ Attack {weekly.attack} ・ Energy {weekly.energyCost}</p>
          <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs"><b>今週の初回討伐報酬</b><p>EXP +{weekly.reward.expReward} / GOLDチケット ×{weekly.reward.goldTicket}</p><p>スターのかけら ×{weekly.reward.starFragments} / {ALCHEMY_ITEMS[weekly.reward.alchemyItemId]?.name} ×{weekly.reward.alchemyItemQuantity}</p></div><p className="mt-3 text-sm font-black">{cleared ? `今週は討伐済み / 次回更新 ${weeklyClock.resetLabel} JST` : '今週は未討伐'}</p>
          <button type="button" disabled={cleared || energy < weekly.energyCost || startingEnemyId === 'weekly'} onClick={() => onStartRequest?.({ id: 'weekly', name: weekly.name, energyCost: weekly.energyCost, isWeekly: true })} className="mt-4 w-full rounded-xl bg-amber-600 py-3 text-sm font-black text-white disabled:bg-slate-300">WEEKLY BOSSに挑戦</button>
        </article> : <article className="rounded-2xl bg-white p-5 text-slate-600">週間ボス情報を確認中…</article>}
      </div>
    </section>;
  }

  const progressPercent = Math.min(100, Math.round(safe.normalWins / chapter.normalWinsRequired * 100));
  const bossStarting = startingEnemyId === boss.id;
  return <section>
    <p className="text-[10px] font-black tracking-widest text-rose-600">CHAPTER {chapter.number}</p><h2 className="text-xl font-black text-slate-800">{chapter.name}</h2><p className="mt-2 text-sm font-bold text-slate-600">通常敵撃破 {safe.normalWins} / {chapter.normalWinsRequired}</p>
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-rose-500 transition-all" style={{ width: `${progressPercent}%` }}/></div><p className={`mt-2 text-xs font-black ${unlocked ? 'text-amber-600' : 'text-slate-500'}`}>{unlocked ? 'BOSS UNLOCKED' : `BOSS解放まであと ${remaining} 勝`}</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{chapter.normalEnemyIds.map((id) => <EnemyCard key={id} enemy={ENEMY_CATALOG[id]} profile={profile} onStart={onStartRequest} starting={startingEnemyId === id}/>)}</div>
    <article className="mt-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 text-slate-700"><p className="text-[10px] font-black tracking-widest text-amber-700">CHAPTER BOSS</p><h3 className="mt-1 text-lg font-black">{boss.name}</h3><p className="mt-2 text-sm">HP {boss.maxHp} ・ Attack {boss.attack} ・ Energy {boss.energyCost}</p><p className="mt-2 text-xs">初回クリア報酬：GOLD +{boss.firstClearReward.gold} / {Object.entries(boss.firstClearReward.materials).map(([id, quantity]) => `${id} ×${quantity}`).join(' ・ ')}</p><p className={`mt-2 text-xs font-bold ${energy >= boss.energyCost ? 'text-emerald-600' : 'text-rose-600'}`}>Battle Energy {energy} / 必要{boss.energyCost}{energy >= boss.energyCost ? '' : ' ・ Energyが足りません'}</p><button type="button" disabled={!unlocked || energy < boss.energyCost || bossStarting} onClick={() => onStartRequest?.({ ...boss, isBoss: true })} className="mt-4 w-full rounded-xl bg-amber-600 py-3 text-sm font-black text-white disabled:bg-slate-300">{bossStarting ? '開始中…' : unlocked ? 'BOSSに挑戦する' : `あと${remaining}勝で解放`}</button></article>
  </section>;
}
