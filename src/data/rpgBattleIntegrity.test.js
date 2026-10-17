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

import { attackBattle, startBattle, startBossBattle, startTowerBattle, startWeeklyBossBattle, useBattleSkill } from './rpgBattleRepository.js';

const profilePath = 'families/family/apps/junior-high/rpg/playerProfile';
const progressPath = 'families/family/apps/junior-high/rpgProgress/current';
const integrityPath = 'families/family/apps/junior-high/rewardIntegrity/current';

describe('battle reward-integrity lock', () => {
  it.each(['campaign', 'tower', 'weekly_boss'])('returns committed feedback and preserves idempotency in %s', async mode => {
    firestore.docs.clear();
    firestore.docs.set(profilePath, { battleEnergy: 10, totalExp: 0, level: 1, equipped: {} });
    firestore.docs.set(progressPath, { campaignCompleted: true });
    const battleId = `feedback-${mode}`;
    const args = { db: {}, familyId: 'family', battleId };
    const start = mode === 'campaign' ? await startBattle({ ...args, enemyId: 'slime' }) : mode === 'tower' ? await startTowerBattle(args) : await startWeeklyBossBattle(args);
    const battlePath = `families/family/apps/junior-high/rpgBattles/${battleId}`;
    if (mode !== 'campaign') {
      const guard = await useBattleSkill({ ...args, skillId: 'guard_stance', actionId: 'guard-action' });
      expect(guard.result.actionEffects).toMatchObject([{ kind: 'guard', guardPercent: 50 }]);
      const stored = structuredClone([...firestore.docs]);
      expect(await useBattleSkill({ ...args, skillId: 'guard_stance', actionId: 'guard-action' })).toEqual({ applied: false, reason: 'ALREADY_APPLIED' });
      expect([...firestore.docs]).toEqual(stored);
      const current = firestore.docs.get(battlePath);
      firestore.docs.set(battlePath, { ...current, enemyStates: current.enemyStates.map(state => ({ ...state, hp: 1 })) });
    } else firestore.docs.set(battlePath, { ...start.battle, enemyHp: 1 });
    const win = await attackBattle({ ...args, actionId: 'final-action' });
    expect(win.victory).toBe(true);
    expect(win.result).toBeDefined();
    expect(win.battle.status).toBe('won');
    const afterWin = structuredClone([...firestore.docs]);
    expect(await attackBattle({ ...args, actionId: 'final-action' })).toEqual({ applied: false, reason: 'ALREADY_APPLIED' });
    await expect(attackBattle({ ...args, actionId: 'late-action' })).rejects.toThrow('BATTLE_ALREADY_COMPLETED');
    expect([...firestore.docs]).toEqual(afterWin);
    // UI feedback remains transient: no new fields in battle or ledger documents.
    for (const [, value] of firestore.docs) {
      expect(value).not.toHaveProperty('actionEffects');
      expect(value).not.toHaveProperty('result');
    }
  });
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
