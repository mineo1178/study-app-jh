import { describe, expect, it } from 'vitest';
import { getAlchemyRecipe } from '../rpg/alchemyCatalog.js';
import { prepareAlchemyCraft } from './rpgAlchemyRepository.js';
describe('alchemy crafting', () => {
  it('subtracts each material and adds owned equipment', () => { const result = prepareAlchemyCraft({ profile: { materials: { iron: 8 }, gacha: { alchemyItems: { silver_ore: 2, alchemy_dust: 3 } } }, recipe: getAlchemyRecipe('silver_iron_blade'), actionId: 'a', now: 10 }); expect(result.profile.materials.iron).toBe(0); expect(result.profile.gacha.alchemyItems.silver_ore).toBe(0); expect(result.profile.ownedEquipment.silver_iron_blade).toBeDefined(); });
  it('does not prepare a partial craft when insufficient or owned', () => { const recipe = getAlchemyRecipe('silver_iron_blade'); expect(() => prepareAlchemyCraft({ profile: {}, recipe, actionId: 'a', now: 1 })).toThrow('INSUFFICIENT_ALCHEMY_MATERIALS'); expect(() => prepareAlchemyCraft({ profile: { ownedEquipment: { silver_iron_blade: {} } }, recipe, actionId: 'a', now: 1 })).toThrow('EQUIPMENT_ALREADY_OWNED'); });
});
