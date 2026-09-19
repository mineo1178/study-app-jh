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

export function normalizeActivityType(value) {
  return ACTIVITY_TYPES.some((type) => type.id === value) ? value : DEFAULT_ACTIVITY_TYPE;
}

// Legacy tasks are classified only when the subject itself makes the meaning unambiguous.
export function inferLegacyActivityType(subjectId) {
  const mapping = {
    e_news: 'reading',
    e_manga: 'reading',
    e_duolingo: 'language_app',
    e_programming: 'programming',
  };
  return mapping[subjectId] || DEFAULT_ACTIVITY_TYPE;
}
