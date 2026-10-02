const TEST_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEVIATION_INPUT_PATTERN = /^\d+(?:\.\d)?$/;

const isPlainRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const formatDateParts = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export const isValidTestDate = (value) => {
    if (typeof value !== 'string')
        return false;
    const match = TEST_DATE_PATTERN.exec(value);
    if (!match)
        return false;
    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() === month - 1
        && parsed.getUTCDate() === day;
};

export const getCalendarMonthsAgoDateString = (date, months) => {
    if (!isValidTestDate(date) || !Number.isInteger(months) || months < 0)
        return null;
    const [year, month, day] = date.split('-').map(Number);
    const targetMonthIndex = (year * 12) + (month - 1) - months;
    const targetYear = Math.floor(targetMonthIndex / 12);
    const targetMonthIndexInYear = ((targetMonthIndex % 12) + 12) % 12;
    const targetMonth = targetMonthIndexInYear + 1;
    const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
    return formatDateParts(targetYear, targetMonth, Math.min(day, lastDay));
};

const normalizeStoredDeviation = (value) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export const normalizeTestRecord = (id, value) => {
    const source = isPlainRecord(value) ? value : {};
    const scores = isPlainRecord(source.scores)
        ? Object.fromEntries(Object.entries(source.scores).filter(([, score]) => normalizeStoredDeviation(score) !== undefined))
        : {};
    return {
        ...source,
        id: String(id ?? source.id ?? ''),
        date: isValidTestDate(source.date) ? source.date : null,
        average: normalizeStoredDeviation(source.average),
        scores,
        lastUpdatedAt: typeof source.lastUpdatedAt === 'number' && Number.isFinite(source.lastUpdatedAt)
            ? source.lastUpdatedAt
            : null
    };
};

export const validateDeviationInput = (rawValue) => {
    const text = rawValue == null ? '' : String(rawValue).trim();
    if (text === '')
        return { valid: true, empty: true, value: undefined };
    if (!DEVIATION_INPUT_PATTERN.test(text))
        return { valid: false, empty: false, value: undefined, error: '偏差値は小数第1位までの数値で入力してください。' };
    const value = Number(text);
    if (!Number.isFinite(value) || value <= 0 || value >= 100)
        return { valid: false, empty: false, value: undefined, error: '偏差値は0より大きく100未満で入力してください。' };
    return { valid: true, empty: false, value };
};

export const buildDeviationUpdate = ({ averageInput, scoreInputs = {}, subjectIds = [] }) => {
    const errors = {};
    const averageResult = validateDeviationInput(averageInput);
    if (!averageResult.valid)
        errors.average = averageResult.error;
    const scores = {};
    const clearedScoreIds = [];
    subjectIds.forEach((subjectId) => {
        const result = validateDeviationInput(scoreInputs[subjectId]);
        if (!result.valid)
            errors[subjectId] = result.error;
        else if (result.empty)
            clearedScoreIds.push(subjectId);
        else
            scores[subjectId] = result.value;
    });
    return {
        valid: Object.keys(errors).length === 0,
        errors,
        average: averageResult.value,
        clearAverage: averageResult.empty,
        scores,
        clearedScoreIds
    };
};

export const applyTestRecordUpdate = (existing, baseData, deviationUpdate) => {
    const current = isPlainRecord(existing) ? existing : {};
    const currentScores = isPlainRecord(current.scores) ? current.scores : {};
    const scores = { ...currentScores, ...deviationUpdate.scores };
    deviationUpdate.clearedScoreIds.forEach((subjectId) => delete scores[subjectId]);
    const next = { ...current, ...baseData, scores };
    if (deviationUpdate.clearAverage)
        delete next.average;
    else
        next.average = deviationUpdate.average;
    return next;
};

export const buildDeviationFieldPatch = (deviationUpdate, deletedValue) => {
    const patch = {
        average: deviationUpdate.clearAverage ? deletedValue : deviationUpdate.average
    };
    Object.entries(deviationUpdate.scores).forEach(([subjectId, value]) => {
        patch[`scores.${subjectId}`] = value;
    });
    deviationUpdate.clearedScoreIds.forEach((subjectId) => {
        patch[`scores.${subjectId}`] = deletedValue;
    });
    return patch;
};

const comparableUpdatedAt = (record) => typeof record?.lastUpdatedAt === 'number' && Number.isFinite(record.lastUpdatedAt)
    ? record.lastUpdatedAt
    : 0;

export const compareTestRecords = (left, right) => {
    const leftDate = isValidTestDate(left?.date) ? left.date : null;
    const rightDate = isValidTestDate(right?.date) ? right.date : null;
    if (leftDate !== rightDate) {
        if (leftDate === null)
            return 1;
        if (rightDate === null)
            return -1;
        return leftDate.localeCompare(rightDate);
    }
    const updatedDifference = comparableUpdatedAt(left) - comparableUpdatedAt(right);
    if (updatedDifference !== 0)
        return updatedDifference;
    return String(left?.id ?? '').localeCompare(String(right?.id ?? ''));
};

export const filterTestRecordsByDateRange = (records, startDate, endDate) => {
    if (!Array.isArray(records) || !isValidTestDate(startDate) || !isValidTestDate(endDate))
        return [];
    return records
        .filter((record) => isValidTestDate(record?.date) && record.date >= startDate && record.date <= endDate)
        .sort(compareTestRecords);
};

export const formatTestDateLabel = (date) => {
    if (!isValidTestDate(date))
        return '';
    const [, month, day] = date.split('-').map(Number);
    return `${month}/${day}`;
};

export const getDeviationDomain = (records, visibleSubjectIds) => {
    const values = [];
    const subjectIds = Array.isArray(visibleSubjectIds) ? visibleSubjectIds : [];
    records.forEach((record) => {
        subjectIds.forEach((subjectId) => {
            const value = subjectId === 'average' ? record?.average : record?.scores?.[subjectId];
            if (typeof value === 'number' && Number.isFinite(value))
                values.push(value);
        });
    });
    if (values.length === 0)
        return [20, 80];
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const lower = minimum < 20 ? Math.floor((minimum - 5) / 5) * 5 : 20;
    const upper = maximum > 80 ? Math.ceil((maximum + 5) / 5) * 5 : 80;
    return [lower, upper];
};
