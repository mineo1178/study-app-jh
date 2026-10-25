import { GOLD_PER_MINUTE_BY_POLICY, LEGACY_REWARD_POLICY_VERSION, SUBJECT_MATERIALS } from './rewardConfig.js';

export const materialForSubject = (subjectId) => SUBJECT_MATERIALS[subjectId] || 'general_essence';
export function isStudySessionRewardEligible(session) {
  return Boolean(session && Object.hasOwn(GOLD_PER_MINUTE_BY_POLICY, session.rewardPolicyVersion) && session.validation?.status === 'valid' && !session.legacySource && Number(session.recordedSeconds) > 0);
}
export function calculateStudyReward(session) {
  const policy = session?.rewardPolicyVersion ?? LEGACY_REWARD_POLICY_VERSION;
  if (!Object.hasOwn(GOLD_PER_MINUTE_BY_POLICY, policy)) throw Object.assign(new Error('UNSUPPORTED_REWARD_POLICY'), { code: 'UNSUPPORTED_REWARD_POLICY' });
  const seconds = Math.max(0, Number(session?.recordedSeconds) || 0);
  return { gold: Math.floor(seconds / 60) * GOLD_PER_MINUTE_BY_POLICY[policy], battleEnergy: Math.floor(seconds / 900), material: { key: materialForSubject(session?.taskSnapshot?.subjectId || session?.subjectId), quantity: Math.floor(seconds / 600) } };
}
