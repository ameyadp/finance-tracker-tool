import { type FormEvent, useState } from 'react';
import { useAccounts, useMoney, useSnapshots, useToast } from '../hooks';
import { type Account, type AccountKind, type Snapshot, db } from '../lib/db';
import { addMonths, formatDate, monthOf, monthRange, todayISO } from '../lib/dates';
import { parseAmount } from '../lib/money';
import { balancesAsOf, netWorthAt, netWorthSeries } from '../lib/reports';
import { NetWorthChart } from './Charts';

function BalanceForm({ account, onDone }: { account: Account; onDone: () => void }) {
	const [amount, setAmount] = useState('');
	const [date, setDate] = useState(todayISO());
	const [error, setError] = useState('');

	async function save(e: FormEvent) {
		e.preventDefault();
		const cents = parseAmount(amount);
		if (cents === null) return setError('Enter a balance, like 1250.00.');
		if (!date) return setError('Pick a date.');
		await db.snapshots.add({ accountId: account.id, date, balanceCents: Math.abs(cents) } as Snapshot);
		onDone();
	}

	return (
		<form className="inline-form" onSubmit={save}>
			<input
				inputMode="decimal"
				placeholder={account.kind === 'liability' ? 'Amount owed' : 'Balance'}
				value={amount}
				onChange={(e) => setAmount(e.target.value)}
				aria-label={`New balance for ${account.name}`}
				autoFocus
			/>
			<input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Balance date" />
			<button type="submit">Save</button>
			<button type="button" className="secondary" onClick={onDone}>
				Cancel
			</button>
			{error && <p className="error">{error}</p>}
		</form>
	);
}

function History({ account, snapshots }: { account: Account; snapshots: Snapshot[] }) {
	const money = useMoney();
	const rows = snapshots.filter((s) => s.accountId === account.id).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
	return (
		<ul className="history">
			{rows.map((s) => (
				<li key={s.id}>
					<span>{formatDate(s.date)} {s.date.slice(0, 4)}</span>
					<span>{money(s.balanceCents)}</span>
					<button
						type="button"
						className="ghost danger"
						onClick={() => confirm('Delete this balance entry?') && void db.snapshots.delete(s.id)}
					>
						Delete
					</button>
				</li>
			))}
		</ul>
	);
}

export function NetWorth() {
	const accounts = useAccounts();
	const snapshots = useSnapshots();
	const money = useMoney();
	const [toast, setToast] = useToast();
	const [updating, setUpdating] = useState<number | null>(null);
	const [expanded, setExpanded] = useState<number | null>(null);
	const [name, setName] = useState('');
	const [kind, setKind] = useState<AccountKind>('asset');

	const latest = balancesAsOf(snapshots);
	const current = netWorthAt(accounts, snapshots);
	const thisMonth = monthOf(todayISO());
	const firstMonth = snapshots.reduce((min, s) => (monthOf(s.date) < min ? monthOf(s.date) : min), thisMonth);
	const start = firstMonth < addMonths(thisMonth, -23) ? addMonths(thisMonth, -23) : firstMonth;
	const series = netWorthSeries(accounts, snapshots, monthRange(start, thisMonth));

	async function addAccount(e: FormEvent) {
		e.preventDefault();
		if (!name.trim()) return;
		const id = await db.accounts.add({ name: name.trim(), kind } as Account);
		setName('');
		setUpdating(id);
	}

	async function deleteAccount(account: Account) {
		if (!confirm(`Delete "${account.name}" and its balance history?`)) return;
		await db.transaction('rw', [db.accounts, db.snapshots], async () => {
			await db.snapshots.where('accountId').equals(account.id).delete();
			await db.accounts.delete(account.id);
		});
		setToast(`Deleted ${account.name}.`);
	}

	const groups: [AccountKind, string][] = [
		['asset', 'Assets'],
		['liability', 'Liabilities'],
	];

	return (
		<>
			<section className="stats">
				<div className="stat">
					<span>Assets</span>
					<strong className="positive">{money(current.assetsCents)}</strong>
				</div>
				<div className="stat">
					<span>Liabilities</span>
					<strong className="negative">{money(current.liabilitiesCents)}</strong>
				</div>
				<div className="stat">
					<span>Net worth</span>
					<strong className={current.netCents >= 0 ? 'positive' : 'negative'}>{money(current.netCents)}</strong>
				</div>
			</section>

			{snapshots.length > 0 && (
				<section className="card">
					<h2>Net worth over time</h2>
					<NetWorthChart data={series} format={money} />
					<p className="muted small">Update balances once a month to build your history.</p>
				</section>
			)}

			{groups.map(([group, title]) => {
				const list = accounts.filter((a) => a.kind === group);
				if (list.length === 0) return null;
				return (
					<section className="card" key={group}>
						<h2>{title}</h2>
						<ul className="accounts">
							{list.map((a) => {
								const snap = latest.get(a.id);
								return (
									<li key={a.id}>
										<div className="row">
											<button type="button" className="inline" onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
												{a.name}
											</button>
											<span className="balance">
												{snap ? money(snap.balanceCents) : '—'}
												{snap && <small>as of {formatDate(snap.date)}</small>}
											</span>
										</div>
										{updating === a.id ? (
											<BalanceForm
												account={a}
												onDone={() => {
													setUpdating(null);
												}}
											/>
										) : (
											<div className="row-actions">
												<button type="button" className="ghost" onClick={() => setUpdating(a.id)}>
													Update balance
												</button>
												<button type="button" className="ghost danger" onClick={() => void deleteAccount(a)}>
													Delete
												</button>
											</div>
										)}
										{expanded === a.id && <History account={a} snapshots={snapshots} />}
									</li>
								);
							})}
						</ul>
					</section>
				);
			})}

			<form className="card form" onSubmit={addAccount}>
				<h2>Add an account</h2>
				<p className="muted small">Bank accounts, investments and property are assets. Credit cards and loans are liabilities.</p>
				<div className="grid">
					<label>
						Name
						<input placeholder="e.g. Checking, 401(k), Car loan" value={name} onChange={(e) => setName(e.target.value)} />
					</label>
					<label>
						Type
						<select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
							<option value="asset">Asset (what you own)</option>
							<option value="liability">Liability (what you owe)</option>
						</select>
					</label>
				</div>
				<div className="actions">
					<button type="submit" disabled={!name.trim()}>
						Add account
					</button>
				</div>
			</form>
			{toast && <div className="toast" role="status">{toast}</div>}
		</>
	);
}
