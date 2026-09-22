import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'demo-study-app-jh';
const familyPath = (familyId, ...parts) => ['families', familyId, ...parts];
const appPath = (familyId, collection, id) => familyPath(familyId, 'apps', 'junior-high', collection, id);
const memberPath = (familyId, uid) => familyPath(familyId, 'members', uid);
const ref = (db, path) => doc(db, ...path);
const member = (role = 'student', active = true) => ({ role, active });
let testEnv;

const userDb = (uid) => testEnv.authenticatedContext(uid).firestore();
const seed = async (familyId, uid, role = 'student', active = true) => {
  await testEnv.withSecurityRulesDisabled(async (context) => setDoc(ref(context.firestore(), memberPath(familyId, uid)), member(role, active)));
};
const seedDoc = async (path, value = { value: 1 }) => {
  await testEnv.withSecurityRulesDisabled(async (context) => setDoc(ref(context.firestore(), path), value));
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore Security Rules', () => {
  it('isolates active members to their own family while allowing permitted task CRUD', async () => {
    await seed('family-a', 'student-a');
    await seed('family-b', 'student-b');
    const db = userDb('student-a');
    const ownTask = ref(db, appPath('family-a', 'tasks', 'task-a'));
    const foreignTask = ref(db, appPath('family-b', 'tasks', 'task-b'));
    await assertSucceeds(setDoc(ownTask, { title: '数学' }));
    await assertSucceeds(getDoc(ownTask));
    await assertSucceeds(updateDoc(ownTask, { title: '数学ワーク' }));
    await assertSucceeds(deleteDoc(ownTask));
    const ownTest = ref(db, appPath('family-a', 'tests', 'test-a'));
    await assertSucceeds(setDoc(ownTest, { score: 80 }));
    await assertSucceeds(updateDoc(ownTest, { score: 90 }));
    await assertSucceeds(deleteDoc(ownTest));
    await assertFails(setDoc(foreignTask, { title: '不許可' }));
    await assertFails(getDoc(foreignTask));
  });

  it('allows only a user to read their membership and denies every client member mutation', async () => {
    await seed('family-a', 'student-a');
    await seed('family-a', 'parent-a', 'parent');
    const student = userDb('student-a');
    await assertSucceeds(getDoc(ref(student, memberPath('family-a', 'student-a'))));
    await assertFails(getDoc(ref(student, memberPath('family-a', 'parent-a'))));
    await assertFails(updateDoc(ref(student, memberPath('family-a', 'student-a')), { role: 'admin' }));
    await assertFails(updateDoc(ref(userDb('parent-a'), memberPath('family-a', 'student-a')), { role: 'admin' }));
  });

  it('permits active student timer and StudySession creation but forbids session update and delete', async () => {
    await seed('family-a', 'student-a');
    await seed('family-a', 'inactive-a', 'student', false);
    const db = userDb('student-a');
    const timer = ref(db, appPath('family-a', 'activeTimers', 'current'));
    const session = ref(db, appPath('family-a', 'studySessions', 'session-a'));
    await assertSucceeds(setDoc(timer, { state: 'running' }));
    await assertSucceeds(updateDoc(timer, { state: 'paused' }));
    await assertSucceeds(deleteDoc(timer));
    await assertSucceeds(setDoc(session, { recordedSeconds: 60 }));
    await assertFails(updateDoc(session, { recordedSeconds: 30 }));
    await assertFails(deleteDoc(session));
    await assertFails(setDoc(ref(userDb('inactive-a'), appPath('family-a', 'activeTimers', 'current')), { state: 'running' }));
  });

  it('permits active reviewers to update correction documents and rejects student, inactive, and missing users', async () => {
    await seed('family-a', 'parent-a', 'parent');
    await seed('family-a', 'admin-a', 'admin');
    await seed('family-a', 'student-a');
    await seed('family-a', 'inactive-parent', 'parent', false);
    for (const collection of ['studySessions', 'rewardLedger', 'rewardAdjustmentLedger', 'rewardIntegrity']) {
      const id = collection === 'rewardIntegrity' ? 'current' : 'item';
      await seedDoc(appPath('family-a', collection, id));
    }
    const parent = userDb('parent-a');
    const admin = userDb('admin-a');
    const student = userDb('student-a');
    const inactive = userDb('inactive-parent');
    await assertSucceeds(updateDoc(ref(parent, appPath('family-a', 'studySessions', 'item')), { value: 2 }));
    await assertSucceeds(updateDoc(ref(admin, appPath('family-a', 'rewardLedger', 'item')), { value: 2 }));
    await assertSucceeds(setDoc(ref(parent, appPath('family-a', 'rewardAdjustmentLedger', 'new')), { value: 1 }));
    await assertSucceeds(updateDoc(ref(admin, appPath('family-a', 'rewardAdjustmentLedger', 'item')), { value: 2 }));
    await assertSucceeds(updateDoc(ref(admin, appPath('family-a', 'rewardIntegrity', 'current')), { value: 2 }));
    await assertFails(updateDoc(ref(student, appPath('family-a', 'studySessions', 'item')), { value: 3 }));
    await assertFails(updateDoc(ref(inactive, appPath('family-a', 'rewardLedger', 'item')), { value: 3 }));
    await assertFails(updateDoc(ref(userDb('missing'), appPath('family-a', 'rewardIntegrity', 'current')), { value: 3 }));
    await assertFails(deleteDoc(ref(parent, appPath('family-a', 'rewardLedger', 'item'))));
    await assertFails(deleteDoc(ref(parent, appPath('family-a', 'rewardAdjustmentLedger', 'item'))));
  });

  it('keeps RPG action, battle, and quest ledgers immutable after active-member creation', async () => {
    await seed('family-a', 'student-a');
    const db = userDb('student-a');
    for (const collection of ['rpgActionLedger', 'rpgBattleLedger', 'rpgQuestLedger']) {
      const ledger = ref(db, appPath('family-a', collection, 'ledger-1'));
      await assertSucceeds(setDoc(ledger, { value: 1 }));
      await assertFails(updateDoc(ledger, { value: 2 }));
      await assertFails(deleteDoc(ledger));
    }
  });

  it('allows active members the current profile, progress, quest, and battle mutation paths only', async () => {
    await seed('family-a', 'student-a');
    const db = userDb('student-a');
    for (const [collection, id] of [['rpg', 'playerProfile'], ['rpgProgress', 'current'], ['rpgQuestState', 'current'], ['rpgBattles', 'battle-1']]) {
      const target = ref(db, appPath('family-a', collection, id));
      await assertSucceeds(setDoc(target, { value: 1 }));
      await assertSucceeds(updateDoc(target, { value: 2 }));
      await assertFails(deleteDoc(target));
    }
    await assertFails(setDoc(ref(db, appPath('family-a', 'unknownCollection', 'item')), { value: 1 }));
  });
});
