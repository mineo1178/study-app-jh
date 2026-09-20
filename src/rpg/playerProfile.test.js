import { describe, expect, it } from 'vitest';
import { PLAYER_PROFILE_SCHEMA_VERSION, createEmptyPlayerProfile, normalizePlayerProfile } from './playerProfile.js';

describe('player profile v2', () => {
  it('normalizes a v1.77 profile without losing its existing balances', () => {
    const profile = normalizePlayerProfile({ schemaVersion: 1, gold: 100, battleEnergy: 3, materials: { iron: 7 } });
    expect(profile).toMatchObject({ schemaVersion: PLAYER_PROFILE_SCHEMA_VERSION, gold: 100, battleEnergy: 3, materials: { iron: 7 }, ownedEquipment: {}, equipped: { weapon: null, armor: null, accessory: null } });
  });

  it('creates independent equipment containers', () => {
    const first = createEmptyPlayerProfile();
    first.equipped.weapon = 'iron_sword';
    expect(createEmptyPlayerProfile().equipped.weapon).toBeNull();
  });
});
