import { runTransaction } from 'firebase/firestore';
import { playerProfileRef } from './rewardLedgerRepository.js';
import { rpgActionLedgerRef, RPG_ACTION_LEDGER_SCHEMA_VERSION } from './rpgShopRepository.js';
import { rewardIntegrityRef, assertNoPendingRewardCorrections } from './rewardCorrectionRepository.js';
import { earnedStatPoints, readStatAllocation, validateStatAllocation, statAllocationCost } from '../rpg/statAllocation.js';

const fail = code => { throw Object.assign(new Error(code), { code }); };
export function prepareStatAllocation({ profile = {}, allocation, expected, actionId, now }) {
  if (profile.activeBattleId) fail('STAT_CHANGE_DURING_BATTLE');
  const before = readStatAllocation(profile);
  const after = validateStatAllocation(allocation, profile.totalExp || 0);
  // Confirmation belongs to this balance, level and allocation; never silently rebase a paid action.
  if (!expected || before.hp !== expected.hp || before.mp !== expected.mp || (profile.totalExp || 0) !== expected.totalExp || (profile.gold || 0) !== expected.gold) fail('STAT_PROFILE_CHANGED');
  if (before.hp === after.hp && before.mp === after.mp) fail('STAT_ALLOCATION_UNCHANGED');
  const cost = statAllocationCost(before, after);
  if (!Number.isFinite(profile.gold || 0) || (profile.gold || 0) < cost) fail('INSUFFICIENT_GOLD');
  const patch = { statAllocation: after, ...(cost ? { gold: profile.gold - cost } : {}), updatedAt: now };
  return {
    profile: { ...profile, ...patch }, patch,
    ledger: { schemaVersion: RPG_ACTION_LEDGER_SCHEMA_VERSION, actionId, type: 'stat_allocation', status: 'applied', before, after, earnedPoints: earnedStatPoints(profile.totalExp || 0), totalExp: profile.totalExp || 0, cost: { gold: cost }, goldBefore: profile.gold || 0, goldAfter: (profile.gold || 0) - cost, appliedAt: now },
  };
}
export async function saveStatAllocation({ db, familyId, actionId, allocation, expected }) {
  if (typeof actionId !== 'string' || !actionId || actionId.includes('/')) fail('INVALID_ACTION_ID');
  const profileRef = playerProfileRef(db, familyId);
  const ledgerRef = rpgActionLedgerRef(db, familyId, actionId);
  const integrityRef = rewardIntegrityRef(db, familyId);
  const now = Date.now();
  return runTransaction(db, async transaction => {
    const [profileSnap, ledgerSnap, integritySnap] = await Promise.all([transaction.get(profileRef), transaction.get(ledgerRef), transaction.get(integrityRef)]);
    if (ledgerSnap.exists()) return { applied: false, reason: 'ALREADY_APPLIED' };
    const change = prepareStatAllocation({ profile: profileSnap.exists() ? profileSnap.data() : {}, allocation, expected, actionId, now });
    if (change.ledger.cost.gold) assertNoPendingRewardCorrections(integritySnap.exists() ? integritySnap.data() : {});
    transaction.set(profileRef, change.patch, { merge: true });
    transaction.set(ledgerRef, change.ledger);
    return { applied: true, profile: change.profile, ledger: change.ledger };
  });
}
