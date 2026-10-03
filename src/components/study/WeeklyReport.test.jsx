import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WeeklyReport from './WeeklyReport.jsx';
import LearningDashboard from './LearningDashboard.jsx';
import { deriveDashboardSummary } from '../../data/dashboardSelectors.js';
const now = Date.parse('2026-01-04T12:00:00+09:00');
const render = props => renderToStaticMarkup(React.createElement(WeeklyReport,{now,onBack:()=>{},...props}));
describe('weekly report UI', () => {
  it('shows a loading message without definite zero metrics', () => {
    const html = render({ready:false});
    expect(html).toContain('読み込み中'); expect(html).not.toContain('0分');
  });
  it('shows empty states, text values, seven daily bars and four selectable weeks', () => {
    const html = render({ready:true,sessions:[]});
    expect(html).toContain('先週の記録なし'); expect(html).toContain('教科の記録はありません');
    expect(html.match(/<progress/g)).toHaveLength(7); expect(html.match(/aria-pressed=/g)).toHaveLength(4);
    expect(html).toContain('aria-label="次の週を見る" disabled');
    expect(html).not.toMatch(/NaN|undefined|Infinity|2026-W01|あと0日|あと0教科/);
  });
  it('supports long defined subject labels and a factual signed comparison', () => {
    const session = (date,seconds) => ({id:date,date,recordedSeconds:seconds,taskSnapshot:{subjectId:'math'},validation:{status:'valid'}});
    const html = render({ready:true,sessions:[session('2026-01-04',30000),session('2025-12-28',25800)],subjectDefinitions:{school:[{id:'math',label:'とても長い教科の名前を含む数学の学習'}]}});
    expect(html).toContain('とても長い教科'); expect(html).toContain('+1時間10分');
    expect(html).toContain('100.0%'); expect(html).not.toMatch(/悪化|良くなった|頑張りが足りない/);
  });
  it('provides a lightweight dashboard link without detailed report duplication', () => {
    const summary = deriveDashboardSummary({now,ready:true});
    const html = renderToStaticMarkup(React.createElement(LearningDashboard,{summary,onNavigate:()=>{}}));
    expect(html).toContain('週間レポートを見る'); expect(html).not.toContain('直近4週間');
  });
});
