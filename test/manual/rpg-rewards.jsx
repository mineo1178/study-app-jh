import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { buildActiveTimer, buildFinishedTimerSession } from '../../src/data/activeTimerRepository.js';
import { applyRewardToPlayerProfile, prepareCanonicalStudySessionReward } from '../../src/data/rewardLedgerRepository.js';
import { normalizePlayerProfile } from '../../src/rpg/playerProfile.js';
import { deriveRewardProgress } from '../../src/rpg/rewardProgress.js';
import RewardResultModal from '../../src/components/rpg/RewardResultModal.jsx';
import RewardProgressCard from '../../src/components/study/RewardProgressCard.jsx';
import RpgWalletPanel from '../../src/components/rpg/RpgWalletPanel.jsx';
import StudyRewardHistory from '../../src/components/study/StudyRewardHistory.jsx';
const old = { id:'old',recordedSeconds:1800,rewardPolicyVersion:'rpg-reward-v1',validation:{status:'valid'},rewards:{gold:30,battleEnergy:2,material:{key:'iron',quantity:3}},status:'applied' };
export default function Fixture() {
  const [profile,setProfile]=useState(()=>normalizePlayerProfile({gold:30,battleEnergy:2,materials:{iron:3}}));
  const [timer,setTimer]=useState(null),[seconds,setSeconds]=useState(1800),[result,setResult]=useState(null),[history,setHistory]=useState([old]);
  const start = legacy => {const value=buildActiveTimer({task:{id:'math'},timerId:'fixture-'+history.length,ownerClientId:'fixture',now:1000000}); if(legacy) delete value.rewardPolicyVersion;setTimer(value);};
  const finish=()=>{const session=buildFinishedTimerSession(timer,{id:'math',subjectId:'s_math',title:'数学',activityType:'problem_solving'},{endAt:timer.startedAt+seconds*1000,staleProof:null});const prepared=prepareCanonicalStudySessionReward(session);const rewards=prepared.rewards;setHistory(value=>[...value,{...session,id:timer.timerId,status:'applied',rewards}]);if(prepared.eligible)setProfile(value=>applyRewardToPlayerProfile(value,rewards,1));setResult({...session,rewards});setTimer(null);};
  return <main className="mx-auto max-w-3xl space-y-4 p-4"><p className="rounded-xl bg-amber-50 p-3 text-xs">画面検証fixture：Firestore接続なし。時間は選択値で模擬、実時間の計測なし。</p><h1 className="text-xl font-black">学習GOLD報酬</h1><RpgWalletPanel profile={profile}/><RewardProgressCard progress={deriveRewardProgress(profile)}/><section className="space-y-3 rounded-xl bg-white p-4"><label>記録時間<select aria-label="記録時間" value={seconds} onChange={event=>setSeconds(Number(event.target.value))} className="m-2 border p-2">{[59,60,90,120,600,1800,3600].map(value=><option key={value} value={value}>{value}秒</option>)}</select></label><div className="flex flex-wrap gap-3"><button className="rounded-xl bg-blue-100 p-3" disabled={!!timer} onClick={()=>start(false)}>学習開始</button><button className="rounded-xl bg-slate-100 p-3" disabled={!!timer} onClick={()=>start(true)}>旧v1学習を再開</button><button className="rounded-xl bg-emerald-100 p-3" disabled={!timer} onClick={finish}>学習完了</button></div>{timer&&<p role="status">計測中：{timer.rewardPolicyVersion==='rpg-reward-v2'?'新ルール 1分100G':'旧ルール 1分1G'}（模擬）</p>}</section><section className="space-y-3"><h2 className="font-black">過去の学習履歴</h2>{history.map(entry=><article className="rounded-xl border p-3" key={entry.id}><p>{entry.id==='old'?'公開前の学習記録':'今回の学習記録'}：{entry.recordedSeconds}秒</p><StudyRewardHistory sessionId={entry.id} loadLedger={async id=>history.find(row=>row.id===id)}/></article>)}</section><RewardResultModal result={result} profile={profile} onClose={()=>setResult(null)}/></main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
