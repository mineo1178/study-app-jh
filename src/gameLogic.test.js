import { describe, expect, it } from 'vitest';
import {
  BOSSES,
  bossProgress,
  collectStudyRecords,
  dailyQuestStatus,
  damageForRecord,
  elapsedSeconds,
  gameProgress,
  getCreditedStudySeconds,
  levelFromExp,
  recordIntegrity,
  sessionExp,
  subjectBalance,
  timerStateAfterPause,
  timerStateAfterStart,
  totalSecondsForFinish,
  weeklyAdventureDays,
} from './gameLogic';

const task = (subjectId, history) => ({ id: `task-${subjectId}`, categoryId: 'school', subjectId, history });
const record = (id, date, minutes, startMinute = 0) => ({
  id,
  date,
  duration: minutes * 60,
  startedAt: Date.parse(`${date}T09:00:00+09:00`) + startMinute * 60 * 1000,
  endedAt: Date.parse(`${date}T09:00:00+09:00`) + (startMinute + minutes) * 60 * 1000,
});

describe('timer pure functions', () => {
  it('START連打でsessionStartTimeを再設定しない', () => {
    const running = { id: 'a', isRunning: true, sessionStartTime: 1000, currentDuration: 0 };
    expect(timerStateAfterStart(running, 5000)).toBe(running);
  });

  it('別タスク計測中はSTARTしない', () => {
    const stopped = { id: 'a', isRunning: false, sessionStartTime: null, currentDuration: 0 };
    expect(timerStateAfterStart(stopped, 5000, true)).toBe(stopped);
  });

  it('PAUSE / RESUME相当で二重加算しない', () => {
    const paused = timerStateAfterPause({ id: 'a', isRunning: true, sessionStartTime: 1000, currentDuration: 20 * 60 }, 601000);
    expect(paused.currentDuration).toBe(30 * 60);
  });

  it('5分無操作でも自動停止用の0秒にはならない', () => {
    expect(elapsedSeconds(1_000, 301_000)).toBe(300);
    expect(elapsedSeconds(1_000, 601_000)).toBe(600);
  });

  it('background復帰・reload相当でも開始時刻から経過時間を再計算する', () => {
    expect(totalSecondsForFinish({ currentDuration: 120, sessionStartTime: 1_000, isRunning: true }, 181_000)).toBe(300);
  });

  it('FINISH連打相当では停止済みタスクの保存時間を増やさない', () => {
    expect(totalSecondsForFinish({ currentDuration: 30 * 60, sessionStartTime: null, isRunning: false }, 60 * 60 * 1000)).toBe(30 * 60);
  });
});

describe('session integrity and creditedDuration', () => {
  it('30分正常sessionは30分をRPG報酬にする', () => {
    const result = getCreditedStudySeconds(record('a', '2026-09-05', 30));
    expect(result.creditedDuration).toBe(30 * 60);
    expect(result.integrity.needsReview).toBe(false);
  });

  it('95分sessionはrecorded95分 / credited60分で長時間判定する', () => {
    const item = record('a', '2026-09-05', 95);
    const result = getCreditedStudySeconds(item);
    expect(recordIntegrity(item).recordedMinutes).toBe(95);
    expect(result.creditedDuration).toBe(60 * 60);
    expect(result.integrity.flags).toContain('longSession');
  });

  it('120分超は要確認、180分超は高リスク判定にする', () => {
    expect(getCreditedStudySeconds(record('a', '2026-09-05', 121)).integrity.flags).toContain('reviewSession');
    expect(getCreditedStudySeconds(record('b', '2026-09-05', 181)).integrity.flags).toContain('highRiskSession');
  });

  it('300分sessionでもcredited60分にする', () => {
    expect(getCreditedStudySeconds(record('a', '2026-09-05', 300)).creditedDuration).toBe(60 * 60);
  });

  it('startedAt > endedAt はRPG報酬を0にする', () => {
    const item = { ...record('a', '2026-09-05', 30), startedAt: 2000, endedAt: 1000 };
    const result = getCreditedStudySeconds(item);
    expect(result.creditedDuration).toBe(0);
    expect(result.integrity.flags).toContain('startsAfterEnd');
  });

  it('durationと開始終了差分の不一致を検知する', () => {
    const item = { ...record('a', '2026-09-05', 30), endedAt: Date.parse('2026-09-05T09:10:00+09:00') };
    expect(getCreditedStudySeconds(item).integrity.flags).toContain('clockMismatch');
  });

  it('overlap sessionを要確認にし、重複時間をRPG報酬から除外する', () => {
    const first = record('a', '2026-09-05', 60, 0);
    const second = record('b', '2026-09-05', 60, 20);
    const records = collectStudyRecords([task('s_math', [first]), task('s_english', [second])]);
    expect(records[1].integrity.flags).toContain('overlap');
    expect(records.reduce((sum, item) => sum + item.creditedDuration, 0)).toBe(80 * 60);
  });
});

