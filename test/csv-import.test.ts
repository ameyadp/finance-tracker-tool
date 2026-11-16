import { beforeEach, describe, expect, it } from 'vitest';
import { guessMapping, normalizeDescription, parseCsv, rowsToTransactions } from '../src/lib/csv';
import { commitImport, planImport } from '../src/lib/importer';
import { FinanceDB } from '../src/lib/db';

const chaseStyle = `﻿Transaction Date,Post Date,Description,Category,Type,Amount
01/03/2026,01/04/2026,STARBUCKS #1234,Food,Sale,-5.75
01/03/2026,01/04/2026,STARBUCKS #1234,Food,Sale,-5.75
01/05/2026,01/05/2026,PAYROLL ACME INC,,Credit,"2,500.00"
02/30/2026,02/30/2026,BAD DATE,,Sale,-1.00
01/07/2026,01/07/2026,NO AMOUNT,,Sale,
`;

const splitStyle = `Date,Details,Money Out,Money In
2026-01-03,Rent,1200.00,
2026-01-04,Refund,,15.50
`;

describe('CSV parsing and mapping', () => {
	it('guesses columns for a single signed amount column', () => {
		const csv = parseCsv(chaseStyle);
		const m = guessMapping(csv);
		expect(m).toMatchObject({
			date: 'Transaction Date',
			description: 'Description',
			amountMode: 'single',
			amount: 'Amount',
			dateFormat: 'MDY',
		});
	});

	it('guesses split money-out / money-in columns', () => {
		const m = guessMapping(parseCsv(splitStyle));
		expect(m).toMatchObject({ amountMode: 'split', debit: 'Money Out', credit: 'Money In', dateFormat: 'YMD' });
	});

	it('converts rows, reports bad rows, and keeps identical rows distinct', () => {
		const csv = parseCsv(chaseStyle);
		const { drafts, errors } = rowsToTransactions(csv.rows, guessMapping(csv));

		expect(drafts.map((d) => [d.date, d.amountCents])).toEqual([
			['2026-01-03', -575],
			['2026-01-03', -575],
			['2026-01-05', 250000],
		]);
		expect(new Set(drafts.map((d) => d.importHash)).size).toBe(3);
		expect(errors).toEqual([
			{ row: 5, reason: 'Unreadable date "02/30/2026"' },
			{ row: 6, reason: 'Unreadable amount' },
		]);
	});

	it('handles split columns and inverted signs', () => {
		const split = parseCsv(splitStyle);
		expect(rowsToTransactions(split.rows, guessMapping(split)).drafts.map((d) => d.amountCents)).toEqual([
			-120000, 1550,
		]);

		const csv = parseCsv('Date,Description,Amount\n2026-01-01,Coffee,4.00\n');
		const m = { ...guessMapping(csv), invert: true };
		expect(rowsToTransactions(csv.rows, m).drafts[0]?.amountCents).toBe(-400);
	});

	it('normalizes descriptions so store numbers and dates do not matter', () => {
		expect(normalizeDescription('STARBUCKS #1234 01/03')).toBe('starbucks');
		expect(normalizeDescription('Trader Joe\'s 552')).toBe("trader joe's");
	});
});

describe('importing into the database', () => {
	let db: FinanceDB;

	beforeEach(async () => {
		db = new FinanceDB(`test-${crypto.randomUUID()}`);
		await db.open();
	});

	it('skips rows already imported when the same file is imported again', async () => {
		const csv = parseCsv(chaseStyle);
		const { drafts } = rowsToTransactions(csv.rows, guessMapping(csv));

		const first = await planImport(drafts, db);
		expect(first.toAdd).toHaveLength(3);
		expect(first.duplicates).toBe(0);
		await commitImport(first, db);

		const second = await planImport(drafts, db);
		expect(second.toAdd).toHaveLength(0);
		expect(second.duplicates).toBe(3);
		expect(await db.transactions.count()).toBe(3);
	});

	it('pre-fills categories learned from earlier transactions', async () => {
		const dining = await db.categories.where('name').equals('Dining').first();
		await db.transactions.add({
			date: '2025-12-01',
			description: 'STARBUCKS #9999',
			amountCents: -400,
			categoryId: dining!.id,
		} as never);

		const csv = parseCsv(chaseStyle);
		const plan = await planImport(rowsToTransactions(csv.rows, guessMapping(csv)).drafts, db);
		expect(plan.toAdd.filter((t) => t.categoryId === dining!.id)).toHaveLength(2);
		expect(plan.toAdd.find((t) => t.description.startsWith('PAYROLL'))?.categoryId).toBeNull();
	});
});
