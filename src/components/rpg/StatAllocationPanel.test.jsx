import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import StatAllocationPanel from './StatAllocationPanel.jsx';
import BattleArena from './BattleArena.jsx';
import PartyBattleArena from './PartyBattleArena.jsx';
import { prepareBattleStart, preparePartyTowerStart } from '../../data/rpgBattleRepository.js';
import { normalizePlayerProfile } from '../../rpg/playerProfile.js';
import { totalExpForLevel } from '../../rpg/levelSystem.js';
import { ENEMY_CATALOG } from '../../rpg/enemyCatalog.js';
import { buildTowerEncounter } from '../../rpg/towerCatalog.js';
const profile = normalizePlayerProfile({ totalExp: totalExpForLevel(10), gold: 300, battleEnergy: 30, statAllocation: { hp: 6, mp: 3 } });
describe('stat allocation UI', () => {
  it('renders earned, spent and remaining points, HP/MP and free/purchased rules without writing', () => {
    const html = renderToStaticMarkup(<StatAllocationPanel profile={profile} onSave={() => { throw Error('must not write on render'); }}/>);
    for (const text of ['能力育成','獲得 9pt','使用済み 9pt','未配分 0pt','現在の最大HP 58','最大MP 14','120G','HPを増やす','MPを減らす']) expect(html).toContain(text);
    expect(html).toMatch(/disabled=""[^>]*>保存内容を確認/);
    expect(html).toMatch(/aria-label="MPを増やす" disabled/);
  });
  it('disables all distribution buttons during battle', () => {
    const html = renderToStaticMarkup(<StatAllocationPanel profile={profile} locked/>);
    expect(html).toContain('戦闘中は能力を変更できません');
    for (const label of ['HPを増やす','HPを減らす','MPを増やす','MPを減らす']) expect(html).toContain('aria-label="' + label + '" disabled');
  });
  it('explains corrupt allocations without silently normalizing them', () => {
    const html = renderToStaticMarkup(<StatAllocationPanel profile={{ ...profile, statAllocation: { hp: -1, mp: 0 } }}/>);
    expect(html).toContain('保存された配分が不正'); expect(html).not.toContain('保存内容を確認');
  });
  it('shows MP and insufficient reason only on new Campaign battles', () => {
    const { battle } = prepareBattleStart({ profile, enemy: ENEMY_CATALOG.slime, battleId: 'ui', now: 1 });
    const html = renderToStaticMarkup(<BattleArena battle={{ ...battle, playerMp: 0 }}/>);
    expect(html).toContain('主人公 MP 0 / 14'); expect(html).toContain('MPが不足しています'); expect(html).toContain('消費MP 2');
    delete battle.mpRulesVersion; delete battle.playerMp;
    const old = renderToStaticMarkup(<BattleArena battle={battle}/>);
    expect(old).not.toContain('主人公 MP'); expect(old).not.toContain('消費MP'); expect(old).not.toContain('MPが不足');
  });
  it('keeps legacy ally skills usable with zero hero MP and hides their MP costs', () => {
    const { battle } = preparePartyTowerStart({ profile, encounter: buildTowerEncounter({ floor: 10 }), battleId: 'party', now: 1 });
    const html = renderToStaticMarkup(<PartyBattleArena battle={{ ...battle, skillRulesVersion: 1, playerMp: 0, activePartyMemberId: 'guardian' }}/>);
    expect(html).toContain('主人公 MP 0 / 14'); expect(html).toContain('守護の壁'); expect(html).not.toContain('MPが不足'); expect(html).not.toContain('消費MP');
  });
});
