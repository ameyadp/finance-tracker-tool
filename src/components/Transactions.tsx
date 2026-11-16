import { type FormEvent, useMemo, useState } from 'react';
import { useCategories, useMoney, useToast, useTransactions } from '../hooks';
import { normalizeDescription } from '../lib/csv';
import { type Category, type Transaction, db } from '../lib/db';
import { formatDate, monthOf, todayISO } from '../lib/dates';
import { centsToInput, parseAmount } from '../lib/money';
import { MonthPicker } from './MonthPicker';

const ALL = 'all';
const UNCATEGORIZED = 'none';

interface Draft {
	id: number | null;
	date: string;
	description: string;
	amount: string;
	direction: 'out' | 'in';
	categoryId: string;
}

const emptyDraft = (): Draft => ({
	id: null,
	date: todayISO(),
	description: '',
	amount: '',
	direction: 'out',
	categoryId: '',
});

/** Set a transaction's category and apply it to uncategorized transactions with the same description. */
async function categorize(t: Transaction, categoryId: number | null): Promise<number> {
	await db.transactions.update(t.id, { categoryId });
	if (categoryId === null) return 0;
	const key = normalizeDescription(t.description);
	if (!key) return 0;
	const similar = await db.transactions
		.filter((o) => o.id !== t.id && o.categoryId === null && normalizeDescription(o.description) === key)
		.primaryKeys();
	await Promise.all(similar.map((id) => db.transactions.update(id, { categoryId })));
	return similar.length;
}

function CategorySelect({
	value,
	categories,
	onChange,
	label,
}: {
	value: number | null;
	categories: Category[];
	onChange: (id: number | null) => void;
	label: string;
}) {
	return (
		<select
			aria-label={label}
			value={value ?? ''}
			onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
			className={value === null ? 'uncategorized' : undefined}
		>
			<option value="">Uncategorized</option>
			{categories.map((c) => (
				<option key={c.id} value={c.id}>
					{c.name}
				</option>
			))}
		</select>
	);
}

