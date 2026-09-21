export const CHAPTER_CATALOG_VERSION = 1;
export const CHAPTER_CATALOG = Object.freeze({
  chapter_1: { id: 'chapter_1', number: 1, name: 'はじまりの草原', normalEnemyIds: ['slime', 'goblin'], normalWinsRequired: 3, bossId: 'orc_chief', nextChapterId: 'chapter_2' },
  chapter_2: { id: 'chapter_2', number: 2, name: '石の洞窟', normalEnemyIds: ['goblin', 'stone_golem'], normalWinsRequired: 4, bossId: 'ancient_golem', nextChapterId: null },
});
export const getChapter = (id) => CHAPTER_CATALOG[id] || null;
