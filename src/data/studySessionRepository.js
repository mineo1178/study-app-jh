import { collection, doc, getDocs, runTransaction } from 'firebase/firestore';

export const studySessionsCollection = (db, familyId) => collection(db, 'families', familyId, 'apps', 'junior-high', 'studySessions');

export const LEGACY_MIGRATION_BATCH_SIZE = 400;

const chunksOf = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

export function legacyMigrationDocument(candidate, migratedAt = Date.now()) {
  const firstSegment = candidate.segments?.[0] || null;
  const lastSegment = candidate.segments?.at(-1) || null;
  return {
    ...candidate,
    subjectId: candidate.taskSnapshot?.subjectId || null,
    activityType: candidate.taskSnapshot?.activityType || 'other',
    duration: Number(candidate.recordedSeconds) || 0,
    startedAt: firstSegment?.startedAt || null,
    endedAt: lastSegment?.endedAt || null,
    migrationVersion: 1,
    migratedAt,
  };
}

export async function createLegacyStudySessions({ db, familyId, candidates, now = Date.now() }) {
  const sessions = studySessionsCollection(db, familyId);
  const chunks = chunksOf(candidates, LEGACY_MIGRATION_BATCH_SIZE);
  let created = 0;
  for (const chunk of chunks) {
    await runTransaction(db, async (transaction) => {
      const refs = chunk.map((candidate) => doc(sessions, candidate.id));
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      if (snapshots.some((snapshot) => snapshot.exists())) throw new Error('MIGRATION_DOCUMENT_ALREADY_EXISTS');
      // Firestore Web transactions retry if a document read above changes before commit.
      // Therefore set is create-only here: an existing ID always aborts before any write.
      chunk.forEach((candidate, index) => transaction.set(refs[index], legacyMigrationDocument(candidate, now)));
    });
    created += chunk.length;
  }
  const verificationSnapshot = await getDocs(sessions);
  return {
    requested: candidates.length,
    created,
    skipped: 0,
    failed: 0,
    studySessions: verificationSnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() })),
  };
}
