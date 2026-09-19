const SENSITIVE_KEY = /(?:password|token|secret|credential|auth)/i;

export function toMigrationTimestamp(value) {
  if (value === undefined || value === null) return null;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString();
  }
  return null;
}

function safeValue(value) {
  if (value === undefined) return null;
  if (value instanceof Date || typeof value?.toDate === 'function') return toMigrationTimestamp(value);
  if (Array.isArray(value)) return value.map(safeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, nested]) => [key, safeValue(nested)]));
  }
  return value;
}

function exportHistory(history = {}) {
  return {
    id: history.id || null,
    date: history.date || null,
    duration: Number(history.duration) || 0,
    memo: history.memo || '',
    startedAt: toMigrationTimestamp(history.startedAt),
    endedAt: toMigrationTimestamp(history.endedAt),
  };
}

function exportTask(task = {}) {
  return {
    id: task.id,
    categoryId: task.categoryId || null,
    subjectId: task.subjectId || null,
    activityType: task.activityType || null,
    type: task.type || null,
    title: task.title || '',
    history: (task.history || []).map(exportHistory),
    createdAt: toMigrationTimestamp(task.createdAt),
    lastUpdatedAt: toMigrationTimestamp(task.lastUpdatedAt),
    archivedAt: toMigrationTimestamp(task.archivedAt),
  };
}

function exportStudySession(session = {}) {
  return {
    id: session.id,
    timerId: session.timerId || null,
    taskId: session.taskId || null,
    taskSnapshot: safeValue(session.taskSnapshot || {}),
    date: session.date || null,
    segments: (session.segments || []).map((segment) => ({
      startedAt: toMigrationTimestamp(segment.startedAt),
      endedAt: toMigrationTimestamp(segment.endedAt),
      durationSeconds: Number(segment.durationSeconds) || 0,
    })),
    recordedSeconds: Number(session.recordedSeconds) || 0,
    validation: safeValue(session.validation || null),
    legacySource: safeValue(session.legacySource || null),
    memo: session.memo || '',
    createdAt: toMigrationTimestamp(session.createdAt),
    updatedAt: toMigrationTimestamp(session.updatedAt),
  };
}

export function createMigrationExport({ tasks = [], studySessions = [], activeTimers = [] } = {}, now = new Date()) {
  return {
    schemaVersion: 1,
    exportedAt: toMigrationTimestamp(now),
    source: 'study-app-jh-v1.67',
    tasks: tasks.map(exportTask),
    studySessions: studySessions.map(exportStudySession),
    activeTimers: activeTimers.map(safeValue),
  };
}

export function migrationExportFilename(now = new Date()) {
  const stamp = [now.getFullYear(), `${now.getMonth() + 1}`.padStart(2, '0'), `${now.getDate()}`.padStart(2, '0')].join('')
    + '-' + [`${now.getHours()}`.padStart(2, '0'), `${now.getMinutes()}`.padStart(2, '0'), `${now.getSeconds()}`.padStart(2, '0')].join('');
  return `study-app-jh-migration-export-${stamp}.json`;
}

export function downloadMigrationExport(payload, filename) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
