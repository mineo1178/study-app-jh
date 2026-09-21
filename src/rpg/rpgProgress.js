import { getChapter } from './chapterCatalog.js';
export const RPG_PROGRESS_SCHEMA_VERSION = 1;
export const createEmptyRpgProgress = () => ({ schemaVersion: 1, currentChapterId: 'chapter_1', normalWins: 0, completedChapterIds: [], campaignCompleted: false });
export const normalizeRpgProgress = (progress = {}) => { const empty = createEmptyRpgProgress(); const chapter = getChapter(progress.currentChapterId) || getChapter(empty.currentChapterId); return { ...empty, ...progress, schemaVersion: RPG_PROGRESS_SCHEMA_VERSION, currentChapterId: chapter.id, normalWins: Math.min(chapter.normalWinsRequired, Math.max(0, Number(progress.normalWins) || 0)), completedChapterIds: [...new Set((progress.completedChapterIds || []).filter((id) => Boolean(getChapter(id))))], campaignCompleted: Boolean(progress.campaignCompleted) }; };
export const isBossUnlocked = (progress, chapter = getChapter(normalizeRpgProgress(progress).currentChapterId)) => { const safe = normalizeRpgProgress(progress); return Boolean(chapter && !safe.campaignCompleted && safe.currentChapterId === chapter.id && !safe.completedChapterIds.includes(chapter.id) && safe.normalWins >= chapter.normalWinsRequired); };
export const applyNormalVictoryProgress = (progress, chapterId, now) => { const safe = normalizeRpgProgress(progress); const chapter = getChapter(chapterId); if (!chapter || safe.currentChapterId !== chapter.id) throw Object.assign(new Error('CHAPTER_STATE_MISMATCH'), { code: 'CHAPTER_STATE_MISMATCH' }); return { ...safe, normalWins: Math.min(chapter.normalWinsRequired, safe.normalWins + 1), updatedAt: now }; };
export const applyBossClearProgress = (progress, chapterId, now) => { const safe = normalizeRpgProgress(progress); const chapter = getChapter(chapterId); if (!chapter || !isBossUnlocked(safe, chapter)) throw Object.assign(new Error('BOSS_LOCKED'), { code: 'BOSS_LOCKED' }); const completedChapterIds = [...new Set([...safe.completedChapterIds, chapter.id])]; return chapter.nextChapterId ? { ...safe, currentChapterId: chapter.nextChapterId, normalWins: 0, completedChapterIds, campaignCompleted: false, updatedAt: now } : { ...safe, completedChapterIds, campaignCompleted: true, updatedAt: now }; };

// Battle schema v7+ must complete against the chapter rules captured at battle
// start.  Do not normalize normalWins through the mutable chapter catalog here.
const normalizeSnapshotProgress = (progress = {}) => {
  const empty = createEmptyRpgProgress();
  return {
    ...empty,
    ...progress,
    schemaVersion: RPG_PROGRESS_SCHEMA_VERSION,
    currentChapterId: progress.currentChapterId || empty.currentChapterId,
    normalWins: Math.max(0, Number(progress.normalWins) || 0),
    completedChapterIds: [...new Set(progress.completedChapterIds || [])],
    campaignCompleted: Boolean(progress.campaignCompleted),
  };
};

const snapshotFailure = (code) => Object.assign(new Error(code), { code });
const requireChapterSnapshot = (chapterSnapshot, { requireNextChapterId = false } = {}) => {
  if (!chapterSnapshot?.id || !Number.isFinite(Number(chapterSnapshot.normalWinsRequired))) throw snapshotFailure('CHAPTER_SNAPSHOT_INVALID');
  if (requireNextChapterId && !Object.hasOwn(chapterSnapshot, 'nextChapterId')) throw snapshotFailure('CHAPTER_SNAPSHOT_INVALID');
  return chapterSnapshot;
};

export const applyNormalVictoryProgressFromSnapshot = (progress, chapterSnapshot, now) => {
  const snapshot = requireChapterSnapshot(chapterSnapshot);
  const safe = normalizeSnapshotProgress(progress);
  if (safe.currentChapterId !== snapshot.id) throw snapshotFailure('CHAPTER_STATE_MISMATCH');
  return { ...safe, normalWins: Math.min(Math.max(0, Number(snapshot.normalWinsRequired)), safe.normalWins + 1), updatedAt: now };
};

export const applyBossClearProgressFromSnapshot = (progress, chapterSnapshot, now) => {
  const snapshot = requireChapterSnapshot(chapterSnapshot, { requireNextChapterId: true });
  const safe = normalizeSnapshotProgress(progress);
  if (safe.campaignCompleted || safe.currentChapterId !== snapshot.id || safe.completedChapterIds.includes(snapshot.id) || safe.normalWins < Number(snapshot.normalWinsRequired)) throw snapshotFailure('BOSS_LOCKED');
  const completedChapterIds = [...new Set([...safe.completedChapterIds, snapshot.id])];
  return snapshot.nextChapterId === null
    ? { ...safe, completedChapterIds, campaignCompleted: true, updatedAt: now }
    : { ...safe, currentChapterId: snapshot.nextChapterId, normalWins: 0, completedChapterIds, campaignCompleted: false, updatedAt: now };
};
