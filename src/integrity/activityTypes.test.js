import { describe, expect, it } from 'vitest';
import { inferLegacyActivityType, needsLegacyActivityTypeReview } from './activityTypes';

describe('legacy activity type inference', () => {
  it.each([
    ['e_news', '新聞', 'reading'],
    ['e_manga', '歴史マンガ', 'reading'],
    ['e_duolingo', '英語', 'language_app'],
    ['e_programming', 'ChatGPT', 'programming'],
  ])('%s / %s を %s に分類する', (subjectId, title, expected) => {
    expect(inferLegacyActivityType(subjectId, title)).toBe(expected);
  });

  it.each(['プログラミング', 'programming exercise', 'ChatGPT', 'コーディング'])('e_mangaの危険タイトル「%s」はreadingにしない', (title) => {
    expect(inferLegacyActivityType('e_manga', title)).toBe('other');
    expect(needsLegacyActivityTypeReview('e_manga', title)).toBe(true);
  });
});
