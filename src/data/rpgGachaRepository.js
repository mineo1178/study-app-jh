import { runTransaction } from 'firebase/firestore';
import { normalizePlayerProfile } from '../rpg/playerProfile.js';
import { ALCHEMY_ITEMS, calculateRarity, FRAGMENTS_BY_RARITY, GACHA_RATES, MEMBER_RATES, membersForRarity, itemsForRarity, TICKET_PRICES, TICKET_TYPES } from '../rpg/gachaCatalog.js';
import { playerProfileRef } from './rewardLedgerRepository.js';
import { rpgActionLedgerRef } from './rpgShopRepository.js';
import { assertNoPendingRewardCorrections, rewardIntegrityRef } from './rewardCorrectionRepository.js';

const failure = (code) => Object.assign(new Error(code), { code });
const integer = (value) => Math.max(0, Math.floor(Number(value) || 0));
const randomPercent = () => { if (!globalThis.crypto?.getRandomValues) throw failure('SECURE_RANDOM_UNAVAILABLE'); const bytes = new Uint32Array(1); globalThis.crypto.getRandomValues(bytes); return bytes[0] / 4294967296 * 100; };
export const createGachaActionId = (type = 'gacha-draw') => `${type}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const validTicket = (ticketType) => TICKET_TYPES.includes(ticketType);
const action = (actionId, type, now, extra) => ({ schemaVersion: 1, actionId, type, status: 'applied', appliedAt: now, ...extra });
export function prepareTicketPurchase({ profile, ticketType, actionId, now }) {
  if (!validTicket(ticketType)) throw failure('INVALID_TICKET_TYPE');
  const current = normalizePlayerProfile(profile); const cost = TICKET_PRICES[ticketType];
  if (integer(current.gold) < cost) throw failure('INSUFFICIENT_GOLD');
  return { profile: { ...current, gold: integer(current.gold) - cost, gacha: { ...current.gacha, ticketBalances: { ...current.gacha.ticketBalances, [ticketType]: integer(current.gacha.ticketBalances[ticketType]) + 1 } }, updatedAt: now }, ledger: action(actionId, 'gacha_ticket_purchase', now, { ticketType, goldSpent: cost }) };
}
export function prepareDraw({ profile, ticketType, actionId, now, rolls = { rarityRoll: randomPercent(), categoryRoll: randomPercent(), poolRoll: randomPercent() } }) {
  if (!validTicket(ticketType)) throw failure('INVALID_TICKET_TYPE');
  const current = normalizePlayerProfile(profile); if (!integer(current.gacha.ticketBalances[ticketType])) throw failure('INSUFFICIENT_TICKETS');
  const pityApplied = integer(current.gacha.drawsSinceSsr) >= 19 ? 'ssr' : integer(current.gacha.drawsSinceSrPlus) >= 9 ? 'sr' : 'none';
  const rarity = calculateRarity({ ticketType, drawsSinceSrPlus: integer(current.gacha.drawsSinceSrPlus), drawsSinceSsr: integer(current.gacha.drawsSinceSsr), rarityRoll: rolls.rarityRoll });
  const isMember = rarity !== 'N' && rolls.categoryRoll < MEMBER_RATES[rarity]; const pool = isMember ? membersForRarity(rarity) : itemsForRarity(rarity); const result = pool[Math.min(pool.length - 1, Math.floor((rolls.poolRoll / 100) * pool.length))];
  const duplicate = isMember && current.unlockedPartyMemberIds.includes(result.id); const fragments = duplicate ? FRAGMENTS_BY_RARITY[rarity] : 0;
  const gacha = { ...current.gacha, ticketBalances: { ...current.gacha.ticketBalances, [ticketType]: integer(current.gacha.ticketBalances[ticketType]) - 1 }, drawsSinceSrPlus: rarity === 'SR' || rarity === 'SSR' ? 0 : integer(current.gacha.drawsSinceSrPlus) + 1, drawsSinceSsr: rarity === 'SSR' ? 0 : integer(current.gacha.drawsSinceSsr) + 1, starFragments: integer(current.gacha.starFragments) + fragments, alchemyItems: { ...current.gacha.alchemyItems } };
  if (!isMember) gacha.alchemyItems[result.id] = integer(gacha.alchemyItems[result.id]) + 1;
  const recent = [{ rarity, resultType: isMember ? 'member' : 'item', resultId: result.id, duplicate, starFragmentsGained: fragments, drawnAt: now }, ...current.gacha.recentDraws].slice(0, 20);
  gacha.recentDraws = recent;
  const profileNext = { ...current, gacha, unlockedPartyMemberIds: isMember && !duplicate ? [...current.unlockedPartyMemberIds, result.id] : current.unlockedPartyMemberIds, updatedAt: now };
  return { profile: profileNext, ledger: action(actionId, 'gacha_draw', now, { ticketType, rolls, rarity, resultType: isMember ? 'member' : 'item', memberId: isMember ? result.id : null, itemId: isMember ? null : result.id, duplicate, starFragmentsGained: fragments, pityApplied, drawnAt: now }) };
}
export function prepareFragmentExchange({ profile, kind, targetId, actionId, now }) {
  const current = normalizePlayerProfile(profile); const ticketCosts = { silver: 80, gold: 150, premium: 350 }; const itemCost = kind === 'item' && ALCHEMY_ITEMS[targetId] ? (ALCHEMY_ITEMS[targetId].rarity === 'R' ? 25 : ALCHEMY_ITEMS[targetId].rarity === 'SR' ? 60 : null) : null; const cost = kind === 'ticket' ? ticketCosts[targetId] : itemCost;
  if (!cost) throw failure('INVALID_FRAGMENT_EXCHANGE'); if (integer(current.gacha.starFragments) < cost) throw failure('INSUFFICIENT_FRAGMENTS');
  const gacha = { ...current.gacha, starFragments: integer(current.gacha.starFragments) - cost, ticketBalances: { ...current.gacha.ticketBalances }, alchemyItems: { ...current.gacha.alchemyItems } };
  if (kind === 'ticket') gacha.ticketBalances[targetId] = integer(gacha.ticketBalances[targetId]) + 1; else gacha.alchemyItems[targetId] = integer(gacha.alchemyItems[targetId]) + 1;
  return { profile: { ...current, gacha, updatedAt: now }, ledger: action(actionId, 'gacha_fragment_exchange', now, { kind, targetId, fragmentsSpent: cost }) };
}
async function apply({ db, familyId, actionId, requiresIntegrity = true, makeChange }) { const profileRef = playerProfileRef(db, familyId); const ledgerRef = rpgActionLedgerRef(db, familyId, actionId); const integrityRef = rewardIntegrityRef(db, familyId); return runTransaction(db, async (transaction) => { const [profile, ledger, integrity] = await Promise.all([transaction.get(profileRef), transaction.get(ledgerRef), transaction.get(integrityRef)]); if (ledger.exists()) return { applied: false, reason: 'ALREADY_APPLIED' }; if (requiresIntegrity) assertNoPendingRewardCorrections(integrity.exists() ? integrity.data() : {}); const change = makeChange(profile.exists() ? profile.data() : {}); transaction.set(profileRef, change.profile); transaction.set(ledgerRef, change.ledger); return { applied: true, ...change }; }); }
export const purchaseGachaTicket = ({ db, familyId, ticketType, actionId }) => apply({ db, familyId, actionId, makeChange: (profile) => prepareTicketPurchase({ profile, ticketType, actionId, now: Date.now() }) });
export const drawGacha = ({ db, familyId, ticketType, actionId }) => apply({ db, familyId, actionId, makeChange: (profile) => prepareDraw({ profile, ticketType, actionId, now: Date.now() }) });
export const exchangeGachaFragments = ({ db, familyId, kind, targetId, actionId }) => apply({ db, familyId, actionId, makeChange: (profile) => prepareFragmentExchange({ profile, kind, targetId, actionId, now: Date.now() }) });
export const validateGachaRates = () => Object.values(GACHA_RATES).every((rates) => Object.values(rates).reduce((sum, value) => sum + value, 0) === 100) && Object.values(MEMBER_RATES).every((rate) => rate >= 0 && rate <= 100);
