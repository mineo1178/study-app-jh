import { describe, expect, it } from 'vitest';
import { ENEMY_CATALOG, ENEMY_CATALOG_VERSION } from './enemyCatalog.js';
describe('enemy catalog', () => { it('defines the v2 enemies', () => { expect(ENEMY_CATALOG_VERSION).toBe(2); expect(ENEMY_CATALOG.slime).toMatchObject({ maxHp: 20, energyCost: 1, expReward: 20 }); expect(ENEMY_CATALOG.goblin).toMatchObject({ maxHp: 38, energyCost: 1, expReward: 35 }); expect(ENEMY_CATALOG.stone_golem).toMatchObject({ maxHp: 74, energyCost: 2, expReward: 70 }); }); });
