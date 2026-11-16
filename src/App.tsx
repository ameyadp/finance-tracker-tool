import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Import } from './components/Import';
import { NetWorth } from './components/NetWorth';
import { Overview } from './components/Overview';
import { Settings } from './components/Settings';
import { Transactions } from './components/Transactions';
import { getConsent, setConsent } from './lib/telemetry';

const TABS = [
	{ id: 'overview', label: 'Overview' },
	{ id: 'transactions', label: 'Transactions' },
	{ id: 'import', label: 'Import' },
	{ id: 'networth', label: 'Net worth' },
	{ id: 'settings', label: 'Settings' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const tabFromHash = (): TabId => {
	const id = window.location.hash.slice(1);
	return (TABS.find((t) => t.id === id)?.id ?? 'overview') as TabId;
};

interface InstallPromptEvent extends Event {
	prompt: () => Promise<void>;
}

function ConsentBanner() {
	return (
		<aside className="banner" role="region" aria-label="Usage sharing">
			<p>
				<strong>Help decide if this app is worth building further?</strong> Share an anonymous daily “app opened” count.
				No financial data, ever. You can change this in Settings.
			</p>
			<div className="actions">
				<button type="button" onClick={() => void setConsent('granted')}>
					Share anonymous counts
				</button>
				<button type="button" className="secondary" onClick={() => void setConsent('denied')}>
					No thanks
				</button>
			</div>
		</aside>
	);
}

export default function App() {
	const [tab, setTab] = useState<TabId>(tabFromHash);
	const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
	const consent = useLiveQuery(getConsent, [], undefined);

	useEffect(() => {
		const onHash = () => setTab(tabFromHash());
		const onPrompt = (e: Event) => {
			e.preventDefault();
			setInstallPrompt(e as InstallPromptEvent);
		};
		const onInstalled = () => setInstallPrompt(null);
		window.addEventListener('hashchange', onHash);
		window.addEventListener('beforeinstallprompt', onPrompt);
		window.addEventListener('appinstalled', onInstalled);
		return () => {
			window.removeEventListener('hashchange', onHash);
			window.removeEventListener('beforeinstallprompt', onPrompt);
			window.removeEventListener('appinstalled', onInstalled);
		};
	}, []);

	const go = (id: string) => {
		window.location.hash = id;
		window.scrollTo({ top: 0 });
	};

	return (
		<div className="app">
			<header className="topbar">
				<div className="brand">
					<img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={28} height={28} />
					<span>Finance Tracker</span>
				</div>
				{installPrompt && (
					<button
						type="button"
						className="secondary small"
						onClick={() => {
							void installPrompt.prompt();
							setInstallPrompt(null);
						}}
					>
						Install app
					</button>
				)}
			</header>

			<nav className="tabs" aria-label="Sections">
				{TABS.map((t) => (
					<a key={t.id} href={`#${t.id}`} aria-current={tab === t.id ? 'page' : undefined}>
						{t.label}
					</a>
				))}
			</nav>

			<main>
				{consent === null && <ConsentBanner />}
				{tab === 'overview' && <Overview go={go} />}
				{tab === 'transactions' && <Transactions />}
				{tab === 'import' && <Import go={go} />}
				{tab === 'networth' && <NetWorth />}
				{tab === 'settings' && <Settings />}
			</main>

			<footer className="foot">🔒 Your data stays on this device.</footer>
		</div>
	);
}
