// Overview shown when the app is opened in a browser tab (not installed):
// what it does, a screenshot, and a nudge to install for regular use.

const FEATURES: { title: string; text: string }[] = [
	{ title: 'Monthly overview', text: 'Income, spending and savings each month, where the money went, and a 6-month trend.' },
	{ title: 'Import from your bank', text: 'Drop in a CSV export. Columns are detected, duplicates skipped, and your categories remembered.' },
	{ title: 'Net worth over time', text: 'Track what you own and owe, update balances, and watch the trend.' },
	{ title: 'Private by design', text: 'No accounts, no cloud, no bank logins. Everything stays on this device, with backup and restore.' },
];

export function AppIntro({ onInstall, onContinue }: { onInstall: () => void; onContinue: () => void }) {
	return (
		<div className="intro-page">
			<header className="intro-head">
				<img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={56} height={56} />
				<div>
					<h1>Finance Tracker</h1>
					<p className="intro-tagline">Track spending and net worth privately. Your data never leaves your device.</p>
				</div>
			</header>

			<div className="intro-actions">
				<button type="button" className="intro-primary" onClick={onInstall}>
					Install app
				</button>
				<button type="button" className="intro-secondary" onClick={onContinue}>
					Continue in browser
				</button>
			</div>
			<p className="intro-why">
				Installing is the best way to use it regularly: it opens in its own window from your dock, start menu or home screen, and
				works offline. Free, no sign-up.
			</p>

			<img
				className="intro-shot"
				src={`${import.meta.env.BASE_URL}overview.webp`}
				alt="Screenshot of Finance Tracker"
				width={1100}
				height={760}
			/>

			<ul className="intro-features">
				{FEATURES.map((f) => (
					<li key={f.title}>
						<strong>{f.title}</strong>
						<span>{f.text}</span>
					</li>
				))}
			</ul>

			<p className="intro-foot">🔒 Your financial data is stored only on your device. Installs and app opens are counted anonymously (no ID, none of your data).</p>
		</div>
	);
}
