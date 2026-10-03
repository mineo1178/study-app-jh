export const SUBJECT_DEFS = {
    school: [
        { id: 's_math', label: '数学', hex: '#3b82f6', isMajor: true },
        { id: 's_japanese', label: '国語', hex: '#f43f5e', isMajor: true },
        { id: 's_social', label: '社会', hex: '#10b981', isMajor: true },
        { id: 's_science', label: '理科', hex: '#f59e0b', isMajor: true },
        { id: 's_english', label: '英語', hex: '#8b5cf6', isMajor: true },
        { id: 's_pe', label: '体育', hex: '#fb923c', isMajor: false },
        { id: 's_tech', label: '技術', hex: '#64748b', isMajor: false },
        { id: 's_music', label: '音楽', hex: '#ec4899', isMajor: false },
        { id: 's_home', label: '家庭科', hex: '#06b6d4', isMajor: false }
    ],
    juku: [
        { id: 'j_math', label: '数学', hex: '#2563eb' },
        { id: 'j_japanese', label: '国語', hex: '#e11d48' },
        { id: 'j_science', label: '理科', hex: '#d97706' },
        { id: 'j_social', label: '社会', hex: '#059669' },
        { id: 'j_english', label: '英語', hex: '#7c3aed' }
    ],
    etc: [
        { id: 'e_news', label: '新聞', hex: '#475569' },
        { id: 'e_manga', label: '歴史マンガ', hex: '#ea580c' },
        { id: 'e_duolingo', label: 'Duolingo', hex: '#84cc16' },
        { id: 'e_programming', label: 'プログラミング', hex: '#0ea5e9' }
    ]
};

export const SUBJECT_GROUP_LABELS = { school: '中学校', juku: '塾', etc: 'その他' };

export function goalSubjects(definitions = SUBJECT_DEFS) {
  return Object.entries(definitions).flatMap(([groupId, subjects]) => subjects
    .filter(subject => subject.id && subject.id !== 'unknown' && !subject.deprecated)
    .map(subject => ({ ...subject, groupId, name: SUBJECT_GROUP_LABELS[groupId] ? `${SUBJECT_GROUP_LABELS[groupId]}・${subject.label}` : subject.label })));
}
