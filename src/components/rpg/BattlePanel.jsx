import { ENEMY_CATALOG } from '../../rpg/enemyCatalog.js';
import BattleArena from './BattleArena.jsx';
import EnemyCard from './EnemyCard.jsx';
import VictoryResult from './VictoryResult.jsx';
export default function BattlePanel({ profile, battle, onStartRequest, onAttack, startingEnemyId, attacking }) { if (battle?.status === 'won') return <VictoryResult battle={battle}/>; if (battle?.status === 'active') return <BattleArena battle={battle} onAttack={onAttack} attacking={attacking}/>; return <section><p className="text-[10px] font-black tracking-widest text-rose-600">BATTLE</p><h2 className="text-xl font-black text-slate-800">敵を選ぶ</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Object.values(ENEMY_CATALOG).map((enemy) => <EnemyCard key={enemy.id} enemy={enemy} profile={profile} onStart={onStartRequest} starting={startingEnemyId === enemy.id}/>)}</div></section>; }
