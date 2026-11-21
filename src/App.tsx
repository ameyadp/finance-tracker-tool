import { useEffect, useState } from 'react';
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
import { continueInBrowser, installNoticeSeen, isStandalone, shouldShowIntro, takeInstallRequest, installLabel } from './lib/install';
import { SiteNav } from './components/SiteNav';
import { useInstalled } from './lib/useInstalled';
import { pingTrialEnded } from './lib/telemetry';

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


export default function App() {
	const installed = useInstalled();
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
					onInstall={gate === 'installed' || installed ? undefined : () => setInstallOpen(true)}
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
			<SiteNav />
			<header className="topbar">
				<div className="brand">
					<img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={28} height={28} />
					<span>Finance Tracker</span>
				</div>
				{!installed && (
					<button type="button" className="secondary small" onClick={() => setInstallOpen(true)}>
						{installLabel()}
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
					<TrialBanner session={trialSession} total={TRIAL_SESSIONS} onSignUp={() => setGate('voluntary')} onInstall={installed ? undefined : () => setInstallOpen(true)} />
				)}
				{showInstalledNotice && <InstalledNotice onClose={() => setShowInstalledNotice(false)} />}
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
