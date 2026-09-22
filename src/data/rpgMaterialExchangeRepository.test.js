import { describe, expect, it, vi } from 'vitest';

const firestore = vi.hoisted(() => ({ docs: new Map() }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => ({ path: parts.join('/') }),
  runTransaction: async (_db, callback) => callback({
    get: async (reference) => ({ exists: () => firestore.docs.has(reference.path), data: () => firestore.docs.get(reference.path) }),
    set: (reference, value) => firestore.docs.set(reference.path, value),
  }),
}));

import { MATERIAL_DEFS, MATERIAL_KEYS } from '../rpg/rewardConfig.js';
import { MATERIAL_EXCHANGE_GIVE, MATERIAL_EXCHANGE_RECEIVE, exchangeMaterial, prepareMaterialExchange } from './rpgMaterialExchangeRepository.js';

const now = 123456;
const profile = (materials = { iron: 3, mana_rune: 2 }) => ({ gold: 99, battleEnergy: 4, materials, ownedEquipment: { iron_sword: { acquiredAt: 1 } }, equipped: { weapon: 'iron_sword' }, totalExp: 30, level: 2, activeBattleId: 'battle-1' });

describe('material exchange', () => {
  it('defines descriptions for every exchangeable material', () => {
    MATERIAL_KEYS.forEach((key) => expect(['label', 'description', 'sourceLabel', 'usageLabel'].every((field) => Boolean(MATERIAL_DEFS[key][field]))).toBe(true));
  });
  it('exchanges exactly three for one while preserving every unrelated profile field', () => {
    const current = profile();
    const result = prepareMaterialExchange({ profile: current, sourceMaterialKey: 'iron', targetMaterialKey: 'mana_rune', actionId: 'exchange-1', now });
    expect(MATERIAL_EXCHANGE_GIVE).toBe(3);
    expect(MATERIAL_EXCHANGE_RECEIVE).toBe(1);
    expect(result.profile.materials).toMatchObject({ iron: 0, mana_rune: 3 });
    expect(result.profile).toMatchObject({ gold: 99, battleEnergy: 4, ownedEquipment: current.ownedEquipment, equipped: current.equipped, totalExp: 30, level: 2, activeBattleId: 'battle-1', updatedAt: now });
    expect(result.ledger).toEqual({ schemaVersion: 1, type: 'material_exchange', actionId: 'exchange-1', source: { materialKey: 'iron', quantity: 3 }, target: { materialKey: 'mana_rune', quantity: 1 }, status: 'applied', appliedAt: now });
    expect(JSON.stringify(result.ledger)).not.toContain('undefined');
  });
  it('keeps a remainder after exchanging four materials', () => {
    const result = prepareMaterialExchange({ profile: profile({ iron: 4, mana_rune: 0 }), sourceMaterialKey: 'iron', targetMaterialKey: 'mana_rune', actionId: 'exchange-2', now });
    expect(result.profile.materials).toMatchObject({ iron: 1, mana_rune: 1 });
  });
  it('rejects insufficient, identical, and unknown materials', () => {
    expect(() => prepareMaterialExchange({ profile: profile({ iron: 2 }), sourceMaterialKey: 'iron', targetMaterialKey: 'mana_rune', actionId: 'x', now })).toThrow('INSUFFICIENT_EXCHANGE_MATERIAL');
    expect(() => prepareMaterialExchange({ profile: profile(), sourceMaterialKey: 'iron', targetMaterialKey: 'iron', actionId: 'x', now })).toThrow('SAME_EXCHANGE_MATERIAL');
    expect(() => prepareMaterialExchange({ profile: profile(), sourceMaterialKey: 'unknown', targetMaterialKey: 'iron', actionId: 'x', now })).toThrow('UNKNOWN_MATERIAL');
  });
  it('is idempotent and blocks exchange while reward correction is pending', async () => {
    firestore.docs.clear();
    const profilePath = 'families/family/apps/junior-high/rpg/playerProfile';
    const integrityPath = 'families/family/apps/junior-high/rewardIntegrity/current';
    firestore.docs.set(profilePath, profile());
    const first = await exchangeMaterial({ db: {}, familyId: 'family', sourceMaterialKey: 'iron', targetMaterialKey: 'mana_rune', actionId: 'exchange-once' });
    const second = await exchangeMaterial({ db: {}, familyId: 'family', sourceMaterialKey: 'iron', targetMaterialKey: 'mana_rune', actionId: 'exchange-once' });
    expect(first.applied).toBe(true);
    expect(second).toEqual({ applied: false, reason: 'ALREADY_APPLIED' });
    expect(firestore.docs.get(profilePath).materials.iron).toBe(0);
    firestore.docs.set(integrityPath, { pendingSessionIds: ['session-1'] });
    await expect(exchangeMaterial({ db: {}, familyId: 'family', sourceMaterialKey: 'mana_rune', targetMaterialKey: 'iron', actionId: 'blocked' })).rejects.toThrow('REWARD_CORRECTION_PENDING');
  });
});
