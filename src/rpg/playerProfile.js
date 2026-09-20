import { MATERIAL_KEYS } from './rewardConfig.js';

export const PLAYER_PROFILE_SCHEMA_VERSION = 2;

export const EMPTY_EQUIPMENT = Object.freeze({ weapon: null, armor: null, accessory: null });

export const createEmptyPlayerProfile = () => ({
  schemaVersion: PLAYER_PROFILE_SCHEMA_VERSION,
  gold: 0,
  battleEnergy: 0,
  materials: Object.fromEntries(MATERIAL_KEYS.map((key) => [key, 0])),
  ownedEquipment: {},
  equipped: { ...EMPTY_EQUIPMENT },
});

export const normalizePlayerProfile = (profile = {}) => {
  const empty = createEmptyPlayerProfile();
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
  };
};
