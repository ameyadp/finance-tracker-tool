import { describe, expect, it } from 'vitest';
import { FinanceDB } from '../src/lib/db';
import { createBackup, restoreBackup, validateBackup } from '../src/lib/backup';
import { parsePing } from '../worker/ping';

const freshDb = async () => {
	const db = new FinanceDB(`test-${crypto.randomUUID()}`);
	await db.open();
	return db;
};

describe('backup', () => {
	it('restores an exported backup exactly, replacing existing data', async () => {
		const source = await freshDb();
		const accountId = await source.accounts.add({ name: 'Checking', kind: 'asset' } as never);
		await source.snapshots.add({ accountId, date: '2026-01-31', balanceCents: 123456 } as never);
		await source.transactions.add({ date: '2026-01-02', description: 'Rent', amountCents: -150000, categoryId: 3 } as never);
		await source.settings.put({ key: 'currency', value: 'EUR' });

		const backup = await createBackup(source);
		const fromFile = validateBackup(JSON.parse(JSON.stringify(backup)));

		const target = await freshDb();
		await target.transactions.add({ date: '2020-01-01', description: 'old', amountCents: 1, categoryId: null } as never);
		await restoreBackup(fromFile, target);

		expect(await target.transactions.toArray()).toEqual(await source.transactions.toArray());
		expect(await target.accounts.toArray()).toEqual(await source.accounts.toArray());
		expect(await target.snapshots.toArray()).toEqual(await source.snapshots.toArray());
		expect(await target.categories.toArray()).toEqual(await source.categories.toArray());
		expect((await target.settings.get('currency'))?.value).toBe('EUR');
	});

	it('rejects files that are not valid backups', async () => {
		const good = JSON.parse(JSON.stringify(await createBackup(await freshDb())));

		expect(() => validateBackup({ hello: 'world' })).toThrow("isn't a Finance Tracker backup");
		expect(() => validateBackup({ ...good, version: 99 })).toThrow('newer version');

		const badAmount = structuredClone(good);
		badAmount.data.transactions = [{ id: 1, date: '2026-01-01', description: 'x', amountCents: 1.5, categoryId: null }];
		expect(() => validateBackup(badAmount)).toThrow('invalid entry in transactions');

		const orphan = structuredClone(good);
		orphan.data.snapshots = [{ id: 1, accountId: 42, date: '2026-01-01', balanceCents: 1 }];
		expect(() => validateBackup(orphan)).toThrow('invalid entry in snapshots');
	});
});

describe('parsePing', () => {
	const id = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';

	it('accepts exactly what the app sends', () => {
		expect(parsePing({ id, event: 'active', v: '0.1.0' })).toEqual({ id, event: 'active', version: '0.1.0' });
	});

	it.each([
		[null],
		['active'],
		[{ id: 'not-a-uuid', event: 'active', v: '0.1.0' }],
		[{ id, event: 'purchase', v: '0.1.0' }],
		[{ id, event: 'active', v: '<script>' }],
		[{ id, event: 'active' }],
	])('rejects %j', (body) => {
		expect(parsePing(body)).toBeNull();
	});
});
