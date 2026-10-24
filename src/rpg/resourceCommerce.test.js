import { describe, expect, it } from 'vitest';
import { MATERIAL_KEYS } from './rewardConfig.js';
import { ALCHEMY_ITEMS } from './gachaCatalog.js';
import { EQUIPMENT_CATALOG } from './equipmentCatalog.js';
import { hasEquipmentPrice, RESOURCE_SHOP_CATALOG, getResourceShopItem } from './resourceShopCatalog.js';
import { MATERIAL_TRADE_CATALOG, getMaterialTrade } from './materialTradeCatalog.js';
import { resourceTransactionState } from './resourceTransactions.js';
import { getShopItemState } from './shopUiLogic.js';
import { preparePurchase, prepareResourcePurchase } from '../data/rpgShopRepository.js';
import { prepareMaterialTrade } from '../data/rpgMaterialExchangeRepository.js';

const buys = Object.values(RESOURCE_SHOP_CATALOG), trades = Object.values(MATERIAL_TRADE_CATALOG);
const rich = { gold: 5000, materials: Object.fromEntries(MATERIAL_KEYS.map(key => [key, 50])) };
const buy = (itemId, profile = rich, quantity = 1) => prepareResourcePurchase({ profile, itemId, quantity, actionId: 'buy', now: 1 });
const trade = (recipeId, profile = rich, quantity = 1) => prepareMaterialTrade({ profile, recipeId, quantity, actionId: 'trade', now: 1 });
describe('resource catalog and validation', () => {
  it('defines 18 unique products and 108 unique recipes with valid IDs, counts and prices', () => {
    expect(buys).toHaveLength(18); expect(trades).toHaveLength(108);
    const ids = [...buys, ...trades].map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of [...buys, ...trades]) {
      expect(item.name).toBeTruthy();
      for (const [key, count] of Object.entries({ ...item.cost.materials, ...item.receive.materials })) { expect(MATERIAL_KEYS).toContain(key); expect(Number.isSafeInteger(count) && count > 0).toBe(true); }
      for (const [key, count] of Object.entries(item.receive.alchemyItems)) { expect(['N', 'R']).toContain(ALCHEMY_ITEMS[key]?.rarity); expect(count).toBe(1); }
      if (buys.includes(item)) expect(Number.isSafeInteger(item.cost.gold) && item.cost.gold > 0).toBe(true);
    }
    for (const recipe of trades.filter(item => item.category === 'alchemy')) expect(Object.values(recipe.cost.materials).reduce((a,b) => a+b, 0)).toBe(ALCHEMY_ITEMS[Object.keys(recipe.receive.alchemyItems)[0]].rarity === 'N' ? 5 : 12);
  });
  it.each(Object.values(EQUIPMENT_CATALOG))('maintains the sale status of $id', item => {
    const purchasable = hasEquipmentPrice(item);
    expect(getShopItemState(rich, item).purchasable).toBe(purchasable);
    if (purchasable) expect(preparePurchase({ profile: rich, item, actionId: 'equipment', now: 1 }).ledger.cost).toEqual(item.cost);
    else expect(() => preparePurchase({ profile: rich, item, actionId: 'equipment', now: 1 })).toThrow('ITEM_NOT_FOR_SALE');
    expect(Object.values(EQUIPMENT_CATALOG).filter(hasEquipmentPrice)).toHaveLength(6);
  });
  it.each([undefined, null, {}, { id: 'bad' }, { id: 'fake', cost: { gold: 0 } }, { id: 'fake', cost: { gold: -1 } }])('does not offer unpriced equipment: %j', item => expect(getShopItemState(rich, item).purchasable).toBe(false));
  it.each(['missing', '__proto__', 'constructor'])('rejects unknown catalog ID %s', id => {
    expect(getResourceShopItem(id)).toBeNull(); expect(getMaterialTrade(id)).toBeNull();
    expect(() => buy(id)).toThrow('ITEM_NOT_FOUND'); expect(() => trade(id)).toThrow('ITEM_NOT_FOUND');
  });
  it.each([0, -1, 2, 1.5, '1', Infinity, NaN, null, {}, []])('rejects invalid or non-unit quantity %j', quantity => {
    expect(() => buy('material_iron', rich, quantity)).toThrow('INVALID_QUANTITY');
    expect(() => trade('gold_iron', rich, quantity)).toThrow('INVALID_QUANTITY');
  });
  it('uses the authoritative equipment price even when a caller supplies a forged cost', () => {
    expect(preparePurchase({ profile: rich, item: { id: 'iron_sword', cost: { gold: 0 } }, actionId: 'forged', now: 1 }).ledger.cost.gold).toBe(80);
  });
});
describe('resource transfers and economy', () => {
  it.each(buys)('buys $id with matching ledger and balance deltas', item => {
    const result = buy(item.id);
    expect(result.profile.gold).toBe(rich.gold - item.cost.gold);
    expect(result.ledger).toMatchObject({ schemaVersion: 2, quantity: 1, cost: item.cost, receive: item.receive, itemSnapshot: item });
    for (const [key, count] of Object.entries(item.receive.materials)) expect(result.profile.materials[key]).toBe(rich.materials[key] + count);
    for (const [key, count] of Object.entries(item.receive.alchemyItems)) expect(result.profile.gacha.alchemyItems[key]).toBe(count);
    expect(() => buy(item.id, { gold: item.cost.gold - 1 })).toThrow('INSUFFICIENT_GOLD');
  });
  it.each(trades)('exchanges $id with exact deductions and gains', item => {
    const result = trade(item.id);
    for (const key of MATERIAL_KEYS) expect(result.profile.materials[key]).toBe(rich.materials[key] - (item.cost.materials[key] || 0) + (item.receive.materials[key] || 0));
    expect(result.profile.gold).toBe(rich.gold + item.receive.gold);
    expect(result.ledger.cost).toEqual(item.cost); expect(result.ledger.receive).toEqual(item.receive);
    expect(() => trade(item.id, { materials: {} })).toThrow('INSUFFICIENT_EXCHANGE_MATERIAL');
  });
  it('preserves unrelated and unknown fields, including nested profile data', () => {
    const original = { ...rich, totalExp: 1000, level: 7, battleEnergy: 9, activeBattleId: 'active', ownedEquipment: { iron_sword: {} }, equipped: { weapon: 'iron_sword', future: 'keep' }, weeklyBoss: { totalClears: 3, future: 1 }, selectedTitleId: 'title', future: { keep: true }, gacha: { ticketBalances: { gold: 2 }, recentDraws: ['unchanged'], alchemyItems: { dragon_scale: 2 }, future: 8 } };
    for (const result of [buy('material_iron', original), buy('alchemy_magic_crystal', original), trade('trade_magic_crystal', original), preparePurchase({ profile: original, item: EQUIPMENT_CATALOG.scholar_blade, actionId: 'equip', now: 1 })]) {
      for (const key of ['totalExp', 'level', 'battleEnergy', 'activeBattleId', 'ownedEquipment', 'equipped', 'weeklyBoss', 'selectedTitleId', 'future']) if (key !== 'ownedEquipment' || !result.ledger.receive?.equipment) expect(result.profile[key]).toEqual(original[key]);
      expect(result.profile.gacha.future).toBe(8); expect(result.profile.gacha.ticketBalances.gold).toBe(2); expect(result.profile.gacha.alchemyItems.dragon_scale).toBe(2);
    }
    expect(original.materials.iron).toBe(50);
  });
  it('previews shortages and current/after values without mutating a profile', () => {
    const profile = { gold: 20, materials: { iron: 0 } }, before = structuredClone(profile);
    const state = resourceTransactionState(profile, getResourceShopItem('material_iron'));
    expect(state.available).toBe(false); expect(state.rows[0]).toMatchObject({ before: 20, after: -10, shortage: 10 }); expect(profile).toEqual(before);
  });
  it('has no value-increasing cycle under a common potential for every product and recipe', () => {
    const value = resources => (resources.gold || 0) + Object.values(resources.materials || {}).reduce((a,b) => a+b, 0) * 5 + Object.entries(resources.alchemyItems || {}).reduce((sum,[key,count]) => sum + count * (ALCHEMY_ITEMS[key].rarity === 'N' ? 25 : 60), 0);
    for (const item of [...buys, ...trades]) expect(value(item.receive)).toBeLessThanOrEqual(value(item.cost));
    // Every allowed step is non-increasing, hence any composition is too.
    expect(buys.filter(item => item.category === 'alchemy').map(item => item.cost.gold)).toEqual([90,90,90,90,240,240,240,240]);
  });
  it('loses 75G after buying three materials then selling them and loses resources on swap loops', () => {
    let profile = { gold: 100, materials: { iron: 0 } };
    for (let i=0;i<3;i++) profile = buy('material_iron', profile).profile;
    profile = trade('gold_iron', profile).profile; expect(profile.gold).toBe(25); expect(profile.materials.iron).toBe(0);
    const one = trade('swap_iron_to_mana_rune', { gold: 0, materials: { iron: 9 } });
    const two = trade('swap_iron_to_mana_rune', one.profile); const three = trade('swap_iron_to_mana_rune', two.profile);
    const loop = trade('swap_mana_rune_to_iron', three.profile); expect(loop.profile.materials).toMatchObject({ iron: 1, mana_rune: 0 });
  });
});
