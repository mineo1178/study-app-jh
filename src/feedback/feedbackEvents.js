import { formatHms } from '../data/studySessionSelectors.js';

const priority = { idle_stop: -1, study_complete: 0, chapter_clear: 0, campaign_clear: 1, tower_floor_clear: 0, tower_boss_clear: 0, weekly_boss_clear: 0, level_up: 2, achievement_complete: 3, title_unlocked: 4 };

export function createFeedbackQueue() {
  let events = [];
  let held = [];
  let holds = 0;
  const seen = new Set();
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    getSnapshot: () => events,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    hold() { holds += 1; },
    release() {
      holds = Math.max(0, holds - 1);
      if (holds || !held.length) return;
      const current = events[0];
      const pending = [...events.slice(current ? 1 : 0), ...held].sort((a, b) => priority[a.type] - priority[b.type]);
      held = [];
      events = current ? [current, ...pending] : pending;
      notify();
    },
    enqueue(batch) {
      const fresh = batch.filter((event) => { if (!event?.key || seen.has(event.key)) return false; seen.add(event.key); return true; });
      if (!fresh.length) return;
      if (holds) { held = [...held, ...fresh]; return; }
      const current = events[0];
      const pending = [...events.slice(current ? 1 : 0), ...fresh].sort((a, b) => priority[a.type] - priority[b.type]);
      events = current ? [current, ...pending] : pending;
      notify();
    },
    update(event) { held = held.map((item) => item.key === event.key ? event : item); events = events.map((item) => item.key === event.key ? event : item); notify(); },
    close(key) { events = events.filter((event) => event.key !== key); notify(); },
  };
}

export function idleStopFeedback(result) {
  if (!result?.session || result.alreadyFinished) return [];
  const session = result.session;
  return [{ key: `idle:${session.timerId}`, type: 'idle_stop', title: 'タイマーを自動停止しました',
    name: '15分間操作がなかったため、タイマーを停止しました。',
    details: [session.validation?.status === 'valid'
      ? `停止予定時刻までの学習時間 ${formatHms(session.recordedSeconds)}を記録しました。`
      : 'この記録は確認が必要なため、実績と報酬には含めていません。「確認」画面で確認してください。',
    'もう一度STARTすると計測を再開できます。'] }];
}

export function studyFeedback(result, taskName, reward) {
  if (!result || result.alreadyFinished || result.session?.validation?.status !== 'valid') return [];
  const session = result.session;
  const id = session.timerId || session.id;
  if (!id) return [];
  const details = [`有効学習時間 ${formatHms(session.recordedSeconds)}`];
  if (reward?.applied && reward.rewards) {
    const rewards = reward.rewards;
    details.push(`GOLD +${rewards.gold} / ENERGY +${rewards.battleEnergy}`);
    if (Number.isFinite(rewards.expGranted)) details.push(`EXP +${rewards.expGranted}`);
  } else if (session.rewardPolicyVersion) details.push('RPG報酬は既存の自動反映処理で確認されます');
  return [{ key: `study:${id}`, type: 'study_complete', title: '学習完了！', name: taskName, details }];
}

export function progressFeedback(before, after) {
  if (!before) return [];
  const events = [];
  if (after.level > before.level) events.push({ key: `level:${after.level}`, type: 'level_up', title: 'LEVEL UP', name: `Lv.${before.level} → Lv.${after.level}` });
  for (const achievement of after.achievements) {
    if (achievement.completed && before.achievements.some((item) => item.id === achievement.id && !item.completed)) events.push({ key: `achievement:${achievement.id}`, type: 'achievement_complete', title: '実績達成', name: achievement.name });
  }
  for (const title of after.titles) {
    if (!before.titles.some((item) => item.id === title.id)) events.push({ key: `title:${title.id}`, type: 'title_unlocked', title: '称号解放', name: title.name });
  }
  return events;
}

export function battleFeedback(before, after, highestFloor = 0) {
  if (!before || before.status !== 'active' || before.battleId !== after?.battleId || after.status !== 'won') return [];
  const base = { key: `battle:${after.battleId}`, name: after.enemySnapshot?.name || after.weeklyBossSnapshot?.name, details: [] };
  const victory = after.victory || {};
  if (after.battleMode === 'weekly_boss') {
    const reward = victory.weeklyBoss;
    if (reward) base.details.push(`EXP +${reward.expReward} / 金チケット +${reward.goldTicket} / 星のかけら +${reward.starFragments}`, `${reward.alchemyItemId} ×${reward.alchemyItemQuantity}`);
    return [{ ...base, type: 'weekly_boss_clear', title: 'Weekly Boss撃破！' }];
  }
  if (after.battleMode === 'tower') return [{ ...base, type: after.battleKind === 'boss' ? 'tower_boss_clear' : 'tower_floor_clear', title: after.battleKind === 'boss' ? 'Tower Boss撃破！' : 'Floorクリア！', name: `${after.towerFloor}階クリア`, details: [...(victory.expGranted !== undefined ? [`EXP +${victory.expGranted}`] : []), ...(after.towerFloor > highestFloor ? [`最高到達階 ${after.towerFloor}階`] : [])] }];
  if (!victory.bossClear) return [];
  const events = [{ ...base, type: 'chapter_clear', title: 'Chapter Boss撃破・Chapterクリア！', name: after.chapterSnapshot?.name, details: [`EXP +${victory.expGranted}`, `GOLD +${victory.bossClear.reward.gold}`] }];
  if (after.chapterSnapshot?.nextChapterId === null) events.push({ key: `campaign:${after.battleId}`, type: 'campaign_clear', title: 'Campaignクリア！', name: 'すべてのChapterをクリアしました' });
  return events;
}

// Module lifetime survives tab navigation, StrictMode and component remounts.
export const feedbackSession = { queue: createFeedbackQueue(), progress: null, battles: new Map() };
