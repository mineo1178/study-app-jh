export const RPG_QUEST_CATALOG_VERSION = 2;
export const RPG_QUEST_CATALOG = Object.freeze({
  first_equipment: Object.freeze({ id: 'first_equipment', name: 'はじめての装備', description: '装備を1つ手に入れよう', reward: { gold: 150, battleEnergy: 0 } }),
  full_loadout: Object.freeze({ id: 'full_loadout', name: '冒険の準備', description: '武器・防具・アクセサリーをすべて装備しよう', reward: { gold: 150, battleEnergy: 2 } }),
  chapter_1_clear: Object.freeze({ id: 'chapter_1_clear', name: '草原の覇者', description: 'Chapter 1をクリアしよう', reward: { gold: 300, battleEnergy: 2 } }),
  campaign_clear: Object.freeze({ id: 'campaign_clear', name: '冒険の証', description: 'すべてのChapterをクリアしよう', reward: { gold: 600, battleEnergy: 0 } }),
});
export const getQuest = (questId) => RPG_QUEST_CATALOG[questId] || null;
