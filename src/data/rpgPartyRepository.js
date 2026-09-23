import { runTransaction } from 'firebase/firestore';
import { normalizePlayerProfile } from '../rpg/playerProfile.js';
import { validatePartyMemberIds } from '../rpg/partyMemberCatalog.js';
import { playerProfileRef } from './rewardLedgerRepository.js';

export async function saveParty({ db, familyId, partyMemberIds }) {
  const ref = playerProfileRef(db, familyId);
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const profile = normalizePlayerProfile(snap.exists() ? snap.data() : {});
    if (profile.activeBattleId) throw Object.assign(new Error('PARTY_CHANGE_DURING_BATTLE'), { code: 'PARTY_CHANGE_DURING_BATTLE' });
    const next = validatePartyMemberIds(partyMemberIds);
    if (next.length === profile.partyMemberIds.length && next.every((id, index) => id === profile.partyMemberIds[index])) return { applied: false, reason: 'NO_CHANGES', profile };
    const updated = { ...profile, partyMemberIds: next, updatedAt: Date.now() };
    transaction.set(ref, updated);
    return { applied: true, profile: updated };
  });
}
