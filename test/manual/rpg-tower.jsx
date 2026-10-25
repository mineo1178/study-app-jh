import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import RpgHub from '../../src/components/rpg/RpgHub.jsx';

import { buildTowerEncounter } from '../../src/rpg/towerCatalog.js';
import { preparePartyTowerStart } from '../../src/data/rpgBattleRepository.js';
import { preparePartyBattleAction } from '../../src/rpg/partyBattleEngine.js';
import old from '../fixtures/rpg-v2.9.9-tower.json';
export default function Fixture() {
  const [floor,setFloor]=useState(80),[battle,setBattle]=useState(null),[candidate,setCandidate]=useState(null);
  const profile={...old.battles[1].profile,activeBattleId:battle?.status==='active'?battle.battleId:null};
  const start=()=>{setBattle(preparePartyTowerStart({profile,encounter:buildTowerEncounter({floor}),battleId:'ui-v5',now:1}).battle);setCandidate(null);};
  const act=(skillId,targetEnemyInstanceId,targetMemberId)=>setBattle(preparePartyBattleAction({battle,action:{skillId,targetEnemyInstanceId,targetMemberId,actionId:'ui'},now:2}).battle);
  return <main className="mx-auto max-w-6xl space-y-3 p-2"><p>v2.9.10 Tower fixture (no Firestore)</p><div className="flex flex-wrap gap-2">{[21,60,80,81,100].map(f=><button key={f} onClick={()=>{setFloor(f);setBattle(null);setCandidate(null);}}>{f}階</button>)}<button onClick={()=>setBattle(structuredClone(old.battles[1].battle))}>旧rules4再開</button><button onClick={()=>setBattle(null)}>一覧に戻る</button></div><RpgHub profile={profile} progress={{campaignCompleted:true,completedChapterIds:['chapter_1','chapter_2']}} towerProgress={{currentFloor:floor,highestFloor:floor-1}} battle={battle} battleCandidate={candidate} onStartBattleRequest={setCandidate} onConfirmBattleStart={start} onCancelBattleStart={()=>setCandidate(null)} onAttackBattle={target=>act(null,target)} onUseBattleSkill={act} onBattleBack={()=>setBattle(null)}/></main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
