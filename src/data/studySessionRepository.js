import { collection } from 'firebase/firestore';

export const studySessionsCollection = (db, familyId) => collection(db, 'families', familyId, 'apps', 'junior-high', 'studySessions');
