import { RPG_QUEST_CATALOG, getQuest } from './questCatalog.js';

export const RPG_QUEST_STATE_SCHEMA_VERSION = 1;
export const createEmptyQuestState = () => ({ schemaVersion: RPG_QUEST_STATE_SCHEMA_VERSION, claimedQuestIds: [] });
export const normalizeQuestState = (state = {}) => ({ ...createEmptyQuestState(), ...state, schemaVersion: RPG_QUEST_STATE_SCHEMA_VERSION, claimedQuestIds: [...new Set((state.claimedQuestIds || []).filter((id) => Boolean(getQuest(id))))] });
export const isQuestCompleted = ({ questId, profile = {}, progress = {} }) => {
  if (!getQuest(questId)) return false;
  if (questId === 'first_equipment') return Object.keys(profile.ownedEquipment || {}).length >= 1;
  if (questId === 'full_loadout') return ['weapon', 'armor', 'accessory'].every((slot) => Boolean(profile.equipped?.[slot]));
  if (questId === 'chapter_1_clear') return (progress.completedChapterIds || []).includes('chapter_1');
  if (questId === 'campaign_clear') return progress.campaignCompleted === true;
  return false;
};
export const getQuestStatus = ({ questId, profile, progress, questState }) => {
  const state = normalizeQuestState(questState);
  if (state.claimedQuestIds.includes(questId)) return 'claimed';
  return isQuestCompleted({ questId, profile, progress }) ? 'claimable' : 'locked';
};
export const QUEST_IDS = Object.keys(RPG_QUEST_CATALOG);
