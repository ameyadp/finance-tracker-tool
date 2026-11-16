import { type Account, type Category, type FinanceDB, type Snapshot, type Transaction, db as defaultDb } from './db';

// A backup is a single JSON file the user saves themselves. Because data only
// lives on this device, this is how people move to a new device or recover
// after clearing browser data.

export const BACKUP_FORMAT = 'finance-tracker-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
	format: typeof BACKUP_FORMAT;
	version: number;
	exportedAt: string;
	data: {
		transactions: Transaction[];
		categories: Category[];
		accounts: Account[];
		snapshots: Snapshot[];
		currency: string;
	};
}

export async function createBackup(database: FinanceDB = defaultDb): Promise<Backup> {
	const [transactions, categories, accounts, snapshots, currency] = await Promise.all([
		database.transactions.toArray(),
		database.categories.toArray(),
		database.accounts.toArray(),
		database.snapshots.toArray(),
		database.settings.get('currency'),
	]);
	return {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		exportedAt: new Date().toISOString(),
		data: { transactions, categories, accounts, snapshots, currency: (currency?.value as string) ?? 'USD' },
	};
}

const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isDate = (v: unknown): v is string => isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function checkAll<T>(items: unknown, name: string, valid: (x: Record<string, unknown>) => boolean): T[] {
	if (!Array.isArray(items)) throw new Error(`Backup is missing ${name}.`);
	items.forEach((item, i) => {
		if (!isObj(item) || !valid(item)) throw new Error(`Backup has an invalid entry in ${name} (#${i + 1}).`);
	});
	return items as T[];
}

/** Validate a parsed backup file. Throws an Error with a readable message if it's not valid. */
export function validateBackup(input: unknown): Backup {
	if (!isObj(input) || input.format !== BACKUP_FORMAT) throw new Error("This file isn't a Finance Tracker backup.");
	if (!isInt(input.version) || input.version > BACKUP_VERSION) {
		throw new Error('This backup was made by a newer version of the app. Update the app and try again.');
	}
	const data = input.data;
	if (!isObj(data)) throw new Error('Backup is missing its data.');

	const categories = checkAll<Category>(
		data.categories,
		'categories',
		(c) => isInt(c.id) && isStr(c.name) && ['income', 'expense', 'transfer'].includes(c.kind as string),
	);
	const categoryIds = new Set(categories.map((c) => c.id));
	const accounts = checkAll<Account>(
		data.accounts,
		'accounts',
		(a) => isInt(a.id) && isStr(a.name) && ['asset', 'liability'].includes(a.kind as string),
	);
	const accountIds = new Set(accounts.map((a) => a.id));

	return {
		format: BACKUP_FORMAT,
		version: input.version,
		exportedAt: isStr(input.exportedAt) ? input.exportedAt : '',
		data: {
			categories,
			accounts,
			transactions: checkAll<Transaction>(
				data.transactions,
				'transactions',
				(t) =>
					isInt(t.id) &&
					isDate(t.date) &&
					isStr(t.description) &&
					isInt(t.amountCents) &&
					(t.categoryId === null || (isInt(t.categoryId) && categoryIds.has(t.categoryId))) &&
					(t.importHash === undefined || isStr(t.importHash)),
			),
			snapshots: checkAll<Snapshot>(
				data.snapshots,
				'snapshots',
				(s) => isInt(s.id) && isInt(s.accountId) && accountIds.has(s.accountId) && isDate(s.date) && isInt(s.balanceCents),
			),
			currency: isStr(data.currency) ? data.currency : 'USD',
		},
	};
}

/** Replace everything on this device with the contents of a backup. */
export async function restoreBackup(backup: Backup, database: FinanceDB = defaultDb): Promise<void> {
	const { transactions, categories, accounts, snapshots, currency } = backup.data;
	await database.transaction(
		'rw',
		[database.transactions, database.categories, database.accounts, database.snapshots, database.settings],
		async () => {
			await Promise.all([
				database.transactions.clear(),
				database.categories.clear(),
				database.accounts.clear(),
				database.snapshots.clear(),
			]);
			await database.categories.bulkAdd(categories);
			await database.accounts.bulkAdd(accounts);
			await database.snapshots.bulkAdd(snapshots);
			await database.transactions.bulkAdd(transactions);
			await database.settings.put({ key: 'currency', value: currency });
		},
	);
}
