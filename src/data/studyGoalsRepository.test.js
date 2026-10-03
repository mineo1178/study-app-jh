import { beforeEach, expect, it, vi } from 'vitest';
import { normalizePlayerProfile } from '../rpg/playerProfile.js';
import { normalizeStudyGoals, DEFAULT_STUDY_GOALS } from '../personalStudyGoals.js';
const mock = vi.hoisted(() => ({ profile: {}, fail: false, writes: 0 }));
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...path) => path.join('/'),
  runTransaction: vi.fn(),
  setDoc: vi.fn(async (_ref, value, options) => {
    if (mock.fail) throw new Error('offline');
    expect(options.mergeFields).toEqual(['studyGoals.dailyTargetMinutes', 'studyGoals.weeklyStudyDays']);
    mock.writes++;
    mock.profile = { ...mock.profile, studyGoals: { ...mock.profile.studyGoals, ...value.studyGoals } };
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
