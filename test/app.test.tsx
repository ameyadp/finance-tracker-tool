// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { DEFAULT_CATEGORIES, db } from '../src/lib/db';
import { loadSampleData } from '../src/lib/sample';

// End-to-end-style checks of the real UI against an in-memory IndexedDB.

// jsdom's File lacks Blob.text(), which every real browser supports.
if (!File.prototype.text) {
	File.prototype.text = function (this: File) {
		return new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(reader.error);
			reader.readAsText(this);
		});
	};
}

async function resetDb() {
	await db.transaction('rw', [db.transactions, db.accounts, db.snapshots, db.categories, db.settings], async () => {
		await Promise.all([db.transactions.clear(), db.accounts.clear(), db.snapshots.clear(), db.categories.clear(), db.settings.clear()]);
		await db.categories.bulkAdd(DEFAULT_CATEGORIES as never);
	});
}

function renderApp(tab = 'overview') {
	window.location.hash = tab;
	const user = userEvent.setup();
	render(<App />);
	return user;
}

beforeEach(async () => {
	await resetDb();
	vi.spyOn(window, 'confirm').mockReturnValue(true);
	vi.spyOn(window, 'alert').mockImplementation(() => {});
	window.scrollTo = vi.fn() as never;
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('Finance Tracker app', () => {
	it('shows a welcome screen and loads sample data', async () => {
		const user = renderApp();
		await user.click(await screen.findByRole('button', { name: 'Explore with sample data' }));
		expect(await screen.findByText('Where the money went')).toBeTruthy();
		expect(screen.getByText('Last 6 months')).toBeTruthy();
		expect(screen.getByRole('button', { name: /^Net worth/ })).toBeTruthy();
		expect(screen.getByText('Groceries')).toBeTruthy();
	});

	it('asks for usage consent once and remembers the answer', async () => {
		const user = renderApp();
		await user.click(await screen.findByRole('button', { name: 'No thanks' }));
		await waitFor(() => expect(screen.queryByRole('region', { name: 'Usage sharing' })).toBeNull());
		expect((await db.settings.get('telemetryConsent'))?.value).toBe('denied');
	});

	it('adds and edits a transaction', async () => {
		const user = renderApp('transactions');
		await user.click(await screen.findByRole('button', { name: '+ Add transaction' }));
		await user.type(screen.getByLabelText('Amount'), '12.50');
		await user.type(screen.getByLabelText('Description'), 'Test coffee');
		await user.selectOptions(screen.getByLabelText('Category'), 'Dining');
		await user.click(screen.getByRole('button', { name: 'Add' }));

		const row = (await screen.findByText('Test coffee')).closest('li')!;
		expect(within(row).getByText(/-\$12\.50/)).toBeTruthy();

		await user.click(within(row).getByRole('button', { name: 'Edit Test coffee' }));
		const amount = screen.getByLabelText('Amount');
		await user.clear(amount);
		await user.type(amount, '4');
		await user.click(screen.getByRole('radio', { name: 'Money in' }));
		await user.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(async () => expect((await db.transactions.toArray())[0]?.amountCents).toBe(400));
	});

	it('rejects a transaction with no amount', async () => {
		const user = renderApp('transactions');
		await user.click(await screen.findByRole('button', { name: '+ Add transaction' }));
		await user.type(screen.getByLabelText('Description'), 'Nothing');
		await user.click(screen.getByRole('button', { name: 'Add' }));
		expect(await screen.findByText('Enter an amount, like 12.50.')).toBeTruthy();
		expect(await db.transactions.count()).toBe(0);
	});

	it('applies a category to similar uncategorized transactions', async () => {
		const today = new Date().toISOString().slice(0, 10);
		await db.transactions.bulkAdd([
			{ date: today, description: 'CORNER STORE #12', amountCents: -500, categoryId: null },
			{ date: today, description: 'CORNER STORE #99', amountCents: -700, categoryId: null },
			{ date: today, description: 'Other place', amountCents: -100, categoryId: null },
		] as never);
		const user = renderApp('transactions');

		await user.selectOptions(await screen.findByLabelText('Category for CORNER STORE #12'), 'Groceries');
		expect(await screen.findByText('Also categorized 1 similar transaction.')).toBeTruthy();

		const groceries = (await db.categories.where('name').equals('Groceries').first())!.id;
		const rows = await db.transactions.toArray();
		expect(rows.filter((t) => t.categoryId === groceries)).toHaveLength(2);
		expect(rows.find((t) => t.description === 'Other place')?.categoryId).toBeNull();
	});

	it('imports a bank CSV and skips duplicates on re-import', async () => {
		const user = renderApp('import');
		const csv = 'Date,Description,Amount\n2026-01-03,Coffee shop,-4.50\n2026-01-04,Paycheck,2000.00\n';
		const file = () => new File([csv], 'bank.csv', { type: 'text/csv' });
		const input = () => document.querySelector<HTMLInputElement>('input[type=file]')!;

		await user.upload(input(), file());
		expect(await screen.findByRole('button', { name: 'Import 2 transactions' })).toBeTruthy();
		await user.click(screen.getByRole('button', { name: 'Import 2 transactions' }));
		expect(await screen.findByText('Imported 2 transactions.')).toBeTruthy();
		expect(await db.transactions.count()).toBe(2);

		await user.upload(input(), file());
		expect(await screen.findByText(/2 already imported/)).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Import 0 transactions' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('explains files that are not CSV tables', async () => {
		const user = renderApp('import');
		const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
		await user.upload(input, new File(['just some text'], 'notes.csv', { type: 'text/csv' }));
		expect(await screen.findByText(/Couldn't find a table/)).toBeTruthy();
	});

	it('tracks accounts and net worth', async () => {
		const user = renderApp('networth');
		await user.type(await screen.findByLabelText('Name'), 'Savings');
		await user.click(screen.getByRole('button', { name: 'Add account' }));
		await user.type(await screen.findByLabelText('New balance for Savings'), '1,500');
		await user.click(screen.getByRole('button', { name: 'Save' }));

		await user.type(screen.getByLabelText('Name'), 'Visa');
		await user.selectOptions(screen.getByLabelText('Type'), 'liability');
		await user.click(screen.getByRole('button', { name: 'Add account' }));
		await user.type(await screen.findByLabelText('New balance for Visa'), '400');
		await user.click(screen.getByRole('button', { name: 'Save' }));

		expect(await screen.findByText('Net worth over time')).toBeTruthy();
		await waitFor(() => expect(screen.getAllByText('$1,100.00').length).toBeGreaterThan(0));
	});

	it('renders every tab with sample data without crashing', async () => {
		await loadSampleData();
		const user = renderApp();
		for (const tab of ['Transactions', 'Import', 'Net worth', 'Settings', 'Overview']) {
			await user.click(screen.getByRole('link', { name: tab }));
			await waitFor(() => expect(screen.getByRole('link', { name: tab }).getAttribute('aria-current')).toBe('page'));
		}
		expect(await screen.findByText('Where the money went')).toBeTruthy();
	});
});

describe('installing', () => {
	it('opens the install screen with the required notice from the website’s Install link', async () => {
		window.history.replaceState(null, '', '/projects/finance-tracker/app/?install=1');
		const user = userEvent.setup();
		render(<App />);
		const dialog = screen.getByRole('dialog', { name: 'Install Finance Tracker' });
		expect(dialog.textContent).toMatch(/Install counting is required/);
		expect(window.location.search).toBe('');
		await user.keyboard('{Escape}');
		expect(screen.queryByRole('dialog')).toBeNull();
		await user.click(screen.getByRole('button', { name: 'Install app' }));
		expect(screen.getByRole('dialog', { name: 'Install Finance Tracker' })).toBeTruthy();
	});
});
