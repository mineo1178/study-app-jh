import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { buildFinishedTimerSession } from '../../src/data/activeTimerRepository.js';
import { confirmStudyTime } from '../../src/data/studyTimeReviewRepository.js';
import { applyStudySessionReward } from '../../src/data/rewardLedgerRepository.js';

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
