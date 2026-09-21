import { describe, expect, it } from 'vitest';
import { applyRewardToPlayerProfile, prepareCanonicalStudySessionReward } from './rewardLedgerRepository.js';

describe('study reward and equipment coexistence', () => {
  it('adds only reward assets while preserving v2 equipment state', () => {
    const profile = {
      gold: 100,
      battleEnergy: 2,
      materials: { iron: 4 },
      ownedEquipment: { iron_sword: { acquiredAt: 1, sourceActionId: 'purchase-1' } },
      equipped: { weapon: 'iron_sword', armor: null, accessory: null },
      totalExp: 100, level: 2, activeBattleId: 'battle-1',
    };
    const next = applyRewardToPlayerProfile(profile, { gold: 10, battleEnergy: 1, material: { key: 'iron', quantity: 2 } }, 99);
    expect(next).toMatchObject({ gold: 110, battleEnergy: 3, materials: { iron: 6 }, ownedEquipment: profile.ownedEquipment, equipped: profile.equipped, totalExp: 100, level: 2, activeBattleId: 'battle-1', updatedAt: 99 });
  });
  it('rejects an invalid canonical session without preparing a reward or changing the profile', () => {
    const callerSnapshot = { id: 'session-1', recordedSeconds: 3_600, rewardPolicyVersion: 'rpg-reward-v1', validation: { status: 'valid' }, taskSnapshot: { subjectId: 's_math' } };
    const canonicalSession = { ...callerSnapshot, validation: { status: 'invalid' } };
    const prepared = prepareCanonicalStudySessionReward(canonicalSession);
    const profile = { gold: 20, battleEnergy: 2, materials: { iron: 2 } };
    const after = prepared.eligible ? applyRewardToPlayerProfile(profile, prepared.rewards, 1) : profile;
    expect(callerSnapshot.validation.status).toBe('valid');
    expect(prepared).toMatchObject({ eligible: false, reason: 'INELIGIBLE' });
    expect(after).toEqual(profile);
  });
  it('calculates reward and ledger basis only from canonical duration and subject', () => {
    const callerSnapshot = { id: 'session-2', recordedSeconds: 3_600, rewardPolicyVersion: 'rpg-reward-v1', validation: { status: 'valid' }, taskSnapshot: { subjectId: 's_math' } };
    const canonicalSession = { ...callerSnapshot, recordedSeconds: 600, taskSnapshot: { subjectId: 's_science', categoryId: 'school', activityType: 'problem_solving' } };
    const prepared = prepareCanonicalStudySessionReward(canonicalSession);
    expect(callerSnapshot.recordedSeconds).toBe(3_600);
    expect(prepared).toEqual({ eligible: true, rewards: { gold: 10, battleEnergy: 0, material: { key: 'mineral', quantity: 1 } }, basis: { recordedSeconds: 600, subjectId: 's_science', categoryId: 'school', activityType: 'problem_solving' } });
  });
  it('rejects a legacy canonical session even when a caller snapshot is non-legacy', () => {
    const canonicalSession = { id: 'session-3', recordedSeconds: 600, rewardPolicyVersion: 'rpg-reward-v1', validation: { status: 'valid' }, taskSnapshot: { subjectId: 's_math' }, legacySource: { taskId: 'task-1', historyId: 'history-1' } };
    expect(prepareCanonicalStudySessionReward(canonicalSession)).toMatchObject({ eligible: false, reason: 'INELIGIBLE' });
  });
});
