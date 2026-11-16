import { describe, expect, it } from 'vitest';
import { centsToInput, parseAmount } from '../src/lib/money';
import { addMonths, endOfMonth, guessDateFormat, monthRange, parseDate } from '../src/lib/dates';

describe('parseAmount', () => {
	it.each([
		['12.34', 1234],
		['1,234.56', 123456],
		['$1,234.56', 123456],
		['-12.30', -1230],
		['(12.30)', -1230],
		['12.30-', -1230],
		['-$5', -500],
		['$-5', -500],
		['+5', 500],
		['USD 5.5', 550],
		['.75', 75],
		['0.1', 10],
		['1.005', 101],
		['1.004', 100],
		['0', 0],
		['-0.00', 0],
	])('parses %s', (input, cents) => {
		expect(parseAmount(input)).toBe(cents);
	});

	it.each(['', 'abc', '1.2.3', '12,34', '1,23,456', '.', '--5', '$'])('rejects %s', (input) => {
		expect(parseAmount(input)).toBeNull();
	});

	it('round-trips through the input format', () => {
		expect(parseAmount(centsToInput(123456))).toBe(123456);
		expect(parseAmount(centsToInput(-5))).toBe(-5);
	});
});

describe('parseDate', () => {
	it('reads each date order', () => {
		expect(parseDate('2026-01-31', 'YMD')).toBe('2026-01-31');
		expect(parseDate('2026/1/5', 'YMD')).toBe('2026-01-05');
		expect(parseDate('01/31/2026', 'MDY')).toBe('2026-01-31');
		expect(parseDate('31.01.2026', 'DMY')).toBe('2026-01-31');
		expect(parseDate('1/5/26', 'MDY')).toBe('2026-01-05');
		expect(parseDate('2026-01-31T10:00:00Z', 'YMD')).toBe('2026-01-31');
		expect(parseDate(' 2026-01-31 08:15 ', 'YMD')).toBe('2026-01-31');
	});

	it('rejects impossible or malformed dates', () => {
		expect(parseDate('02/30/2026', 'MDY')).toBeNull();
		expect(parseDate('13/01/2026', 'MDY')).toBeNull();
		expect(parseDate('2026-01', 'YMD')).toBeNull();
		expect(parseDate('Jan 5 2026', 'MDY')).toBeNull();
		expect(parseDate('1/5/202', 'MDY')).toBeNull();
	});

	it('guesses the date order from sample values', () => {
		expect(guessDateFormat(['2026-01-05', '2026-02-10'])).toBe('YMD');
		expect(guessDateFormat(['01/05/2026', '01/25/2026'])).toBe('MDY');
		expect(guessDateFormat(['05/01/2026', '25/01/2026'])).toBe('DMY');
		expect(guessDateFormat(['01/02/2026'])).toBe('MDY');
	});
});

describe('month helpers', () => {
	it('shifts and ranges months across years', () => {
		expect(addMonths('2026-11', 2)).toBe('2027-01');
		expect(addMonths('2026-01', -1)).toBe('2025-12');
		expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
	});

	it('finds the last day of a month, including leap years', () => {
		expect(endOfMonth('2028-02')).toBe('2028-02-29');
		expect(endOfMonth('2026-02')).toBe('2026-02-28');
		expect(endOfMonth('2026-12')).toBe('2026-12-31');
	});
});
