import { describe, expect, it } from 'vitest';
import { RPG_QUEST_CATALOG, RPG_QUEST_CATALOG_VERSION } from './questCatalog.js';

describe('quest catalog', () => { it('defines the four fixed non-EXP, non-material quests', () => { const quests = Object.values(RPG_QUEST_CATALOG); expect(RPG_QUEST_CATALOG_VERSION).toBe(1); expect(quests.map((quest) => quest.id)).toEqual(['first_equipment', 'full_loadout', 'chapter_1_clear', 'campaign_clear']); expect(new Set(quests.map((quest) => quest.id)).size).toBe(4); quests.forEach((quest) => { expect(quest.reward.gold).toBeGreaterThanOrEqual(0); expect(quest.reward.battleEnergy).toBeGreaterThanOrEqual(0); expect(quest.reward.exp).toBeUndefined(); expect(quest.reward.materials).toBeUndefined(); }); }); });
