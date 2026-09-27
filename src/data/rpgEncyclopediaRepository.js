import { collection, getDocs, query, where } from 'firebase/firestore';

const appCollection = (db, familyId, collectionName) => collection(db, 'families', familyId, 'apps', 'junior-high', collectionName);
const data = (snapshot) => snapshot.docs.map((entry) => entry.data()).filter((entry) => entry && typeof entry === 'object');

export async function loadRpgEncyclopediaLedgers({ db, familyId }) {
  const actionQuery = query(appCollection(db, familyId, 'rpgActionLedger'), where('type', 'in', ['gacha_draw', 'gacha_fragment_exchange', 'alchemy_craft']));
  const battleQuery = query(appCollection(db, familyId, 'rpgBattleLedger'), where('type', 'in', ['battle_start', 'weekly_boss_clear']));
  const [actions, battles] = await Promise.all([getDocs(actionQuery), getDocs(battleQuery)]);
  return { actionLedgers: data(actions), battleLedgers: data(battles) };
}

export function createCachedEncyclopediaLedgerLoader(load) {
  let request = null;
  return () => {
    if (!request) request = Promise.resolve().then(load);
    return request;
  };
}
