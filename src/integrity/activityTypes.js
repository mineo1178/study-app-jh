export const ACTIVITY_TYPES = [
  { id: 'problem_solving', label: '問題演習' },
  { id: 'reading', label: '読書' },
  { id: 'memorization', label: '暗記' },
  { id: 'lesson', label: '授業・講義' },
  { id: 'language_app', label: '語学アプリ' },
  { id: 'programming', label: 'プログラミング' },
  { id: 'other', label: 'その他' },
];

export const DEFAULT_ACTIVITY_TYPE = 'other';

const NON_READING_MANGA_TITLE_PATTERN = /(プログラミング|programming|chatgpt|コーディング)/i;

export function normalizeActivityType(value) {
  return ACTIVITY_TYPES.some((type) => type.id === value) ? value : DEFAULT_ACTIVITY_TYPE;
}

// Legacy tasks are classified only when the subject itself makes the meaning unambiguous.
// e_manga predates activityType and contains a small number of non-reading tasks.
export function needsLegacyActivityTypeReview(subjectId, title = '') {
  return subjectId === 'e_manga' && NON_READING_MANGA_TITLE_PATTERN.test(String(title));
}

export function inferLegacyActivityType(subjectId, title = '') {
  const mapping = {
    e_news: 'reading',
    e_duolingo: 'language_app',
    e_programming: 'programming',
  };
  if (subjectId === 'e_manga') {
    return needsLegacyActivityTypeReview(subjectId, title) ? DEFAULT_ACTIVITY_TYPE : 'reading';
  }
  return mapping[subjectId] || DEFAULT_ACTIVITY_TYPE;
}
