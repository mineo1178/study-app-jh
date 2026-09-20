import { describe, expect, it } from 'vitest';
import { battleEnergyState, battleHpPercent, battleIsActive } from './battleUiLogic.js';
describe('battle UI logic', () => { it('handles energy, hp and active state safely', () => { expect(battleEnergyState({ battleEnergy: 0 }, { energyCost: 1 }).sufficient).toBe(false); expect(battleEnergyState({ battleEnergy: 2 }, { energyCost: 1 }).sufficient).toBe(true); expect(battleHpPercent({ enemyHp: 10, enemySnapshot: { maxHp: 20 } })).toBe(50); expect(battleHpPercent(null)).toBe(0); expect(battleIsActive({ status: 'active' })).toBe(true); }); });
