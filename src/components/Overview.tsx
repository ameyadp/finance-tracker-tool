import { useState } from 'react';
import { useAccounts, useCategories, useMoney, useSnapshots, useTransactions } from '../hooks';
import { addMonths, monthOf, monthRange, todayISO } from '../lib/dates';
import { monthSummary, monthlyTotals, netWorthAt } from '../lib/reports';
import { loadSampleData } from '../lib/sample';
import { IncomeSpendingChart } from './Charts';
import { MonthPicker } from './MonthPicker';

export function Overview({ go }: { go: (tab: string) => void }) {
	const transactions = useTransactions();
	const categories = useCategories();
	const accounts = useAccounts();
	const snapshots = useSnapshots();
	const money = useMoney();
	const [month, setMonth] = useState(() => monthOf(todayISO()));

	if (transactions === undefined) return null;

	if (transactions.length === 0 && accounts.length === 0) {
		return (
			<section className="card empty">
				<h2>Welcome 👋</h2>
				<p>
					Track spending and net worth without handing your finances to anyone. Everything you enter stays on this
					device.
				</p>
				<div className="actions">
					<button type="button" onClick={() => go('import')}>
						Import a bank CSV
					</button>
					<button type="button" className="secondary" onClick={() => go('transactions')}>
						Add a transaction
					</button>
					<button type="button" className="secondary" onClick={() => void loadSampleData()}>
						Explore with sample data
					</button>
				</div>
			</section>
		);
	}

	const summary = monthSummary(transactions, categories, month);
	const trend = monthlyTotals(transactions, categories, monthRange(addMonths(month, -5), month));
	const netWorth = netWorthAt(accounts, snapshots);
	const maxCategory = summary.spendingByCategory[0]?.cents ?? 1;

	return (
		<>
			<MonthPicker month={month} onChange={setMonth} />

			<section className="stats">
				<div className="stat">
					<span>Income</span>
					<strong className="positive">{money(summary.incomeCents)}</strong>
				</div>
				<div className="stat">
					<span>Spending</span>
					<strong className="negative">{money(summary.spendingCents)}</strong>
				</div>
				<div className="stat">
					<span>Saved</span>
					<strong className={summary.netCents >= 0 ? 'positive' : 'negative'}>{money(summary.netCents)}</strong>
				</div>
				{accounts.length > 0 && (
					<button type="button" className="stat link" onClick={() => go('networth')}>
						<span>Net worth</span>
						<strong>{money(netWorth.netCents)}</strong>
					</button>
				)}
			</section>

			<section className="card">
				<h2>Last 6 months</h2>
				<IncomeSpendingChart data={trend} format={money} />
			</section>

			<section className="card">
				<h2>Where the money went</h2>
				{summary.spendingByCategory.length === 0 ? (
					<p className="muted">No spending recorded this month.</p>
				) : (
					<ul className="category-bars">
						{summary.spendingByCategory.map((c) => (
							<li key={c.categoryId ?? 'none'}>
								<div className="row">
									<span>{c.name}</span>
									<span>{money(c.cents)}</span>
								</div>
								<div className="bar">
									<div style={{ width: `${(c.cents / maxCategory) * 100}%` }} />
								</div>
							</li>
						))}
					</ul>
				)}
				{summary.spendingByCategory.some((c) => c.categoryId === null) && (
					<p className="muted small">
						Tip: categorize transactions on the <button type="button" className="inline" onClick={() => go('transactions')}>Transactions</button> tab — the app remembers and applies your choices to future imports.
					</p>
				)}
			</section>
		</>
	);
}
