import { doc, runTransaction } from 'firebase/firestore';
import { MATERIAL_KEYS } from '../rpg/rewardConfig.js';
import { playerProfileRef } from './rewardLedgerRepository.js';
import { assertNoPendingRewardCorrections, rewardIntegrityRef } from './rewardCorrectionRepository.js';

import { getMaterialTrade, MATERIAL_TRADE_CATALOG_VERSION } from '../rpg/materialTradeCatalog.js';
import { prepareResourceTransaction, validateResourceQuantity } from '../rpg/resourceTransactions.js';
import { MATERIAL_EXCHANGE_GIVE, MATERIAL_EXCHANGE_RECEIVE } from '../rpg/materialTradeCatalog.js';
export { MATERIAL_EXCHANGE_GIVE, MATERIAL_EXCHANGE_RECEIVE };
export const RPG_MATERIAL_EXCHANGE_SCHEMA_VERSION = 1;

const appPath = (familyId, collectionName, id) => ['families', familyId, 'apps', 'junior-high', collectionName, id];
export const rpgExchangeLedgerRef = (db, familyId, actionId) => doc(db, ...appPath(familyId, 'rpgExchangeLedger', actionId));
export const createMaterialExchangeActionId = () => `exchange-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const failure = (code, details = {}) => Object.assign(new Error(code), { code, details });
const number = (value) => Math.max(0, Number(value) || 0);
const isMaterialKey = (key) => MATERIAL_KEYS.includes(key);

export function prepareMaterialExchange({ profile = {}, sourceMaterialKey, targetMaterialKey, quantity = 1, actionId, now }) {
  validateResourceQuantity(quantity);
  if (!isMaterialKey(sourceMaterialKey) || !isMaterialKey(targetMaterialKey)) throw failure('UNKNOWN_MATERIAL');
  if (sourceMaterialKey === targetMaterialKey) throw failure('SAME_EXCHANGE_MATERIAL');
  const sourceQuantity = number(profile.materials?.[sourceMaterialKey]);
  if (sourceQuantity < MATERIAL_EXCHANGE_GIVE) throw failure('INSUFFICIENT_EXCHANGE_MATERIAL', { materialKey: sourceMaterialKey, current: sourceQuantity });
  const materials = {
    ...(profile.materials || {}),
    [sourceMaterialKey]: sourceQuantity - MATERIAL_EXCHANGE_GIVE,
    [targetMaterialKey]: number(profile.materials?.[targetMaterialKey]) + MATERIAL_EXCHANGE_RECEIVE,
  };
  return {
    profile: { ...profile, materials, updatedAt: now },
    ledger: {
      schemaVersion: RPG_MATERIAL_EXCHANGE_SCHEMA_VERSION,
      type: 'material_exchange',
      actionId,
      source: { materialKey: sourceMaterialKey, quantity: MATERIAL_EXCHANGE_GIVE },
      target: { materialKey: targetMaterialKey, quantity: MATERIAL_EXCHANGE_RECEIVE },
      status: 'applied',
      appliedAt: now,
    },
  };
}

export async function exchangeMaterial({ db, familyId, sourceMaterialKey, targetMaterialKey, recipeId, quantity = 1, actionId }) {
  validateResourceQuantity(quantity);
  if (recipeId !== undefined && !getMaterialTrade(recipeId)) throw failure('ITEM_NOT_FOUND');
  if (typeof actionId !== 'string' || !actionId || actionId.includes('/')) throw failure('INVALID_ACTION_ID');
  const profile = playerProfileRef(db, familyId);
  const integrity = rewardIntegrityRef(db, familyId);
  const ledger = rpgExchangeLedgerRef(db, familyId, actionId);
  const now = Date.now();
  return runTransaction(db, async (transaction) => {
    const [profileSnap, integritySnap, ledgerSnap] = await Promise.all([transaction.get(profile), transaction.get(integrity), transaction.get(ledger)]);
    if (ledgerSnap.exists()) return { applied: false, reason: 'ALREADY_APPLIED' };
    assertNoPendingRewardCorrections(integritySnap.exists() ? integritySnap.data() : {});
    const current = profileSnap.exists() ? profileSnap.data() : {};
    const change = recipeId !== undefined ? prepareMaterialTrade({ profile: current, recipeId, quantity, actionId, now }) : prepareMaterialExchange({ profile: current, sourceMaterialKey, targetMaterialKey, actionId, now });
    transaction.set(profile, change.profile);
    transaction.set(ledger, change.ledger);
    return { applied: true, profile: change.profile, ledger: change.ledger };
  });
}

export function prepareMaterialTrade({ profile, recipeId, quantity = 1, actionId, now }) {
  return prepareResourceTransaction({ profile, offer: getMaterialTrade(recipeId), quantity, actionId, now, type: 'material_trade', catalogVersion: MATERIAL_TRADE_CATALOG_VERSION });
}
