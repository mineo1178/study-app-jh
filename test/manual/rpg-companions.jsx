import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import RpgHub from '../../src/components/rpg/RpgHub.jsx';
import { normalizePlayerProfile } from '../../src/rpg/playerProfile.js';
import { totalExpForLevel } from '../../src/rpg/levelSystem.js';
import { COMPANION_GROWTH_CATALOG } from '../../src/rpg/companionGrowthCatalog.js';
import { prepareCompanionGrowthAction } from '../../src/data/rpgCompanionGrowthRepository.js';
import { preparePartyTowerStart, prepareWeeklyBossStart } from '../../src/data/rpgBattleRepository.js';
import { getWeeklyBossDefinition } from '../../src/rpg/weeklyBossCatalog.js';
import { buildTowerEncounter } from '../../src/rpg/towerCatalog.js';
import { preparePartyBattleAction } from '../../src/rpg/partyBattleEngine.js';
export default function Fixture() {
  const [profile,setProfile] = useState(() => normalizePlayerProfile({ totalExp: totalExpForLevel(20), gold: 500, battleEnergy: 100, unlockedPartyMemberIds: ['hero',...Object.keys(COMPANION_GROWTH_CATALOG)] }));
  const [battle,setBattle] = useState(null), [candidate,setCandidate] = useState(null), [locked,setLocked] = useState(false);
  const safe = { ...profile, activeBattleId: locked ? 'remote-battle' : battle?.status === 'active' ? battle.battleId : null };
  const save = async request => { const change = prepareCompanionGrowthAction({ ...request, profile: safe, now: 1 }); setProfile(change.profile); return { applied: true, profile: change.profile }; };
  const start = () => { const change = candidate.isWeekly ? prepareWeeklyBossStart({profile:safe,boss:getWeeklyBossDefinition(candidate.weekId),battleId:'weekly',now:1}) : preparePartyTowerStart({profile:safe,encounter:buildTowerEncounter({floor:80}),battleId:'tower',now:1}); setBattle(change.battle); setCandidate(null); };
  const act = (skillId,targetEnemyInstanceId,targetMemberId) => setBattle(preparePartyBattleAction({battle,action:{skillId,targetEnemyInstanceId,targetMemberId,actionId:'fixture'},now:2}).battle);
  return <main className="mx-auto max-w-6xl space-y-3 p-2"><p>v2.9.11 UI fixture：Firestore未接続・本番データなし</p><button type="button" onClick={() => setLocked(!locked)} className="min-h-11 rounded-lg bg-slate-100 p-3">戦闘ロック切替</button><RpgHub profile={safe} progress={{campaignCompleted:true}} towerProgress={{currentFloor:80,highestFloor:79}} onSaveCompanionGrowth={save} onSaveParty={ids=>setProfile({...profile,partyMemberIds:ids})} battle={battle} battleCandidate={candidate} onStartBattleRequest={setCandidate} onConfirmBattleStart={start} onCancelBattleStart={()=>setCandidate(null)} onAttackBattle={target=>act(null,target)} onUseBattleSkill={act} onBattleBack={()=>setBattle(null)}/></main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
