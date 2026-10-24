import { beforeEach, describe, expect, it, vi } from 'vitest';
const store = vi.hoisted(() => ({ docs: new Map(), retry: null, fail: false }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => ({ path: parts.join('/') }),
  runTransaction: async (_db, callback) => {
    const attempt = async commit => {
      const writes = [];
      const result = await callback({ get: async ref => { const value = structuredClone(store.docs.get(ref.path)); return { exists: () => value !== undefined, data: () => value }; }, set: (ref, value, options) => writes.push([ref.path, structuredClone(value), options]) });
      if (store.fail) throw Error('NETWORK_FAILURE');
      if (commit) for (const [path, value, options] of writes) store.docs.set(path, options?.merge ? { ...store.docs.get(path), ...value } : value);
      return result;
    };
    if (store.retry) { await attempt(false); store.retry(); store.retry = null; }
    return attempt(true);
  },
}));
import { saveStatAllocation, prepareStatAllocation } from './rpgStatAllocationRepository.js';
import { startBattle, useBattleSkill } from './rpgBattleRepository.js';
import { totalExpForLevel } from '../rpg/levelSystem.js';
const path = 'families/family/apps/junior-high/rpg/playerProfile';
const integrity = 'families/family/apps/junior-high/rewardIntegrity/current';
const player = () => ({ totalExp: totalExpForLevel(10), gold: 300, battleEnergy: 10, statAllocation: { hp: 6, mp: 3 }, custom: { untouched: true } });
const expected = p => ({ ...p.statAllocation, totalExp: p.totalExp, gold: p.gold });
const args = p => ({ db: {}, familyId: 'family', actionId: 'allocate', allocation: { hp: 3, mp: 6 }, expected: expected(p) });
beforeEach(() => { store.docs.clear(); store.retry = null; store.fail = false; store.docs.set(path, player()); });
describe('allocation transactions', () => {
  it('charges 120G atomically, preserves all fields, records ledger and deduplicates actionId', async () => {
    const p = player(), result = await saveStatAllocation(args(p));
    expect(store.docs.get(path)).toEqual({ ...p, statAllocation: { hp: 3, mp: 6 }, gold: 180, updatedAt: expect.any(Number) });
    expect(result.ledger).toMatchObject({ type: 'stat_allocation', before: p.statAllocation, after: { hp: 3, mp: 6 }, cost: { gold: 120 }, goldAfter: 180 });
    const after = structuredClone([...store.docs]);
    expect(await saveStatAllocation(args(p))).toEqual({ applied: false, reason: 'ALREADY_APPLIED' });
    expect([...store.docs]).toEqual(after);
    await expect(saveStatAllocation({ ...args(p), actionId: 'another' })).rejects.toThrow('STAT_PROFILE_CHANGED');
  });
  it('adds points free and cannot move allocation by first reducing it for free', async () => {
    const p = { ...player(), statAllocation: { hp: 3, mp: 2 } }; store.docs.set(path, p);
    const result = await saveStatAllocation({ ...args(p), allocation: { hp: 5, mp: 3 } });
    expect(result.profile.gold).toBe(300); expect(result.ledger.cost.gold).toBe(0);
    const current = store.docs.get(path);
    const reset = await saveStatAllocation({ ...args(current), actionId: 'reset', allocation: { hp: 0, mp: 0 } });
    expect(reset.profile.gold).toBe(180);
  });
  it.each(['gold','totalExp','statAllocation','activeBattleId'])('rejects changed %s on a transaction retry without a write', async field => {
    const p = player();
    store.retry = () => store.docs.set(path, { ...p, [field]: { gold: 299, totalExp: p.totalExp + 100, statAllocation: { hp: 5, mp: 4 }, activeBattleId: 'other-device' }[field] });
    await expect(saveStatAllocation(args(p))).rejects.toThrow(field === 'activeBattleId' ? 'STAT_CHANGE_DURING_BATTLE' : 'STAT_PROFILE_CHANGED');
    expect(store.docs.size).toBe(1);
  });
  it('retries an unchanged transaction without double charging', async () => { store.retry = () => {}; await saveStatAllocation(args(player())); expect(store.docs.get(path).gold).toBe(180); expect(store.docs.size).toBe(2); });
  it('leaves allocation and GOLD untouched on insufficient balance and network failure', async () => {
    const p = { ...player(), gold: 119 }; store.docs.set(path, p);
    await expect(saveStatAllocation(args(p))).rejects.toThrow('INSUFFICIENT_GOLD'); expect(store.docs.get(path)).toEqual(p);
    store.docs.set(path, player()); store.fail = true;
    await expect(saveStatAllocation(args(player()))).rejects.toThrow('NETWORK_FAILURE'); expect(store.docs.get(path)).toEqual(player());
  });
  it('blocks paid reallocation during correction but permits a free addition', async () => {
    const p = { ...player(), statAllocation: { hp: 3, mp: 2 } }; store.docs.set(path, p); store.docs.set(integrity, { pendingSessionIds: ['pending'] });
    await expect(saveStatAllocation({ ...args(p), allocation: { hp: 2, mp: 3 } })).rejects.toThrow('REWARD_CORRECTION_PENDING');
    expect((await saveStatAllocation({ ...args(p), allocation: { hp: 4, mp: 2 } })).ledger.cost.gold).toBe(0);
  });
  it('rejects corrupt saved allocation rather than repairing or overwriting it', () => {
    const p = { ...player(), statAllocation: { hp: -1, mp: 0 } };
    expect(() => prepareStatAllocation({ ...args(p), profile: p, now: 1 })).toThrow('INVALID_STAT_ALLOCATION');
    expect(p.statAllocation.hp).toBe(-1);
  });
  it('blocks allocation after another device starts a battle', async () => {
    const p = player(); await startBattle({ db: {}, familyId: 'family', enemyId: 'slime', battleId: 'active' });
    await expect(saveStatAllocation(args(p))).rejects.toThrow('STAT_CHANGE_DURING_BATTLE');
    expect(store.docs.get(path).gold).toBe(300);
  });
  it('deduplicates persisted MP actions, including lost-response replay', async () => {
    const base = { db: {}, familyId: 'family', battleId: 'mp' };
    await startBattle({ ...base, enemyId: 'slime' });
    const action = { ...base, skillId: 'guard_stance', actionId: 'guard' };
    await useBattleSkill(action);
    const battlePath = 'families/family/apps/junior-high/rpgBattles/mp';
    expect(store.docs.get(battlePath).playerMp).toBe(12);
    expect(await useBattleSkill(action)).toEqual({ applied: false, reason: 'ALREADY_APPLIED' });
    expect(store.docs.get(battlePath).playerMp).toBe(12);
  });
});
