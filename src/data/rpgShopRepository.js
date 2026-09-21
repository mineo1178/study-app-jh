import { doc, runTransaction } from 'firebase/firestore';
import { EQUIPMENT_CATALOG_VERSION, EQUIPMENT_SLOTS, getEquipmentCatalogItem } from '../rpg/equipmentCatalog.js';
import { normalizePlayerProfile } from '../rpg/playerProfile.js';
import { playerProfileRef } from './rewardLedgerRepository.js';
import { assertNoPendingRewardCorrections, rewardIntegrityRef } from './rewardCorrectionRepository.js';

export const RPG_ACTION_LEDGER_SCHEMA_VERSION = 1;

const appPath = (familyId, collectionName, id) => ['families', familyId, 'apps', 'junior-high', collectionName, id];
export const rpgActionLedgerRef = (db, familyId, actionId) => doc(db, ...appPath(familyId, 'rpgActionLedger', actionId));
export const createRpgActionId = (type) => `${type}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

const failure = (code, details = {}) => Object.assign(new Error(code), { code, details });
const number = (value) => Number(value) || 0;
const actionBase = (actionId, type, now) => ({ schemaVersion: RPG_ACTION_LEDGER_SCHEMA_VERSION, actionId, type, status: 'applied', appliedAt: now });

export function preparePurchase({ profile, item, actionId, now }) {
  const current = normalizePlayerProfile(profile);
  if (current.ownedEquipment[item.id]) throw failure('ALREADY_OWNED');
  if (number(current.gold) < number(item.cost.gold)) throw failure('INSUFFICIENT_GOLD');

  for (const [materialKey, required] of Object.entries(item.cost.materials || {})) {
    const available = number(current.materials[materialKey]);
    if (available < number(required)) throw failure('INSUFFICIENT_MATERIALS', { materialKey, required: number(required), current: available });
  }

  const materials = { ...current.materials };
  for (const [materialKey, required] of Object.entries(item.cost.materials || {})) {
    materials[materialKey] = number(materials[materialKey]) - number(required);
  }
  const cost = { gold: number(item.cost.gold), materials: { ...(item.cost.materials || {}) } };
  const nextProfile = {
    ...current,
    gold: number(current.gold) - cost.gold,
    materials,
    ownedEquipment: {
      ...current.ownedEquipment,
      [item.id]: { acquiredAt: now, sourceActionId: actionId },
    },
    updatedAt: now,
  };
  const ledger = {
    ...actionBase(actionId, 'purchase', now),
    itemId: item.id,
    catalogVersion: EQUIPMENT_CATALOG_VERSION,
    itemSnapshot: { name: item.name, slot: item.slot, rarity: item.rarity },
    cost,
  };
  return { profile: nextProfile, ledger };
}

export function prepareEquip({ profile, item, actionId, now }) {
  const current = normalizePlayerProfile(profile);
  if (!current.ownedEquipment[item.id]) throw failure('ITEM_NOT_OWNED');
  const previousItemId = current.equipped[item.slot] || null;
  if (previousItemId === item.id) throw failure('ALREADY_EQUIPPED');
  return {
    profile: { ...current, equipped: { ...current.equipped, [item.slot]: item.id }, updatedAt: now },
    ledger: { ...actionBase(actionId, 'equip', now), itemId: item.id, slot: item.slot, previousItemId, nextItemId: item.id },
  };
}

export function prepareUnequip({ profile, slot, actionId, now }) {
  if (!EQUIPMENT_SLOTS.includes(slot)) throw failure('INVALID_EQUIPMENT_SLOT');
  const current = normalizePlayerProfile(profile);
  const previousItemId = current.equipped[slot] || null;
  if (!previousItemId) throw failure('ALREADY_UNEQUIPPED');
  return {
    profile: { ...current, equipped: { ...current.equipped, [slot]: null }, updatedAt: now },
    ledger: { ...actionBase(actionId, 'unequip', now), slot, previousItemId, nextItemId: null },
  };
}

async function applyAction({ db, familyId, actionId, makeChange, requiresClearRewardIntegrity = false }) {
  const profile = playerProfileRef(db, familyId);
  const ledger = rpgActionLedgerRef(db, familyId, actionId);
  const integrity = rewardIntegrityRef(db, familyId);
  return runTransaction(db, async (transaction) => {
    const [profileSnap, ledgerSnap, integritySnap] = await Promise.all([transaction.get(profile), transaction.get(ledger), transaction.get(integrity)]);
    if (ledgerSnap.exists()) return { applied: false, reason: 'ALREADY_APPLIED' };
    if (requiresClearRewardIntegrity) assertNoPendingRewardCorrections(integritySnap.exists() ? integritySnap.data() : {});
    const change = makeChange(profileSnap.exists() ? profileSnap.data() : {});
    transaction.set(profile, change.profile);
    transaction.set(ledger, change.ledger);
    return { applied: true, profile: change.profile, ledger: change.ledger };
  });
}

export async function purchaseEquipment({ db, familyId, itemId, actionId }) {
  const item = getEquipmentCatalogItem(itemId);
  if (!item) throw failure('ITEM_NOT_FOUND');
  const now = Date.now();
  return applyAction({ db, familyId, actionId, requiresClearRewardIntegrity: true, makeChange: (profile) => preparePurchase({ profile, item, actionId, now }) });
}

export async function equipItem({ db, familyId, itemId, actionId }) {
  const item = getEquipmentCatalogItem(itemId);
  if (!item) throw failure('ITEM_NOT_FOUND');
  const now = Date.now();
  return applyAction({ db, familyId, actionId, makeChange: (profile) => prepareEquip({ profile, item, actionId, now }) });
}

export async function unequipSlot({ db, familyId, slot, actionId }) {
  if (!EQUIPMENT_SLOTS.includes(slot)) throw failure('INVALID_EQUIPMENT_SLOT');
  const now = Date.now();
  return applyAction({ db, familyId, actionId, makeChange: (profile) => prepareUnequip({ profile, slot, actionId, now }) });
}
