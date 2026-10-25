import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import JobPanel from './JobPanel.jsx';
import { JOB_CATALOG } from '../../rpg/jobCatalog.js';
describe('job panel',()=>{
  it.each(Object.keys(JOB_CATALOG))('shows Japanese job %s and all six choices with stat comparisons',jobId=>{
    const html=renderToStaticMarkup(<JobPanel profile={{jobId}} onSave={()=>{}}/>);
    expect(html).toContain('現在の職業：'+JOB_CATALOG[jobId].name);
    for(const job of Object.values(JOB_CATALOG)) expect(html).toContain(job.name);
    for(const label of ['最大HP','最大MP','攻撃力','防御力','消費MP','無料'])expect(html).toContain(label);
  });
  it('blocks confirmation during an active battle',()=>{
    const html=renderToStaticMarkup(<JobPanel profile={{activeBattleId:'active'}} locked onSave={()=>{}}/>);expect(html).toContain('戦闘中は転職できません');expect((html.match(/disabled=""/g)||[]).length).toBe(7);
  });
});
