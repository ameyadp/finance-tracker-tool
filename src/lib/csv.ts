import Papa from 'papaparse';
import { type DateFormat, guessDateFormat, parseDate } from './dates';
import { parseAmount } from './money';

export interface ParsedCsv {
	headers: string[];
	rows: Record<string, string>[];
}

export function parseCsv(text: string): ParsedCsv {
	const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
		header: true,
		skipEmptyLines: 'greedy',
		transformHeader: (h) => h.trim(),
	});
	const headers = (result.meta.fields ?? []).filter((h) => h !== '');
	return { headers, rows: result.data };
}

export interface ColumnMapping {
	date: string;
	description: string;
	/** "single": one signed amount column. "split": separate money-out and money-in columns. */
	amountMode: 'single' | 'split';
	amount: string;
	debit: string;
	credit: string;
	/** Flip the sign of a single amount column (for banks that list purchases as positive). */
	invert: boolean;
	dateFormat: DateFormat;
}

function findHeader(headers: string[], patterns: RegExp[]): string {
	for (const pattern of patterns) {
		const match = headers.find((h) => pattern.test(h));
		if (match) return match;
	}
	return '';
}

/** Best-effort guess of which columns hold the date, description and amount. */
export function guessMapping(csv: ParsedCsv): ColumnMapping {
	const { headers, rows } = csv;
	const date = findHeader(headers, [/^(transaction|trans\.?|posted|posting)?\s*date$/i, /date/i]);
	const description = findHeader(headers, [/desc/i, /payee|merchant/i, /^name$/i, /memo|details|narrative/i]);
	const amount = findHeader(headers, [/^amount$/i, /amount/i]);
	const debit = findHeader(headers, [/debit|withdrawal|money out|paid out/i]);
	const credit = findHeader(headers, [/credit|deposit|money in|paid in/i]);
	const amountMode = !amount && debit && credit ? 'split' : 'single';

	return {
		date,
		description,
		amountMode,
		amount,
		debit,
		credit,
		invert: false,
		dateFormat: guessDateFormat(rows.slice(0, 50).map((r) => r[date] ?? '')),
	};
}

export interface DraftTransaction {
	date: string;
	description: string;
	amountCents: number;
	importHash: string;
}

export interface RowError {
	/** 1-based row number as shown in a spreadsheet, counting the header row. */
	row: number;
	reason: string;
}

export function normalizeDescription(description: string): string {
	return description
		.toLowerCase()
		.replace(/[#*]?\d[\d\-/:.]*/g, ' ')
		.replace(/[^a-z&' ]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function rowAmount(row: Record<string, string>, m: ColumnMapping): number | null {
	if (m.amountMode === 'single') {
		const cents = parseAmount(row[m.amount] ?? '');
		return cents === null ? null : m.invert ? -cents : cents;
	}
	const outText = (row[m.debit] ?? '').trim();
	const inText = (row[m.credit] ?? '').trim();
	if (!outText && !inText) return null;
	const out = outText ? parseAmount(outText) : 0;
	const inn = inText ? parseAmount(inText) : 0;
	if (out === null || inn === null) return null;
	return Math.abs(inn) - Math.abs(out);
}

/** Turn CSV rows into transactions, reporting rows that can't be read. */
export function rowsToTransactions(
	rows: Record<string, string>[],
	mapping: ColumnMapping,
): { drafts: DraftTransaction[]; errors: RowError[] } {
	const drafts: DraftTransaction[] = [];
	const errors: RowError[] = [];
	// Identical rows (same date, amount and description) are legitimate — two coffees
	// in one day — so each repeat gets its own occurrence number in the hash.
	const seen = new Map<string, number>();

	rows.forEach((row, index) => {
		const rowNumber = index + 2;
		const date = parseDate(row[mapping.date] ?? '', mapping.dateFormat);
		if (!date) {
			errors.push({ row: rowNumber, reason: `Unreadable date "${row[mapping.date] ?? ''}"` });
			return;
		}
		const amountCents = rowAmount(row, mapping);
		if (amountCents === null) {
			errors.push({ row: rowNumber, reason: 'Unreadable amount' });
			return;
		}
		const description = (row[mapping.description] ?? '').trim() || '(no description)';
		const key = `${date}|${amountCents}|${normalizeDescription(description)}`;
		const occurrence = (seen.get(key) ?? 0) + 1;
		seen.set(key, occurrence);
		drafts.push({ date, description, amountCents, importHash: `${key}|${occurrence}` });
	});

	return { drafts, errors };
}
