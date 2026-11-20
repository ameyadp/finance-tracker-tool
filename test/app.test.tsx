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
	localStorage.removeItem('finance-tracker:installed');
	await resetDb();
	// Most tests start past the browser overview screen, as someone who chose "Continue in browser".
	sessionStorage.clear();
	sessionStorage.setItem('finance-tracker:continue-in-browser', '1');
	localStorage.setItem('finance-tracker:registered', '1');
	localStorage.removeItem('finance-tracker:browser-sessions');
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

	it('shows no usage-sharing prompt: counts are required and explained before first use', async () => {
		renderApp();
		await screen.findByRole('main');
		expect(screen.queryByRole('region', { name: 'Usage sharing' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'No thanks' })).toBeNull();
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

describe('overview in the browser', () => {
	it('shows the overview first, and continues to the app when asked', async () => {
		sessionStorage.clear();
		const user = userEvent.setup();
		render(<App />);
		expect(screen.getByRole('heading', { name: 'Finance Tracker', level: 1 })).toBeTruthy();
		expect(screen.getByRole('img', { name: 'Screenshot of Finance Tracker' })).toBeTruthy();
		await user.click(screen.getByRole('button', { name: 'Continue in browser' }));
		expect(await screen.findByRole('button', { name: 'Explore with sample data' })).toBeTruthy();
		expect(sessionStorage.getItem('finance-tracker:continue-in-browser')).toBe('1');
	});

	it('opens the install screen from the overview', async () => {
		sessionStorage.clear();
		localStorage.setItem('finance-tracker:registered', '1');
		const user = userEvent.setup();
		render(<App />);
		await user.click(screen.getByRole('button', { name: 'Install app' }));
		expect(screen.getByRole('dialog', { name: 'Install Finance Tracker' }).textContent).toMatch(/Usage counting is required/);
	});
});

describe('installing', () => {
	it('opens the install screen with the required notice from the website’s Install link', async () => {
		localStorage.setItem('finance-tracker:registered', '1');
		window.history.replaceState(null, '', '/projects/finance-tracker/app/?install=1');
		const user = userEvent.setup();
		render(<App />);
		const dialog = screen.getByRole('dialog', { name: 'Install Finance Tracker' });
		expect(dialog.textContent).toMatch(/Usage counting is required/);
		expect(window.location.search).toBe('');
		await user.keyboard('{Escape}');
		expect(screen.queryByRole('dialog')).toBeNull();
		await user.click(screen.getByRole('button', { name: 'Install app' }));
		expect(screen.getByRole('dialog', { name: 'Install Finance Tracker' })).toBeTruthy();
	});
});

describe('install sign-up', () => {
	afterEach(() => {
		localStorage.removeItem('finance-tracker:registered');
		// @ts-expect-error test cleanup of a jsdom gap
		delete window.matchMedia;
	});

	it('asks for name, email and location before install instructions', async () => {
		localStorage.removeItem('finance-tracker:registered');
		const posted: unknown[] = [];
		vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
			if (String(url).endsWith('/api/register')) {
				posted.push(JSON.parse(String(init?.body)));
				return Response.json({ ok: true }, { status: 201 });
			}
			return new Response(null, { status: 204 });
		}));
		window.history.replaceState(null, '', '/projects/finance-tracker/app/?install=1');
		const user = userEvent.setup();
		render(<App />);
		const dialog = screen.getByRole('dialog', { name: 'Install Finance Tracker' });
		expect(dialog.textContent).toMatch(/Step 1 of 2/);
		expect(dialog.textContent).toMatch(/support@ameyapurandare.com/);
		await user.type(screen.getByLabelText('Name'), 'Ada Lovelace');
		await user.type(screen.getByLabelText('Email'), 'ada@example.com');
		await user.type(screen.getByLabelText('Location'), 'London, UK');
		await user.click(screen.getByRole('button', { name: 'Continue to install' }));
		expect(await screen.findByText(/Usage counting is required/)).toBeTruthy();
		expect(posted).toEqual([{ name: 'Ada Lovelace', email: 'ada@example.com', location: 'London, UK', website: '' }]);
		expect(localStorage.getItem('finance-tracker:registered')).toBe('1');
		vi.unstubAllGlobals();
	});

	it('shows sign-up errors from the server', async () => {
		localStorage.removeItem('finance-tracker:registered');
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Please enter a valid email address.' }, { status: 400 })));
		window.history.replaceState(null, '', '/projects/finance-tracker/app/?install=1');
		const user = userEvent.setup();
		render(<App />);
		await user.type(screen.getByLabelText('Name'), 'Ada');
		await user.type(screen.getByLabelText('Email'), 'ada@x.io');
		await user.type(screen.getByLabelText('Location'), 'London');
		await user.click(screen.getByRole('button', { name: 'Continue to install' }));
		expect((await screen.findByRole('alert')).textContent).toMatch(/valid email/);
		expect(localStorage.getItem('finance-tracker:registered')).toBeNull();
		vi.unstubAllGlobals();
	});

	it('blocks the installed app until the person signs up on this device', async () => {
		localStorage.removeItem('finance-tracker:registered');
		window.matchMedia = ((q: string) => ({ matches: q.includes('standalone'), media: q, addEventListener() {}, removeEventListener() {} })) as never;
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true }, { status: 201 })));
		const user = userEvent.setup();
		render(<App />);
		expect(screen.getByRole('heading', { name: 'Welcome to Finance Tracker' })).toBeTruthy();
		await user.type(screen.getByLabelText('Name'), 'Ada');
		await user.type(screen.getByLabelText('Email'), 'ada@example.com');
		await user.type(screen.getByLabelText('Location'), 'London');
		await user.click(screen.getByRole('button', { name: 'Start using the app' }));
		await waitFor(() => expect(screen.queryByRole('heading', { name: 'Welcome to Finance Tracker' })).toBeNull());
		vi.unstubAllGlobals();
	});
});

