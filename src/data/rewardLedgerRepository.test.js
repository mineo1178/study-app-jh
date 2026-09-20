import { describe, expect, it } from 'vitest';
import { applyRewardToPlayerProfile } from './rewardLedgerRepository.js';

describe('study reward and equipment coexistence', () => {
  it('adds only reward assets while preserving v2 equipment state', () => {
    const profile = {
      gold: 100,
      battleEnergy: 2,
      materials: { iron: 4 },
      ownedEquipment: { iron_sword: { acquiredAt: 1, sourceActionId: 'purchase-1' } },
      equipped: { weapon: 'iron_sword', armor: null, accessory: null },
    };
    const next = applyRewardToPlayerProfile(profile, { gold: 10, battleEnergy: 1, material: { key: 'iron', quantity: 2 } }, 99);
    expect(next).toMatchObject({ gold: 110, battleEnergy: 3, materials: { iron: 6 }, ownedEquipment: profile.ownedEquipment, equipped: profile.equipped, updatedAt: 99 });
  });
});
