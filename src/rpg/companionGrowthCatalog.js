export const COMPANION_GROWTH_RULES_VERSION = 1;
export const COMPANION_RESET_GOLD = 100;
export const COMPANION_POINT_CAPS = Object.freeze({ hp: 12, mp: 12, attack: 6, defense: 6 });
export const EMPTY_COMPANION_ALLOCATION = Object.freeze({ hp: 0, mp: 0, attack: 0, defense: 0 });
// Each member has its own aptitude and signature. Effects apply only after purchase.
const definitions = {
  guardian: ['鉄壁の守り', { maxHp: 9, defense: 1 }, { defense: 2, guardPoints: 12 }],
  mage: ['広域炎魔法', { maxMp: 4 }, { powerPercent: 18, maxMp: 2 }],
  healer: ['祈りの回復', { maxMp: 2, maxHp: 6 }, { healPercent: 12 }],
  akane: ['鋭い炎斬り', { attack: 2 }, { powerPercent: 20 }],
  minato: ['省魔力の癒し', { maxMp: 4 }, { mpReduction: 1, healPercent: 3 }],
  raika: ['省魔力の雷雲', { maxMp: 4 }, { element: 'lightning', mpReduction: 1, powerPercent: 5 }],
  gaku: ['大地の体力', { maxHp: 12 }, { maxHp: 12, guardPoints: 5 }],
  kaede: ['持続する炎', { maxMp: 4 }, { mpReduction: 1, powerPercent: 10 }],
  seria: ['みんなへの祝福', { maxHp: 9 }, { healPercent: 8, maxHp: 6 }],
  leon: ['轟く雷撃', { attack: 2 }, { element: 'lightning', powerPercent: 20 }],
  noa: ['静かな結界', { defense: 2 }, { guardPoints: 15 }],
  homura: ['猛火の剣', { attack: 1, maxHp: 6 }, { powerPercent: 15, attack: 1 }],
  shizuku: ['尽きぬ泉', { maxMp: 4 }, { healPercent: 5, maxMp: 4 }],
  raiden: ['雷帝の魔力', { maxMp: 2, attack: 1 }, { element: 'lightning', powerPercent: 12, maxMp: 4 }],
  terra: ['大地の要塞', { maxHp: 6, defense: 1 }, { defense: 2, guardPoints: 8 }],
};
export const COMPANION_GROWTH_CATALOG = Object.freeze(Object.fromEntries(Object.entries(definitions).map(([memberId, [specialty, aptitude, signature]]) => [memberId, {
  memberId, specialty,
  nodes: [
    { id: 'vitality', name: '生命の根', cost: 2, parents: [], effects: { maxHp: 6 } },
    { id: 'focus', name: '魔力の根', cost: 2, parents: [], effects: { maxMp: 2 } },
    { id: 'offense', name: '攻撃の枝', cost: 3, parents: ['focus'], effects: { attack: 1, powerPercent: 5 } },
    { id: 'defense', name: '守りの枝', cost: 3, parents: ['vitality'], effects: { defense: 1, guardPoints: 3 } },
    { id: 'aptitude', name: '得意分野', cost: 4, parents: ['offense', 'defense'], effects: aptitude },
    { id: 'signature', name: specialty, cost: 5, parents: ['aptitude'], effects: signature },
  ],
}])));
export function companionEffectDescription(effects) {
  const labels = { maxHp: 'HP', maxMp: 'MP', attack: '攻撃', defense: '防御', powerPercent: '技威力%', healPercent: '回復率pt', guardPoints: 'ガード軽減pt', mpReduction: '消費MP軽減' };
  return Object.entries(effects).map(([key, value]) => key === 'element' ? '技を雷属性にする' : labels[key] + ' +' + value).join('・');
}
