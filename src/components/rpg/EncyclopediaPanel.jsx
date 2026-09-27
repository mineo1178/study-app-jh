import { useMemo, useState } from 'react';
import { ALCHEMY_ITEMS } from '../../rpg/gachaCatalog.js';
import { buildEncyclopedia } from '../../rpg/encyclopedia.js';
import { ELEMENT_LABELS } from '../../rpg/elementConfig.js';
import { partySkill } from '../../rpg/partyMemberCatalog.js';

const CATEGORIES = [
  ['members', '仲間'], ['enemies', '敵'], ['equipment', '装備'], ['alchemyItems', '錬金素材'],
];
const SLOT_LABELS = { weapon: '武器', armor: '防具', accessory: 'アクセサリー' };
const ENEMY_KIND_LABELS = { normal: '通常敵', boss: 'CHAPTER BOSS', weekly: 'WEEKLY BOSS' };
const elementLabel = (value) => ELEMENT_LABELS[value] || value;
const elements = (values) => (values || []).map(elementLabel).join('・') || 'なし';

function MemberDetails({ item }) {
  return <><p className="mt-1 text-xs font-black text-violet-700">{item.rarity || 'Starter'} {item.role}</p><p className="mt-3 text-xs font-bold text-slate-600">傾向：{item.tendency}</p><p className="mt-1 text-xs font-bold text-slate-600">スキル：{item.skillIds.map((id) => partySkill(id)?.name || id).join('・')}</p>{item.element && <p className="mt-1 text-xs font-bold text-slate-600">属性：{item.element}</p>}{item.multiplier && <p className="mt-1 text-xs font-bold text-slate-600">倍率：{item.multiplier}</p>}</>;
}

function EnemyDetails({ item }) {
  return <><p className="mt-1 text-xs font-black text-rose-700">{ENEMY_KIND_LABELS[item.encyclopediaKind]}</p><p className="mt-3 text-xs font-bold text-slate-600">属性：{elementLabel(item.element)} / 弱点：{elements(item.weaknesses)} / 耐性：{elements(item.resistances)}</p><p className="mt-1 text-xs font-bold text-slate-600">HP {item.maxHp} ・ 攻撃 {item.attack}{item.energyCost !== undefined ? ` ・ Energy ${item.energyCost}` : ''}{item.expReward !== undefined ? ` ・ EXP ${item.expReward}` : ''}</p>{item.firstClearReward && <p className="mt-2 text-xs font-bold text-amber-700">初回報酬：GOLD {item.firstClearReward.gold}</p>}{item.reward && <p className="mt-2 text-xs font-bold text-amber-700">週間報酬：EXP {item.reward.expReward} / {ALCHEMY_ITEMS[item.reward.alchemyItemId]?.name} ×{item.reward.alchemyItemQuantity}</p>}</>;
}

function EquipmentDetails({ item }) {
  return <><p className="mt-1 text-xs font-black text-blue-700">{SLOT_LABELS[item.slot] || item.slot} ・ {item.rarity}</p><p className="mt-3 text-xs font-bold text-slate-500">{item.description}</p><p className="mt-2 text-xs font-bold text-slate-600">攻撃 +{item.stats.attack} / 防御 +{item.stats.defense}</p>{item.recipe && <p className="mt-2 text-xs font-bold text-violet-700">錬金：{Object.entries(item.recipe.alchemyItems).map(([id, amount]) => `${ALCHEMY_ITEMS[id]?.name || id} ×${amount}`).join('・')}</p>}</>;
}

const AlchemyItemDetails = ({ item }) => <p className="mt-1 text-xs font-black text-violet-700">レア度 {item.rarity}</p>;

function Card({ entry, category }) {
  if (!entry.discovered) return <article className="rounded-2xl border border-slate-200 bg-slate-100 p-5 text-center"><p className="text-2xl">🔒</p><h3 className="mt-2 font-black text-slate-500">???</h3><p className="mt-1 text-xs font-bold text-slate-400">未発見</p></article>;
  const Details = category === 'members' ? MemberDetails : category === 'enemies' ? EnemyDetails : category === 'equipment' ? EquipmentDetails : AlchemyItemDetails;
  return <article className="rounded-2xl border border-violet-100 bg-white p-5 shadow-sm"><h3 className="font-black text-slate-800">{entry.item.name}</h3><Details item={entry.item}/></article>;
}

export default function EncyclopediaPanel({ profile, ledgers, loading, error }) {
  const [category, setCategory] = useState('members');
  const encyclopedia = useMemo(() => buildEncyclopedia({ profile, actionLedgers: ledgers?.actionLedgers, battleLedgers: ledgers?.battleLedgers }), [ledgers, profile]);
  const entries = encyclopedia[category];
  const found = entries.filter((entry) => entry.discovered).length;
  return <section className="space-y-5"><div><p className="text-[10px] font-black tracking-widest text-violet-600">ENCYCLOPEDIA</p><h2 className="text-xl font-black text-slate-800">図鑑</h2></div><div className="grid grid-cols-4 rounded-2xl bg-slate-100 p-1">{CATEGORIES.map(([id, label]) => <button type="button" key={id} onClick={() => setCategory(id)} className={`rounded-xl px-1 py-3 text-xs font-black sm:text-sm ${category === id ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div>{loading && <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">発見記録を読み込み中…</p>}{error && <p className="rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-700">発見記録を読み込めませんでした。現在の所持情報のみ表示します。</p>}<div className="flex items-center justify-between"><h3 className="font-black text-slate-700">{CATEGORIES.find(([id]) => id === category)?.[1]}</h3><span className="rounded-lg bg-violet-50 px-3 py-1 text-sm font-black text-violet-700">{found} / {entries.length}</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{entries.map((entry) => <Card key={entry.item.id} entry={entry} category={category}/>)}</div></section>;
}
