import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

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

  it('allows mutable RPG documents only within the fixed family and denies unknown collections', async () => {
    const db = userDb();
    for (const [collection, id] of [['rpg', 'playerProfile'], ['rpgProgress', 'current'], ['rpgQuestState', 'current'], ['rpgBattles', 'battle-1']]) {
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
});
