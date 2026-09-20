export const REWARD_POLICY_VERSION = 'rpg-reward-v1';
export const REWARD_SCHEMA_VERSION = 1;
export const MATERIAL_KEYS = ['iron', 'wisdom_scroll', 'mana_rune', 'mineral', 'history_seal', 'logic_core', 'vitality', 'resonance', 'craft_cloth', 'general_essence'];
export const MATERIAL_DEFS = { iron: { label: '鉄鉱石' }, wisdom_scroll: { label: '知恵の巻物' }, mana_rune: { label: 'マナルーン' }, mineral: { label: '鉱石' }, history_seal: { label: '歴史の印' }, logic_core: { label: 'ロジックコア' }, vitality: { label: '生命の欠片' }, resonance: { label: '共鳴石' }, craft_cloth: { label: 'クラフトクロス' }, general_essence: { label: '万能エッセンス' } };
export const SUBJECT_MATERIALS = {
  s_math: 'iron', j_math: 'iron', s_japanese: 'wisdom_scroll', j_japanese: 'wisdom_scroll',
  s_english: 'mana_rune', j_english: 'mana_rune', s_science: 'mineral', j_science: 'mineral',
  s_social: 'history_seal', j_social: 'history_seal', s_tech: 'logic_core', e_programming: 'logic_core',
  e_duolingo: 'mana_rune', e_manga: 'history_seal', e_news: 'wisdom_scroll',
  s_pe: 'vitality', s_music: 'resonance', s_home: 'craft_cloth',
};
