import { describe, expect, it } from 'vitest';
import { getElementMultiplier } from './battleCalculator.js';
describe('elements', () => { it('uses fixed weak, normal, and resist percentages', () => { expect(getElementMultiplier({ attackElement: 'fire', weaknesses: ['fire'] })).toEqual({ type: 'weak', percent: 150 }); expect(getElementMultiplier({ attackElement: 'fire', resistances: ['fire'] })).toEqual({ type: 'resist', percent: 75 }); expect(getElementMultiplier({ attackElement: 'neutral' })).toEqual({ type: 'normal', percent: 100 }); }); });
