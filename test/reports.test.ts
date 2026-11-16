import { describe, expect, it } from 'vitest';
import type { Account, Category, Snapshot, Transaction } from '../src/lib/db';
import { monthSummary, netWorthSeries } from '../src/lib/reports';

const categories: Category[] = [
	{ id: 1, name: 'Salary', kind: 'income' },
	{ id: 2, name: 'Groceries', kind: 'expense' },
	{ id: 3, name: 'Dining', kind: 'expense' },
	{ id: 4, name: 'Transfer', kind: 'transfer' },
];

let nextId = 1;
const txn = (date: string, amountCents: number, categoryId: number | null): Transaction => ({
	id: nextId++,
	date,
	description: 'x',
	amountCents,
	categoryId,
});

describe('monthSummary', () => {
	const transactions = [
		txn('2026-01-01', 500000, 1),
		txn('2026-01-03', -12000, 2),
		txn('2026-01-09', -3000, 2),
		txn('2026-01-10', -4500, 3),
		txn('2026-01-11', -999, null),
		txn('2026-01-20', -100000, 4), // credit card payment: not spending
		txn('2026-02-01', -7000, 2), // different month
	];

	it('totals income and spending for the month, ignoring transfers', () => {
		const s = monthSummary(transactions, categories, '2026-01');
		expect(s.incomeCents).toBe(500000);
		expect(s.spendingCents).toBe(12000 + 3000 + 4500 + 999);
		expect(s.netCents).toBe(500000 - 20499);
	});

	it('breaks spending down by category, largest first', () => {
		const s = monthSummary(transactions, categories, '2026-01');
		expect(s.spendingByCategory).toEqual([
			{ categoryId: 2, name: 'Groceries', cents: 15000 },
			{ categoryId: 3, name: 'Dining', cents: 4500 },
			{ categoryId: null, name: 'Uncategorized', cents: 999 },
		]);
	});
});

describe('netWorthSeries', () => {
	const accounts: Account[] = [
		{ id: 1, name: 'Checking', kind: 'asset' },
		{ id: 2, name: 'Card', kind: 'liability' },
	];
	const snapshots: Snapshot[] = [
		{ id: 1, accountId: 1, date: '2026-01-15', balanceCents: 100000 },
		{ id: 2, accountId: 2, date: '2026-01-20', balanceCents: 30000 },
		{ id: 3, accountId: 1, date: '2026-03-02', balanceCents: 150000 },
		{ id: 4, accountId: 1, date: '2026-03-02', balanceCents: 160000 }, // later entry, same day wins
	];

	it('carries the latest balance forward and subtracts liabilities', () => {
		expect(netWorthSeries(accounts, snapshots, ['2025-12', '2026-01', '2026-02', '2026-03'])).toEqual([
			{ month: '2025-12', assetsCents: 0, liabilitiesCents: 0, netCents: 0 },
			{ month: '2026-01', assetsCents: 100000, liabilitiesCents: 30000, netCents: 70000 },
			{ month: '2026-02', assetsCents: 100000, liabilitiesCents: 30000, netCents: 70000 },
			{ month: '2026-03', assetsCents: 160000, liabilitiesCents: 30000, netCents: 130000 },
		]);
	});
});
