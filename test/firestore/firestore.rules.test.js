import { correctStudySessionReward, retryPendingRewardCorrection } from '../../src/data/rewardCorrectionRepository.js';
import { calculateStudyReward } from '../../src/rpg/rewardCalculator.js';
import { changePlayerJob } from '../../src/data/rpgJobRepository.js';
import { JOB_CATALOG } from '../../src/rpg/jobCatalog.js';
import { buildTowerEncounter } from '../../src/rpg/towerCatalog.js';
import { saveStatAllocation } from '../../src/data/rpgStatAllocationRepository.js';
import { startBattle, useBattleSkill, preparePartyTowerStart } from '../../src/data/rpgBattleRepository.js';
import { totalExpForLevel } from '../../src/rpg/levelSystem.js';
import { purchaseResource } from '../../src/data/rpgShopRepository.js';
import { exchangeMaterial } from '../../src/data/rpgMaterialExchangeRepository.js';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { buildFinishedTimerSession, buildActiveTimer, startActiveTimer, finishActiveTimer } from '../../src/data/activeTimerRepository.js';
import { confirmStudyTime } from '../../src/data/studyTimeReviewRepository.js';
import { applyStudySessionReward, reverseStudySessionReward } from '../../src/data/rewardLedgerRepository.js';

const projectId = 'demo-study-app-jh';
const appFamilyId = 'oomine-study-2026';
const appPath = (familyId, collection, id) => ['families', familyId, 'apps', 'junior-high', collection, id];
const ref = (db, path) => doc(db, ...path);
let testEnv;
const userDb = (uid = 'app-user') => testEnv.authenticatedContext(uid).firestore();
const anonymousDb = () => testEnv.unauthenticatedContext().firestore();
const seedDoc = async (path, value = { value: 1 }) => testEnv.withSecurityRulesDisabled(async (context) => setDoc(ref(context.firestore(), path), value));

