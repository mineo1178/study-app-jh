import { describe, expect, it } from 'vitest';
import { PLAYER_PROFILE_SCHEMA_VERSION, createEmptyPlayerProfile, normalizePlayerProfile } from './playerProfile.js';

describe('player profile v2', () => {
  it('normalizes a v2 profile without losing its existing balances', () => {
    const profile = normalizePlayerProfile({ schemaVersion: 2, gold: 100, battleEnergy: 3, materials: { iron: 7 } });
    expect(profile).toMatchObject({ schemaVersion: PLAYER_PROFILE_SCHEMA_VERSION, gold: 100, battleEnergy: 3, materials: { iron: 7 }, ownedEquipment: {}, equipped: { weapon: null, armor: null, accessory: null }, totalExp: 0, level: 1, activeBattleId: null });
  });

  it('creates independent equipment containers', () => {
    const first = createEmptyPlayerProfile();
    first.equipped.weapon = 'iron_sword';
    expect(createEmptyPlayerProfile().equipped.weapon).toBeNull();
  });
  it('upgrades v4 profiles while preserving RPG state and starter unlocks', () => {
    const profile = normalizePlayerProfile({ schemaVersion: 4, gold: 55, materials: { iron: 3 }, ownedEquipment: { iron_sword: {} }, totalExp: 30, activeBattleId: 'battle-1', partyMemberIds: ['hero', 'mage'] });
    expect(profile).toMatchObject({ schemaVersion: 5, gold: 55, materials: { iron: 3 }, ownedEquipment: { iron_sword: {} }, totalExp: 30, activeBattleId: 'battle-1', partyMemberIds: ['hero', 'mage'] });
    expect(profile.unlockedPartyMemberIds).toEqual(expect.arrayContaining(['hero', 'guardian', 'mage', 'healer']));
    expect(profile.gacha.ticketBalances).toEqual({ normal: 0, silver: 0, gold: 0, premium: 0 });
  });
});
