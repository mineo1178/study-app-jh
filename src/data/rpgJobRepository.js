import { runTransaction } from 'firebase/firestore';
import { playerProfileRef } from './rewardLedgerRepository.js';
import { rpgActionLedgerRef, RPG_ACTION_LEDGER_SCHEMA_VERSION } from './rpgShopRepository.js';
import { JOB_CATALOG, playerJobId } from '../rpg/jobCatalog.js';
const fail = code => { throw Object.assign(new Error(code), { code }); };
export function prepareJobChange({ profile = {}, jobId, expected, actionId, now }) {
  if (typeof jobId !== 'string' || !Object.hasOwn(JOB_CATALOG, jobId)) fail('INVALID_JOB_ID');
  if (profile.activeBattleId) fail('JOB_CHANGE_DURING_BATTLE');
  const before = playerJobId(profile), revision = profile.jobRevision || 0;
  if (!expected || expected.jobId !== before || expected.revision !== revision) fail('JOB_PROFILE_CHANGED');
  if (jobId === before) fail('JOB_UNCHANGED');
  const patch = { jobId, jobRevision: revision + 1, updatedAt: now };
  return { patch, profile: { ...profile, ...patch }, ledger: { schemaVersion: RPG_ACTION_LEDGER_SCHEMA_VERSION, actionId, type: 'job_change', status: 'applied', before, after: jobId, revision: revision + 1, appliedAt: now } };
}
export async function changePlayerJob({ db, familyId, actionId, jobId, expected }) {
  if (typeof actionId !== 'string' || !actionId || actionId.includes('/')) fail('INVALID_ACTION_ID');
  const profileRef = playerProfileRef(db, familyId), ledgerRef = rpgActionLedgerRef(db, familyId, actionId), now = Date.now();
  return runTransaction(db, async transaction => {
    const [profile, ledger] = await Promise.all([transaction.get(profileRef), transaction.get(ledgerRef)]);
    if (ledger.exists()) return { applied: false, reason: 'ALREADY_APPLIED' };
    const change = prepareJobChange({ profile: profile.exists() ? profile.data() : {}, jobId, expected, actionId, now });
    transaction.set(profileRef, change.patch, { merge: true }); transaction.set(ledgerRef, change.ledger);
    return { applied: true, profile: change.profile };
  });
}
