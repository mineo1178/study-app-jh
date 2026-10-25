import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import CompanionGrowthPanel from './CompanionGrowthPanel.jsx';
import PartyPanel from './PartyPanel.jsx';
import BattleStartConfirmModal from './BattleStartConfirmModal.jsx';
import { normalizePlayerProfile } from '../../rpg/playerProfile.js';
import { totalExpForLevel } from '../../rpg/levelSystem.js';
const profile = normalizePlayerProfile({totalExp:totalExpForLevel(20),gold:500});
describe('companion growth presentation',()=>{
  it('shows independent budgets, six panels, comparisons and confirmation/reset controls',()=>{
    const html=renderToStaticMarkup(<CompanionGrowthPanel profile={profile} memberId="guardian" onSave={()=>{}}/>);
    for(const text of ['鉄壁の守り','残り19pt','残り19SP','能力ポイント配分','生命の根','魔力の根','攻撃の枝','守りの枝','得意分野','育成前 → 保存後の能力','保存内容を確認','100G']) expect(html).toContain(text);
  });
  it('rejects locked members and corrupt persisted data without showing editable controls',()=>{
    expect(renderToStaticMarkup(<CompanionGrowthPanel profile={profile} memberId="homura"/>)).toContain('未解放の仲間');
    const broken={...profile,companionGrowth:{guardian:null}};
    expect(renderToStaticMarkup(<CompanionGrowthPanel profile={broken} memberId="guardian"/>)).toContain('保存済みデータは変更していません');
    expect(renderToStaticMarkup(<PartyPanel profile={broken}/>)).toContain('保存済みデータを変更せず停止');
  });
  it('disables growth controls during Battle',()=>{
    const html=renderToStaticMarkup(<CompanionGrowthPanel profile={{...profile,activeBattleId:'active'}} memberId="guardian" onSave={()=>{}}/>);
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>保存内容を確認/);
  });
});

it('blocks corrupt party previews while preserving solo Campaign',()=>{
 const broken={...profile,battleEnergy:100,companionGrowth:{guardian:null}};
 const tower=renderToStaticMarkup(<BattleStartConfirmModal profile={broken} enemy={{id:'tower',isTower:true}}/>);
 expect(tower).toContain('戦闘を開始できません');expect(tower).not.toContain('このまま戦う');
 const campaign=renderToStaticMarkup(<BattleStartConfirmModal profile={broken} enemy={{id:'slime'}}/>);
 expect(campaign).toContain('主人公単独');expect(campaign).toContain('このまま戦う');
});
