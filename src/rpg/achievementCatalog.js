import { DAILY_TARGET_SECONDS } from '../studyTargets.js';

export const TITLE_CATALOG = Object.freeze({
  title_first_step: { id: 'title_first_step', name: '駆け出し学習者' },
  title_study_10h: { id: 'title_study_10h', name: '努力の積み重ね' },
  title_streak_3: { id: 'title_streak_3', name: '継続の芽' },
  title_week_5days: { id: 'title_week_5days', name: '習慣の達人' },
  title_campaign: { id: 'title_campaign', name: '冒険の覇者' },
  title_tower_10: { id: 'title_tower_10', name: '塔の挑戦者' },
  title_weekly_boss: { id: 'title_weekly_boss', name: 'ボスハンター' },
  title_party_collector: { id: 'title_party_collector', name: '仲間を集めし者' },
});

export const ACHIEVEMENT_CATALOG = Object.freeze([
  { id: 'achievement_first_session', name: 'はじめの一歩', description: '有効な学習を1回記録する', target: 1, unlocksTitleId: 'title_first_step' },
  { id: 'achievement_study_10h', name: '学習10時間', description: '累計有効学習時間を10時間にする', target: 10 * 60 * 60, unlocksTitleId: 'title_study_10h' },
  { id: 'achievement_daily_2h', name: '2時間チャレンジ', description: '1日の有効学習時間を2時間にする', target: DAILY_TARGET_SECONDS },
  { id: 'achievement_streak_3', name: '3日連続', description: '3日連続で学習する', target: 3, unlocksTitleId: 'title_streak_3' },
  { id: 'achievement_week_5days', name: '週5日学習', description: '同じ週に5日以上学習する', target: 5, unlocksTitleId: 'title_week_5days' },
  { id: 'achievement_week_3subjects', name: '週3教科', description: '同じ週に3教科以上学習する', target: 3 },
  { id: 'achievement_level_5', name: 'Lv.5', description: 'RPG Level 5に到達する', target: 5 },
  { id: 'achievement_first_equipment', name: 'はじめての装備', description: '装備を1つ手に入れる', target: 1 },
  { id: 'achievement_chapter1', name: '草原の覇者', description: 'Chapter 1をクリアする', target: 1 },
  { id: 'achievement_campaign_complete', name: 'Campaign制覇', description: 'Campaignをクリアする', target: 1, unlocksTitleId: 'title_campaign' },
  { id: 'achievement_tower_10', name: '塔の10階', description: '塔の10階をクリアする', target: 10, unlocksTitleId: 'title_tower_10' },
  { id: 'achievement_tower_boss', name: '塔のボス撃破', description: '塔のボスを1体倒す', target: 1 },
  { id: 'achievement_weekly_boss', name: 'Weekly討伐', description: 'Weekly Bossを1体倒す', target: 1, unlocksTitleId: 'title_weekly_boss' },
  { id: 'achievement_all_party', name: '仲間コレクター', description: 'すべての仲間を解放する', target: null, unlocksTitleId: 'title_party_collector' },
]);

export const getTitle = (titleId) => TITLE_CATALOG[titleId] || null;
