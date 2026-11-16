import { type FinanceDB, type Snapshot, type Transaction, db as defaultDb } from './db';
import { addMonths, endOfMonth, monthOf, todayISO } from './dates';

// Realistic-looking made-up data so first-time visitors can explore the app
// before importing their own. Only loaded on an empty database.

export async function loadSampleData(database: FinanceDB = defaultDb): Promise<void> {
	const categories = await database.categories.toArray();
	const cat = (name: string) => categories.find((c) => c.name === name)?.id ?? null;
	const thisMonth = monthOf(todayISO());
	const months = [-5, -4, -3, -2, -1, 0].map((n) => addMonths(thisMonth, n));
	const today = todayISO();
	const day = (month: string, d: number) => {
		const date = `${month}-${String(d).padStart(2, '0')}`;
		return date > endOfMonth(month) ? endOfMonth(month) : date;
	};

	const transactions: Omit<Transaction, 'id'>[] = [];
	const add = (date: string, description: string, dollars: number, category: string) => {
		if (date <= today) transactions.push({ date, description, amountCents: Math.round(dollars * 100), categoryId: cat(category) });
	};

	months.forEach((m, i) => {
		const wobble = (base: number, step: number) => base + ((i * step) % 23);
		add(day(m, 1), 'Paycheck — Acme Corp', 3850, 'Salary');
		add(day(m, 15), 'Paycheck — Acme Corp', 3850, 'Salary');
		add(day(m, 1), 'Rent', -2100, 'Housing');
		add(day(m, 4), 'Trader Joe’s', -wobble(86, 7), 'Groceries');
		add(day(m, 11), 'Safeway', -wobble(64, 11), 'Groceries');
		add(day(m, 19), 'Trader Joe’s', -wobble(92, 5), 'Groceries');
		add(day(m, 6), 'Blue Bottle Coffee', -6.5, 'Dining');
		add(day(m, 13), 'Thai Basil', -wobble(42, 9), 'Dining');
		add(day(m, 22), 'Pizza Night', -wobble(31, 13), 'Dining');
		add(day(m, 8), 'PG&E', -wobble(95, 17), 'Utilities');
		add(day(m, 9), 'Comcast Internet', -70, 'Utilities');
		add(day(m, 10), 'Shell Gas', -wobble(48, 3), 'Transport');
		add(day(m, 3), 'Netflix', -15.49, 'Subscriptions');
		add(day(m, 3), 'Spotify', -11.99, 'Subscriptions');
		add(day(m, 25), 'Credit card payment', -1200, 'Transfer');
		if (i % 2 === 0) add(day(m, 17), 'Amazon', -wobble(74, 19), 'Shopping');
		if (i === 3) add(day(m, 20), 'Flight to Denver', -386, 'Travel');
		if (i === 4) add(day(m, 12), 'Dentist', -140, 'Health');
	});

	await database.transaction('rw', [database.transactions, database.accounts, database.snapshots], async () => {
		await database.transactions.bulkAdd(transactions as Transaction[]);
		const checking = await database.accounts.add({ name: 'Checking', kind: 'asset' } as never);
		const brokerage = await database.accounts.add({ name: 'Brokerage', kind: 'asset' } as never);
		const card = await database.accounts.add({ name: 'Credit card', kind: 'liability' } as never);
		const loan = await database.accounts.add({ name: 'Car loan', kind: 'liability' } as never);

		const snapshots: Omit<Snapshot, 'id'>[] = [];
		months.forEach((m, i) => {
			const date = endOfMonth(m) > today ? today : endOfMonth(m);
			snapshots.push(
				{ accountId: checking, date, balanceCents: (6200 + i * 850) * 100 },
				{ accountId: brokerage, date, balanceCents: (24000 + i * 600 + (i === 2 ? -1400 : 0)) * 100 },
				{ accountId: card, date, balanceCents: (1450 - (i % 3) * 220) * 100 },
				{ accountId: loan, date, balanceCents: (14800 - i * 410) * 100 },
			);
		});
		await database.snapshots.bulkAdd(snapshots as Snapshot[]);
	});
}

export async function isDatabaseEmpty(database: FinanceDB = defaultDb): Promise<boolean> {
	const [t, a] = await Promise.all([database.transactions.count(), database.accounts.count()]);
	return t === 0 && a === 0;
}
