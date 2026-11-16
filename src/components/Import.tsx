import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useCategories, useMoney } from '../hooks';
import { type ColumnMapping, type ParsedCsv, guessMapping, parseCsv, rowsToTransactions } from '../lib/csv';
import { formatDate } from '../lib/dates';
import { type ImportPlan, commitImport, planImport } from '../lib/importer';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function ColumnSelect({
	label,
	value,
	headers,
	onChange,
	optional,
}: {
	label: string;
	value: string;
	headers: string[];
	onChange: (v: string) => void;
	optional?: boolean;
}) {
	return (
		<label>
			{label}
			<select value={value} onChange={(e) => onChange(e.target.value)}>
				<option value="">{optional ? '(none)' : 'Choose a column…'}</option>
				{headers.map((h) => (
					<option key={h} value={h}>
						{h}
					</option>
				))}
			</select>
		</label>
	);
}

export function Import({ go }: { go: (tab: string) => void }) {
	const money = useMoney();
	const categories = useCategories();
	const [fileName, setFileName] = useState('');
	const [csv, setCsv] = useState<ParsedCsv | null>(null);
	const [mapping, setMapping] = useState<ColumnMapping | null>(null);
	const [plan, setPlan] = useState<ImportPlan | null>(null);
	const [error, setError] = useState('');
	const [done, setDone] = useState<number | null>(null);
	const [busy, setBusy] = useState(false);

	const result = useMemo(() => (csv && mapping ? rowsToTransactions(csv.rows, mapping) : null), [csv, mapping]);
	const mappingComplete =
		!!mapping?.date &&
		(mapping.amountMode === 'single' ? !!mapping.amount : !!mapping.debit && !!mapping.credit);

	// Recompute which rows are new whenever the mapping changes.
	useEffect(() => {
		let cancelled = false;
		if (!result || !mappingComplete) return setPlan(null);
		planImport(result.drafts).then((p) => !cancelled && setPlan(p));
		return () => {
			cancelled = true;
		};
	}, [result, mappingComplete]);

	async function onFile(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = '';
		setDone(null);
		setError('');
		if (!file) return;
		if (file.size > MAX_FILE_BYTES) return setError('That file is too large (over 20 MB).');

		const parsed = parseCsv(await file.text());
		if (parsed.headers.length < 2 || parsed.rows.length === 0) {
			setCsv(null);
			return setError("Couldn't find a table in that file. Make sure it's a CSV export with a header row.");
		}
		setFileName(file.name);
		setCsv(parsed);
		setMapping(guessMapping(parsed));
	}

	async function runImport() {
		if (!plan) return;
		setBusy(true);
		try {
			const added = await commitImport(plan);
			setDone(added);
			setCsv(null);
			setMapping(null);
			setPlan(null);
		} catch (err) {
			setError(`Import failed: ${(err as Error).message}`);
		} finally {
			setBusy(false);
		}
	}

	const set = (patch: Partial<ColumnMapping>) => mapping && setMapping({ ...mapping, ...patch });
	const categoryName = (id: number | null) => categories.find((c) => c.id === id)?.name ?? '—';

	return (
		<>
			<section className="card">
				<h2>Import from your bank</h2>
				<p className="muted">
					Download a CSV of your transactions from your bank or card’s website, then choose it here. The file is read
					on this device and never uploaded. Re-importing an overlapping file is safe: rows you already have are
					skipped.
				</p>
				<label className="file-button">
					<input type="file" accept=".csv,text/csv" onChange={onFile} />
					{csv ? 'Choose a different file' : 'Choose CSV file'}
				</label>
				{error && <p className="error">{error}</p>}
				{done !== null && (
					<div className="success">
						<p>
							Imported {done} transaction{done === 1 ? '' : 's'}.
						</p>
						<button type="button" onClick={() => go('transactions')}>
							Review and categorize
						</button>
					</div>
				)}
			</section>

			{csv && mapping && (
				<section className="card form">
					<h2>Match the columns</h2>
					<p className="muted small">
						{fileName}: {csv.rows.length} rows. We guessed the columns; check they’re right.
					</p>
					<div className="grid">
						<ColumnSelect label="Date" value={mapping.date} headers={csv.headers} onChange={(date) => set({ date })} />
						<label>
							Date format
							<select value={mapping.dateFormat} onChange={(e) => set({ dateFormat: e.target.value as ColumnMapping['dateFormat'] })}>
								<option value="MDY">Month/Day/Year</option>
								<option value="DMY">Day/Month/Year</option>
								<option value="YMD">Year-Month-Day</option>
							</select>
						</label>
						<ColumnSelect
							label="Description"
							value={mapping.description}
							headers={csv.headers}
							onChange={(description) => set({ description })}
							optional
						/>
						<label>
							Amounts are in
							<select value={mapping.amountMode} onChange={(e) => set({ amountMode: e.target.value as ColumnMapping['amountMode'] })}>
								<option value="single">One column (+/−)</option>
								<option value="split">Separate in/out columns</option>
							</select>
						</label>
						{mapping.amountMode === 'single' ? (
							<>
								<ColumnSelect label="Amount" value={mapping.amount} headers={csv.headers} onChange={(amount) => set({ amount })} />
								<label className="checkbox">
									<input type="checkbox" checked={mapping.invert} onChange={(e) => set({ invert: e.target.checked })} />
									Purchases are positive numbers in this file
								</label>
							</>
						) : (
							<>
								<ColumnSelect label="Money out" value={mapping.debit} headers={csv.headers} onChange={(debit) => set({ debit })} />
								<ColumnSelect label="Money in" value={mapping.credit} headers={csv.headers} onChange={(credit) => set({ credit })} />
							</>
						)}
					</div>

					{mappingComplete && result && (
						<>
							<h3>Preview</h3>
							<p className="small">
								<strong>{plan?.toAdd.length ?? '…'}</strong> new · {plan?.duplicates ?? 0} already imported ·{' '}
								<span className={result.errors.length ? 'negative' : ''}>{result.errors.length} unreadable</span>
							</p>
							{plan && plan.toAdd.length > 0 && (
								<div className="table-wrap">
									<table>
										<thead>
											<tr>
												<th>Date</th>
												<th>Description</th>
												<th>Category</th>
												<th className="num">Amount</th>
											</tr>
										</thead>
										<tbody>
											{plan.toAdd.slice(0, 8).map((t) => (
												<tr key={t.importHash}>
													<td>{formatDate(t.date)}</td>
													<td>{t.description}</td>
													<td>{categoryName(t.categoryId)}</td>
													<td className={`num ${t.amountCents < 0 ? 'negative' : 'positive'}`}>{money(t.amountCents)}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
							{result.errors.length > 0 && (
								<details className="small">
									<summary>Rows that will be skipped</summary>
									<ul>
										{result.errors.slice(0, 20).map((e) => (
											<li key={e.row}>
												Row {e.row}: {e.reason}
											</li>
										))}
									</ul>
								</details>
							)}
							<p className="muted small">Check the signs: spending should show in red as negative amounts.</p>
							<div className="actions">
								<button type="button" disabled={!plan || plan.toAdd.length === 0 || busy} onClick={() => void runImport()}>
									{busy ? 'Importing…' : `Import ${plan?.toAdd.length ?? 0} transactions`}
								</button>
							</div>
						</>
					)}
				</section>
			)}
		</>
	);
}
