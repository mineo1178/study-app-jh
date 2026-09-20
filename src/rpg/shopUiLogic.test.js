import { describe, expect, it } from 'vitest';
import { EQUIPMENT_CATALOG } from './equipmentCatalog.js';
import { getShopItemState, groupOwnedEquipment, isEquipmentEquipped } from './shopUiLogic.js';

describe('shop UI logic', () => {
  const sword = EQUIPMENT_CATALOG.iron_sword;
  it('identifies purchasable, gold-short, material-short, and owned items', () => {
    expect(getShopItemState({ gold: 100, materials: { iron: 5 } }, sword).purchasable).toBe(true);
    expect(getShopItemState({ gold: 50, materials: { iron: 5 } }, sword).insufficientGold).toBe(true);
    expect(getShopItemState({ gold: 100, materials: { iron: 2 } }, sword).insufficientMaterials).toBe(true);
    expect(getShopItemState({ gold: 100, materials: { iron: 5 }, ownedEquipment: { iron_sword: {} } }, sword).owned).toBe(true);
  });
  it('groups ownership and recognises currently equipped items safely', () => {
    const profile = { ownedEquipment: { iron_sword: {}, mineral_armor: {}, history_charm: {} }, equipped: { weapon: 'iron_sword' } };
    const grouped = groupOwnedEquipment(profile, EQUIPMENT_CATALOG);
    expect(grouped.weapon.map((item) => item.id)).toEqual(['iron_sword']);
    expect(grouped.armor.map((item) => item.id)).toEqual(['mineral_armor']);
    expect(grouped.accessory.map((item) => item.id)).toEqual(['history_charm']);
    expect(isEquipmentEquipped(profile, EQUIPMENT_CATALOG.iron_sword)).toBe(true);
    expect(getShopItemState(null, sword).purchasable).toBe(false);
    expect(groupOwnedEquipment({ materials: undefined, ownedEquipment: undefined, equipped: undefined }, EQUIPMENT_CATALOG).weapon).toEqual([]);
  });
});
