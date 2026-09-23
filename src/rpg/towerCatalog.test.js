import { describe, expect, it } from 'vitest';
import { buildTowerEnemy, isTowerBossFloor } from './towerCatalog.js';
import { applyTowerVictory, normalizeTowerProgress } from './towerProgress.js';

describe('endless tower rules', () => {
  it('creates deterministic normal and boss floors with gradual scaling', () => {
    expect(isTowerBossFloor(1)).toBe(false); expect(isTowerBossFloor(10)).toBe(true); expect(isTowerBossFloor(11)).toBe(false); expect(isTowerBossFloor(20)).toBe(true);
    const floor1 = buildTowerEnemy({ floor: 1 }); const floor11 = buildTowerEnemy({ floor: 11 }); const floor10 = buildTowerEnemy({ floor: 10 });
    expect(floor1.tower).toMatchObject({ floor: 1, boss: false }); expect(floor10.tower.boss).toBe(true); expect(floor11.maxHp).toBeGreaterThan(floor1.maxHp); expect(floor11.attack).toBeGreaterThanOrEqual(floor1.attack); expect(floor11.expReward).toBeGreaterThan(floor1.expReward);
  });
  it('advances only the current floor and records boss wins', () => {
    expect(normalizeTowerProgress({}).currentFloor).toBe(1);
    const one = applyTowerVictory({}, { floor: 1, boss: false, now: 1 }); expect(one).toMatchObject({ currentFloor: 2, highestFloor: 1, totalWins: 1, bossWins: 0 });
    const nine = applyTowerVictory({ currentFloor: 9, highestFloor: 8, totalWins: 8, bossWins: 0 }, { floor: 9, boss: false, now: 2 }); expect(nine).toMatchObject({ currentFloor: 10, highestFloor: 9, totalWins: 9, bossWins: 0 }); expect(isTowerBossFloor(nine.currentFloor)).toBe(true);
    const ten = applyTowerVictory({ currentFloor: 10, highestFloor: 9, totalWins: 9 }, { floor: 10, boss: true, now: 2 }); expect(ten).toMatchObject({ currentFloor: 11, highestFloor: 10, totalWins: 10, bossWins: 1 });
    expect(() => applyTowerVictory(one, { floor: 3, boss: false, now: 2 })).toThrow('TOWER_FLOOR_MISMATCH');
  });
});
