import { MATERIAL_KEYS } from './rewardConfig.js';
import { levelForTotalExp } from './levelSystem.js';

export const PLAYER_PROFILE_SCHEMA_VERSION = 4;
export const DEFAULT_PARTY_MEMBER_IDS = Object.freeze(['hero', 'guardian', 'mage']);

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
  };
};