describe('RPG calculation', () => {
  it('RPG開始日前の履歴はEXP対象外、開始日以降は対象', () => {
    const progress = gameProgress([task('s_math', [
      record('old', '2026-09-04', 60),
      record('new', '2026-09-05', 30),
    ])], '2026-09-05');
    expect(progress.records.find((item) => item.id === 'old').exp).toBe(0);
    expect(progress.records.find((item) => item.id === 'new').exp).toBe(30);
    expect(getCreditedStudySeconds(record('missing-date', undefined, 30)).creditedDuration).toBe(0);
  });

  it('1履歴のEXPを60分で上限にする', () => {
    expect(sessionExp(20 * 60)).toBe(20);
    expect(sessionExp(90 * 60)).toBe(60);
  });

  it('累計EXPからレベルと次レベルまでのEXPを計算する', () => {
    expect(levelFromExp(100)).toMatchObject({ level: 2, expIntoLevel: 0, expForNext: 120, expToNext: 120 });
    expect(levelFromExp(220)).toMatchObject({ level: 3, expIntoLevel: 0, expForNext: 140 });
  });

  it('通常ダメージと弱点倍率を計算する', () => {
    expect(damageForRecord({ subjectId: 's_english', creditedDuration: 20 * 60 }, BOSSES[0])).toBe(100);
    expect(damageForRecord({ subjectId: 's_math', creditedDuration: 20 * 60 }, BOSSES[0])).toBe(150);
  });

  it('ボス進行を学習ダメージから計算する', () => {
    const result = bossProgress([
      { subjectId: 's_math', creditedDuration: 60 * 60, date: '2026-09-05' },
      { subjectId: 's_math', creditedDuration: 60 * 60, date: '2026-09-06' },
    ]);
    expect(result.defeated.map((boss) => boss.name)).toContain(BOSSES[0].name);
    expect(result.boss.name).toBe(BOSSES[1].name);
  });

  it('教科バランスボーナスを計算する', () => {
    const records = [
      { subjectId: 's_math', creditedDuration: 10 * 60, date: '2026-09-05' },
      { subjectId: 's_english', creditedDuration: 10 * 60, date: '2026-09-05' },
      { subjectId: 's_science', creditedDuration: 10 * 60, date: '2026-09-05' },
      { subjectId: 's_social', creditedDuration: 10 * 60, date: '2026-09-05' },
    ];
    expect(subjectBalance(records, '2026-09-05')).toMatchObject({ subjectCount: 4, expMultiplier: 1.1, chest: true, damageMultiplier: 1.1 });
  });

  it('デイリークエストと未学習教科クエストを判定する', () => {
    const records = [
      { subjectId: 's_math', creditedDuration: 15 * 60, date: '2026-09-05' },
      { subjectId: 's_english', creditedDuration: 15 * 60, date: '2026-09-05' },
    ];
    const status = dailyQuestStatus(records, '2026-09-05');
    expect(status.completedCount).toBe(3);
    expect(status.quests.map((quest) => quest.id)).toContain('unstudiedMajor');
  });

  it('アイテム、スキル、週間冒険日数を既存historyから算出する', () => {
    const histories = [
      record('1', '2026-09-07', 60),
      record('2', '2026-09-08', 60),
      record('3', '2026-09-09', 60),
      record('4', '2026-09-10', 60),
      record('5', '2026-09-11', 60),
    ];
    const shiftedHistories = histories.map((item, index) => record(`e-${index}`, item.date, 60, 70));
    const progress = gameProgress([task('s_math', histories), task('s_english', shiftedHistories)], '2026-09-09');
    expect(progress.items.map((item) => item.id)).toContain('wooden-sword');
    expect(progress.skills.map((skill) => skill.id)).toContain('double-strike');
    expect(weeklyAdventureDays(progress.records, '2026-09-09').days).toBe(3);
  });
});
