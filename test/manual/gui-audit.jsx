import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/styles/jh-design-system.css';
import LearningDashboard from '../../src/components/study/LearningDashboard.jsx';
import WeeklyReport from '../../src/components/study/WeeklyReport.jsx';
import StudyAnalytics from '../../src/components/study/StudyAnalytics.jsx';
import MonthlyStudyCalendar from '../../src/components/study/MonthlyStudyCalendar.jsx';
import ManualReviewPanel from '../../src/components/review/ManualReviewPanel.jsx';
import HistoryCorrectionModal from '../../src/components/review/HistoryCorrectionModal.jsx';
import StudyTimeReviewModal from '../../src/components/review/StudyTimeReviewModal.jsx';
import RpgHub from '../../src/components/rpg/RpgHub.jsx';
import { deriveDashboardSummary } from '../../src/data/dashboardSelectors.js';
import { buildReviewQueue } from '../../src/review/manualReviewUi.js';
import { normalizePlayerProfile } from '../../src/rpg/playerProfile.js';
import { totalExpForLevel } from '../../src/rpg/levelSystem.js';
import { COMPANION_GROWTH_CATALOG } from '../../src/rpg/companionGrowthCatalog.js';
import { prepareCompanionGrowthAction } from '../../src/data/rpgCompanionGrowthRepository.js';
import { preparePartyTowerStart } from '../../src/data/rpgBattleRepository.js';
import { preparePartyBattleAction } from '../../src/rpg/partyBattleEngine.js';
import { buildTowerEncounter } from '../../src/rpg/towerCatalog.js';
import { SUBJECT_DEFS } from '../../src/subjectCatalog.js';

