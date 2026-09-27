import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({ snapshots: new Map(), queries: [], failure: null }));

vi.mock('firebase/firestore', () => ({
  collection: (_db, ...parts) => ({ path: parts.join('/') }),
  where: (field, operator, value) => ({ field, operator, value }),
  query: (reference, ...constraints) => ({ reference, constraints }),
  getDocs: async (request) => {
    firestore.queries.push(request);
    if (firestore.failure) throw firestore.failure;
    const values = firestore.snapshots.get(request.reference.path) || [];
    return { docs: values.map((value) => ({ data: () => value })) };
  },
}));

import { createCachedEncyclopediaLedgerLoader, loadRpgEncyclopediaLedgers } from './rpgEncyclopediaRepository.js';

const base = 'families/family/apps/junior-high';

beforeEach(() => { firestore.snapshots.clear(); firestore.queries.length = 0; firestore.failure = null; });

describe('RPG encyclopedia ledger repository', () => {
  it('reads only the required action and battle ledger types without writes', async () => {
    firestore.snapshots.set(`${base}/rpgActionLedger`, [{ type: 'gacha_draw' }, null]);
    firestore.snapshots.set(`${base}/rpgBattleLedger`, [{ type: 'battle_start' }]);
    await expect(loadRpgEncyclopediaLedgers({ db: {}, familyId: 'family' })).resolves.toEqual({ actionLedgers: [{ type: 'gacha_draw' }], battleLedgers: [{ type: 'battle_start' }] });
    expect(firestore.queries).toHaveLength(2);
    expect(firestore.queries.map((entry) => entry.reference.path)).toEqual([`${base}/rpgActionLedger`, `${base}/rpgBattleLedger`]);
    expect(firestore.queries[0].constraints).toEqual([{ field: 'type', operator: 'in', value: ['gacha_draw', 'gacha_fragment_exchange', 'alchemy_craft'] }]);
    expect(firestore.queries[1].constraints).toEqual([{ field: 'type', operator: 'in', value: ['battle_start', 'weekly_boss_clear'] }]);
  });

  it('returns empty arrays for empty ledgers and rejects read failures', async () => {
    await expect(loadRpgEncyclopediaLedgers({ db: {}, familyId: 'family' })).resolves.toEqual({ actionLedgers: [], battleLedgers: [] });
    firestore.failure = new Error('READ_FAILED');
    await expect(loadRpgEncyclopediaLedgers({ db: {}, familyId: 'family' })).rejects.toThrow('READ_FAILED');
  });

  it('caches one fulfilled request across tab changes and rerenders', async () => {
    const load = vi.fn(async () => ({ actionLedgers: [], battleLedgers: [] }));
    const cached = createCachedEncyclopediaLedgerLoader(load);
    const first = cached(); const second = cached(); const third = cached();
    expect(first).toBe(second); expect(second).toBe(third);
    await expect(first).resolves.toEqual({ actionLedgers: [], battleLedgers: [] });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('caches a failed request to avoid repeated queries in the same session', async () => {
    const load = vi.fn(async () => { throw new Error('READ_FAILED'); });
    const cached = createCachedEncyclopediaLedgerLoader(load);
    await expect(cached()).rejects.toThrow('READ_FAILED');
    await expect(cached()).rejects.toThrow('READ_FAILED');
    expect(load).toHaveBeenCalledTimes(1);
  });
});
