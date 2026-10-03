import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import LearningDashboard from '../components/study/LearningDashboard.jsx';
import { deriveDashboardSummary as derive } from './dashboardSelectors.js';
import { deriveRewardProgress } from '../rpg/rewardProgress.js';
import { EQUIPMENT_CATALOG } from '../rpg/equipmentCatalog.js';
const now = Date.parse('2026-01-04T23:59:00+09:00');
const record = (date, seconds = 60, subjectId = 'math', status = 'valid', extra = {}) => ({ id: `${date}-${subjectId}`, date, recordedSeconds: seconds, taskSnapshot: { subjectId }, validation: { status }, ...extra });
const summary = extra => derive({ now, ready: true, ...extra });
describe('dashboard summary', () => {
  it('handles empty, missing and loading data', () => {
    expect(derive().status).toBe('loading');
    expect(summary().todaySeconds).toBe(0);
    expect(summary().todayCount).toBe(0);
    expect(summary({ sessions: [record('bad', NaN), record('2026-01-04', Infinity)] }).weekSeconds).toBe(0);
  });
  it('excludes invalid, pending, stale and live records and deduplicates timers', () => {
    const sessions = [record('2026-01-04', 30, 'a'), record('2026-01-04', 900, 'b', 'invalid'), record('2026-01-04', 900, 'c', 'pending_review'), record('2026-01-04', 900, 'd', 'valid', { isStale: true }), record('2026-01-04', 900, 'e', 'valid', { isLive: true }), record('2026-01-04', 30, 'a')];
    expect(summary({ sessions }).todaySeconds).toBe(30);
    expect(summary({ sessions }).todayCount).toBe(1);
  });
  it('uses recorded time excluding pauses and marks achieved daily goals', () => {
    const s = summary({ sessions: [record('2026-01-04', 7200, 'math', 'valid', { segments: [{ startedAt: 1, endedAt: 99999999 }] })] });
    expect(s.todaySeconds).toBe(7200); expect(s.remaining).toBe(0); expect(s.actions.some(a => a.id === 'daily')).toBe(false);
  });
  it('uses JST and ISO year boundary', () => {
    const sessions = [record('2025-12-28', 600), record('2025-12-29', 120), record('2026-01-04', 60)];
    expect(summary({ sessions }).weekSeconds).toBe(180);
    expect(summary({ sessions, now: Date.parse('2026-01-04T15:00:00Z') }).todaySeconds).toBe(0);
    expect(summary({ sessions, now: Date.parse('2026-01-04T15:00:00Z') }).weekDays).toBe(0);
  });
  it('prioritizes daily then weekly goals and limits to three unique actions', () => {
    const s = summary({ sessions: ['2025-12-29','2025-12-30','2025-12-31','2026-01-01'].map((d,i) => record(d,60,i % 2 ? 'math' : 'english')), rewardProgress: deriveRewardProgress({ gold: 99999 }) });
    expect(s.actions.map(a=>a.id)).toEqual(['daily','days','subjects']);
    expect(s.actions[1].title).toContain('あと1日'); expect(s.actions[2].title).toContain('あと1教科');
    expect(new Set(s.actions.map(a=>a.id)).size).toBe(s.actions.length);
  });
  const complete = ['2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-04'].map((d,i)=>record(d,7200,`subject${i}`));
  it('reuses reward requirements for nearly ready and available gacha and equipment', () => {
    for (const gold of [0, 299, 999999]) {
      const rewardProgress = deriveRewardProgress({ gold });
      const s = summary({ sessions: complete, rewardProgress });
      expect(s.actions.some(a=>a.id==='gacha')).toBe(true);
      expect(s.actions.find(a=>a.id==='gacha').title).toBe(rewardProgress.goals[0].available ? 'ガチャできます' : `次のガチャまであと${rewardProgress.goals[0].remainingMinutes}分が目安`);
      expect(s.actions.some(a=>a.id===rewardProgress.goals[1].id)).toBe(true);
    }
    expect(summary({ sessions: complete, rewardProgress: { status: 'ready', goals: [] } }).actions).toEqual([]);
  });
  it('reports campaign, tower and current week boss, honoring unlock and energy', () => {
    const base = { sessions: complete, rpgReady: true, playerProfile: { battleEnergy: 99 }, towerProgress: { highestFloor: 10, currentFloor: 11 }, rpgProgress: { currentChapterId: 'chapter_2', campaignCompleted: false } };
    expect(summary(base).rpg.campaign).toBe('Chapter 2進行中');
    expect(summary(base).actions.map(a=>a.id)).toEqual(['campaign']);
    const s = summary({ ...base, rpgProgress: { campaignCompleted: true } });
    expect(s.rpg.tower).toBe('最高10F / 次は11F'); expect(s.actions.map(a=>a.id)).toEqual(['weekly','tower']);
    const cleared = summary({ ...base, rpgProgress: { campaignCompleted: true }, playerProfile: { battleEnergy: 99, weeklyBoss: { clearedWeekIds: ['2026-W01'] } } });
    expect(cleared.rpg.weekly).toContain('討伐済み'); expect(cleared.actions.some(a=>a.id==='weekly')).toBe(false);
    expect(summary({ ...base, playerProfile: { battleEnergy: 0 } }).actions).toEqual([]);
    expect(summary({ ...base, battle: { status: 'active' } }).actions).toEqual([]);
  });
  it('renders loading, achieved, empty grades and safe unknown data', () => {
    const render = s => renderToStaticMarkup(React.createElement(LearningDashboard,{ summary: s, onNavigate: ()=>{} }));
    expect(render(derive())).toContain('読み込んでいます');
    const html = render(summary({ sessions: complete, gradesReady: true }));
    expect(html).toContain('今日の目標達成！'); expect(html).toContain('まだ成績の記録がありません'); expect(html).not.toMatch(/NaN|undefined|あと0分/);
  });
  it('handles no unowned equipment and blocked rewards', () => {
    const rewardProgress = deriveRewardProgress({ gold: 1000, ownedEquipment: Object.fromEntries(Object.keys(EQUIPMENT_CATALOG).map(id => [id, true])) });
    expect(rewardProgress.goals).toHaveLength(1);
    expect(summary({ sessions: complete, rewardProgress }).actions.map(a => a.id)).toEqual(['gacha']);
    expect(summary({ sessions: complete, rewardProgress: deriveRewardProgress({ gold: 1000 }, { blocked: true }) }).actions).toEqual([]);
  });
  it('shows at most one incomplete achievement only after loading', () => {
    const achievements = [{ id: 'completed', completed: true, current: 10, target: 10 }, { id: 'near', current: 9, target: 10 }, { id: 'far', current: 1, target: 10 }, { id: 'unknown', current: NaN, target: 10 }];
    expect(summary({ achievements }).achievement).toBeNull();
    expect(summary({ achievements, rpgReady: true }).achievement.id).toBe('near');
  });
  it('does not fabricate unknown tower progress or grades', () => {
    const s = summary({ rpgReady: true, rpgProgress: { campaignCompleted: true }, towerProgress: {}, gradesReady: true, grades: [{ date: null }, { name: '最新', date: '2026-01-04', average: 55 }] });
    expect(s.rpg.tower).toContain('確認しています');
    expect(s.actions.some(a => a.id === 'tower')).toBe(false);
    expect(s.latestGrade.name).toBe('最新');
  });
});
