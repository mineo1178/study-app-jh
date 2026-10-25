import { renderToStaticMarkup } from 'react-dom/server';
import { describe,expect,it } from 'vitest';
import SkillPanelBoard from './SkillPanelBoard.jsx';
import { JOB_CATALOG } from '../../rpg/jobCatalog.js';
import { skillPanelNodes } from '../../rpg/skillPanelSelectors.js';
describe('job panel presentation',()=>{
 it.each(Object.keys(JOB_CATALOG))('offers common/job view for %s and restricts its visible catalog',jobId=>{const html=renderToStaticMarkup(<SkillPanelBoard profile={{jobId}}/>);expect(html).toContain('共通パネル');expect(html).toContain('職業別パネル');expect(html).toContain('他職業の取得も使用済みSP');expect(skillPanelNodes({jobId},'job').every(node=>node.id==='start'||node.jobId===jobId)).toBe(true);});
});
