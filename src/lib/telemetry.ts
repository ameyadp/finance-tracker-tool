import { db, getSetting, setSetting } from './db';
import { todayISO } from './dates';

// Anonymous usage counting.
//
// Installs and app opens are always counted: the app sends "install", the app version, and a
// one-off random number that isn't stored, so it can't be linked to anything else.
//
// Also required to use the app (shown before first use): a random ID kept on this device, the event name,
// and the app version, with at most one "active" ping per day.
//
// Never any financial data, names, or amounts.

export type Consent = 'granted' | 'denied';
export type TelemetryEvent = 'active' | 'install' | 'opt_in' | 'open_app' | 'open_web' | 'trial_ended';

const PING_URL = `${import.meta.env.BASE_URL}api/ping`;

/** Usage counts are required to use the app, so consent is always granted. */
export const getConsent = async (): Promise<Consent | null> => 'granted';

async function anonId(): Promise<string> {
	let id = await getSetting<string | null>('anonId', null);
	if (!id) {
		id = crypto.randomUUID();
		await setSetting('anonId', id);
	}
	return id;
}

async function post(event: TelemetryEvent, id: string): Promise<boolean> {
	if (import.meta.env.DEV) return false;
	try {
		const res = await fetch(PING_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, event, v: __APP_VERSION__ }),
			keepalive: true,
		});
		return res.ok;
	} catch {
		return false; // Offline or blocked: usage counting is best-effort.
	}
}

const send = async (event: TelemetryEvent) => post(event, await anonId());

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

/** Record that the app was opened today (once per day). */
export async function pingActive(): Promise<void> {
	const today = todayISO();
	if ((await getSetting<string | null>('lastPingDay', null)) === today) return;
	// First daily count from this device: also count it as a new device.
	if (!(await getSetting<string | null>('anonId', null))) await send('opt_in');
	if (await send('active')) await setSetting('lastPingDay', today);
}

const INSTALL_COUNTED = 'finance-tracker:install-counted';

/** Count an install, once per device. Always sent, without the device's ID. */
export async function pingInstall(): Promise<void> {
	try {
		if (localStorage.getItem(INSTALL_COUNTED)) return;
	} catch {
		// storage unavailable: still count
	}
	if (await post('install', crypto.randomUUID())) {
		try {
			localStorage.setItem(INSTALL_COUNTED, '1');
		} catch {
			// ignore
		}
	}
}

const OPEN_COUNTED = 'finance-tracker:open-counted';

/** Count one app open per session (installed app or browser tab). Always sent, without the device's ID. */
export async function pingOpen(installed: boolean): Promise<void> {
	try {
		if (sessionStorage.getItem(OPEN_COUNTED)) return;
		sessionStorage.setItem(OPEN_COUNTED, '1');
	} catch {
		// storage unavailable: still count
	}
	await post(installed ? 'open_app' : 'open_web', crypto.randomUUID());
}

const TRIAL_END_COUNTED = 'finance-tracker:trial-end-counted';

/** Count a browser reaching the end of its free trial, once per device. Always sent, without the device's ID. */
export async function pingTrialEnded(): Promise<void> {
	try {
		if (localStorage.getItem(TRIAL_END_COUNTED)) return;
	} catch {
		// storage unavailable: still count
	}
	if (await post('trial_ended', crypto.randomUUID())) {
		try {
			localStorage.setItem(TRIAL_END_COUNTED, '1');
		} catch {
			// ignore
		}
	}
}
