import { ENEMY_CATALOG } from './enemyCatalog.js';
import { BOSS_CATALOG } from './bossCatalog.js';

export const TOWER_RULES_VERSION = 5;
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
  // Party battles need their own baseline: all living allies act before enemies.
  // Floor growth also applies within each decade; later tiers add pressure.
  // A continuous ramp after floor 20: no extra jumps at 21/41/61/81.
  const highFloorGrowth = (Math.max(0, safeFloor - 20) / 80) ** 2;
  const hpMultiplier = 1 + (safeFloor - 1) * 0.06 + tier * tier * 0.025;
  const attackMultiplier = 1 + (safeFloor - 1) * 0.045 + tier * tier * 0.02;
  const bossBase = base.id === 'orc_chief' || base.id === 'ancient_golem';
  const baseHp = bossBase ? base.maxHp * 0.65 : 20 + base.maxHp * 0.5;
  const baseAttack = bossBase ? Math.max(10, base.attack) : base.attack + 4;
  const normalHpRelief = !bossBase && safeFloor > 3 ? 0.96 : 1;
  const normalAttackRelief = !bossBase && safeFloor > 3 ? 0.95 : 1;
  const expMultiplier = 1 + tier * 0.15;
  return {
    id: `tower-${boss ? 'boss' : 'normal'}-${safeFloor}-${base.id}`,
    name: boss ? `塔の${base.name}` : `塔の${base.name}`,
    element: base.element,
    weaknesses: [...(base.weaknesses || [])],
    resistances: [...(base.resistances || [])],
    maxHp: scaled(baseHp, hpMultiplier * normalHpRelief * (1 + 0.4 * highFloorGrowth)),
    attack: scaled(baseAttack, attackMultiplier * (bossBase ? 0.70 : normalAttackRelief) * (1 + 0.2 * highFloorGrowth)),
    expReward: scaled(base.expReward, expMultiplier),
    energyCost: boss ? 3 : 1,
    actionPattern: [...(base.actionPattern || [])],
    tower: { rulesVersion: TOWER_RULES_VERSION, floor: safeFloor, tier, boss },
  };
}

export function buildTowerEncounter({ floor }) {
  const safeFloor = Math.max(1, Math.floor(Number(floor) || 1));
  const boss = isTowerBossFloor(safeFloor);
  const withinDecade = (safeFloor - 1) % 10 + 1;
  const count = boss ? Math.min(3, safeFloor >= 20 ? 3 : 2) : withinDecade <= 3 ? 1 : withinDecade <= 6 ? 2 : 3;
  const primary = buildTowerEnemy({ floor: safeFloor });
  const choices = [ENEMY_CATALOG.slime, ENEMY_CATALOG.goblin, ENEMY_CATALOG.stone_golem];
  const enemies = Array.from({ length: count }, (_, index) => {
    const base = index === 0 ? (boss ? (safeFloor / 10 % 2 === 1 ? BOSS_CATALOG.orc_chief : BOSS_CATALOG.ancient_golem) : choices[(safeFloor - 1) % choices.length]) : choices[(safeFloor + index - 1) % choices.length];
    const enemy = index === 0 ? primary : buildTowerEnemy({ floor: safeFloor, baseEnemy: base });
    return { ...enemy, enemyId: base.id, enemyInstanceId: `tower-${safeFloor}-e${index + 1}-${base.id}` };
  });
  return { floor: safeFloor, rulesVersion: TOWER_RULES_VERSION, energyCost: boss ? 3 : 1, expReward: enemies.reduce((sum, enemy) => sum + enemy.expReward, 0), enemies, boss };
}
