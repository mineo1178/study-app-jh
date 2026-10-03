import { TICKET_PRICES, TICKET_TYPES } from './gachaCatalog.js';
import { EQUIPMENT_CATALOG } from './equipmentCatalog.js';
import { MATERIAL_DEFS } from './rewardConfig.js';
import { calculateStudyReward } from './rewardCalculator.js';

const amount = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
const requirement = (id, current, target, unit) => ({ id, current: amount(current), target, remaining: Math.max(0, target - amount(current)), unit });

// Invert the existing calculator rather than duplicate its reward thresholds.
export function studySecondsForGold(gold) {
  const target = amount(gold);
  if (!target) return 0;
  if (target > calculateStudyReward({ recordedSeconds: Number.MAX_SAFE_INTEGER }).gold) return null;
  let high = 1;
  while (calculateStudyReward({ recordedSeconds: high }).gold < target) high *= 2;
  let low = 0;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (calculateStudyReward({ recordedSeconds: middle }).gold >= target) high = middle;
    else low = middle + 1;
  }
  return low;
}

export function deriveRewardProgress(profile, { blocked = false } = {}) {
  if (!profile) return { status: 'loading', goals: [] };
  const gold = amount(profile.gold);
  const ticketType = TICKET_TYPES.find((type) => amount(profile.gacha?.ticketBalances?.[type]) > 0);
  const goldRequirement = requirement('gold', gold, TICKET_PRICES.normal, 'GOLD');
  const gacha = {
    id: 'gacha', name: ticketType ? `${ticketType.toUpperCase()} ガチャ` : 'NORMAL ガチャ',
    requirements: [goldRequirement], available: !blocked && Boolean(ticketType || !goldRequirement.remaining),
    hasTicket: Boolean(ticketType), progress: ticketType ? 1 : Math.min(1, gold / TICKET_PRICES.normal),
    remainingMinutes: Math.ceil(studySecondsForGold(goldRequirement.remaining) / 60),
  };
  const item = Object.values(EQUIPMENT_CATALOG).find((entry) => entry.cost && !profile.ownedEquipment?.[entry.id]);
  const goals = [gacha];
  if (item) {
    const requirements = [requirement('gold', gold, item.cost.gold, 'GOLD'), ...Object.entries(item.cost.materials || {}).map(([key, target]) => requirement(key, profile.materials?.[key], target, MATERIAL_DEFS[key]?.label || key))];
    goals.push({ id: item.id, name: item.name, requirements, available: !blocked && requirements.every((entry) => !entry.remaining), progress: Math.min(...requirements.map((entry) => entry.target ? Math.min(1, entry.current / entry.target) : 1)) });
  }
  return { status: blocked ? 'blocked' : 'ready', goals };
}
