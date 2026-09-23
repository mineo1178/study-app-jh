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

import { attackBattle, startBattle, startBossBattle, startTowerBattle } from './rpgBattleRepository.js';

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
    await expect(startTowerBattle({ db: {}, familyId: 'family', battleId: 'blocked-tower' })).rejects.toThrow('REWARD_CORRECTION_PENDING');
    expect(firestore.docs.get(profilePath)).toEqual({ battleEnergy: 10 });
  });
  it('locks Tower behind Campaign clear and applies each start and victory transaction once', async () => {
    firestore.docs.clear(); firestore.docs.set(profilePath, { battleEnergy: 10, totalExp: 0, level: 1, equipped: {} }); firestore.docs.set(progressPath, { campaignCompleted: false });
    await expect(startTowerBattle({ db: {}, familyId: 'family', battleId: 'tower-locked' })).rejects.toThrow('TOWER_LOCKED');
    expect(firestore.docs.get(profilePath)).toMatchObject({ battleEnergy: 10 }); expect(firestore.docs.has('families/family/apps/junior-high/rpgBattles/tower-locked')).toBe(false);
    firestore.docs.set(progressPath, { campaignCompleted: true }); const started = await startTowerBattle({ db: {}, familyId: 'family', battleId: 'tower-win' });
    expect(started.applied).toBe(true); expect(firestore.docs.get(profilePath)).toMatchObject({ battleEnergy: 9, activeBattleId: 'tower-win' });
    const battlePath = 'families/family/apps/junior-high/rpgBattles/tower-win'; const storedBattle = firestore.docs.get(battlePath); firestore.docs.set(battlePath, { ...storedBattle, enemyStates: storedBattle.enemyStates.map((enemy) => ({ ...enemy, hp: 1 })) });
    const first = await attackBattle({ db: {}, familyId: 'family', battleId: 'tower-win', actionId: 'tower-action' }); expect(first.victory).toBe(true);
    const afterFirst = structuredClone(firestore.docs.get(profilePath)); const towerPath = 'families/family/apps/junior-high/rpgTowerProgress/current'; const towerAfterFirst = structuredClone(firestore.docs.get(towerPath));
    await expect(attackBattle({ db: {}, familyId: 'family', battleId: 'tower-win', actionId: 'tower-action' })).resolves.toMatchObject({ applied: false, reason: 'ALREADY_APPLIED' });
    await expect(attackBattle({ db: {}, familyId: 'family', battleId: 'tower-win', actionId: 'tower-action-2' })).rejects.toThrow('BATTLE_ALREADY_COMPLETED');
    expect(firestore.docs.get(profilePath)).toEqual(afterFirst); expect(firestore.docs.get(towerPath)).toEqual(towerAfterFirst);
  });
});
