import { beforeEach, expect, it, vi } from 'vitest';
import { normalizePlayerProfile } from '../rpg/playerProfile.js';
import { normalizeStudyGoals, DEFAULT_STUDY_GOALS } from '../personalStudyGoals.js';
const mock = vi.hoisted(() => ({ profile: {}, fail: false, writes: 0 }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...path) => path.join('/'),
  runTransaction: vi.fn(),
  deleteField: () => 'DELETE_FIELD',
  setDoc: vi.fn(async (_ref, value, options) => {
    if (mock.fail) throw new Error('offline');
    expect(options.mergeFields.slice(0,2)).toEqual(['studyGoals.dailyTargetMinutes', 'studyGoals.weeklyStudyDays']);
    mock.writes++;
    for (const field of options.mergeFields) {
      const keys = field.split('.');
      let target = mock.profile, source = value;
      for (const key of keys.slice(0,-1)) { target[key] ||= {}; target = target[key]; source = source[key]; }
      const key = keys.at(-1);
      if (source[key] === 'DELETE_FIELD') delete target[key];
      else target[key] = source[key];
    }
  }),
}));
import { saveStudyGoals } from './studyGoalsRepository.js';
beforeEach(() => { mock.profile = { gold: 99, unknown: 'keep', studyGoals: { future: true } }; mock.fail = false; mock.writes = 0; });
it('saves once, reloads through existing profile normalization, and preserves unrelated fields', async () => {
  await saveStudyGoals({ db: {}, familyId: 'family', studyGoals: { dailyTargetMinutes: 90, weeklyStudyDays: 3 } });
  expect(mock.writes).toBe(1);
  expect(mock.profile).toMatchObject({ gold: 99, unknown: 'keep', studyGoals: { future: true, dailyTargetMinutes: 90, weeklyStudyDays: 3 } });
  expect(normalizeStudyGoals(normalizePlayerProfile(mock.profile).studyGoals)).toEqual({ dailyTargetMinutes: 90, weeklyStudyDays: 3 });
  await saveStudyGoals({ db: {}, familyId: 'family', studyGoals: DEFAULT_STUDY_GOALS });
  expect(normalizeStudyGoals(mock.profile.studyGoals)).toEqual(DEFAULT_STUDY_GOALS);
});
it('creates settings on a missing profile without migration', async () => {
  mock.profile = {};
  expect(normalizeStudyGoals(normalizePlayerProfile(mock.profile).studyGoals)).toEqual(DEFAULT_STUDY_GOALS);
  await saveStudyGoals({ db: {}, familyId: 'family', studyGoals: { dailyTargetMinutes: 15, weeklyStudyDays: 1 } });
  expect(mock.profile.studyGoals.dailyTargetMinutes).toBe(15);
});
it('propagates save failure and keeps confirmed settings', async () => {
  const before = structuredClone(mock.profile); mock.fail = true;
  await expect(saveStudyGoals({ db: {}, familyId: 'family', studyGoals: { dailyTargetMinutes: 60, weeklyStudyDays: 7 } })).rejects.toThrow('offline');
  expect(mock.profile).toEqual(before); expect(mock.writes).toBe(0);
});
it('saves subject targets with daily goals in one partial write, retaining unknown fields and reload values', async () => {
  mock.profile.studyGoals.subjectWeeklyTargets = { orphan: 300, s_math: 60, s_english: 120 };
  await saveStudyGoals({ db: {}, familyId: 'family', studyGoals: { dailyTargetMinutes: 90, weeklyStudyDays: 3, subjectWeeklyTargets: { s_math: 180, s_english: 0, j_math: 600, orphan: 0 } } });
  expect(mock.writes).toBe(1);
  expect(normalizePlayerProfile(mock.profile)).toMatchObject({ gold: 99, unknown: 'keep', studyGoals: { future: true, dailyTargetMinutes: 90, weeklyStudyDays: 3, subjectWeeklyTargets: { orphan: 300, s_math: 180, j_math: 600 } } });
  expect(mock.profile.studyGoals.subjectWeeklyTargets).not.toHaveProperty('s_english');
});
it('resets known subject goals without deleting orphan values or unknown settings', async () => {
  mock.profile.studyGoals.subjectWeeklyTargets = { s_math: 180, orphan: 300 };
  await saveStudyGoals({ db: {}, familyId: 'family', studyGoals: { ...DEFAULT_STUDY_GOALS, subjectWeeklyTargets: {} } });
  expect(mock.profile.studyGoals).toEqual({ future: true, ...DEFAULT_STUDY_GOALS, subjectWeeklyTargets: { orphan: 300 } });
});
it('keeps subject settings on a daily-only write and on subject save failure', async () => {
  mock.profile.studyGoals.subjectWeeklyTargets = { s_math: 180 };
  await saveStudyGoals({ db: {}, familyId: 'family', studyGoals: { dailyTargetMinutes: 60, weeklyStudyDays: 7 } });
  expect(mock.profile.studyGoals.subjectWeeklyTargets).toEqual({ s_math: 180 });
  const before = structuredClone(mock.profile); mock.fail = true;
  await expect(saveStudyGoals({ db: {}, familyId: 'family', studyGoals: { dailyTargetMinutes: 15, weeklyStudyDays: 1, subjectWeeklyTargets: { s_math: 600 } } })).rejects.toThrow('offline');
  expect(mock.profile).toEqual(before);
});

