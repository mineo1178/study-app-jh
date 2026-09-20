import { REWARD_POLICY_VERSION, SUBJECT_MATERIALS } from './rewardConfig.js';

export const materialForSubject = (subjectId) => SUBJECT_MATERIALS[subjectId] || 'general_essence';
export function isStudySessionRewardEligible(session) {
  return Boolean(session && session.rewardPolicyVersion === REWARD_POLICY_VERSION && session.validation?.status === 'valid' && !session.legacySource && Number(session.recordedSeconds) >= 0);
}
export function calculateStudyReward(session) {
  const seconds = Math.max(0, Number(session?.recordedSeconds) || 0);
  return { gold: Math.floor(seconds / 60), battleEnergy: Math.floor(seconds / 900), material: { key: materialForSubject(session?.taskSnapshot?.subjectId || session?.subjectId), quantity: Math.floor(seconds / 600) } };
}
