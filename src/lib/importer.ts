import { type FinanceDB, type Transaction, db as defaultDb } from './db';
import { type DraftTransaction, normalizeDescription } from './csv';

export interface ImportPlan {
	toAdd: Omit<Transaction, 'id'>[];
	duplicates: number;
}

/**
 * Work out which drafted rows are new, and pre-fill categories by matching
 * descriptions you've categorized before.
 */
export async function planImport(drafts: DraftTransaction[], database: FinanceDB = defaultDb): Promise<ImportPlan> {
	const existing = await database.transactions
		.where('importHash')
		.anyOf(drafts.map((d) => d.importHash))
		.toArray();
	const existingHashes = new Set(existing.map((t) => t.importHash));

	// Learn categories from past transactions, most recent first.
	const learned = new Map<string, number>();
	const history = await database.transactions.orderBy('date').reverse().toArray();
	for (const t of history) {
		if (t.categoryId === null) continue;
		const key = normalizeDescription(t.description);
		if (key && !learned.has(key)) learned.set(key, t.categoryId);
	}

	const toAdd = drafts
		.filter((d) => !existingHashes.has(d.importHash))
		.map((d) => ({ ...d, categoryId: learned.get(normalizeDescription(d.description)) ?? null }));

	return { toAdd, duplicates: drafts.length - toAdd.length };
}

export async function commitImport(plan: ImportPlan, database: FinanceDB = defaultDb): Promise<number> {
	await database.transactions.bulkAdd(plan.toAdd as Transaction[]);
	return plan.toAdd.length;
}
