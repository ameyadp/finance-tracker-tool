import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { type Account, type Category, type Snapshot, type Transaction, db, getSetting } from './lib/db';
import { formatMoney } from './lib/money';

// Live queries re-render automatically whenever the underlying data changes.

export function useCurrency(): string {
	return useLiveQuery(() => getSetting('currency', 'USD'), [], 'USD');
}

/** Returns a function that formats cents in the user's chosen currency. */
export function useMoney(): (cents: number) => string {
	const currency = useCurrency();
	return (cents) => formatMoney(cents, currency);
}

export const useCategories = (): Category[] =>
	useLiveQuery(() => db.categories.toArray().then((c) => c.sort((a, b) => a.name.localeCompare(b.name))), [], []);

/** All transactions, newest first. Undefined while loading. */
export const useTransactions = (): Transaction[] | undefined =>
	useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), []);

export const useAccounts = (): Account[] => useLiveQuery(() => db.accounts.toArray(), [], []);

export const useSnapshots = (): Snapshot[] => useLiveQuery(() => db.snapshots.toArray(), [], []);

/** A short-lived status message. */
export function useToast(): [string, (message: string) => void] {
	const [message, setMessage] = useState('');
	useEffect(() => {
		if (!message) return;
		const timer = setTimeout(() => setMessage(''), 4000);
		return () => clearTimeout(timer);
	}, [message]);
	return [message, setMessage];
}
