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

import { getEquipmentCatalogItem } from '../rpg/equipmentCatalog.js';
import { equipItem, prepareEquip, preparePurchase, prepareUnequip, purchaseEquipment } from './rpgShopRepository.js';

const now = 123456;
const baseProfile = (overrides = {}) => ({ gold: 100, materials: { iron: 10, wisdom_scroll: 4, mana_rune: 4 }, ...overrides });
const purchase = (profile = baseProfile(), actionId = 'purchase-1') => preparePurchase({ profile, item: getEquipmentCatalogItem('iron_sword'), actionId, now });

describe('rpg shop purchase logic', () => {
  it('purchases once, preserves equipment, and records the immutable paid cost', () => {
    const result = purchase({ ...baseProfile(), equipped: { weapon: 'history_charm' } });
    expect(result.profile).toMatchObject({ gold: 20, materials: { iron: 5 }, equipped: { weapon: 'history_charm' } });
    expect(result.profile.ownedEquipment.iron_sword).toEqual({ acquiredAt: now, sourceActionId: 'purchase-1' });
    expect(result.ledger).toMatchObject({ type: 'purchase', itemId: 'iron_sword', catalogVersion: 2, cost: { gold: 80, materials: { iron: 5 } } });
  });

  it('rejects insufficient gold or materials without returning a partial change', async () => {
    expect(() => purchase(baseProfile({ gold: 50 }))).toThrow('INSUFFICIENT_GOLD');
    expect(() => purchase(baseProfile({ materials: { iron: 2 } }))).toThrow('INSUFFICIENT_MATERIALS');
    await expect(purchaseEquipment({ db: {}, familyId: 'family', itemId: 'unknown', actionId: 'unknown' })).rejects.toThrow('ITEM_NOT_FOUND');
  });

  it('rejects a separately requested duplicate item purchase', () => {
    const once = purchase();
    expect(() => purchase(once.profile, 'purchase-2')).toThrow('ALREADY_OWNED');
  });

  it('treats the same action ID as an idempotent transaction', async () => {
    firestore.docs.clear();
    const profilePath = 'families/family/apps/junior-high/rpg/playerProfile';
    firestore.docs.set(profilePath, baseProfile());
    const first = await purchaseEquipment({ db: {}, familyId: 'family', itemId: 'iron_sword', actionId: 'once' });
    const second = await purchaseEquipment({ db: {}, familyId: 'family', itemId: 'iron_sword', actionId: 'once' });
    expect(first.applied).toBe(true);
    expect(second).toEqual({ applied: false, reason: 'ALREADY_APPLIED' });
    expect(firestore.docs.get(profilePath).gold).toBe(20);
    expect(firestore.docs.get(profilePath).materials.iron).toBe(5);
  });
  it('blocks purchases during a pending reward correction but still permits equipment changes', async () => {
    firestore.docs.clear();
    const profilePath = 'families/family/apps/junior-high/rpg/playerProfile';
    const integrityPath = 'families/family/apps/junior-high/rewardIntegrity/current';
    firestore.docs.set(profilePath, { ...baseProfile(), ownedEquipment: { iron_sword: { acquiredAt: 1, sourceActionId: 'seed' } } });
    firestore.docs.set(integrityPath, { pendingSessionIds: ['session-1'] });
    await expect(purchaseEquipment({ db: {}, familyId: 'family', itemId: 'scholar_blade', actionId: 'blocked' })).rejects.toThrow('REWARD_CORRECTION_PENDING');
    await expect(equipItem({ db: {}, familyId: 'family', itemId: 'iron_sword', actionId: 'equip-while-pending' })).resolves.toMatchObject({ applied: true });
    expect(firestore.docs.get(profilePath).equipped.weapon).toBe('iron_sword');
  });
});

describe('rpg equipment logic', () => {
  const owned = { gold: 0, materials: {}, ownedEquipment: { iron_sword: { acquiredAt: 1, sourceActionId: 'a' }, scholar_blade: { acquiredAt: 2, sourceActionId: 'b' } } };

  it('equips an owned item and records the prior slot state', () => {
    const result = prepareEquip({ profile: owned, item: getEquipmentCatalogItem('iron_sword'), actionId: 'equip-1', now });
    expect(result.profile.equipped.weapon).toBe('iron_sword');
    expect(result.ledger).toMatchObject({ type: 'equip', previousItemId: null, nextItemId: 'iron_sword' });
  });

  it('swaps without losing either owned item', () => {
    const result = prepareEquip({ profile: { ...owned, equipped: { weapon: 'iron_sword' } }, item: getEquipmentCatalogItem('scholar_blade'), actionId: 'equip-2', now });
    expect(result.profile.equipped.weapon).toBe('scholar_blade');
    expect(Object.keys(result.profile.ownedEquipment)).toEqual(['iron_sword', 'scholar_blade']);
    expect(result.ledger.previousItemId).toBe('iron_sword');
  });

  it('rejects an unowned or already-equipped item without a change', () => {
    expect(() => prepareEquip({ profile: baseProfile(), item: getEquipmentCatalogItem('iron_sword'), actionId: 'x', now })).toThrow('ITEM_NOT_OWNED');
    expect(() => prepareEquip({ profile: { ...owned, equipped: { weapon: 'iron_sword' } }, item: getEquipmentCatalogItem('iron_sword'), actionId: 'x', now })).toThrow('ALREADY_EQUIPPED');
  });

  it('unequips without deleting ownership and rejects no-op or invalid slots', () => {
    const result = prepareUnequip({ profile: { ...owned, equipped: { weapon: 'iron_sword' } }, slot: 'weapon', actionId: 'unequip-1', now });
    expect(result.profile.equipped.weapon).toBeNull();
    expect(result.profile.ownedEquipment.iron_sword).toBeDefined();
    expect(result.ledger).toMatchObject({ type: 'unequip', previousItemId: 'iron_sword', nextItemId: null });
    expect(() => prepareUnequip({ profile: owned, slot: 'weapon', actionId: 'x', now })).toThrow('ALREADY_UNEQUIPPED');
    expect(() => prepareUnequip({ profile: owned, slot: 'helmet', actionId: 'x', now })).toThrow('INVALID_EQUIPMENT_SLOT');
  });
});
