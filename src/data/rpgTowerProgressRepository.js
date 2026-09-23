import { doc } from 'firebase/firestore';
export const rpgTowerProgressRef = (db, familyId) => doc(db, 'families', familyId, 'apps', 'junior-high', 'rpgTowerProgress', 'current');