describe('browser trial', () => {
	const newTab = () => {
		cleanup();
		sessionStorage.clear();
		sessionStorage.setItem('finance-tracker:continue-in-browser', '1');
	};

	beforeEach(() => {
		localStorage.removeItem('finance-tracker:registered');
		localStorage.removeItem('finance-tracker:browser-sessions');
	});

	it('counts one session per tab visit, not per reload', () => {
		newTab();
		render(<App />);
		expect(screen.getByRole('region', { name: 'Free trial' }).textContent).toMatch(/Free browser session 1 of 3/);
		cleanup();
		render(<App />); // reload in the same tab
		expect(screen.getByRole('region', { name: 'Free trial' }).textContent).toMatch(/session 1 of 3/);
		newTab();
		render(<App />);
		expect(screen.getByRole('region', { name: 'Free trial' }).textContent).toMatch(/session 2 of 3/);
		expect(localStorage.getItem('finance-tracker:browser-sessions')).toBe('2');
	});

	it('counts the session when continuing from the overview', async () => {
		cleanup();
		sessionStorage.clear();
		const user = userEvent.setup();
		render(<App />);
		await user.click(screen.getByRole('button', { name: 'Continue in browser' }));
		expect(screen.getByRole('region', { name: 'Free trial' }).textContent).toMatch(/session 1 of 3/);
	});

	it('requires sign-up on the 4th session, then lets the person in', async () => {
		localStorage.setItem('finance-tracker:browser-sessions', '3');
		vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true }, { status: 201 })));
		newTab();
		const user = userEvent.setup();
		render(<App />);
		expect(screen.getByRole('heading', { name: 'You’ve used your 3 free sessions' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Install the app instead' })).toBeTruthy();
		await user.type(screen.getByLabelText('Name'), 'Ada');
		await user.type(screen.getByLabelText('Email'), 'ada@example.com');
		await user.type(screen.getByLabelText('Location'), 'London');
		await user.click(screen.getByRole('button', { name: 'Keep using Finance Tracker' }));
		await waitFor(() => expect(screen.queryByRole('heading', { name: 'You’ve used your 3 free sessions' })).toBeNull());
		expect(screen.queryByRole('region', { name: 'Free trial' })).toBeNull();
		vi.unstubAllGlobals();
	});

	it('lets people sign up early from the banner, or decline for now', async () => {
		newTab();
		const user = userEvent.setup();
		render(<App />);
		await user.click(screen.getByRole('button', { name: 'Sign up' }));
		expect(screen.getByRole('heading', { name: 'Sign up for Finance Tracker' })).toBeTruthy();
		await user.click(screen.getByRole('button', { name: 'Not now' }));
		expect(screen.getByRole('region', { name: 'Free trial' })).toBeTruthy();
	});

	it('never counts or limits a signed-up device', () => {
		localStorage.setItem('finance-tracker:registered', '1');
		localStorage.setItem('finance-tracker:browser-sessions', '7');
		newTab();
		render(<App />);
		expect(screen.queryByRole('region', { name: 'Free trial' })).toBeNull();
		expect(screen.queryByRole('heading', { name: 'You’ve used your 3 free sessions' })).toBeNull();
		expect(localStorage.getItem('finance-tracker:browser-sessions')).toBe('7');
	});
});