export function Transactions() {
	const transactions = useTransactions();
	const categories = useCategories();
	const money = useMoney();
	const [toast, setToast] = useToast();
	const [month, setMonth] = useState(() => monthOf(todayISO()));
	const [search, setSearch] = useState('');
	const [categoryFilter, setCategoryFilter] = useState(ALL);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [error, setError] = useState('');

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase();
		return (transactions ?? []).filter(
			(t) =>
				(q ? t.description.toLowerCase().includes(q) : monthOf(t.date) === month) &&
				(categoryFilter === ALL ||
					(categoryFilter === UNCATEGORIZED ? t.categoryId === null : t.categoryId === Number(categoryFilter))),
		);
	}, [transactions, month, search, categoryFilter]);

	const uncategorizedCount = (transactions ?? []).filter((t) => t.categoryId === null).length;

	async function save(e: FormEvent) {
		e.preventDefault();
		if (!draft) return;
		const cents = parseAmount(draft.amount);
		if (cents === null || cents === 0) return setError('Enter an amount, like 12.50.');
		if (!draft.description.trim()) return setError('Enter a description.');
		if (!draft.date) return setError('Pick a date.');

		const record = {
			date: draft.date,
			description: draft.description.trim(),
			amountCents: draft.direction === 'out' ? -Math.abs(cents) : Math.abs(cents),
			categoryId: draft.categoryId ? Number(draft.categoryId) : null,
		};
		if (draft.id === null) await db.transactions.add(record as Transaction);
		else await db.transactions.update(draft.id, record);

		setToast(draft.id === null ? 'Transaction added.' : 'Transaction updated.');
		setMonth(monthOf(record.date));
		setDraft(null);
		setError('');
	}

	function edit(t: Transaction) {
		setDraft({
			id: t.id,
			date: t.date,
			description: t.description,
			amount: centsToInput(Math.abs(t.amountCents)),
			direction: t.amountCents < 0 ? 'out' : 'in',
			categoryId: t.categoryId === null ? '' : String(t.categoryId),
		});
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	async function remove(t: Transaction) {
		if (!confirm(`Delete "${t.description}"?`)) return;
		await db.transactions.delete(t.id);
		setToast('Transaction deleted.');
	}

	async function changeCategory(t: Transaction, categoryId: number | null) {
		const others = await categorize(t, categoryId);
		if (others > 0) setToast(`Also categorized ${others} similar transaction${others === 1 ? '' : 's'}.`);
	}

	return (
		<>
			{draft ? (
				<form className="card form" onSubmit={save}>
					<h2>{draft.id === null ? 'Add transaction' : 'Edit transaction'}</h2>
					<div className="segmented" role="radiogroup" aria-label="Money in or out">
						{(['out', 'in'] as const).map((d) => (
							<button
								key={d}
								type="button"
								role="radio"
								aria-checked={draft.direction === d}
								className={draft.direction === d ? 'active' : ''}
								onClick={() => setDraft({ ...draft, direction: d })}
							>
								{d === 'out' ? 'Money out' : 'Money in'}
							</button>
						))}
					</div>
					<div className="grid">
						<label>
							Amount
							<input
								inputMode="decimal"
								placeholder="0.00"
								value={draft.amount}
								onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
								autoFocus
							/>
						</label>
						<label>
							Date
							<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
						</label>
						<label className="wide">
							Description
							<input
								placeholder="e.g. Groceries at Safeway"
								value={draft.description}
								onChange={(e) => setDraft({ ...draft, description: e.target.value })}
							/>
						</label>
						<label className="wide">
							Category
							<select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
								<option value="">Uncategorized</option>
								{categories.map((c) => (
									<option key={c.id} value={c.id}>
										{c.name}
									</option>
								))}
							</select>
						</label>
					</div>
					{error && <p className="error">{error}</p>}
					<div className="actions">
						<button type="submit">{draft.id === null ? 'Add' : 'Save changes'}</button>
						<button
							type="button"
							className="secondary"
							onClick={() => {
								setDraft(null);
								setError('');
							}}
						>
							Cancel
						</button>
					</div>
				</form>
			) : (
				<button type="button" className="add-button" onClick={() => setDraft(emptyDraft())}>
					+ Add transaction
				</button>
			)}

			<div className="toolbar">
				{search ? <strong>Search results</strong> : <MonthPicker month={month} onChange={setMonth} />}
				<input
					type="search"
					placeholder="Search all transactions"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					aria-label="Search transactions"
				/>
				<select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category">
					<option value={ALL}>All categories</option>
					<option value={UNCATEGORIZED}>Uncategorized ({uncategorizedCount})</option>
					{categories.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</select>
			</div>

			<section className="card list">
				{visible.length === 0 ? (
					<p className="muted">{transactions?.length ? 'No transactions match.' : 'No transactions yet.'}</p>
				) : (
					<ul className="transactions">
						{visible.map((t) => (
							<li key={t.id}>
								<span className="date">{formatDate(t.date)}</span>
								<span className="desc" title={t.description}>
									{t.description}
								</span>
								<CategorySelect
									value={t.categoryId}
									categories={categories}
									onChange={(id) => void changeCategory(t, id)}
									label={`Category for ${t.description}`}
								/>
								<span className={`amount ${t.amountCents < 0 ? 'negative' : 'positive'}`}>{money(t.amountCents)}</span>
								<span className="row-actions">
									<button type="button" className="ghost" onClick={() => edit(t)} aria-label={`Edit ${t.description}`}>
										Edit
									</button>
									<button type="button" className="ghost danger" onClick={() => void remove(t)} aria-label={`Delete ${t.description}`}>
										Delete
									</button>
								</span>
							</li>
						))}
					</ul>
				)}
			</section>
			{toast && <div className="toast" role="status">{toast}</div>}
		</>
	);
}
