import type { Account, Category, Snapshot, Transaction } from './db';
import { endOfMonth, monthOf } from './dates';

export interface CategoryTotal {
	categoryId: number | null;
	name: string;
	cents: number;
}

export interface MonthSummary {
	incomeCents: number;
	/** Positive number: total money spent. */
	spendingCents: number;
	netCents: number;
	/** Spending per category, largest first. */
	spendingByCategory: CategoryTotal[];
}

function transferIds(categories: Category[]): Set<number> {
	return new Set(categories.filter((c) => c.kind === 'transfer').map((c) => c.id));
}

/** Income, spending and per-category spending for one "YYYY-MM" month. Transfers are ignored. */
export function monthSummary(transactions: Transaction[], categories: Category[], month: string): MonthSummary {
	const transfers = transferIds(categories);
	const names = new Map(categories.map((c) => [c.id, c.name]));
	const byCategory = new Map<number | null, number>();
	let incomeCents = 0;
	let spendingCents = 0;

	for (const t of transactions) {
		if (monthOf(t.date) !== month) continue;
		if (t.categoryId !== null && transfers.has(t.categoryId)) continue;
		if (t.amountCents >= 0) {
			incomeCents += t.amountCents;
		} else {
			spendingCents -= t.amountCents;
			byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) - t.amountCents);
		}
	}

	const spendingByCategory = [...byCategory.entries()]
		.map(([categoryId, cents]) => ({
			categoryId,
			name: categoryId === null ? 'Uncategorized' : (names.get(categoryId) ?? 'Uncategorized'),
			cents,
		}))
		.sort((a, b) => b.cents - a.cents);

	return { incomeCents, spendingCents, netCents: incomeCents - spendingCents, spendingByCategory };
}

export interface MonthTotals {
	month: string;
	incomeCents: number;
	spendingCents: number;
}

/** Income and spending for each of the given months. */
export function monthlyTotals(transactions: Transaction[], categories: Category[], months: string[]): MonthTotals[] {
	return months.map((month) => {
		const s = monthSummary(transactions, categories, month);
		return { month, incomeCents: s.incomeCents, spendingCents: s.spendingCents };
	});
}

/** Most recent snapshot per account on or before a date (all time if no date). */
export function balancesAsOf(snapshots: Snapshot[], asOf?: string): Map<number, Snapshot> {
	const latest = new Map<number, Snapshot>();
	for (const s of snapshots) {
		if (asOf && s.date > asOf) continue;
		const current = latest.get(s.accountId);
		if (!current || s.date > current.date || (s.date === current.date && s.id > current.id)) {
			latest.set(s.accountId, s);
		}
	}
	return latest;
}

export interface NetWorthPoint {
	month: string;
	assetsCents: number;
	liabilitiesCents: number;
	netCents: number;
}

export function netWorthAt(accounts: Account[], snapshots: Snapshot[], asOf?: string): NetWorthPoint {
	const latest = balancesAsOf(snapshots, asOf);
	let assetsCents = 0;
	let liabilitiesCents = 0;
	for (const account of accounts) {
		const snap = latest.get(account.id);
		if (!snap) continue;
		if (account.kind === 'asset') assetsCents += snap.balanceCents;
		else liabilitiesCents += snap.balanceCents;
	}
	return { month: asOf ? monthOf(asOf) : '', assetsCents, liabilitiesCents, netCents: assetsCents - liabilitiesCents };
}

/** Net worth at the end of each month, using each account's latest balance up to that point. */
export function netWorthSeries(accounts: Account[], snapshots: Snapshot[], months: string[]): NetWorthPoint[] {
	return months.map((month) => ({ ...netWorthAt(accounts, snapshots, endOfMonth(month)), month }));
}
