import { renderToStaticMarkup } from 'react-dom/server';
import { describe,expect,it } from 'vitest';
import SkillPanelBoard from './SkillPanelBoard.jsx';
import { totalExpForLevel } from '../../rpg/levelSystem.js';
describe('connected panel map',()=>{
 it('renders a scrollable 25-node map, connections, hidden secrets and SP comparisons',()=>{const html=renderToStaticMarkup(<SkillPanelBoard profile={{totalExp:totalExpForLevel(12),gold:3000}} onSave={()=>{}}/>);expect((html.match(/data-node-id=/g)||[]).length).toBe(25);expect((html.match(/<line /g)||[]).length).toBeGreaterThanOrEqual(24);expect(html).toContain('ひみつ');expect(html).not.toContain('勇気の核');expect(html).toContain('パネル取得前後の能力');expect(html).toContain('1,000G');expect(html).toContain('Tab・Enter');});
 it('blocks battle edits and preserves malformed saved state',()=>{expect(renderToStaticMarkup(<SkillPanelBoard profile={{activeBattleId:'battle'}} locked/>)).toContain('戦闘中');expect(renderToStaticMarkup(<SkillPanelBoard profile={{skillPanel:{unlockedNodeIds:['fake'],revision:0}}}/>)).toContain('データを変更せず');});
});
