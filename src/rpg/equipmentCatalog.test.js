import { describe, expect, it } from 'vitest';
import { EQUIPMENT_CATALOG, EQUIPMENT_CATALOG_VERSION, EQUIPMENT_SLOTS, getEquipmentCatalogItem } from './equipmentCatalog.js';

describe('equipment catalog', () => {
  it('provides versioned items with complete, valid costs', () => {
    expect(EQUIPMENT_CATALOG_VERSION).toBe(1);
    expect(Object.keys(EQUIPMENT_CATALOG)).toHaveLength(6);
    for (const item of Object.values(EQUIPMENT_CATALOG)) {
      expect(item).toMatchObject({ id: expect.any(String), name: expect.any(String), rarity: expect.any(String), description: expect.any(String) });
      expect(EQUIPMENT_SLOTS).toContain(item.slot);
      expect(item.cost.gold).toBeGreaterThanOrEqual(0);
      expect(item.cost.materials).toEqual(expect.any(Object));
      expect(item.stats.attack).toBeGreaterThanOrEqual(0);
    }
  });
  it('gives every equipment item a child-friendly description', () => {
    Object.values(EQUIPMENT_CATALOG).forEach((item) => expect(item.description.trim().length).toBeGreaterThan(0));
  });

  it('looks up catalog items safely', () => {
    expect(getEquipmentCatalogItem('iron_sword')?.slot).toBe('weapon');
    expect(getEquipmentCatalogItem('missing')).toBeNull();
  });
});
