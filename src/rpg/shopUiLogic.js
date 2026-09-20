import { EQUIPMENT_SLOTS } from './equipmentCatalog.js';
import { normalizePlayerProfile } from './playerProfile.js';

const amount = (value) => Number(value) || 0;

export function getShopItemState(profile, item) {
  const safe = normalizePlayerProfile(profile || {});
  const materialShortages = Object.entries(item?.cost?.materials || {}).map(([materialKey, required]) => ({
    materialKey,
    required: amount(required),
    current: amount(safe.materials[materialKey]),
  })).filter((entry) => entry.current < entry.required);
  const goldRequired = amount(item?.cost?.gold);
  const goldCurrent = amount(safe.gold);
  const owned = Boolean(item?.id && safe.ownedEquipment[item.id]);
  return {
    owned,
    insufficientGold: !owned && goldCurrent < goldRequired,
    insufficientMaterials: !owned && materialShortages.length > 0,
    purchasable: Boolean(item?.id) && !owned && goldCurrent >= goldRequired && materialShortages.length === 0,
    goldCurrent,
    goldRequired,
    goldShortage: Math.max(0, goldRequired - goldCurrent),
    materialShortages,
  };
}

export function groupOwnedEquipment(profile, catalog) {
  const safe = normalizePlayerProfile(profile || {});
  const grouped = Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, []]));
  Object.keys(safe.ownedEquipment).forEach((itemId) => {
    const item = catalog[itemId];
    if (item && grouped[item.slot]) grouped[item.slot].push(item);
  });
  return grouped;
}

export const isEquipmentEquipped = (profile, item) => Boolean(item?.id && normalizePlayerProfile(profile || {}).equipped[item.slot] === item.id);
