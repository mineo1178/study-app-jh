import { describe, expect, it } from 'vitest';
import { calculateAttackResult, calculatePlayerAttack } from './battleCalculator.js';
describe('battle calculator', () => {
  it('adds only valid owned equipment attack', () => {
    expect(calculatePlayerAttack({})).toBe(5);
    expect(calculatePlayerAttack({ ownedEquipment: { iron_sword: {} }, equipped: { weapon: 'iron_sword' } })).toBe(10);
    expect(calculatePlayerAttack({ ownedEquipment: { iron_sword: {}, mineral_armor: {}, history_charm: {} }, equipped: { weapon: 'iron_sword', armor: 'mineral_armor', accessory: 'history_charm' } })).toBe(12);
    expect(calculatePlayerAttack({ equipped: { weapon: 'unknown_item', armor: 'mineral_armor' } })).toBe(5);
  });
  it('uses fixed damage and floors HP at zero', () => { expect(calculateAttackResult(20, 10)).toMatchObject({ hpAfter: 10, victory: false }); expect(calculateAttackResult(5, 10)).toMatchObject({ hpAfter: 0, victory: true }); });
});
