import { doc, runTransaction } from 'firebase/firestore';
import { MATERIAL_KEYS, REWARD_POLICY_VERSION, REWARD_SCHEMA_VERSION } from '../rpg/rewardConfig.js';
import { calculateStudyReward, isStudySessionRewardEligible } from '../rpg/rewardCalculator.js';

const appPath = (familyId, collectionName, id) => ['families', familyId, 'apps', 'junior-high', collectionName, id];
export const rewardLedgerRef = (db, familyId, sessionId) => doc(db, ...appPath(familyId, 'rewardLedger', sessionId));
export const playerProfileRef = (db, familyId) => doc(db, ...appPath(familyId, 'rpg', 'playerProfile'));
export const emptyPlayerProfile = () => ({ schemaVersion: 1, gold: 0, battleEnergy: 0, materials: Object.fromEntries(MATERIAL_KEYS.map((key) => [key, 0])) });

export async function applyStudySessionReward({ db, familyId, session }) {
  if (!isStudySessionRewardEligible(session)) return { applied: false, reason: 'INELIGIBLE' };
  const ledger = rewardLedgerRef(db, familyId, session.id);
  const profile = playerProfileRef(db, familyId);
  return runTransaction(db, async (transaction) => {
    const [ledgerSnap, profileSnap] = await Promise.all([transaction.get(ledger), transaction.get(profile)]);
    if (ledgerSnap.exists()) return { applied: false, reason: 'ALREADY_APPLIED' };
    if (!isStudySessionRewardEligible(session)) return { applied: false, reason: 'INELIGIBLE' };
    const rewards = calculateStudyReward(session);
    const current = profileSnap.exists() ? profileSnap.data() : emptyPlayerProfile();
    const materials = { ...emptyPlayerProfile().materials, ...(current.materials || {}), [rewards.material.key]: (Number(current.materials?.[rewards.material.key]) || 0) + rewards.material.quantity };
    transaction.set(profile, { ...current, schemaVersion: 1, gold: (Number(current.gold) || 0) + rewards.gold, battleEnergy: (Number(current.battleEnergy) || 0) + rewards.battleEnergy, materials, updatedAt: Date.now() });
    transaction.set(ledger, { schemaVersion: REWARD_SCHEMA_VERSION, studySessionId: session.id, timerId: session.timerId || null, rewardPolicyVersion: REWARD_POLICY_VERSION, basis: { recordedSeconds: session.recordedSeconds, subjectId: session.taskSnapshot?.subjectId || session.subjectId || null, categoryId: session.taskSnapshot?.categoryId || null, activityType: session.taskSnapshot?.activityType || null }, rewards, status: 'applied', appliedAt: Date.now(), reversal: null });
    return { applied: true, rewards };
  });
}

export async function reverseStudySessionReward({ db, familyId, sessionId }) {
  const ledger = rewardLedgerRef(db, familyId, sessionId); const profile = playerProfileRef(db, familyId);
  return runTransaction(db, async (transaction) => {
    const [ledgerSnap, profileSnap] = await Promise.all([transaction.get(ledger), transaction.get(profile)]);
    if (!ledgerSnap.exists()) throw new Error('REWARD_LEDGER_NOT_FOUND');
    const entry = ledgerSnap.data(); if (entry.status === 'reversed') return { reversed: false, reason: 'ALREADY_REVERSED' };
    const current = profileSnap.data(); if (!current || current.gold < entry.rewards.gold || current.battleEnergy < entry.rewards.battleEnergy || (current.materials?.[entry.rewards.material.key] || 0) < entry.rewards.material.quantity) throw new Error('REWARD_PROFILE_INCONSISTENT');
    transaction.update(profile, { gold: current.gold - entry.rewards.gold, battleEnergy: current.battleEnergy - entry.rewards.battleEnergy, [`materials.${entry.rewards.material.key}`]: current.materials[entry.rewards.material.key] - entry.rewards.material.quantity, updatedAt: Date.now() });
    transaction.update(ledger, { status: 'reversed', reversal: { reversedAt: Date.now(), reason: 'manual' } }); return { reversed: true };
  });
}