// DEV-only entry, never imported by App. No Firebase initialization or remote data.
if (!import.meta.env.DEV) throw new Error('Local fixture is development-only');
const now = Date.parse('2026-11-03T15:00:00+09:00');
const taskSnapshot = { categoryId:'school', subjectId:'s_math', title:'数学ワーク', activityType:'problem_solving', type:'homework' };
const sessions = [
  ...['2026-11-02','2026-11-03','2026-10-27','2026-10-28'].map((date,index)=>({id:'fixture-'+index,timerId:'fixture-'+index,date,recordedSeconds:2700,validation:{status:'valid'},taskSnapshot})),
  {id:'fixture-review',date:'2026-11-03',recordedSeconds:3900,validation:{status:'pending_review',reasonCodes:['long_session']},taskSnapshot},
  {id:'fixture-time',date:'2026-11-03',recordedSeconds:1800,validation:{status:'pending_review'},taskSnapshot,timeReview:{status:'pending',measuredSeconds:1800,reasons:['background_5_minutes'],originalSegments:[{startedAt:now-1800000,endedAt:now}]}}
];
const initialProfile = () => normalizePlayerProfile({totalExp:totalExpForLevel(20),gold:3000,battleEnergy:100,materials:{wood:20,stone:20,crystal:20},unlockedPartyMemberIds:['hero',...Object.keys(COMPANION_GROWTH_CATALOG)],studyGoals:{dailyTargetMinutes:120,weeklyStudyDays:5,subjectWeeklyTargets:{s_math:120},weeklyPlan:{tue:{s_math:60}}}});
export default function Fixture() {
  const [page,setPage]=useState('home'), [mode,setMode]=useState('ready'), [profile,setProfile]=useState(initialProfile);
  const [locked,setLocked]=useState(false), [reviewer,setReviewer]=useState(true), [fail,setFail]=useState(false);
  const [correction,setCorrection]=useState(null), [timeReview,setTimeReview]=useState(null), [error,setError]=useState(null);
  const [battle,setBattle]=useState(null), [candidate,setCandidate]=useState(null);
  const safe={...profile,activeBattleId:locked?'fixture-lock':battle?.status==='active'?battle.battleId:null};
  const rows=mode==='empty'?[]:sessions;
  const summary=deriveDashboardSummary({sessions:rows,now,ready:mode!=='loading',playerProfile:profile,rpgReady:true,gradesReady:true,grades:mode==='empty'?[]:[{name:'検証テスト',date:'2026-11-01',average:55}],rpgProgress:{currentChapterId:'chapter_1',campaignCompleted:true},towerProgress:{currentFloor:80,highestFloor:79},rewardProgress:{status:mode==='pending'?'blocked':'ready',goals:[]}});
  const navigate=next=>{setPage(next==='daily'?'home':next);window.scrollTo(0,0);};
  const saveGoals=async patch=>{if(fail)throw Error('fixture');setProfile({...profile,studyGoals:{...profile.studyGoals,...patch}});};
  const saveGrowth=async request=>{if(fail)throw Error('fixture');const change=prepareCompanionGrowthAction({...request,profile:safe,now});setProfile(change.profile);return {applied:true,profile:change.profile};};
  const unavailable=async()=>{throw Error('fixture: 保存エラー表示の確認');};
  const submitReview=()=>{setError(fail?'検証用の保存エラー。データは変更していません。':'ローカル検証のみ：本番への保存は行いません。');};
  const start=()=>{const change=preparePartyTowerStart({profile:safe,encounter:buildTowerEncounter({floor:80}),battleId:'fixture-tower',now});setBattle(change.battle);setCandidate(null);};
  const act=(skillId,targetEnemyInstanceId,targetMemberId)=>setBattle(preparePartyBattleAction({battle,action:{skillId,targetEnemyInstanceId,targetMemberId,actionId:'fixture-'+battle.turn},now}).battle);
  return <div className="jh-shell min-h-screen pb-8" style={{paddingLeft:0}}>
    <header className="space-y-3 border-b bg-amber-50 p-3 text-sm"><p>ローカルReact fixture / Firebase未初期化 / 実ユーザーデータなし / 統合E2Eではありません</p>
      <nav aria-label="fixture画面" className="flex flex-wrap gap-2">{[['home','ホーム'],['weekly-report','週間レポート'],['study-analytics','学習分析'],['monthly-calendar','月間カレンダー'],['rpg','RPG'],...(reviewer?[['review','履歴・確認']]:[])].map(([id,label])=><button type="button" key={id} className="min-h-11 rounded-lg bg-white px-3" aria-current={page===id?'page':undefined} onClick={()=>navigate(id)}>{label}</button>)}</nav>
      <div className="flex flex-wrap items-center gap-3"><label>表示状態 <select aria-label="表示状態" className="min-h-11" value={mode} onChange={e=>setMode(e.target.value)}>{[['ready','通常'],['empty','未登録'],['loading','読み込み中'],['pending','確認待ち']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label><input type="checkbox" checked={locked} onChange={e=>setLocked(e.target.checked)}/>戦闘ロック</label><label><input type="checkbox" checked={reviewer} onChange={e=>{setReviewer(e.target.checked);setPage('home');}}/>確認権限（fixture表示のみ）</label><label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/>保存エラー</label></div>
    </header>
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {page==='home'&&<LearningDashboard key={mode} summary={summary} studyGoals={profile.studyGoals} onSaveGoals={saveGoals} onNavigate={navigate}/>}
      {page==='study'&&<section id="study-items" className="jh-card"><h1>fixtureの学習項目移動先</h1><p>タイマー本体はlocalhostの実アプリのサンプルモードで別途確認します。</p><button type="button" className="jh-button" onClick={()=>navigate('home')}>ホームへ戻る</button></section>}
      {page==='weekly-report'&&<WeeklyReport sessions={rows} now={now} ready={mode!=='loading'} subjectDefinitions={SUBJECT_DEFS} studyGoals={profile.studyGoals} onSaveGoals={saveGoals} onBack={()=>navigate('home')}/>}
      {page==='study-analytics'&&<StudyAnalytics sessions={rows} now={now} ready={mode!=='loading'} subjectDefinitions={SUBJECT_DEFS} studyGoals={profile.studyGoals} onNavigate={navigate} onBack={()=>navigate('home')}/>}
      {page==='monthly-calendar'&&<MonthlyStudyCalendar sessions={rows} now={now} ready={mode!=='loading'} subjectDefinitions={SUBJECT_DEFS} studyGoals={profile.studyGoals} onBack={()=>navigate('home')}/>}
      {page==='rpg'&&<RpgHub profile={safe} progress={{campaignCompleted:true}} towerProgress={{currentFloor:80,highestFloor:79}} onSaveCompanionGrowth={saveGrowth} onSaveParty={ids=>setProfile({...profile,partyMemberIds:ids})} onSaveStatAllocation={unavailable} onSaveSkillPanel={unavailable} onChangeJob={unavailable} battle={battle} battleCandidate={candidate} onStartBattleRequest={setCandidate} onConfirmBattleStart={start} onCancelBattleStart={()=>setCandidate(null)} onAttackBattle={target=>act(null,target)} onUseBattleSkill={act} onBattleBack={()=>setBattle(null)} achievements={[]} unlockedTitles={[]} questState={{}} loadEncyclopediaLedgers={async()=>[]}/>}
      {page==='review'&&reviewer&&<ManualReviewPanel queue={buildReviewQueue({studySessions:rows})} studySessions={rows} profile={profile} subjectLabel={()=>'数学'} onOpenCorrection={s=>{setError(null);setCorrection(s);}} onOpenTimeReview={s=>{setError(null);setTimeReview(s);}}/>}
    </main>
    {correction&&<HistoryCorrectionModal session={correction} error={error} onClose={()=>setCorrection(null)} onSubmit={submitReview}/>}
    {timeReview&&<StudyTimeReviewModal session={timeReview} subjectLabel="数学" error={error} onClose={()=>setTimeReview(null)} onSubmit={submitReview}/>}
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
