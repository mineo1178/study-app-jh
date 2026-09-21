import { doc, runTransaction } from 'firebase/firestore';
import { REWARD_POLICY_VERSION, REWARD_SCHEMA_VERSION } from '../rpg/rewardConfig.js';
import { createEmptyPlayerProfile, normalizePlayerProfile } from '../rpg/playerProfile.js';
import { calculateStudyReward, isStudySessionRewardEligible } from '../rpg/rewardCalculator.js';

const appPath = (familyId, collectionName, id) => ['families', familyId, 'apps', 'junior-high', collectionName, id];
export const rewardLedgerRef = (db, familyId, sessionId) => doc(db, ...appPath(familyId, 'rewardLedger', sessionId));
export const playerProfileRef = (db, familyId) => doc(db, ...appPath(familyId, 'rpg', 'playerProfile'));
const studySessionRef = (db, familyId, sessionId) => doc(db, ...appPath(familyId, 'studySessions', sessionId));
export const emptyPlayerProfile = createEmptyPlayerProfile;

export function applyRewardToPlayerProfile(profile, rewards, updatedAt) {
  const current = normalizePlayerProfile(profile);
  const materials = {
    ...current.materials,
    [rewards.material.key]: (Number(current.materials?.[rewards.material.key]) || 0) + rewards.material.quantity,
  };
  return {
    ...current,
    gold: (Number(current.gold) || 0) + rewards.gold,
    battleEnergy: (Number(current.battleEnergy) || 0) + rewards.battleEnergy,
    materials,
    updatedAt,
  };
}

export function prepareCanonicalStudySessionReward(session) {
  if (!isStudySessionRewardEligible(session)) return { eligible: false, reason: 'INELIGIBLE' };
  const rewards = calculateStudyReward(session);
  return {
    eligible: true,
    rewards,
    basis: {
      recordedSeconds: session.recordedSeconds,
      subjectId: session.taskSnapshot?.subjectId || session.subjectId || null,
      categoryId: session.taskSnapshot?.categoryId || null,
      activityType: session.taskSnapshot?.activityType || null,
    },
  };
}

export async function applyStudySessionReward({ db, familyId, session }) {
  if (!session?.id) return { applied: false, reason: 'SESSION_NOT_FOUND' };
  const ledger = rewardLedgerRef(db, familyId, session.id);
  const profile = playerProfileRef(db, familyId);
  const sessionReference = studySessionRef(db, familyId, session.id);
  const now = Date.now();
  return runTransaction(db, async (transaction) => {
    const [ledgerSnap, profileSnap, sessionSnap] = await Promise.all([transaction.get(ledger), transaction.get(profile), transaction.get(sessionReference)]);
    if (!sessionSnap.exists()) return { applied: false, reason: 'SESSION_NOT_FOUND' };
    if (ledgerSnap.exists()) return { applied: false, reason: 'ALREADY_APPLIED' };
    const canonicalSession = { id: sessionSnap.id, ...sessionSnap.data() };
    const prepared = prepareCanonicalStudySessionReward(canonicalSession);
    if (!prepared.eligible) return { applied: false, reason: prepared.reason };
    const nextProfile = applyRewardToPlayerProfile(profileSnap.exists() ? profileSnap.data() : emptyPlayerProfile(), prepared.rewards, now);
    transaction.set(profile, nextProfile);
    transaction.set(ledger, { schemaVersion: REWARD_SCHEMA_VERSION, studySessionId: canonicalSession.id, timerId: canonicalSession.timerId || null, rewardPolicyVersion: REWARD_POLICY_VERSION, basis: prepared.basis, rewards: prepared.rewards, status: 'applied', appliedAt: now, reversal: null });
    return { applied: true, rewards: prepared.rewards };
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
