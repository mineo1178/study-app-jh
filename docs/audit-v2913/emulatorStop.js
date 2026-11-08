import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, connectFirestoreEmulator, getDocsFromServer, getDocFromServer, getFirestore, doc, setDoc, terminate } from 'firebase/firestore';
import { activeTimerRef, startActiveTimer, pauseActiveTimer, resumeActiveTimer, finishActiveTimer } from '../../src/data/activeTimerRepository.js';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8090');
const app = initializeApp({ projectId: 'demo-study-app-jh', apiKey: 'emulator-only-key', authDomain: 'localhost' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8090);
const familyId = 'oomine-study-2026';
const path = ['families', familyId, 'apps', 'junior-high'];
const timer = activeTimerRef(db, familyId);
const sessions = collection(db, ...path, 'studySessions');
const task = { id: 'synthetic-math', title: 'Synthetic math', categoryId: 'school', subjectId: 's_math', type: 'homework' };
const taskRef = doc(db, ...path, 'tasks', task.id);
const credentials = ['stop-audit@study.invalid', 'local-emulator-only-passphrase'];
const options = { db, familyId, task, timerId: 'synthetic-timer', ownerClientId: 'device:tab' };

try {
  await assert.rejects(getDocFromServer(taskRef), { code: 'permission-denied' });
  await createUserWithEmailAndPassword(auth, ...credentials);
  await signOut(auth);
  await signInWithEmailAndPassword(auth, ...credentials);
  await setDoc(taskRef, task);
  await assert.rejects(getDocFromServer(activeTimerRef(db, 'different-family')), { code: 'permission-denied' });
  const start = Date.now() - 180_000;
  await startActiveTimer({ ...options, now: start });
  await pauseActiveTimer({ ...options, now: start + 60_000 });
  await resumeActiveTimer({ ...options, now: start + 90_000 });
  const before = (await getDocFromServer(timer)).data();
  const finish = () => finishActiveTimer({ ...options, endAt: start + 150_000 });
  await signOut(auth);
  await assert.rejects(finish(), { code: 'permission-denied' });
  await signInWithEmailAndPassword(auth, ...credentials);
  assert.deepEqual((await getDocFromServer(timer)).data(), before);
  assert.equal((await getDocsFromServer(sessions)).size, 0);
  const results = await Promise.all([finish(), finish()]);
  assert.equal(results.filter(({ alreadyFinished }) => !alreadyFinished).length, 1);
  assert.equal((await finish()).alreadyFinished, true);
  const saved = await getDocsFromServer(sessions);
  assert.equal(saved.size, 1);
  assert.equal(saved.docs[0].id, options.timerId);
  assert.equal(saved.docs[0].data().recordedSeconds, 120);
  assert.equal((await getDocFromServer(timer)).exists(), false);
  console.log('PASS: real Emulator login and Rules; failed STOP preserved timer, then concurrent STOP and replay saved exactly one 120-second session.');
} finally {
  await signOut(auth);
  await terminate(db);
  await deleteApp(app);
}
