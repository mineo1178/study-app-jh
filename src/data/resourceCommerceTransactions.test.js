import { beforeEach, describe, expect, it, vi } from 'vitest';
const store = vi.hoisted(() => ({ docs: new Map(), versions: new Map(), fail: false }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => ({ path: parts.join('/') }),
  runTransaction: async (_db, callback) => {
    for (let attempt=0;attempt<20;attempt++) {
      const reads = new Map(), writes = new Map();
      const result = await callback({ get: async ref => { reads.set(ref.path, store.versions.get(ref.path) || 0); const data=structuredClone(store.docs.get(ref.path)); return { exists: () => data !== undefined, data: () => data }; }, set: (ref,data) => writes.set(ref.path,structuredClone(data)) });
      if (store.fail) throw new Error('TRANSACTION_FAILED');
      if ([...reads].some(([path,version]) => version !== (store.versions.get(path) || 0))) continue;
      for (const[path,data]of writes) { store.docs.set(path,data); store.versions.set(path,(store.versions.get(path)||0)+1); }
      return result;
    }
    throw new Error('RETRY_LIMIT');
  },
}));
import { purchaseEquipment, purchaseResource } from './rpgShopRepository.js';
import { exchangeMaterial } from './rpgMaterialExchangeRepository.js';
const path='families/family/apps/junior-high/rpg/playerProfile';
const args={ db: {}, familyId: 'family' };
const buy = (actionId, itemId = 'material_iron', extra = {}) => purchaseResource({ ...args, itemId, actionId, ...extra });
const trade = (actionId, recipeId = 'gold_iron', extra = {}) => exchangeMaterial({ ...args, recipeId, actionId, ...extra });
beforeEach(() => { store.docs.clear(); store.versions.clear(); store.fail=false; store.docs.set(path, { gold: 90, materials: { iron: 6, mineral: 6 } }); });
describe('atomic commerce transactions (optimistic retry mock)', () => {
  it('deduplicates concurrent identical action IDs for both existing ledger collections', async () => {
    const results = await Promise.all([buy('once'), buy('once')]);
    expect(results.map(r=>r.applied).sort()).toEqual([false,true]); expect(store.docs.get(path).gold).toBe(60); expect(store.docs.get(path).materials.iron).toBe(7);
    const exchanged=await Promise.all([trade('same'),trade('same')]); expect(exchanged.map(r=>r.applied).sort()).toEqual([false,true]);
    expect(store.docs.get(path)).toMatchObject({ gold: 75, materials: { iron: 4 } });
    expect(store.docs.get('families/family/apps/junior-high/rpgActionLedger/once')).toMatchObject({ type: 'resource_purchase', cost: { gold: 30 } });
    expect(store.docs.get('families/family/apps/junior-high/rpgExchangeLedger/same')).toMatchObject({ type: 'material_trade', receive: { gold: 15 } });
  });
  it('permits repeat purchases and serializes competing distinct actions without lost updates', async () => {
    const results=await Promise.all([buy('one'), buy('two')]); expect(results.every(r=>r.applied)).toBe(true);
    expect(store.docs.get(path)).toMatchObject({ gold: 30, materials: { iron: 8 } });
    await buy('three'); const before=structuredClone(store.docs);
    await expect(buy('four')).rejects.toThrow('INSUFFICIENT_GOLD'); expect(store.docs).toEqual(before);
  });
  it('allows only one competing purchase when funds suffice for one', async () => {
    store.docs.set(path,{ gold: 30 }); const results=await Promise.allSettled([buy('a'),buy('b')]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1); expect(results.find(r=>r.status==='rejected').reason.message).toBe('INSUFFICIENT_GOLD');
    expect(store.docs.get(path)).toMatchObject({ gold: 0, materials: { iron: 1 } });
  });
  it('allows only one competing exchange when materials suffice for one', async () => {
    store.docs.set(path,{ gold: 0, materials: { iron: 3 } }); const results=await Promise.allSettled([trade('a'),trade('b')]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1); expect(store.docs.get(path)).toMatchObject({ gold: 15, materials: { iron: 0 } });
  });
  it('rolls back all writes on transaction failure', async () => {
    const before=structuredClone(store.docs); store.fail=true;
    await expect(buy('fail')).rejects.toThrow('TRANSACTION_FAILED'); await expect(trade('fail')).rejects.toThrow('TRANSACTION_FAILED'); expect(store.docs).toEqual(before);
  });
  it('rejects reward correction, unknown IDs, invalid quantity and invalid action IDs without writes', async () => {
    store.docs.set('families/family/apps/junior-high/rewardIntegrity/current',{ pendingSessionIds: ['pending'] }); const before=structuredClone(store.docs);
    await expect(buy('blocked')).rejects.toThrow('REWARD_CORRECTION_PENDING'); await expect(trade('blocked')).rejects.toThrow('REWARD_CORRECTION_PENDING'); expect(store.docs).toEqual(before);
    await expect(buy('bad','missing')).rejects.toThrow('ITEM_NOT_FOUND'); await expect(trade('bad','missing')).rejects.toThrow('ITEM_NOT_FOUND');
    await expect(buy('bad','material_iron',{ quantity: -1 })).rejects.toThrow('INVALID_QUANTITY'); await expect(trade('bad','gold_iron',{ quantity: 0 })).rejects.toThrow('INVALID_QUANTITY');
    for(const actionId of ['',null,12,'bad/id']) { await expect(buy(actionId)).rejects.toThrow('INVALID_ACTION_ID'); await expect(trade(actionId)).rejects.toThrow('INVALID_ACTION_ID'); }
    expect(store.docs).toEqual(before);
  });
  it('rejects unpriced equipment explicitly through the public transaction API', async () => {
    const before=structuredClone(store.docs);
    await expect(purchaseEquipment({ ...args, itemId: 'dragon_star_blade', actionId: 'free' })).rejects.toThrow('ITEM_NOT_FOR_SALE'); expect(store.docs).toEqual(before);
  });
});
