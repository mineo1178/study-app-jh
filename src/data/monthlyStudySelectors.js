import { getValidStudySessions } from './studySessionSelectors.js';
import { timestampForStudyDate } from '../rpg/achievementSelectors.js';
import { goalSubjects, SUBJECT_DEFS } from '../subjectCatalog.js';
import { personalStudyTargets } from '../personalStudyGoals.js';

const DAY_MS = 86400000;
const JST_OFFSET = 9 * 3600000;
export const monthlyStudyDate = now => Number.isFinite(now) ? new Date(now + JST_OFFSET).toISOString().slice(0,10) : null;
const validMonth = month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month || '') && Number(month.slice(0,4)) > 0;

export function moveCalendarMonth(month, direction, currentMonth) {
  if (!validMonth(month) || !validMonth(currentMonth)) return currentMonth;
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  const next = date.toISOString().slice(0,7);
  return validMonth(next) ? next > currentMonth ? currentMonth : next : month;
}

export const calendarCellDuration = seconds => {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  return seconds > 0 && minutes === 0 ? '<1分' : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2,'0')}`;
};

const emptyDay = date => ({ date, seconds: 0, count: 0, subjects: new Map(), records: [] });
const sortedSubjects = (subjects, total) => [...subjects.values()].filter(subject => subject.seconds > 0)
  .map(subject => ({ ...subject, percent: total > 0 ? subject.seconds / total * 100 : 0 }))
  .sort((a,b) => b.seconds - a.seconds || a.order - b.order);

// Same session.date attribution and recordedSeconds as Dashboard/WeeklyReport.
// This index is independent of selected month, selected day and live timer ticks.
export function aggregateMonthlyStudy({ sessions = [], now, ready = false, subjectDefinitions = SUBJECT_DEFS } = {}) {
  if (!ready || !Number.isFinite(now)) return { status: 'loading', days: new Map() };
  const today = monthlyStudyDate(now);
  const catalog = goalSubjects(subjectDefinitions);
  const definitions = new Map(catalog.map((subject,order) => [subject.id,{ ...subject, order }]));
  const days = new Map(), seen = new Set();
  for (const session of getValidStudySessions(sessions)) {
    if (session.isLive || session.isStale) continue;
    const key = session.timerId || session.id;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const seconds = Number(session.recordedSeconds);
    if (timestampForStudyDate(session.date) === null || session.date > today || !Number.isFinite(seconds) || seconds < 0) continue;
    const day = days.get(session.date) || emptyDay(session.date);
    const definition = definitions.get(session.taskSnapshot?.subjectId);
    const id = definition?.id || 'other';
    const subject = day.subjects.get(id) || { id, name: definition?.name || 'その他', order: definition?.order ?? catalog.length, seconds: 0 };
    subject.seconds += seconds;
    day.subjects.set(id,subject);
    day.seconds += seconds; day.count++;
    const startedAt = session.segments?.[0]?.startedAt || session.startedAt;
    day.records.push({ id: `${day.count}`, title: session.taskSnapshot?.title || '学習', subject: subject.name, seconds, startedAt: Number.isFinite(startedAt) ? startedAt : null });
    days.set(day.date,day);
  }
  for (const day of days.values()) day.records.sort((a,b) => (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity));
  return { status: 'ready', today, currentMonth: today.slice(0,7), days };
}

export function deriveMonthlyStudyCalendar(index, selectedMonth, studyGoals) {
  if (index.status !== 'ready') return { status: 'loading', cells: [] };
  const month = validMonth(selectedMonth) && selectedMonth <= index.currentMonth ? selectedMonth : index.currentMonth;
  const start = Date.parse(`${month}-01T00:00:00Z`);
  const nextMonth = new Date(start);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const dayCount = Math.round((nextMonth.getTime() - start) / DAY_MS);
  const leading = (new Date(start).getUTCDay() + 6) % 7;
  const { dailyTargetSeconds } = personalStudyTargets(studyGoals);
  const subjects = new Map();
  let seconds = 0, studyDays = 0, achievedDays = 0;
  const days = Array.from({ length: dayCount },(_,offset) => {
    const date = new Date(start + offset * DAY_MS).toISOString().slice(0,10);
    const day = index.days.get(date) || emptyDay(date);
    const future = date > index.today;
    const achieved = !future && day.seconds >= dailyTargetSeconds;
    seconds += day.seconds;
    if (day.seconds > 0) studyDays++;
    if (achieved) achievedDays++;
    for (const subject of day.subjects.values()) {
      const total = subjects.get(subject.id) || { ...subject, seconds: 0 };
      total.seconds += subject.seconds; subjects.set(subject.id,total);
    }
    return { ...day, dayNumber: offset + 1, future, achieved, isToday: date === index.today, breakdown: sortedSubjects(day.subjects,day.seconds) };
  });
  const cells = [...Array(leading).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const breakdown = sortedSubjects(subjects,seconds);
  return { status: 'ready', month, label: `${Number(month.slice(0,4))}年${Number(month.slice(5))}月`, cells, days, seconds, studyDays, achievedDays, subjectCount: breakdown.filter(subject => subject.id !== 'other').length, subjects: breakdown, dailyTargetSeconds };
}
