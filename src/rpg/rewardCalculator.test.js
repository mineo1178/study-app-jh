import { describe, expect, it } from 'vitest';
import { REWARD_POLICY_VERSION } from './rewardConfig';
import { calculateStudyReward, isStudySessionRewardEligible, materialForSubject } from './rewardCalculator';
const valid = (recordedSeconds) => ({ recordedSeconds, rewardPolicyVersion: REWARD_POLICY_VERSION, validation: { status: 'valid' }, taskSnapshot: { subjectId: 's_math' } });
describe('study rewards', () => {
  it('calculates 30 seconds, 10 minutes, and 30 minutes', () => {
    expect(calculateStudyReward(valid(30))).toEqual({ gold: 0, battleEnergy: 0, material: { key: 'iron', quantity: 0 } });
    expect(calculateStudyReward(valid(600))).toEqual({ gold: 10, battleEnergy: 0, material: { key: 'iron', quantity: 1 } });
    expect(calculateStudyReward(valid(1800))).toEqual({ gold: 30, battleEnergy: 2, material: { key: 'iron', quantity: 3 } });
  });
  it('maps subjects and falls back safely', () => {
    expect(materialForSubject('s_japanese')).toBe('wisdom_scroll'); expect(materialForSubject('s_english')).toBe('mana_rune'); expect(materialForSubject('s_science')).toBe('mineral'); expect(materialForSubject('s_social')).toBe('history_seal'); expect(materialForSubject('s_tech')).toBe('logic_core'); expect(materialForSubject('e_programming')).toBe('logic_core'); expect(materialForSubject('e_duolingo')).toBe('mana_rune'); expect(materialForSubject('unknown')).toBe('general_essence');
  });
  it('excludes invalid, pending, legacy, and old sessions', () => {
    expect(isStudySessionRewardEligible(valid(0))).toBe(true);
    expect(isStudySessionRewardEligible({ ...valid(60), validation: { status: 'invalid' } })).toBe(false);
    expect(isStudySessionRewardEligible({ ...valid(60), validation: { status: 'pending_review' } })).toBe(false);
    expect(isStudySessionRewardEligible({ ...valid(60), validation: { status: 'valid' }, manualReview: { reviewed: true, decision: 'valid' } })).toBe(true);
    expect(isStudySessionRewardEligible({ ...valid(60), legacySource: { taskId: 'old' } })).toBe(false);
    expect(isStudySessionRewardEligible({ ...valid(60), rewardPolicyVersion: undefined })).toBe(false);
  });
});
