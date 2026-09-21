import { describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({ docs: new Map() }));

vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => ({ path: parts.join('/') }),
  runTransaction: async (_db, callback) => callback({
    get: async (reference) => ({
      exists: () => firestore.docs.has(reference.path),
      data: () => firestore.docs.get(reference.path),
    }),
    set: (reference, value) => firestore.docs.set(reference.path, value),
  }),
}));

import { startBattle, startBossBattle } from './rpgBattleRepository.js';

const profilePath = 'families/family/apps/junior-high/rpg/playerProfile';
const progressPath = 'families/family/apps/junior-high/rpgProgress/current';
const integrityPath = 'families/family/apps/junior-high/rewardIntegrity/current';

describe('battle reward-integrity lock', () => {
  it('blocks normal and Boss starts while preserving no active battle side effect', async () => {
    firestore.docs.clear();
    firestore.docs.set(profilePath, { battleEnergy: 10 });
    firestore.docs.set(progressPath, { currentChapterId: 'chapter_1', normalWins: 3 });
    firestore.docs.set(integrityPath, { pendingSessionIds: ['session-1'] });
    await expect(startBattle({ db: {}, familyId: 'family', enemyId: 'slime', battleId: 'blocked-normal' })).rejects.toThrow('REWARD_CORRECTION_PENDING');
    await expect(startBossBattle({ db: {}, familyId: 'family', bossId: 'orc_chief', battleId: 'blocked-boss' })).rejects.toThrow('REWARD_CORRECTION_PENDING');
    expect(firestore.docs.get(profilePath)).toEqual({ battleEnergy: 10 });
  });
});
