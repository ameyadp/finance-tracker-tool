import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCategories, useCurrency, useToast } from '../hooks';
import { createBackup, restoreBackup, validateBackup } from '../lib/backup';
import { type CategoryKind, DEFAULT_CATEGORIES, db, setSetting } from '../lib/db';
import { todayISO } from '../lib/dates';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CHF', 'SGD', 'NZD', 'MXN', 'BRL'];

function Categories() {
	const categories = useCategories();
	const [name, setName] = useState('');
	const [kind, setKind] = useState<CategoryKind>('expense');
	const [error, setError] = useState('');

	async function add(e: FormEvent) {
		e.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) return;
		if (categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return setError('That category already exists.');
		await db.categories.add({ name: trimmed, kind } as never);
		setName('');
		setError('');
	}

	async function remove(id: number, label: string) {
		const used = await db.transactions.where('categoryId').equals(id).count();
		const note = used ? ` ${used} transaction${used === 1 ? '' : 's'} will become uncategorized.` : '';
		if (!confirm(`Delete the "${label}" category?${note}`)) return;
		await db.transaction('rw', [db.transactions, db.categories], async () => {
			await db.transactions.where('categoryId').equals(id).modify({ categoryId: null });
			await db.categories.delete(id);
		});
	}

	const kindLabel: Record<CategoryKind, string> = { income: 'Income', expense: 'Expense', transfer: 'Transfer (not counted)' };

	return (
		<section className="card">
			<h2>Categories</h2>
			<p className="muted small">
				Use <strong>Transfer</strong> for moving money between your own accounts, like paying a credit card bill, so it
				isn’t counted as spending twice.
			</p>
			<ul className="chips">
				{categories.map((c) => (
					<li key={c.id} className={`chip ${c.kind}`}>
						<span title={kindLabel[c.kind]}>{c.name}</span>
						<button type="button" aria-label={`Delete ${c.name}`} onClick={() => void remove(c.id, c.name)}>
							×
						</button>
					</li>
				))}
			</ul>
			<form className="inline-form" onSubmit={add}>
				<input placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} aria-label="New category name" />
				<select value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)} aria-label="Category type">
					{(Object.keys(kindLabel) as CategoryKind[]).map((k) => (
						<option key={k} value={k}>
							{kindLabel[k]}
						</option>
					))}
				</select>
				<button type="submit" disabled={!name.trim()}>
					Add
				</button>
			</form>
			{error && <p className="error">{error}</p>}
		</section>
	);
}

export function Settings() {
	const currency = useCurrency();
	const [toast, setToast] = useToast();
	const [persisted, setPersisted] = useState<boolean | null>(null);

	useEffect(() => {
		navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
	}, []);

	async function exportBackup() {
		const backup = await createBackup();
		const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `finance-tracker-backup-${todayISO()}.json`;
		a.click();
		URL.revokeObjectURL(url);
		await setSetting('lastBackup', todayISO());
		setToast('Backup downloaded.');
	}

	async function importBackup(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = '';
		if (!file) return;
		try {
			const backup = validateBackup(JSON.parse(await file.text()));
			const { transactions, accounts } = backup.data;
			if (
				!confirm(
					`Replace everything on this device with this backup (${transactions.length} transactions, ${accounts.length} accounts)? This can't be undone.`,
				)
			)
				return;
			await restoreBackup(backup);
			setToast('Backup restored.');
		} catch (err) {
			alert(err instanceof SyntaxError ? "That file isn't valid JSON." : (err as Error).message);
		}
	}

	async function deleteEverything() {
		if (!confirm('Delete all your transactions, accounts and balances from this device? Export a backup first if you might want them back.')) return;
		if (!confirm('Are you sure? This cannot be undone.')) return;
		await db.transaction('rw', [db.transactions, db.accounts, db.snapshots, db.categories], async () => {
			await Promise.all([db.transactions.clear(), db.accounts.clear(), db.snapshots.clear(), db.categories.clear()]);
			await db.categories.bulkAdd(DEFAULT_CATEGORIES as never);
		});
		setToast('All data deleted.');
	}

	const lastBackup = useLiveQuery(() => db.settings.get('lastBackup'), [])?.value as string | undefined;

	return (
		<>
			<section className="card form">
				<h2>Currency</h2>
				<label>
					Show amounts in
					<select value={currency} onChange={(e) => void setSetting('currency', e.target.value)}>
						{CURRENCIES.map((c) => (
							<option key={c} value={c}>
								{c}
							</option>
						))}
					</select>
				</label>
			</section>

			<Categories />

			<section className="card">
				<h2>Backup</h2>
				<p className="muted small">
					Your data lives only in this browser on this device. Download a backup regularly, and use it to move to a new
					device. {lastBackup ? `Last backup: ${lastBackup}.` : 'You haven’t made a backup yet.'}
				</p>
				{persisted === false && (
					<p className="warning small">
						This browser may clear the app’s data if storage runs low. Installing the app (Add to Home Screen / Install)
						and keeping a backup protects you.
					</p>
				)}
				<div className="actions">
					<button type="button" onClick={() => void exportBackup()}>
						Download backup
					</button>
					<label className="file-button secondary">
						<input type="file" accept=".json,application/json" onChange={importBackup} />
						Restore from backup
					</label>
				</div>
			</section>

			<section className="card">
				<h2>Privacy</h2>
				<p className="small">
					Your financial data never leaves this device: no cloud sync and no bank logins. Installing the app asks once for your name, email and location, which are kept separately and never linked to your financial data.
				</p>
				<p className="muted small">
					📊 Using Finance Tracker includes anonymous usage counts, and this is required: each install and app open, plus once a day a random ID, the app version and the word “active”, so I can see how many people use it. Never any amounts, descriptions or personal details. Reaching the end of the free browser trial is also counted, with no ID.
				</p>
			</section>

			<section className="card">
				<h2>Danger zone</h2>
				<button type="button" className="danger" onClick={() => void deleteEverything()}>
					Delete all data on this device
				</button>
			</section>

			<p className="muted small center">Finance Tracker v{__APP_VERSION__}</p>
			{toast && <div className="toast" role="status">{toast}</div>}
		</>
	);
}