beforeAll(async () => { testEnv = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules', 'utf8') } }); });
beforeEach(async () => { await testEnv.clearFirestore(); });
afterAll(async () => { await testEnv.cleanup(); });

describe('Firestore Security Rules', () => {
  const seedTimeReview = async () => {
    const start = 1_000_000;
    const session = buildFinishedTimerSession({ timerId: 'review-timer', taskId: 'math', ownerClientId: 'owner', state: 'running', startedAt: start, segmentStartedAt: start, lastHeartbeatAt: start, segments: [] },
      { id: 'math', subjectId: 's_math', title: '数学', activityType: 'problem_solving' },
      { endAt: start + 900_000, idle: { lastUserActivityAt: start }, staleProof: null });
    await seedDoc(appPath(appFamilyId, 'studySessions', 'review-timer'), session);
    return session;
  };
  it('atomically confirms study time across real concurrent clients and awards a single reward', async () => {
    const session = await seedTimeReview();
    const db = userDb('device-a');
    expect(await applyStudySessionReward({ db, familyId: appFamilyId, session: { ...session, id: 'review-timer' } })).toMatchObject({ applied: false, reason: 'INELIGIBLE' });
    const args = { familyId: appFamilyId, sessionId: 'review-timer' };
    const results = await Promise.all([
      confirmStudyTime({ ...args, db, targetSeconds: 600, confirmedBy: 'device-a' }),
      confirmStudyTime({ ...args, db: userDb('device-b'), targetSeconds: 900, confirmedBy: 'device-b' }),
    ]);
    expect(results.filter((result) => !result.alreadyConfirmed)).toHaveLength(1);
    const confirmed = (await getDoc(ref(db, appPath(appFamilyId, 'studySessions', 'review-timer')))).data();
    const profile = (await getDoc(ref(db, appPath(appFamilyId, 'rpg', 'playerProfile')))).data();
    const ledger = (await getDoc(ref(db, appPath(appFamilyId, 'rewardLedger', 'review-timer')))).data();
    expect(confirmed.timeReview.status).toBe('confirmed');
    expect(profile.gold).toBe(Math.floor(confirmed.recordedSeconds / 60));
    expect(ledger.basis.recordedSeconds).toBe(confirmed.recordedSeconds);
    expect((await applyStudySessionReward({ db, familyId: appFamilyId, session: { ...confirmed, id: 'review-timer' } })).applied).toBe(false);
  });
  it('rejects an unauthenticated confirmation without changing pending time or awarding rewards', async () => {
    await seedTimeReview();
    await assertFails(confirmStudyTime({ db: anonymousDb(), familyId: appFamilyId, sessionId: 'review-timer', targetSeconds: 600, confirmedBy: 'unknown' }));
    const db = userDb();
    expect((await getDoc(ref(db, appPath(appFamilyId, 'studySessions', 'review-timer')))).data().timeReview.status).toBe('pending');
    expect((await getDoc(ref(db, appPath(appFamilyId, 'rewardLedger', 'review-timer')))).exists()).toBe(false);
  });
  it('allows authenticated users to use fixed-family tasks, tests, and timers while isolating other families', async () => {
    const db = userDb();
    for (const [collection, id] of [['tasks', 'task-1'], ['tests', 'test-1'], ['activeTimers', 'current']]) {
      const target = ref(db, appPath(appFamilyId, collection, id));
      await assertSucceeds(setDoc(target, { value: 1 })); await assertSucceeds(getDoc(target)); await assertSucceeds(updateDoc(target, { value: 2 })); await assertSucceeds(deleteDoc(target));
    }
    await assertFails(setDoc(ref(db, appPath('other-family', 'tasks', 'task-1')), { value: 1 }));
    await assertFails(getDoc(ref(db, appPath('other-family', 'tasks', 'task-1'))));
  });

  it('allows correction and reward operations for the fixed family but keeps their documents non-deletable', async () => {
    const db = userDb();
    for (const [collection, id] of [['studySessions', 'item'], ['rewardLedger', 'item'], ['rewardAdjustmentLedger', 'item'], ['rewardIntegrity', 'current']]) {
      const target = ref(db, appPath(appFamilyId, collection, id));
      await assertSucceeds(setDoc(target, { value: 1 })); await assertSucceeds(updateDoc(target, { value: 2 })); await assertFails(deleteDoc(target));
    }
    await assertFails(updateDoc(ref(userDb('other-user'), appPath('other-family', 'studySessions', 'item')), { value: 2 }));
  });

  it('keeps all RPG action ledgers immutable after authenticated fixed-family creation', async () => {
    const db = userDb();
    for (const collection of ['rpgQuestLedger', 'rpgActionLedger', 'rpgExchangeLedger', 'rpgBattleLedger']) {
      const ledger = ref(db, appPath(appFamilyId, collection, 'ledger-1'));
      await assertSucceeds(setDoc(ledger, { value: 1 })); await assertSucceeds(getDoc(ledger)); await assertFails(updateDoc(ledger, { value: 2 })); await assertFails(deleteDoc(ledger));
    }
  });

  it('allows authenticated fixed-family encyclopedia ledger queries and denies anonymous queries', async () => {
    await seedDoc(appPath(appFamilyId, 'rpgActionLedger', 'draw-1'), { type: 'gacha_draw' });
    await seedDoc(appPath(appFamilyId, 'rpgBattleLedger', 'start-1'), { type: 'battle_start' });
    const actionQuery = query(collection(userDb(), ...appPath(appFamilyId, 'rpgActionLedger', '').slice(0, -1)), where('type', 'in', ['gacha_draw', 'alchemy_craft']));
    const battleQuery = query(collection(userDb(), ...appPath(appFamilyId, 'rpgBattleLedger', '').slice(0, -1)), where('type', 'in', ['battle_start', 'weekly_boss_clear']));
    await assertSucceeds(getDocs(actionQuery)); await assertSucceeds(getDocs(battleQuery));
    const anonymousQuery = query(collection(anonymousDb(), ...appPath(appFamilyId, 'rpgActionLedger', '').slice(0, -1)), where('type', '==', 'gacha_draw'));
    await assertFails(getDocs(anonymousQuery));
  });

  it('allows mutable RPG documents only within the fixed family and denies unknown collections', async () => {
    const db = userDb();
    for (const [collection, id] of [['rpg', 'playerProfile'], ['rpgProgress', 'current'], ['rpgTowerProgress', 'current'], ['rpgQuestState', 'current'], ['rpgBattles', 'battle-1']]) {
      const target = ref(db, appPath(appFamilyId, collection, id));
      await assertSucceeds(setDoc(target, { value: 1 })); await assertSucceeds(updateDoc(target, { value: 2 })); await assertFails(deleteDoc(target));
    }
    await assertFails(setDoc(ref(db, appPath(appFamilyId, 'unknownCollection', 'item')), { value: 1 }));
  });

  it('denies unauthenticated access and member documents', async () => {
    const anonymous = anonymousDb();
    await assertFails(setDoc(ref(anonymous, appPath(appFamilyId, 'tasks', 'task-1')), { value: 1 }));
    await assertFails(getDoc(ref(anonymous, appPath(appFamilyId, 'rpgExchangeLedger', 'ledger-1'))));
    await seedDoc(['families', appFamilyId, 'members', 'app-user']);
    await assertFails(getDoc(ref(userDb(), ['families', appFamilyId, 'members', 'app-user'])));
  });

  it('applies fixed-family authentication and delete protection directly to Tower Progress', async () => {
    const towerPath = appPath(appFamilyId, 'rpgTowerProgress', 'current'); const fixed = ref(userDb(), towerPath);
    await assertSucceeds(setDoc(fixed, { value: 1 })); await assertSucceeds(getDoc(fixed)); await assertSucceeds(updateDoc(fixed, { value: 2 })); await assertFails(deleteDoc(fixed));
    const anonymous = ref(anonymousDb(), towerPath); await assertFails(getDoc(anonymous)); await assertFails(setDoc(anonymous, { value: 1 })); await assertFails(updateDoc(anonymous, { value: 2 }));
    const other = ref(userDb('other-user'), appPath('other-family', 'rpgTowerProgress', 'current')); await assertFails(getDoc(other)); await assertFails(setDoc(other, { value: 1 })); await assertFails(updateDoc(other, { value: 2 }));
  });
});

describe('v2.9.2 real Firestore commerce transactions', () => {
  it('deduplicates the same purchase action across two clients and keeps its ledger immutable', async () => {
    await seedDoc(appPath(appFamilyId, 'rpg', 'playerProfile'), { gold: 90, materials: { iron: 0 }, future: { keep: true } });
    const args = { familyId: appFamilyId, itemId: 'material_iron', actionId: 'same-buy' };
    const results = await Promise.all([purchaseResource({ ...args, db: userDb('device-a') }), purchaseResource({ ...args, db: userDb('device-b') })]);
    expect(results.map(result => result.applied).sort()).toEqual([false, true]);
    const profile = (await getDoc(ref(userDb(), appPath(appFamilyId, 'rpg', 'playerProfile')))).data();
    expect(profile).toMatchObject({ gold: 60, materials: { iron: 1 }, future: { keep: true } });
    const ledger = ref(userDb(), appPath(appFamilyId, 'rpgActionLedger', 'same-buy'));
    expect((await getDoc(ledger)).data()).toMatchObject({ type: 'resource_purchase', cost: { gold: 30 }, receive: { materials: { iron: 1 } } });
    await assertFails(updateDoc(ledger, { cost: { gold: 0 } }));
  });
  it('prevents distinct concurrent purchases from overspending while permitting funded repeats', async () => {
    const profileRef = ref(userDb(), appPath(appFamilyId, 'rpg', 'playerProfile'));
    await seedDoc(appPath(appFamilyId, 'rpg', 'playerProfile'), { gold: 30 });
    const args = { familyId: appFamilyId, itemId: 'material_iron' };
    const results = await Promise.allSettled([purchaseResource({ ...args, db: userDb('a'), actionId: 'first' }), purchaseResource({ ...args, db: userDb('b'), actionId: 'second' })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason.code).toBe('INSUFFICIENT_GOLD');
    expect((await getDoc(profileRef)).data()).toMatchObject({ gold: 0, materials: { iron: 1 } });
    await updateDoc(profileRef, { gold: 60 });
    await Promise.all([purchaseResource({ ...args, db: userDb('a'), actionId: 'third' }), purchaseResource({ ...args, db: userDb('b'), actionId: 'fourth' })]);
    expect((await getDoc(profileRef)).data()).toMatchObject({ gold: 0, materials: { iron: 3 } });
  });
  it('atomically exchanges materials for GOLD and alchemy items without duplicate consumption', async () => {
    await seedDoc(appPath(appFamilyId, 'rpg', 'playerProfile'), { gold: 0, materials: { iron: 9, mineral: 6 }, gacha: { alchemyItems: { dragon_scale: 1 } } });
    const args = { familyId: appFamilyId, recipeId: 'gold_iron', actionId: 'same-trade' };
    const results = await Promise.all([exchangeMaterial({ ...args, db: userDb('a') }), exchangeMaterial({ ...args, db: userDb('b') })]);
    expect(results.map(result=>result.applied).sort()).toEqual([false,true]);
    await exchangeMaterial({ db: userDb(), familyId: appFamilyId, recipeId: 'trade_silver_ore', actionId: 'silver' });
    expect((await getDoc(ref(userDb(), appPath(appFamilyId, 'rpg', 'playerProfile')))).data()).toMatchObject({ gold: 15, materials: { iron: 0, mineral: 0 }, gacha: { alchemyItems: { silver_ore: 1, dragon_scale: 1 } } });
    expect((await getDoc(ref(userDb(), appPath(appFamilyId, 'rpgExchangeLedger', 'silver')))).data()).toMatchObject({ cost: { materials: { iron: 6, mineral: 6 } }, receive: { alchemyItems: { silver_ore: 1 } } });
  });
  it('blocks commerce during pending correction and rejects anonymous access without writes', async () => {
    await seedDoc(appPath(appFamilyId, 'rpg', 'playerProfile'), { gold: 90, materials: { iron: 6 } });
    await seedDoc(appPath(appFamilyId, 'rewardIntegrity', 'current'), { pendingSessionIds: ['pending'] });
    await expect(purchaseResource({ db: userDb(), familyId: appFamilyId, itemId: 'material_iron', actionId: 'blocked' })).rejects.toThrow('REWARD_CORRECTION_PENDING');
    await expect(exchangeMaterial({ db: userDb(), familyId: appFamilyId, recipeId: 'gold_iron', actionId: 'blocked' })).rejects.toThrow('REWARD_CORRECTION_PENDING');
    await assertFails(purchaseResource({ db: anonymousDb(), familyId: appFamilyId, itemId: 'material_iron', actionId: 'anonymous' }));
    expect((await getDoc(ref(userDb(), appPath(appFamilyId, 'rpg', 'playerProfile')))).data()).toMatchObject({ gold: 90, materials: { iron: 6 } });
    expect((await getDoc(ref(userDb(), appPath(appFamilyId, 'rpgActionLedger', 'blocked')))).exists()).toBe(false);
  });
});

// Real emulator transactions: no mocks, includes contention/retry against the shared profile.
describe('stat allocation emulator transactions', () => {
  const profilePath = appPath(appFamilyId, 'rpg', 'playerProfile');
  const base = () => ({ gold: 300, totalExp: totalExpForLevel(10), battleEnergy: 30, statAllocation: { hp: 6, mp: 3 }, custom: { retained: true } });
  const request = p => ({ familyId: appFamilyId, allocation: { hp: 3, mp: 6 }, expected: { ...p.statAllocation, totalExp: p.totalExp, gold: p.gold } });
  it('deduplicates simultaneous paid allocation across devices and preserves unrelated profile fields', async () => {
    const p = base(); await seedDoc(profilePath, p);
    const results = await Promise.all(['a','b'].map(uid => saveStatAllocation({ ...request(p), db: userDb(uid), actionId: 'same-stat-action' })));
    expect(results.filter(result => result.applied)).toHaveLength(1);
    const saved = (await getDoc(ref(userDb(), profilePath))).data();
    expect(saved).toMatchObject({ gold: 180, statAllocation: { hp: 3, mp: 6 }, custom: p.custom });
    expect((await getDoc(ref(userDb(), appPath(appFamilyId, 'rpgActionLedger', 'same-stat-action')))).data()).toMatchObject({ cost: { gold: 120 }, before: p.statAllocation });
  });
  it('accepts only one competing allocation with different IDs against the same baseline', async () => {
    const p = base(); await seedDoc(profilePath, p);
    const results = await Promise.allSettled(['a','b'].map((uid,index) => saveStatAllocation({ ...request(p), allocation: { hp: index + 1, mp: 8 - index }, db: userDb(uid), actionId: 'competing-' + uid })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason.code).toBe('STAT_PROFILE_CHANGED');
    expect((await getDoc(ref(userDb(), profilePath))).data().gold).toBe(180);
  });
  it('serializes allocation and battle start; the snapshot uses either complete old or complete new stats', async () => {
    const p = base(); await seedDoc(profilePath, p);
    const results = await Promise.allSettled([
      saveStatAllocation({ ...request(p), db: userDb('a'), actionId: 'race-stat' }),
      startBattle({ db: userDb('b'), familyId: appFamilyId, enemyId: 'slime', battleId: 'race-battle' }),
    ]);
    expect(results[1].status).toBe('fulfilled');
    const saved = (await getDoc(ref(userDb(), profilePath))).data();
    const battle = (await getDoc(ref(userDb(), appPath(appFamilyId, 'rpgBattles', 'race-battle')))).data();
    expect(saved.activeBattleId).toBe('race-battle');
    expect(battle.playerSnapshot.maxHp).toBe(40 + saved.statAllocation.hp * 3);
    expect(battle.playerSnapshot.maxMp).toBe(8 + saved.statAllocation.mp * 2);
    expect(saved.gold).toBe(results[0].status === 'fulfilled' ? 180 : 300);
    if (results[0].status === 'rejected') expect(results[0].reason.code).toBe('STAT_CHANGE_DURING_BATTLE');
  });
  it('consumes MP only once for simultaneous identical battle actions', async () => {
    await seedDoc(profilePath, base());
    const args = { db: userDb('a'), familyId: appFamilyId, battleId: 'mp-replay' };
    await startBattle({ ...args, enemyId: 'slime' });
    const action = { ...args, actionId: 'same-skill', skillId: 'guard_stance' };
    const results = await Promise.all([useBattleSkill(action), useBattleSkill({ ...action, db: userDb('b') })]);
    expect(results.filter(result => result.applied)).toHaveLength(1);
    const battle = (await getDoc(ref(userDb(), appPath(appFamilyId, 'rpgBattles', 'mp-replay')))).data();
    expect(battle.playerMp).toBe(12); expect(battle.skillUses.guard_stance).toBe(1);
  });
  it('blocks correction, insufficient gold, unauthenticated writes and mid-battle changes atomically', async () => {
    const p = base(); await seedDoc(profilePath, p);
    const args = { ...request(p), db: userDb(), actionId: 'rejected' };
    await seedDoc(appPath(appFamilyId, 'rewardIntegrity', 'current'), { pendingSessionIds: ['pending'] });
    await expect(saveStatAllocation(args)).rejects.toThrow('REWARD_CORRECTION_PENDING');
    await seedDoc(appPath(appFamilyId, 'rewardIntegrity', 'current'), {});
    await assertFails(saveStatAllocation({ ...args, db: anonymousDb() }));
    for (const patch of [{ gold: 119 }, { activeBattleId: 'another-device' }]) {
      const latest = { ...p, ...patch }; await seedDoc(profilePath, latest);
      await expect(saveStatAllocation({ ...args, expected: request(latest).expected })).rejects.toThrow(patch.gold ? 'INSUFFICIENT_GOLD' : 'STAT_CHANGE_DURING_BATTLE');
      expect((await getDoc(ref(userDb(), profilePath))).data()).toEqual(latest);
    }
    expect((await getDoc(ref(userDb(), appPath(appFamilyId, 'rpgActionLedger', 'rejected')))).exists()).toBe(false);
  });
});

describe('skill rules v2 emulator transactions', () => {
  it('repeats an ally spell beyond two uses and spends MP once under replay across devices', async () => {
    const profilePath = appPath(appFamilyId, 'rpg', 'playerProfile');
    const change = preparePartyTowerStart({ profile: { totalExp: totalExpForLevel(12), battleEnergy: 30 }, encounter: buildTowerEncounter({floor:10}), battleId:'ally-mp', now:1 });
    const initial = { ...change.battle, activePartyMemberId:'mage', enemyStates:change.battle.enemyStates.map(state=>({...state,hp:10000})), partyStates:change.battle.partyStates.map(state=>({...state,hp:10000})), skillUses:{'mage:firestorm':2} };
    await seedDoc(profilePath, change.profile); await seedDoc(appPath(appFamilyId,'rpgBattles','ally-mp'),initial);
    const args={db:userDb('a'),familyId:appFamilyId,battleId:'ally-mp',actionId:'third-spell',skillId:'firestorm'};
    const results=await Promise.all([useBattleSkill(args),useBattleSkill({...args,db:userDb('b')})]);
    expect(results.filter(result=>result.applied)).toHaveLength(1);
    const saved=(await getDoc(ref(userDb(),appPath(appFamilyId,'rpgBattles','ally-mp')))).data();
    expect(saved.memberMp).toEqual({guardian:8,mage:8}); expect(saved.playerMp).toBe(8); expect(saved.skillUses['mage:firestorm']).toBe(3);
    expect(saved.activePartyMemberId).toBe('hero'); expect(saved.partySnapshot).toEqual(initial.partySnapshot);
    const ledger=(await getDoc(ref(userDb(),appPath(appFamilyId,'rpgBattleLedger','third-spell')))).data(); expect(ledger.action.mp).toEqual({before:12,after:8,cost:4});
  });
});

describe('job change emulator transactions',()=>{
  const profilePath=appPath(appFamilyId,'rpg','playerProfile');
  const base=()=>({totalExp:totalExpForLevel(12),gold:300,battleEnergy:30,statAllocation:{hp:5,mp:6},ownedEquipment:{iron_sword:true},equipped:{weapon:'iron_sword'},custom:{keep:1}});
  it.each(Object.keys(JOB_CATALOG))('persists %s across clients without resetting other profile data',async jobId=>{
    const before={...base(),jobId:jobId==='adventurer'?'warrior':'adventurer'};await seedDoc(profilePath,before);
    const args={db:userDb('a'),familyId:appFamilyId,actionId:'job-'+jobId,jobId,expected:{jobId:before.jobId,revision:0}};
    const results=await Promise.all([changePlayerJob(args),changePlayerJob({...args,db:userDb('b')})]);expect(results.filter(result=>result.applied)).toHaveLength(1);
    const saved=(await getDoc(ref(userDb('c'),profilePath))).data();expect(saved).toMatchObject({...before,jobId,jobRevision:1});
  });
  it('rejects concurrent stale job changes and battle-time or invalid changes',async()=>{
    await seedDoc(profilePath,base());const args={db:userDb('a'),familyId:appFamilyId,expected:{jobId:'adventurer',revision:0}};
    const results=await Promise.allSettled([changePlayerJob({...args,jobId:'mage',actionId:'job-mage'}),changePlayerJob({...args,db:userDb('b'),jobId:'knight',actionId:'job-knight'})]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect(results.find(result=>result.status==='rejected').reason.code).toBe('JOB_PROFILE_CHANGED');
    await expect(changePlayerJob({...args,jobId:'bogus',actionId:'bad'})).rejects.toThrow('INVALID_JOB_ID');
    await seedDoc(profilePath,{...base(),activeBattleId:'existing'});await expect(changePlayerJob({...args,jobId:'mage',actionId:'blocked'})).rejects.toThrow('JOB_CHANGE_DURING_BATTLE');
  });
  it('serializes job changes with battle start and freezes the committed job',async()=>{
    await seedDoc(profilePath,base());
    const results=await Promise.allSettled([changePlayerJob({db:userDb('a'),familyId:appFamilyId,jobId:'mage',expected:{jobId:'adventurer',revision:0},actionId:'race-job'}),startBattle({db:userDb('b'),familyId:appFamilyId,enemyId:'slime',battleId:'job-start'})]);
    expect(results[1].status).toBe('fulfilled');const saved=(await getDoc(ref(userDb(),profilePath))).data();const battle=(await getDoc(ref(userDb(),appPath(appFamilyId,'rpgBattles','job-start')))).data();
    expect(battle.playerSnapshot.jobId).toBe(saved.jobId||'adventurer');expect(saved.activeBattleId).toBe('job-start');
    if(results[0].status==='rejected')expect(results[0].reason.code).toBe('JOB_CHANGE_DURING_BATTLE');
  });
});

describe.each([['rpg-reward-v1',1],['rpg-reward-v2',100]])('versioned reward real transactions %s',(policy,rate)=>{
  const profilePath=appPath(appFamilyId,'rpg','playerProfile');
  const task={id:'math',subjectId:'s_math',activityType:'problem_solving'};
  const makeSession=(seconds,id='reward-policy')=>buildFinishedTimerSession({...buildActiveTimer({task,timerId:id,ownerClientId:'a',now:1000000}),rewardPolicyVersion:policy},task,{endAt:1000000+seconds*1000,staleProof:null});
  const seedSession=async(seconds=3600,id='reward-policy')=>{const session=makeSession(seconds,id);await seedDoc(appPath(appFamilyId,'studySessions',id),session);return {...session,id};};
  it('handles every duration boundary under concurrent clients and preserves the canonical policy and profile',async()=>{
    const original={gold:123,battleEnergy:5,materials:{iron:3},totalExp:1100,jobId:'knight',equipped:{weapon:'iron_sword'},ownedEquipment:{iron_sword:true},statAllocation:{hp:2,mp:1},custom:{keep:true}};await seedDoc(profilePath,original);
    let sum=0;
    for(const seconds of [59,60,90,120,600,1800,3600]) {
      const id='seconds-'+seconds,session=await seedSession(seconds,id),args={familyId:appFamilyId,session:{...session,rewardPolicyVersion:'caller-untrusted',recordedSeconds:999999}};
      const results=await Promise.all([applyStudySessionReward({...args,db:userDb('a')}),applyStudySessionReward({...args,db:userDb('b')})]);expect(results.filter(result=>result.applied)).toHaveLength(1);
      const entry=(await getDoc(ref(userDb(),appPath(appFamilyId,'rewardLedger',id)))).data();expect(entry.rewardPolicyVersion).toBe(policy);expect(entry.rewards).toEqual(calculateStudyReward(session));sum+=entry.rewards.gold;
    }
    const saved=(await getDoc(ref(userDb('c'),profilePath))).data();expect(saved).toMatchObject({...original,gold:123+sum,battleEnergy:11,materials:{iron:13}});expect(sum).toBe(104*rate);
  }, 30000);
  it('corrects once, keeps the original ledger, then reverses only the remaining grant once across clients',async()=>{
    const session=await seedSession(),args={db:userDb('a'),familyId:appFamilyId,session};await applyStudySessionReward(args);
    const request={familyId:appFamilyId,sessionId:session.id,correction:{correctionId:'shorten',recordedSeconds:1200,validation:{status:'valid'}},reviewerUid:'reviewer'};
    const results=await Promise.all([correctStudySessionReward({...request,db:userDb('a')}),correctStudySessionReward({...request,db:userDb('b')})]);expect(results.filter(result=>result.applied)).toHaveLength(1);
    const entry=(await getDoc(ref(userDb(),appPath(appFamilyId,'rewardLedger',session.id)))).data();expect(entry.rewards.gold).toBe(60*rate);expect(entry.effectiveRewards.gold).toBe(20*rate);
    const reverse={familyId:appFamilyId,sessionId:session.id};const reversed=await Promise.all([reverseStudySessionReward({...reverse,db:userDb('a')}),reverseStudySessionReward({...reverse,db:userDb('b')})]);expect(reversed.filter(result=>result.reversed)).toHaveLength(1);
    const saved=(await getDoc(ref(userDb(),profilePath))).data();expect(saved.gold).toBe(0);expect(saved.battleEnergy).toBe(0);expect(saved.materials.iron).toBe(0);
    expect((await getDoc(ref(userDb(),appPath(appFamilyId,'rewardLedger',session.id)))).data().rewards.gold).toBe(60*rate);
    expect((await applyStudySessionReward(args)).applied).toBe(false);
  });
  it('keeps insufficient correction pending and retries its stored deduction once under contention',async()=>{
    const session=await seedSession();await applyStudySessionReward({db:userDb(),familyId:appFamilyId,session});await updateDoc(ref(userDb(),profilePath),{gold:0});
    const args={db:userDb(),familyId:appFamilyId,sessionId:session.id,reviewerUid:'reviewer'};
    const change=await correctStudySessionReward({...args,correction:{correctionId:'pending',recordedSeconds:1200,validation:{status:'valid'}}});expect(change.status).toBe('pending');
    expect((await retryPendingRewardCorrection(args)).applied).toBe(false);await expect(reverseStudySessionReward(args)).rejects.toThrow('REWARD_CORRECTION_PENDING');
    await updateDoc(ref(userDb(),profilePath),{gold:40*rate});const results=await Promise.all([retryPendingRewardCorrection(args),retryPendingRewardCorrection({...args,db:userDb('b')})]);expect(results.filter(result=>result.applied)).toHaveLength(1);
    const entry=(await getDoc(ref(userDb(),appPath(appFamilyId,'rewardLedger',session.id)))).data();expect(entry.rewards.gold).toBe(60*rate);expect(entry.effectiveRewards.gold).toBe(20*rate);expect(entry.pendingCorrection).toBeNull();
    expect((await getDoc(ref(userDb(),profilePath))).data().gold).toBe(0);
  });
  it('retains saved policy through deferred time confirmation and rejects pending/invalid awards',async()=>{
    const timer={...buildActiveTimer({task,timerId:'deferred',ownerClientId:'a',now:1000000}),rewardPolicyVersion:policy};
    const session={...buildFinishedTimerSession(timer,task,{endAt:1900000,staleProof:null,idle:{lastUserActivityAt:1000000}}),id:'deferred'};
    await seedDoc(appPath(appFamilyId,'studySessions','deferred'),session);
    expect((await applyStudySessionReward({db:userDb(),familyId:appFamilyId,session})).applied).toBe(false);
    const confirmed=await confirmStudyTime({db:userDb(),familyId:appFamilyId,sessionId:'deferred',targetSeconds:600,confirmedBy:'a'});expect(confirmed.rewards.gold).toBe(10*rate);
    const entry=(await getDoc(ref(userDb(),appPath(appFamilyId,'rewardLedger','deferred')))).data();expect(entry.rewardPolicyVersion).toBe(policy);
    await seedDoc(appPath(appFamilyId,'studySessions','invalid'),{...makeSession(600,'invalid'),validation:{status:'invalid'}});
    expect((await applyStudySessionReward({db:userDb(),familyId:appFamilyId,session:{id:'invalid'}})).applied).toBe(false);
  });
});
describe('reward policy start/finish rollover transaction',()=>{
  it('captures new policy at START while completing an old missing-policy timer at the old rate',async()=>{
    const task={id:'math',subjectId:'s_math',activityType:'problem_solving'},args={db:userDb(),familyId:appFamilyId,task,ownerClientId:'a',now:1000000};
    const timer=await startActiveTimer({...args,timerId:'new-rate'});expect(timer.rewardPolicyVersion).toBe('rpg-reward-v2');
    const result=await finishActiveTimer({...args,timerId:'new-rate',endAt:2800000,staleProof:null});expect(result.session.recordedSeconds).toBe(1800);expect(result.session.rewardPolicyVersion).toBe('rpg-reward-v2');
    const grant=await applyStudySessionReward({...args,session:{...result.session,id:'new-rate'}});expect(grant.rewards.gold).toBe(3000);
    const old={...timer,timerId:'old-rate'};delete old.rewardPolicyVersion;await seedDoc(appPath(appFamilyId,'activeTimers','current'),old);
    const finished=await finishActiveTimer({...args,timerId:'old-rate',endAt:2800000,staleProof:null});expect(finished.session.rewardPolicyVersion).toBe('rpg-reward-v1');
    expect((await applyStudySessionReward({...args,session:{...finished.session,id:'old-rate'}})).rewards.gold).toBe(30);
  });
});
