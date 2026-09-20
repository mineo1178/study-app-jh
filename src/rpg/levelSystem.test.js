import { describe, expect, it } from 'vitest';
import { expToNextLevel, levelForTotalExp, totalExpForLevel } from './levelSystem.js';
describe('level system', () => {
  it('uses the cumulative level curve at every boundary', () => {
    expect([0, 99, 100, 249, 250, 449, 450, 700].map(levelForTotalExp)).toEqual([1, 1, 2, 2, 3, 3, 4, 5]);
    expect([1, 2, 3, 4, 5, 6].map(totalExpForLevel)).toEqual([0, 100, 250, 450, 700, 1000]);
  });
  it('handles invalid values and reports next level distance', () => {
    expect(levelForTotalExp(-10)).toBe(1); expect(totalExpForLevel(0)).toBe(0); expect(expToNextLevel(90)).toBe(10);
  });
});
