import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BattleStartConfirmModal from './BattleStartConfirmModal.jsx';
import PartyPanel from './PartyPanel.jsx';
import EquipmentPanel from './EquipmentPanel.jsx';
import { normalizePlayerProfile } from '../../rpg/playerProfile.js';

const profile = normalizePlayerProfile({ battleEnergy: 5, ownedEquipment: { iron_sword: true, scholar_blade: true, dragon_star_blade: false }, equipped: { weapon: 'iron_sword' } });
const render = element => renderToStaticMarkup(element);
const allButtonsDisabled = html => expect(html.match(/<button\b/g)?.length).toBe(html.match(/<button[^>]*disabled=""/g)?.length);

describe('preparation presentation', () => {
  it('shows the Campaign hero, gear, skills, energy, hints and four clear actions', () => {
    const html = render(<BattleStartConfirmModal enemy={{ id: 'slime' }} profile={profile}/>);
    for (const text of ['スライム', '通常戦', '敵 1体', '主人公単独', '鉄の剣', '未装備', '炎斬り', '炎属性で攻撃', '現在 5 / 消費 1', 'パーティーを見直す', '装備を見直す', 'このまま戦う', 'キャンセル', '弱点：炎（対応スキルあり）', '耐性：水']) expect(html).toContain(text);
    expect(html).not.toContain('守護戦士');
    expect(html).toContain('aria-labelledby="battle-preparation-title"');
    expect(html).toContain('<summary');
  });
  it.each([{ id: 'orc_chief', isBoss: true }, { id: 'tower', isTower: true }, { id: 'weekly', isWeekly: true, weekId: '2026-W42' }])('shows boss status from the catalog for $id', enemy => {
    const html = render(<BattleStartConfirmModal enemy={enemy} profile={profile} towerProgress={{ currentFloor: 10 }}/>);
    expect(html).toContain('ボス戦');
    if (enemy.isTower || enemy.isWeekly) expect(html).toContain('守護戦士');
    else expect(html).not.toContain('守護戦士');
  });
  it('prevents starting with insufficient energy and locks navigation while starting', () => {
    const html = render(<BattleStartConfirmModal enemy={{ id: 'slime' }} profile={{ ...profile, battleEnergy: 0 }}/>);
    expect(html).toContain('Battle Energyが足りません');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>このまま戦う/);
    allButtonsDisabled(render(<BattleStartConfirmModal enemy={{ id: 'slime' }} profile={profile} starting/>));
    const active = render(<BattleStartConfirmModal enemy={{ id: 'slime' }} profile={{ ...profile, activeBattleId: 'remote' }}/>);
    expect(active).toContain('進行中の戦闘');
    expect(active).toMatch(/<button[^>]*disabled=""[^>]*>このまま戦う/);
  });
  it('shows real party stats, Japanese skills, a preview and locked members', () => {
    const html = render(<PartyPanel profile={profile}/>);
    for (const text of ['HP 40 / 攻撃力 10 / 防御力 0', '守護の壁', 'ファイアストーム', 'ヒーリングプレア', '受けるダメージを60%軽減', '合計HP', '合計攻撃力', '参考情報', '主人公は固定', '未解放', '保存済み：編成中', 'この編成で保存']) expect(html).toContain(text);
    expect(html).not.toContain('guardian_wall');
    expect(html).not.toContain('flame_slash');
    allButtonsDisabled(render(<PartyPanel profile={profile} locked/>));
    allButtonsDisabled(render(<PartyPanel profile={profile} pending/>));
  });
  it('shows only owned equipment candidates, total stat comparison and equipped slots', () => {
    const html = render(<EquipmentPanel profile={profile}/>);
    for (const text of ['装備中', '未装備', '鉄の剣', '賢者の剣', '10 → 13（+3）', '40 → 40（変化なし）', '10 → 5（-5）', '装備する']) expect(html).toContain(text);
    expect(html).not.toContain('竜星剣');
    allButtonsDisabled(render(<EquipmentPanel profile={profile} locked/>));
    allButtonsDisabled(render(<EquipmentPanel profile={profile} pendingAction="equip:scholar_blade"/>));
  });
});
