import { describe, expect, it } from 'vitest';
import { buildEncyclopedia, deriveEncyclopediaDiscovery, getEncyclopediaCatalog } from './encyclopedia.js';

describe('RPG encyclopedia selectors', () => {
  it('builds the four canonical categories with 59 total entries', () => {
    const catalog = getEncyclopediaCatalog();
    expect(Object.fromEntries(Object.entries(catalog).map(([key, values]) => [key, values.length]))).toEqual({ members: 16, enemies: 9, equipment: 18, alchemyItems: 16 });
    expect(Object.values(catalog).flat()).toHaveLength(59);
  });

  it('keeps starter members discovered and uses unlocked ids for gacha members', () => {
    const discovery = deriveEncyclopediaDiscovery({ profile: { unlockedPartyMemberIds: ['hero', 'akane'] } });
    expect(discovery.memberIds).toEqual(new Set(['hero', 'guardian', 'mage', 'healer', 'akane']));
    expect(discovery.memberIds.has('kaede')).toBe(false);
  });

  it('discovers campaign, canonical Tower, and Weekly Boss enemies from starts', () => {
    const battleLedgers = [
      { schemaVersion: 2, type: 'battle_start', battleMode: 'campaign', enemyId: 'slime' },
      { schemaVersion: 2, type: 'battle_start', battleMode: 'tower', encounterSnapshot: { enemies: [{ enemyId: 'goblin', id: 'tower-normal-4-goblin' }, { enemyId: 'orc_chief', id: 'tower-boss-10-orc_chief' }] } },
      { schemaVersion: 1, type: 'battle_start', battleMode: 'weekly_boss', weeklyBossSnapshot: { bossId: 'weekly_ignis' } },
    ];
    const discovery = deriveEncyclopediaDiscovery({ battleLedgers });
    expect(discovery.enemyIds).toEqual(new Set(['slime', 'goblin', 'orc_chief', 'weekly_ignis']));
    expect(discovery.enemyIds.has('tower-normal-4-goblin')).toBe(false);
  });

  it('ignores unknown enemy ids, unknown schemas, and incomplete battle records', () => {
    const battleLedgers = [
      { schemaVersion: 2, type: 'battle_start', battleMode: 'campaign', enemyId: 'future_enemy' },
      { schemaVersion: 99, type: 'battle_start', battleMode: 'campaign', enemyId: 'slime' },
      { schemaVersion: 2, type: 'battle_start', battleMode: 'tower' },
      null,
    ];
    expect(deriveEncyclopediaDiscovery({ battleLedgers }).enemyIds.size).toBe(0);
  });

  it('discovers only owned canonical equipment', () => {
    const discovery = deriveEncyclopediaDiscovery({ profile: { ownedEquipment: { iron_sword: {}, future_item: {} } } });
    expect(discovery.equipmentIds).toEqual(new Set(['iron_sword']));
  });

  it('discovers alchemy items from balance, draws, exchanges, crafting costs, and Weekly Boss rewards', () => {
    const discovery = deriveEncyclopediaDiscovery({
      profile: { gacha: { alchemyItems: { alchemy_dust: 1, hard_stone: 0 } } },
      actionLedgers: [
        { schemaVersion: 1, type: 'gacha_draw', resultType: 'item', itemId: 'silver_ore' },
        { schemaVersion: 1, type: 'gacha_fragment_exchange', kind: 'item', targetId: 'magic_crystal' },
        { schemaVersion: 1, type: 'alchemy_craft', alchemyItemsSpent: { beast_hide: 2, unknown: 1 } },
      ],
      battleLedgers: [{ schemaVersion: 1, type: 'weekly_boss_clear', reward: { alchemyItemId: 'dragon_scale', alchemyItemQuantity: 1 } }],
    });
    expect(discovery.alchemyItemIds).toEqual(new Set(['alchemy_dust', 'dragon_scale', 'silver_ore', 'magic_crystal', 'beast_hide']));
  });

  it('ignores unknown schemas and incomplete material ledgers without leaking discoveries', () => {
    const encyclopedia = buildEncyclopedia({
      actionLedgers: [{ schemaVersion: 2, type: 'gacha_draw', resultType: 'item', itemId: 'silver_ore' }, { schemaVersion: 1, type: 'gacha_draw' }, null],
      battleLedgers: [{ schemaVersion: 99, type: 'weekly_boss_clear', reward: { alchemyItemId: 'dragon_scale', alchemyItemQuantity: 1 } }],
    });
    expect(encyclopedia.alchemyItems.every((entry) => !entry.discovered)).toBe(true);
  });
});
