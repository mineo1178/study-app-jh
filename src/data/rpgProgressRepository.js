import { doc } from 'firebase/firestore';
export const rpgProgressRef = (db, familyId) => doc(db, 'families', familyId, 'apps', 'junior-high', 'rpgProgress', 'current');
