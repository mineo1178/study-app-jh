import { MATERIAL_KEYS } from './rewardConfig.js';
import { levelForTotalExp } from './levelSystem.js';

export const PLAYER_PROFILE_SCHEMA_VERSION = 6;
export const DEFAULT_PARTY_MEMBER_IDS = Object.freeze(['hero', 'guardian', 'mage']);
export const STARTER_PARTY_MEMBER_IDS = Object.freeze(['hero', 'guardian', 'mage', 'healer']);

export const EMPTY_EQUIPMENT = Object.freeze({ weapon: null, armor: null, accessory: null });

export const createEmptyPlayerProfile = () => ({
  schemaVersion: PLAYER_PROFILE_SCHEMA_VERSION,
  gold: 0,
  battleEnergy: 0,
  materials: Object.fromEntries(MATERIAL_KEYS.map((key) => [key, 0])),
  ownedEquipment: {},
  equipped: { ...EMPTY_EQUIPMENT },
  totalExp: 0,
  level: 1,
  activeBattleId: null,
  partyMemberIds: [...DEFAULT_PARTY_MEMBER_IDS],
  unlockedPartyMemberIds: [...STARTER_PARTY_MEMBER_IDS],
  gacha: { ticketBalances: { normal: 0, silver: 0, gold: 0, premium: 0 }, starFragments: 0, drawsSinceSrPlus: 0, drawsSinceSsr: 0, alchemyItems: {}, recentDraws: [] },
  weeklyBoss: { clearedWeekIds: [], totalClears: 0, lastClearedAt: null, lastBossId: null },
});

export const normalizePlayerProfile = (profile = {}) => {
  const empty = createEmptyPlayerProfile();
  const totalExp = Math.max(0, Number(profile.totalExp) || 0);
  return {
    ...empty,
    ...profile,
    schemaVersion: PLAYER_PROFILE_SCHEMA_VERSION,
    materials: { ...empty.materials, ...(profile.materials || {}) },
    ownedEquipment: { ...(profile.ownedEquipment || {}) },
    equipped: {
      weapon: profile.equipped?.weapon || null,
      armor: profile.equipped?.armor || null,
      accessory: profile.equipped?.accessory || null,
    },
    totalExp,
    level: levelForTotalExp(totalExp),
    activeBattleId: typeof profile.activeBattleId === 'string' ? profile.activeBattleId : null,
    partyMemberIds: Array.isArray(profile.partyMemberIds) ? [...profile.partyMemberIds] : [...DEFAULT_PARTY_MEMBER_IDS],
    unlockedPartyMemberIds: [...new Set([...STARTER_PARTY_MEMBER_IDS, ...(Array.isArray(profile.unlockedPartyMemberIds) ? profile.unlockedPartyMemberIds : [])])],
    gacha: {
      ...empty.gacha,
      ...(profile.gacha || {}),
      ticketBalances: { ...empty.gacha.ticketBalances, ...(profile.gacha?.ticketBalances || {}) },
      alchemyItems: { ...(profile.gacha?.alchemyItems || {}) },
      recentDraws: Array.isArray(profile.gacha?.recentDraws) ? profile.gacha.recentDraws.slice(0, 20) : [],
    },
    weeklyBoss: { ...empty.weeklyBoss, ...(profile.weeklyBoss || {}), clearedWeekIds: Array.isArray(profile.weeklyBoss?.clearedWeekIds) ? profile.weeklyBoss.clearedWeekIds.slice(-12) : [] },
  };
};
