import { normalizePlayerProfile } from './playerProfile.js';
import { MATERIAL_DEFS } from './rewardConfig.js';
import { ALCHEMY_ITEMS } from './gachaCatalog.js';

const fail = code => { throw Object.assign(new Error(code), { code }); };
export const validateResourceQuantity = quantity => { if (quantity !== 1) fail('INVALID_QUANTITY'); };
export function resourceTransactionState(profile, offer) {
  const current = normalizePlayerProfile(profile || {});
  if (!offer) return { available: false, rows: [] };
  const rows = [{ key: 'gold', label: 'GOLD', before: Number(current.gold) || 0, spend: offer.cost.gold, receive: offer.receive.gold }];
  for (const key of new Set([...Object.keys(offer.cost.materials), ...Object.keys(offer.receive.materials)])) rows.push({ key, label: MATERIAL_DEFS[key].label, before: Number(current.materials[key]) || 0, spend: offer.cost.materials[key] || 0, receive: offer.receive.materials[key] || 0 });
  for (const [key, receive] of Object.entries(offer.receive.alchemyItems)) rows.push({ key, label: ALCHEMY_ITEMS[key].name, before: Number(current.gacha.alchemyItems[key]) || 0, spend: 0, receive });
  return { available: rows.every(row => Number.isSafeInteger(row.before) && row.before >= row.spend && Number.isSafeInteger(row.before - row.spend + row.receive)), rows: rows.map(row => ({ ...row, after: row.before - row.spend + row.receive, shortage: Math.max(0, row.spend - row.before) })) };
}
export function prepareResourceTransaction({ profile = {}, offer, actionId, now, type, catalogVersion, quantity = 1 }) {
  validateResourceQuantity(quantity);
  if (!offer) fail('ITEM_NOT_FOUND');
  const state = resourceTransactionState(profile, offer);
  if (!state.available) fail(state.rows.find(row => row.key === 'gold')?.shortage ? 'INSUFFICIENT_GOLD' : 'INSUFFICIENT_EXCHANGE_MATERIAL');
  const current = normalizePlayerProfile(profile);
  const materials = { ...current.materials };
  for (const key of new Set([...Object.keys(offer.cost.materials), ...Object.keys(offer.receive.materials)])) materials[key] = (Number(materials[key]) || 0) - (offer.cost.materials[key] || 0) + (offer.receive.materials[key] || 0);
  const alchemyItems = { ...current.gacha.alchemyItems };
  for (const [key, count] of Object.entries(offer.receive.alchemyItems)) alchemyItems[key] = (Number(alchemyItems[key]) || 0) + count;
  return {
    profile: { ...profile, gold: (Number(current.gold) || 0) - offer.cost.gold + offer.receive.gold, materials, ...(Object.keys(offer.receive.alchemyItems).length ? { gacha: { ...current.gacha, ...(profile.gacha || {}), alchemyItems } } : {}), updatedAt: now },
    ledger: { schemaVersion: 2, type, actionId, catalogVersion, quantity, itemId: offer.id, itemSnapshot: structuredClone(offer), cost: structuredClone(offer.cost), receive: structuredClone(offer.receive), status: 'applied', appliedAt: now },
  };
}
