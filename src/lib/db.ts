import Dexie, { type EntityTable } from 'dexie';

// All data lives in the browser's IndexedDB on this device. Nothing here is
// ever sent to a server.

export type CategoryKind = 'income' | 'expense' | 'transfer';
export type AccountKind = 'asset' | 'liability';

export interface Category {
	id: number;
	name: string;
	/** Transfers (e.g. paying off a credit card) are excluded from income and spending totals. */
	kind: CategoryKind;
}

export interface Transaction {
	id: number;
	/** "YYYY-MM-DD" */
	date: string;
	description: string;
	/** Positive for money in, negative for money out. */
	amountCents: number;
	categoryId: number | null;
	/** Set for imported rows, used to skip duplicates on re-import. */
	importHash?: string;
}

export interface Account {
	id: number;
	name: string;
	kind: AccountKind;
}

/** An account's balance on a given date. Liability balances are stored as positive amounts owed. */
export interface Snapshot {
	id: number;
	accountId: number;
	/** "YYYY-MM-DD" */
	date: string;
	balanceCents: number;
}

export interface Setting {
	key: string;
	value: unknown;
}

export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
	{ name: 'Salary', kind: 'income' },
	{ name: 'Other income', kind: 'income' },
	{ name: 'Housing', kind: 'expense' },
	{ name: 'Groceries', kind: 'expense' },
	{ name: 'Dining', kind: 'expense' },
	{ name: 'Transport', kind: 'expense' },
	{ name: 'Utilities', kind: 'expense' },
	{ name: 'Shopping', kind: 'expense' },
	{ name: 'Health', kind: 'expense' },
	{ name: 'Entertainment', kind: 'expense' },
	{ name: 'Subscriptions', kind: 'expense' },
	{ name: 'Travel', kind: 'expense' },
	{ name: 'Other', kind: 'expense' },
	{ name: 'Transfer', kind: 'transfer' },
];

export class FinanceDB extends Dexie {
	transactions!: EntityTable<Transaction, 'id'>;
	categories!: EntityTable<Category, 'id'>;
	accounts!: EntityTable<Account, 'id'>;
	snapshots!: EntityTable<Snapshot, 'id'>;
	settings!: EntityTable<Setting, 'key'>;

	constructor(name = 'finance-tracker') {
		super(name);
		this.version(1).stores({
			transactions: '++id, date, categoryId, importHash',
			categories: '++id, &name',
			accounts: '++id',
			snapshots: '++id, accountId, date',
			settings: 'key',
		});
		this.on('populate', (tx) => {
			tx.table('categories').bulkAdd(DEFAULT_CATEGORIES);
		});
	}
}

export const db = new FinanceDB();

export async function getSetting<T>(key: string, fallback: T, database: FinanceDB = db): Promise<T> {
	const row = await database.settings.get(key);
	return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown, database: FinanceDB = db): Promise<void> {
	await database.settings.put({ key, value });
}
