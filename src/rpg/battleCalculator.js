import { EQUIPMENT_CATALOG, EQUIPMENT_SLOTS } from './equipmentCatalog.js';
import { normalizePlayerProfile } from './playerProfile.js';

export const BASE_PLAYER_ATTACK = 5;
export const BASE_PLAYER_MAX_HP = 40;
export const BASE_PLAYER_DEFENSE = 0;

export const calculatePlayerAttack = (profile) => {
  const safe = normalizePlayerProfile(profile || {});
  const bonus = EQUIPMENT_SLOTS.reduce((total, slot) => {
    const itemId = safe.equipped[slot];
    const item = EQUIPMENT_CATALOG[itemId];
    return total + (item && item.slot === slot && safe.ownedEquipment[itemId] ? Math.max(0, Number(item.stats?.attack) || 0) : 0);
  }, 0);
  return BASE_PLAYER_ATTACK + bonus;
};

export const calculateAttackResult = (enemyHp, attack) => {
  const hpBefore = Math.max(0, Number(enemyHp) || 0);
  const damage = Math.max(0, Number(attack) || 0);
  const hpAfter = Math.max(0, hpBefore - damage);
  return { damage, hpBefore, hpAfter, victory: hpAfter === 0 };
};
export const calculatePlayerDefense = (profile) => { const safe = normalizePlayerProfile(profile || {}); return BASE_PLAYER_DEFENSE + EQUIPMENT_SLOTS.reduce((total, slot) => { const id = safe.equipped[slot]; const item = EQUIPMENT_CATALOG[id]; return total + (item && item.slot === slot && safe.ownedEquipment[id] ? Math.max(0, Number(item.stats?.defense) || 0) : 0); }, 0); };
export const calculatePlayerMaxHp = () => BASE_PLAYER_MAX_HP;
export const calculateEnemyCounterDamage = (enemyAttack, playerDefense) => Math.max(1, (Number(enemyAttack) || 0) - (Number(playerDefense) || 0));
