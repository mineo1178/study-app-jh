import { ENEMY_CATALOG } from './enemyCatalog.js';
import { BOSS_CATALOG } from './bossCatalog.js';

export const TOWER_RULES_VERSION = 1;
export const TOWER_BOSS_INTERVAL = 10;
const number = (value) => Math.max(0, Number(value) || 0);
export const isTowerBossFloor = (floor) => Number.isInteger(Number(floor)) && Number(floor) > 0 && Number(floor) % TOWER_BOSS_INTERVAL === 0;
export const towerTierForFloor = (floor) => Math.floor((Math.max(1, Number(floor) || 1) - 1) / TOWER_BOSS_INTERVAL);
const scaled = (base, multiplier) => Math.max(1, Math.round(number(base) * multiplier));

export function buildTowerEnemy({ floor, baseEnemy }) {
  const safeFloor = Math.max(1, Math.floor(Number(floor) || 1));
  const boss = isTowerBossFloor(safeFloor);
  const tier = towerTierForFloor(safeFloor);
  const base = baseEnemy || (boss
    ? (safeFloor / TOWER_BOSS_INTERVAL % 2 === 1 ? BOSS_CATALOG.orc_chief : BOSS_CATALOG.ancient_golem)
    : [ENEMY_CATALOG.slime, ENEMY_CATALOG.goblin, ENEMY_CATALOG.stone_golem][(safeFloor - 1) % 3]);
  const hpMultiplier = 1 + tier * 0.20;
  const attackMultiplier = 1 + tier * 0.10;
  const expMultiplier = 1 + tier * 0.15;
  return {
    id: `tower-${boss ? 'boss' : 'normal'}-${safeFloor}-${base.id}`,
    name: boss ? `塔の${base.name}` : `塔の${base.name}`,
    element: base.element,
    weaknesses: [...(base.weaknesses || [])],
    resistances: [...(base.resistances || [])],
    maxHp: scaled(base.maxHp, hpMultiplier),
    attack: scaled(base.attack, attackMultiplier),
    expReward: scaled(base.expReward, expMultiplier),
    energyCost: boss ? 3 : 1,
    actionPattern: [...(base.actionPattern || [])],
    tower: { rulesVersion: TOWER_RULES_VERSION, floor: safeFloor, tier, boss },
  };
}
