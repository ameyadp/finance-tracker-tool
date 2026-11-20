import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AppIntro } from './components/AppIntro';
import { type GateReason, RegistrationGate, TrialBanner } from './components/RegistrationForm';
import { isRegistered } from './lib/registration';
import { TRIAL_SESSIONS, enterBrowserApp } from './lib/trial';
import { Import } from './components/Import';
import { InstallDialog, InstalledNotice } from './components/InstallDialog';
import { NetWorth } from './components/NetWorth';
import { Overview } from './components/Overview';
import { Settings } from './components/Settings';
import { Transactions } from './components/Transactions';
import { continueInBrowser, installNoticeSeen, isStandalone, shouldShowIntro, takeInstallRequest } from './lib/install';
import { getConsent, setConsent, pingTrialEnded } from './lib/telemetry';

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
	const [installOpen, setInstallOpen] = useState(takeInstallRequest);
	const [introOpen, setIntroOpen] = useState(shouldShowIntro);
	// Sign-up gate and browser trial:
	//  - installed app: sign-up required once per device before use
	//  - browser tab: TRIAL_SESSIONS free sessions, then sign-up required
	const [access] = useState(() =>
		isStandalone()
			? { gate: (isRegistered() ? null : 'installed') as GateReason | null, session: null as number | null }
			: shouldShowIntro()
				? { gate: null, session: null }
				: enterBrowserApp(),
	);
	const [gate, setGate] = useState<GateReason | null>(access.gate);
	const [trialSession, setTrialSession] = useState<number | null>(access.session);
	// Anonymous count (once per device) of browsers that used up their free trial.
	useEffect(() => {
		if (gate === 'trial-ended') void pingTrialEnded();
	}, [gate]);
	const finishSignUp = () => {
		setGate(null);
		setTrialSession(null);
	};
	const [showInstalledNotice, setShowInstalledNotice] = useState(() => isStandalone() && !installNoticeSeen());
	const consent = useLiveQuery(getConsent, [], undefined);

	useEffect(() => {
		const onHash = () => setTab(tabFromHash());
		window.addEventListener('hashchange', onHash);
		return () => window.removeEventListener('hashchange', onHash);
	}, []);

	const go = (id: string) => {
		window.location.hash = id;
		window.scrollTo({ top: 0 });
	};

	if (gate) {
		return (
			<>
				<RegistrationGate
					reason={gate}
					onDone={finishSignUp}
					onInstall={gate === 'installed' ? undefined : () => setInstallOpen(true)}
					onCancel={gate === 'voluntary' ? () => setGate(null) : undefined}
				/>
				{installOpen && <InstallDialog onClose={() => setInstallOpen(false)} />}
			</>
		);
	}

	if (introOpen) {
		return (
			<>
				<AppIntro
					onInstall={() => setInstallOpen(true)}
					onContinue={() => {
						continueInBrowser();
						setIntroOpen(false);
						const entry = enterBrowserApp();
						setGate(entry.gate);
						setTrialSession(entry.session);
					}}
				/>
				{installOpen && <InstallDialog onClose={() => setInstallOpen(false)} />}
			</>
		);
	}

	return (
		<div className="app">
			<header className="topbar">
				<div className="brand">
					<img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={28} height={28} />
					<span>Finance Tracker</span>
				</div>
				{!isStandalone() && (
					<button type="button" className="secondary small" onClick={() => setInstallOpen(true)}>
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
				{trialSession !== null && trialSession <= TRIAL_SESSIONS && (
					<TrialBanner session={trialSession} total={TRIAL_SESSIONS} onSignUp={() => setGate('voluntary')} onInstall={() => setInstallOpen(true)} />
				)}
				{showInstalledNotice && <InstalledNotice onClose={() => setShowInstalledNotice(false)} />}
				{consent === null && <ConsentBanner />}
				{tab === 'overview' && <Overview go={go} />}
				{tab === 'transactions' && <Transactions />}
				{tab === 'import' && <Import go={go} />}
				{tab === 'networth' && <NetWorth />}
				{tab === 'settings' && <Settings />}
			</main>

			<footer className="foot">🔒 Your data stays on this device.</footer>
			{installOpen && <InstallDialog onClose={() => setInstallOpen(false)} />}
		</div>
	);
}
