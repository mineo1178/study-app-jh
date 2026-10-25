import { prepareSkillPanelAction } from '../../src/data/rpgSkillPanelRepository.js';
import oldBattles from '../fixtures/rpg-v2.9.6-battles.json';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import RpgHub from '../../src/components/rpg/RpgHub.jsx';
import { normalizePlayerProfile } from '../../src/rpg/playerProfile.js';
import { totalExpForLevel } from '../../src/rpg/levelSystem.js';
import { prepareJobChange } from '../../src/data/rpgJobRepository.js';
import { prepareStatAllocation } from '../../src/data/rpgStatAllocationRepository.js';
import { prepareBattleStart, prepareBattleAttack, preparePartyTowerStart, prepareWeeklyBossStart } from '../../src/data/rpgBattleRepository.js';
import { preparePartyBattleAction } from '../../src/rpg/partyBattleEngine.js';
import { buildTowerEncounter } from '../../src/rpg/towerCatalog.js';
import { getWeeklyBossDefinition } from '../../src/rpg/weeklyBossCatalog.js';
import { ENEMY_CATALOG } from '../../src/rpg/enemyCatalog.js';
const initial = () => normalizePlayerProfile({ gold: 3000, totalExp: totalExpForLevel(10), battleEnergy: 30, statAllocation: { hp: 3, mp: 2 } });
export default function Fixture() {
  const [profile, setProfile] = useState(() => { try { return { ...initial(), ...JSON.parse(sessionStorage.getItem('rpg-job-fixture') || '{}') }; } catch { return initial(); } });
  useEffect(() => { if (!profile.activeBattleId) sessionStorage.setItem('rpg-job-fixture', JSON.stringify(profile)); }, [profile]);
  const [uid, setUid] = useState('a');
  const [fail, setFail] = useState(false);
  const [battle, setBattle] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [count, setCount] = useState(0);
  const [pending, setPending] = useState(false);
  const save = async request => {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (fail) throw Error('NETWORK_FAILURE');
    const change = prepareStatAllocation({ profile, ...request, now: 1 });
    setProfile(change.profile); setCount(value => value + 1); return { ...change, applied: true };
  };
  const start = (mode, legacy = false) => {
    const args = { profile: { ...profile, ...(legacy ? { jobId: 'adventurer' } : {}), activeBattleId: null }, battleId: mode, now: 1 };
    const change = legacy ? structuredClone(oldBattles[['campaign','tower','weekly'].indexOf(mode)]) : mode === 'campaign' ? prepareBattleStart({ ...args, enemy: ENEMY_CATALOG.slime }) : mode === 'tower' ? preparePartyTowerStart({ ...args, encounter: buildTowerEncounter({ floor: 10 }) }) : prepareWeeklyBossStart({ ...args, boss: getWeeklyBossDefinition('2026-W01') });
    setProfile(change.profile); setBattle(change.battle); setCandidate(null);
  };
  const act = async (skillId, targetEnemyInstanceId, targetMemberId) => {
    setPending(true);
    try {
      const action = { actionId: 'fixture', skillId, targetEnemyInstanceId, targetMemberId };
      const next = battle.partySnapshot ? preparePartyBattleAction({ battle, action, now: 2 }).battle : prepareBattleAttack({ battle, profile, actionId: 'fixture', now: 2, ...(skillId ? { action: { kind: 'skill', damage: 1, skill: { ...battle.playerSnapshot.skills[skillId], useNumber: (battle.skillUses[skillId] || 0) + 1 } } } : {}) }).battle;
      setBattle(next);
    } finally { setPending(false); }
  };
  return <main className="mx-auto max-w-6xl space-y-4 p-3 sm:p-6"><div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs"><p>画面検証専用：Firestore接続なし ／ 確定回数 {count} ／ UID {uid}</p>
    <button onClick={() => { setProfile(initial()); setBattle(null); setUid(value => value + 'a'); }}>リセット</button><button onClick={() => setProfile(value => ({ ...value, gold: 0 }))}>GOLD不足</button><button onClick={() => { setUid(value => value === 'a' ? 'b' : 'a'); setProfile(initial()); setBattle(null); }}>UID切替</button><button onClick={() => setProfile(value => ({ ...value, totalExp: totalExpForLevel(1), statAllocation: { hp: 0, mp: 0 } }))}>Lv1</button><button onClick={() => setProfile(value => ({ ...value, gold: value.gold + 1 }))}>他端末更新</button><button onClick={() => setProfile(value => ({ ...value, totalExp: totalExpForLevel(12) }))}>Lv12</button><button onClick={() => setProfile(value => ({ ...value, totalExp: totalExpForLevel(20) }))}>Lv20</button>
    <label><input type="checkbox" checked={fail} onChange={event => setFail(event.target.checked)}/>保存失敗</label>
    {['campaign','tower','weekly'].flatMap(mode => [false,true].map(legacy => <button key={mode + legacy} onClick={() => start(mode, legacy)}>{mode} {legacy ? '旧' : '新'}</button>))}
    </div><RpgHub key={uid} profile={profile} progress={{ campaignCompleted: true, completedChapterIds: ['chapter_1','chapter_2'] }} towerProgress={{ currentFloor: 10, highestFloor: 10 }} battle={battle} onSaveSkillPanel={async request => { await new Promise(resolve => setTimeout(resolve,300)); if(fail) throw Error('NETWORK_FAILURE'); const change=prepareSkillPanelAction({profile,progress:{campaignCompleted:true,completedChapterIds:['chapter_1','chapter_2']},towerProgress:{highestFloor:10},...request,now:1});setProfile(change.profile);return {applied:true,...change}; }} onChangeJob={async request => { await new Promise(resolve => setTimeout(resolve, 300)); const change = prepareJobChange({ profile, ...request, now: 1 }); setProfile(change.profile); return { applied: true, ...change }; }} onSaveStatAllocation={save} onAttackBattle={target => act(null, target)} onUseBattleSkill={act} attacking={pending} onBattleBack={() => { setBattle(null); setProfile(value => ({ ...value, activeBattleId: null })); }} onStartBattleRequest={setCandidate} battleCandidate={candidate} onCancelBattleStart={() => setCandidate(null)} onConfirmBattleStart={() => start('campaign')}/></main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
