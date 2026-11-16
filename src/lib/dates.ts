// Dates are stored as "YYYY-MM-DD" strings and months as "YYYY-MM".
// Plain strings sort correctly and avoid time-zone surprises.

export type DateFormat = 'YMD' | 'MDY' | 'DMY';

const pad = (n: number) => String(n).padStart(2, '0');

/** Build "YYYY-MM-DD", or null if the date doesn't exist (e.g. Feb 30). */
export function toISODate(year: number, month: number, day: number): string | null {
	if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
	const d = new Date(Date.UTC(year, month - 1, day));
	if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
	return `${year}-${pad(month)}-${pad(day)}`;
}

/** Parse a bank date like "2026-01-31", "01/31/2026", "31.01.26" in the given order. */
export function parseDate(input: string, format: DateFormat): string | null {
	const s = input.trim().split(/[T\s]/)[0] ?? '';
	const parts = s.split(/[/.-]/);
	if (parts.length !== 3 || parts.some((p) => !/^\d{1,4}$/.test(p))) return null;

	const nums = parts.map(Number) as [number, number, number];
	const yearIndex = format === 'YMD' ? 0 : 2;
	let [y, m, d] =
		format === 'YMD' ? nums : format === 'MDY' ? [nums[2], nums[0], nums[1]] : [nums[2], nums[1], nums[0]];

	const yearText = parts[yearIndex] ?? '';
	if (yearText.length === 2) y = y < 70 ? 2000 + y : 1900 + y;
	else if (yearText.length !== 4) return null;

	return toISODate(y, m, d);
}

/** Guess the date order from sample values in a CSV column. */
export function guessDateFormat(samples: string[]): DateFormat {
	const values = samples.map((s) => s.trim()).filter(Boolean);
	if (values.length > 0 && values.every((v) => /^\d{4}[/.-]/.test(v))) return 'YMD';
	for (const v of values) {
		const [a, b] = v.split(/[/.-]/).map(Number);
		if (a !== undefined && a > 12) return 'DMY';
		if (b !== undefined && b > 12) return 'MDY';
	}
	return 'MDY';
}

/** Today's date on this device, as "YYYY-MM-DD". */
export function todayISO(now = new Date()): string {
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const monthOf = (isoDate: string) => isoDate.slice(0, 7);

/** Shift a "YYYY-MM" month by n months. */
export function addMonths(month: string, n: number): string {
	const [y, m] = month.split('-').map(Number) as [number, number];
	const total = y * 12 + (m - 1) + n;
	return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Inclusive list of months from start to end. */
export function monthRange(start: string, end: string): string[] {
	const months: string[] = [];
	for (let m = start; m <= end; m = addMonths(m, 1)) months.push(m);
	return months;
}

/** Last day of a "YYYY-MM" month, as "YYYY-MM-DD". */
export function endOfMonth(month: string): string {
	const [y, m] = month.split('-').map(Number) as [number, number];
	return `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

export function formatMonth(month: string, style: 'long' | 'short' = 'long'): string {
	const [y, m] = month.split('-').map(Number) as [number, number];
	return new Intl.DateTimeFormat(undefined, {
		month: style,
		year: style === 'long' ? 'numeric' : '2-digit',
		timeZone: 'UTC',
	}).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function formatDate(isoDate: string): string {
	const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
	return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
		new Date(Date.UTC(y, m - 1, d)),
	);
}
