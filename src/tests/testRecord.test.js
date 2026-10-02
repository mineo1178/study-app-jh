import { describe, expect, it } from 'vitest';
import {
    applyTestRecordUpdate,
    buildDeviationFieldPatch,
    buildDeviationUpdate,
    compareTestRecords,
    filterTestRecordsByDateRange,
    getCalendarMonthsAgoDateString,
    getDeviationDomain,
    normalizeTestRecord,
    validateDeviationInput
} from './testRecord';

describe('test record normalization', () => {
    it('normalizes missing and malformed optional fields without dropping unknown fields', () => {
        expect(normalizeTestRecord('missing', { extra: 'keep' })).toMatchObject({
            id: 'missing', date: null, average: undefined, scores: {}, lastUpdatedAt: null, extra: 'keep'
        });
        expect(normalizeTestRecord('malformed', { date: '2026-02-30', average: null, scores: 'invalid' })).toMatchObject({
            id: 'malformed', date: null, average: undefined, scores: {}
        });
    });

    it('keeps valid unknown subject values in the derived scores map', () => {
        expect(normalizeTestRecord('legacy', {
            date: '2026-09-28', scores: { s_math: 55, legacy_subject: 62.5, broken: '60' }
        }).scores).toEqual({ s_math: 55, legacy_subject: 62.5 });
    });
});

describe('deviation validation', () => {
    it.each([
        ['50', 50],
        ['50.5', 50.5],
        ['', undefined]
    ])('accepts %s', (input, expected) => {
        const result = validateDeviationInput(input);
        expect(result.valid).toBe(true);
        expect(result.value).toBe(expected);
    });

    it.each(['0', '-1', '100', '100.1', 'NaN', 'Infinity', 'abc', '50.25'])('rejects %s', (input) => {
        expect(validateDeviationInput(input).valid).toBe(false);
    });
});

describe('test record editing', () => {
    it('builds a new record update with optional values', () => {
        const update = buildDeviationUpdate({
            averageInput: '61.5', scoreInputs: { s_math: '60', s_english: '' }, subjectIds: ['s_math', 's_english']
        });
        expect(update).toMatchObject({
            valid: true, average: 61.5, clearAverage: false, scores: { s_math: 60 }, clearedScoreIds: ['s_english']
        });
    });

    it('clears edited values while preserving unknown fields and values outside the selected category', () => {
        const existing = {
            id: 'test-1', average: 58.5, unknownTopLevel: true,
            scores: { s_math: 58.5, j_math: 63, legacy_subject: 70 }
        };
        const update = buildDeviationUpdate({
            averageInput: '', scoreInputs: { s_math: '' }, subjectIds: ['s_math']
        });
        const next = applyTestRecordUpdate(existing, { name: 'edited' }, update);
        expect(next.average).toBeUndefined();
        expect(next.scores).toEqual({ j_math: 63, legacy_subject: 70 });
        expect(next.unknownTopLevel).toBe(true);
        expect(next.name).toBe('edited');
    });

    it('creates delete patches only for the edited average and selected subject fields', () => {
        const deletedValue = Symbol('deleted');
        const update = buildDeviationUpdate({
            averageInput: '',
            scoreInputs: { s_math: '', s_english: '62.5' },
            subjectIds: ['s_math', 's_english']
        });
        expect(buildDeviationFieldPatch(update, deletedValue)).toEqual({
            average: deletedValue,
            'scores.s_math': deletedValue,
            'scores.s_english': 62.5
        });
    });
});

describe('calendar period and stable sorting', () => {
    it('calculates six calendar months ago and clamps month ends', () => {
        expect(getCalendarMonthsAgoDateString('2026-09-28', 6)).toBe('2026-03-28');
        expect(getCalendarMonthsAgoDateString('2024-08-31', 6)).toBe('2024-02-29');
        expect(getCalendarMonthsAgoDateString('2025-08-31', 6)).toBe('2025-02-28');
    });

    it('includes both boundaries and excludes invalid, earlier, and future records', () => {
        const records = [
            { id: 'before', date: '2026-03-27' },
            { id: 'start', date: '2026-03-28' },
            { id: 'end', date: '2026-09-28' },
            { id: 'future', date: '2026-09-29' },
            { id: 'missing', date: null }
        ];
        expect(filterTestRecordsByDateRange(records, '2026-03-28', '2026-09-28').map(({ id }) => id)).toEqual(['start', 'end']);
    });

    it('sorts by date, lastUpdatedAt, then document ID without combining same-day records', () => {
        const records = [
            { id: 'b', date: '2026-06-01', lastUpdatedAt: 20 },
            { id: 'c', date: '2026-05-01', lastUpdatedAt: 30 },
            { id: 'c', date: '2026-06-01', lastUpdatedAt: 10 },
            { id: 'a', date: '2026-06-01', lastUpdatedAt: 20 }
        ];
        expect([...records].sort(compareTestRecords).map(({ id }) => id)).toEqual(['c', 'c', 'a', 'b']);
    });
});

describe('graph data helpers', () => {
    it('supports zero, one, and multiple records with missing scores', () => {
        expect(filterTestRecordsByDateRange([], '2026-01-01', '2026-09-28')).toEqual([]);
        expect(filterTestRecordsByDateRange([{ id: 'one', date: '2026-06-01' }], '2026-01-01', '2026-09-28')).toHaveLength(1);
        expect(filterTestRecordsByDateRange([
            { id: 'one', date: '2026-06-01', scores: {} },
            { id: 'two', date: '2026-06-01' }
        ], '2026-01-01', '2026-09-28')).toHaveLength(2);
    });

    it('uses a stable default domain and expands it with padding for outliers', () => {
        expect(getDeviationDomain([], ['average'])).toEqual([20, 80]);
        expect(getDeviationDomain([{ average: 55 }], ['average'])).toEqual([20, 80]);
        expect(getDeviationDomain([{ average: 10 }, { average: 90 }], ['average'])).toEqual([5, 95]);
    });
});