it('saves all goal kinds once, reloads plans, and clears only known plan IDs', async () => {
  mock.profile.studyGoals.weeklyPlan = { mon: { s_math: 60, orphan: 45 }, special: { s_math: 15 } };
  await saveStudyGoals({ db: {}, familyId: 'family', studyGoals: { dailyTargetMinutes: 90, weeklyStudyDays: 3, subjectWeeklyTargets: { s_math: 180 }, weeklyPlan: { mon: { s_math: 45, s_english: 30 }, sun: { j_math: 360 } } } });
  expect(mock.writes).toBe(1);
  expect(normalizePlayerProfile(mock.profile).studyGoals).toMatchObject({ future: true, dailyTargetMinutes: 90, weeklyStudyDays: 3, subjectWeeklyTargets: { s_math: 180 }, weeklyPlan: { mon: { s_math: 45, s_english: 30, orphan: 45 }, sun: { j_math: 360 }, special: { s_math: 15 } } });
  await saveStudyGoals({ db: {}, familyId: 'family', studyGoals: { dailyTargetMinutes: 90, weeklyStudyDays: 3, weeklyPlan: {} } });
  expect(mock.profile.studyGoals.weeklyPlan.mon).toEqual({ orphan: 45 });
  expect(mock.profile.studyGoals.weeklyPlan.sun).toEqual({});
  expect(mock.profile.studyGoals.weeklyPlan.special).toEqual({ s_math: 15 });
  expect(mock.profile.studyGoals.subjectWeeklyTargets.s_math).toBe(180);
  expect(mock.profile.gold).toBe(99);
});

it('preserves plans on basic-only save and failed plan write', async () => {
  mock.profile.studyGoals.weeklyPlan = { mon: { s_math: 60, orphan: 45 } };
  await saveStudyGoals({ db: {}, familyId: 'family', studyGoals: DEFAULT_STUDY_GOALS });
  expect(mock.profile.studyGoals.weeklyPlan.mon).toEqual({ s_math: 60, orphan: 45 });
  const before = structuredClone(mock.profile); mock.fail = true;
  await expect(saveStudyGoals({ db: {}, familyId: 'family', studyGoals: { ...DEFAULT_STUDY_GOALS, weeklyPlan: {} } })).rejects.toThrow('offline');
  expect(mock.profile).toEqual(before);
});
