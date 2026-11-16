import { db, getSetting, setSetting } from './db';
import { todayISO } from './dates';

// Anonymous, opt-in usage counting.
//
// What is sent (only if the user opts in): a random ID created on this device,
// the event name, and the app version. Never any financial data, names, or
// amounts. At most one "active" ping per day.

export type Consent = 'granted' | 'denied';
export type TelemetryEvent = 'active' | 'install' | 'opt_in';

const PING_URL = `${import.meta.env.BASE_URL}api/ping`;

export const getConsent = () => getSetting<Consent | null>('telemetryConsent', null);

async function anonId(): Promise<string> {
	let id = await getSetting<string | null>('anonId', null);
	if (!id) {
		id = crypto.randomUUID();
		await setSetting('anonId', id);
	}
	return id;
}

async function send(event: TelemetryEvent): Promise<boolean> {
	if (import.meta.env.DEV) return false;
	try {
		const res = await fetch(PING_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: await anonId(), event, v: __APP_VERSION__ }),
			keepalive: true,
		});
		return res.ok;
	} catch {
		return false; // Offline or blocked: usage counting is best-effort.
	}
}

export async function setConsent(consent: Consent): Promise<void> {
	await setSetting('telemetryConsent', consent);
	if (consent === 'granted') {
		await send('opt_in');
		await pingActive();
	} else {
		// Forget the ID so a later opt-in starts fresh.
		await db.settings.delete('anonId');
		await db.settings.delete('lastPingDay');
	}
}

/** Record that the app was opened today (once per day, only with consent). */
export async function pingActive(): Promise<void> {
	if ((await getConsent()) !== 'granted') return;
	const today = todayISO();
	if ((await getSetting<string | null>('lastPingDay', null)) === today) return;
	if (await send('active')) await setSetting('lastPingDay', today);
}

export async function pingInstall(): Promise<void> {
	if ((await getConsent()) === 'granted') await send('install');
}
