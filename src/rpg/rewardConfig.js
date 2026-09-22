export const REWARD_POLICY_VERSION = 'rpg-reward-v1';
export const REWARD_SCHEMA_VERSION = 1;
export const MATERIAL_KEYS = ['iron', 'wisdom_scroll', 'mana_rune', 'mineral', 'history_seal', 'logic_core', 'vitality', 'resonance', 'craft_cloth', 'general_essence'];
export const MATERIAL_DEFS = {
  iron: { label: '鉄鉱石', description: 'ずっしり重い、武器づくりの基本素材。', sourceLabel: '数学の学習で手に入る素材', usageLabel: '武器などの作成に使用' },
  wisdom_scroll: { label: '知恵の巻物', description: '知識が書きこまれた不思議な巻物。', sourceLabel: '国語・ニュース系の学習で手に入る', usageLabel: '知識系の装備に使用' },
  mana_rune: { label: 'マナルーン', description: '魔法の力を秘めた小さなルーン石。', sourceLabel: '英語・Duolingoで手に入る', usageLabel: '魔法系・知識系装備に使用' },
  mineral: { label: '鉱石', description: 'かたくて丈夫な、自然が育てた鉱石。', sourceLabel: '理科の学習で手に入る', usageLabel: '防具に使用' },
  history_seal: { label: '歴史の印', description: '昔の出来事の記憶が刻まれた印。', sourceLabel: '社会・漫画系の学習で手に入る', usageLabel: '歴史系アクセサリーに使用' },
  logic_core: { label: 'ロジックコア', description: '考える力をぎゅっと閉じこめたコア。', sourceLabel: '技術・プログラミングで手に入る', usageLabel: '論理系装備に使用' },
  vitality: { label: '生命の欠片', description: '元気な力がきらめく小さな欠片。', sourceLabel: '体育の学習で手に入る', usageLabel: '体力系装備素材' },
  resonance: { label: '共鳴石', description: '音と心をひとつにするきれいな石。', sourceLabel: '音楽の学習で手に入る', usageLabel: '調和系装備素材' },
  craft_cloth: { label: 'クラフトクロス', description: '丈夫でやわらかい、手作り用の布。', sourceLabel: '家庭科の学習で手に入る', usageLabel: '衣服・防具系素材' },
  general_essence: { label: '万能エッセンス', description: 'いろいろな素材の力を少しずつ持つしずく。', sourceLabel: '専用素材が設定されていない学習で手に入る', usageLabel: '素材交換にも利用できる汎用素材' },
};
export const SUBJECT_MATERIALS = {
  s_math: 'iron', j_math: 'iron', s_japanese: 'wisdom_scroll', j_japanese: 'wisdom_scroll',
  s_english: 'mana_rune', j_english: 'mana_rune', s_science: 'mineral', j_science: 'mineral',
  s_social: 'history_seal', j_social: 'history_seal', s_tech: 'logic_core', e_programming: 'logic_core',
  e_duolingo: 'mana_rune', e_manga: 'history_seal', e_news: 'wisdom_scroll',
  s_pe: 'vitality', s_music: 'resonance', s_home: 'craft_cloth',
};
