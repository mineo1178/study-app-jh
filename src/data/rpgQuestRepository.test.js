import { describe, expect, it, vi } from 'vitest';
import { findUndefinedPaths } from '../test/findUndefinedPaths.js';

const firestore = vi.hoisted(() => ({ docs: new Map() }));
vi.mock('firebase/firestore', () => ({ doc: (_db, ...parts) => ({ path: parts.join('/') }), runTransaction: async (_db, callback) => callback({ get: async (ref) => ({ exists: () => firestore.docs.has(ref.path), data: () => firestore.docs.get(ref.path) }), set: (ref, value) => firestore.docs.set(ref.path, value) }) }));

import { claimQuestReward, prepareQuestClaim } from './rpgQuestRepository.js';

describe('quest claim transaction', () => {
  it('rejects locked quests and atomically preserves EXP and materials on a valid claim', () => {
    expect(() => prepareQuestClaim({ profile: {}, progress: {}, questState: {}, questId: 'first_equipment', now: 1 })).toThrow('QUEST_NOT_COMPLETED');
    const profile = { gold: 4, battleEnergy: 1, totalExp: 90, materials: { iron: 5 }, ownedEquipment: { iron_sword: {} } };
    const change = prepareQuestClaim({ profile, progress: {}, questState: {}, questId: 'first_equipment', now: 2 });
    expect(change.profile).toMatchObject({ gold: 24, battleEnergy: 1, totalExp: 90, materials: { iron: 5 } });
    expect(change.questState.claimedQuestIds).toEqual(['first_equipment']);
    expect(change.ledger).toMatchObject({ type: 'quest_claim', questId: 'first_equipment', reward: { gold: 20, battleEnergy: 0 } });
    [change.profile, change.questState, change.ledger, change.result].forEach((payload) => expect(findUndefinedPaths(payload)).toEqual([]));
  });
  it('uses a deterministic ledger to prevent duplicate cross-device claims', async () => {
    firestore.docs.clear();
    const profilePath = 'families/family/apps/junior-high/rpg/playerProfile';
    firestore.docs.set(profilePath, { gold: 0, battleEnergy: 0, ownedEquipment: { iron_sword: {} }, materials: { iron: 5 } });
    const first = await claimQuestReward({ db: {}, familyId: 'family', questId: 'first_equipment' });
    const second = await claimQuestReward({ db: {}, familyId: 'family', questId: 'first_equipment' });
    expect(first).toMatchObject({ applied: true, questId: 'first_equipment', reward: { gold: 20, battleEnergy: 0 } });
    expect(second).toEqual({ applied: false, reason: 'QUEST_ALREADY_CLAIMED' });
    expect(firestore.docs.get(profilePath)).toMatchObject({ gold: 20, battleEnergy: 0, materials: { iron: 5 } });
    expect(firestore.docs.get('families/family/apps/junior-high/rpgQuestState/current').claimedQuestIds).toEqual(['first_equipment']);
    expect(firestore.docs.get('families/family/apps/junior-high/rpgQuestLedger/quest-claim-first_equipment')).toMatchObject({ type: 'quest_claim' });
  });
});
