import { runTransaction } from 'firebase/firestore';
import { normalizePlayerProfile } from '../rpg/playerProfile.js';
import { companionDefinition, readCompanionGrowth, validateCompanionState } from '../rpg/companionGrowthSelectors.js';
import { COMPANION_RESET_GOLD, EMPTY_COMPANION_ALLOCATION } from '../rpg/companionGrowthCatalog.js';
import { playerProfileRef } from './rewardLedgerRepository.js';
import { rpgActionLedgerRef, RPG_ACTION_LEDGER_SCHEMA_VERSION } from './rpgShopRepository.js';
import { rewardIntegrityRef, assertNoPendingRewardCorrections } from './rewardCorrectionRepository.js';
const fail = code => { throw Object.assign(new Error(code), { code }); };
export function prepareCompanionGrowthAction({ profile: raw = {}, memberId, allocation, unlockedNodeIds, expectedRevision, kind = 'save', actionId, now }) {
  companionDefinition(memberId);
  const profile = normalizePlayerProfile(raw);
  if (!profile.unlockedPartyMemberIds.includes(memberId)) fail('PARTY_MEMBER_LOCKED');
  if (profile.activeBattleId) fail('COMPANION_CHANGE_DURING_BATTLE');
  if (!['save', 'reset'].includes(kind)) fail('INVALID_COMPANION_ACTION');
  const before = readCompanionGrowth(profile, memberId);
  if (expectedRevision !== before.revision || before.revision === Number.MAX_SAFE_INTEGER) fail('COMPANION_PROFILE_CHANGED');
  const next = validateCompanionState(profile, memberId, { allocation: kind === 'reset' ? { ...EMPTY_COMPANION_ALLOCATION } : allocation, unlockedNodeIds: kind === 'reset' ? [] : unlockedNodeIds, revision: before.revision + 1 });
  if (kind !== 'reset' && before.unlockedNodeIds.some(id => !next.unlockedNodeIds.includes(id))) fail('COMPANION_RESET_REQUIRED');
  if (Object.keys(before.allocation).every(key => before.allocation[key] === next.allocation[key]) && before.unlockedNodeIds.length === next.unlockedNodeIds.length && before.unlockedNodeIds.every(id => next.unlockedNodeIds.includes(id))) fail('COMPANION_NO_CHANGES');
  const cost = kind === 'reset' || Object.keys(before.allocation).some(key => next.allocation[key] < before.allocation[key]) ? COMPANION_RESET_GOLD : 0;
  if (cost && (!Number.isSafeInteger(profile.gold) || profile.gold < cost)) fail('INSUFFICIENT_GOLD');
  const state = { allocation: next.allocation, unlockedNodeIds: next.unlockedNodeIds, revision: next.revision };
  const patch = { companionGrowth: { [memberId]: state }, ...(cost ? { gold: profile.gold - cost } : {}), updatedAt: now };
  return { patch, profile: { ...profile, ...patch, companionGrowth: { ...profile.companionGrowth, [memberId]: state } }, ledger: { schemaVersion: RPG_ACTION_LEDGER_SCHEMA_VERSION, actionId, type: 'companion_growth_' + kind, memberId, before: { allocation: before.allocation, unlockedNodeIds: before.unlockedNodeIds, revision: before.revision }, after: state, cost: { gold: cost }, status: 'applied', appliedAt: now } };
}
export async function saveCompanionGrowth({ db, familyId, actionId, ...request }) {
  if (typeof actionId !== 'string' || !actionId || actionId.includes('/')) fail('INVALID_ACTION_ID');
  const profileRef = playerProfileRef(db, familyId), ledgerRef = rpgActionLedgerRef(db, familyId, actionId), integrityRef = rewardIntegrityRef(db, familyId), now = Date.now();
  return runTransaction(db, async transaction => {
    const [profile, ledger, integrity] = await Promise.all([transaction.get(profileRef), transaction.get(ledgerRef), transaction.get(integrityRef)]);
    if (ledger.exists()) return { applied: false, reason: 'ALREADY_APPLIED' };
    const change = prepareCompanionGrowthAction({ ...request, profile: profile.exists() ? profile.data() : {}, actionId, now });
    if (change.ledger.cost.gold) assertNoPendingRewardCorrections(integrity.exists() ? integrity.data() : {});
    transaction.set(profileRef, change.patch, { merge: true });
    transaction.set(ledgerRef, change.ledger);
    return { applied: true, profile: change.profile };
  });
}
