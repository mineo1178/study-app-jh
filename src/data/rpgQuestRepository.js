import { doc, runTransaction } from 'firebase/firestore';
import { normalizePlayerProfile } from '../rpg/playerProfile.js';
import { normalizeRpgProgress } from '../rpg/rpgProgress.js';
import { getQuest } from '../rpg/questCatalog.js';
import { isQuestCompleted, normalizeQuestState } from '../rpg/questState.js';
import { playerProfileRef } from './rewardLedgerRepository.js';
import { rpgProgressRef } from './rpgProgressRepository.js';

const appPath = (familyId, collectionName, id) => ['families', familyId, 'apps', 'junior-high', collectionName, id];
const failure = (code) => Object.assign(new Error(code), { code });
export const rpgQuestStateRef = (db, familyId) => doc(db, ...appPath(familyId, 'rpgQuestState', 'current'));
export const rpgQuestLedgerRef = (db, familyId, questId) => doc(db, ...appPath(familyId, 'rpgQuestLedger', `quest-claim-${questId}`));

export function prepareQuestClaim({ profile, progress, questState, questId, now }) {
  const quest = getQuest(questId);
  if (!quest) throw failure('QUEST_NOT_FOUND');
  const currentProfile = normalizePlayerProfile(profile);
  const currentProgress = normalizeRpgProgress(progress);
  const currentState = normalizeQuestState(questState);
  if (currentState.claimedQuestIds.includes(questId)) throw failure('QUEST_ALREADY_CLAIMED');
  if (!isQuestCompleted({ questId, profile: currentProfile, progress: currentProgress })) throw failure('QUEST_NOT_COMPLETED');
  const reward = { gold: Number(quest.reward.gold) || 0, battleEnergy: Number(quest.reward.battleEnergy) || 0 };
  return {
    profile: { ...currentProfile, gold: currentProfile.gold + reward.gold, battleEnergy: currentProfile.battleEnergy + reward.battleEnergy, updatedAt: now },
    questState: { ...currentState, claimedQuestIds: [...currentState.claimedQuestIds, questId], updatedAt: now },
    ledger: { schemaVersion: 1, type: 'quest_claim', questId, reward, status: 'applied', appliedAt: now },
    result: { questId, reward },
  };
}

export async function claimQuestReward({ db, familyId, questId }) {
  const quest = getQuest(questId);
  if (!quest) throw failure('QUEST_NOT_FOUND');
  const profileRef = playerProfileRef(db, familyId); const progressRef = rpgProgressRef(db, familyId); const stateRef = rpgQuestStateRef(db, familyId); const ledgerRef = rpgQuestLedgerRef(db, familyId, questId); const now = Date.now();
  return runTransaction(db, async (transaction) => {
    const [profileSnap, progressSnap, stateSnap, ledgerSnap] = await Promise.all([transaction.get(profileRef), transaction.get(progressRef), transaction.get(stateRef), transaction.get(ledgerRef)]);
    if (ledgerSnap.exists()) return { applied: false, reason: 'QUEST_ALREADY_CLAIMED' };
    const change = prepareQuestClaim({ profile: profileSnap.exists() ? profileSnap.data() : {}, progress: progressSnap.exists() ? progressSnap.data() : {}, questState: stateSnap.exists() ? stateSnap.data() : {}, questId, now });
    transaction.set(profileRef, change.profile); transaction.set(stateRef, change.questState); transaction.set(ledgerRef, change.ledger);
    return { applied: true, ...change.result };
  });
}
