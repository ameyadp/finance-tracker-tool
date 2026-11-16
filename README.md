# Finance Tracker

A private, offline-first finance tracker. Install it from the browser like an app; all your data stays on your device.

- **Monthly overview:** income, spending and savings, spending by category, and a 6-month trend.
- **Transactions:** add, edit, search and categorize. Categorizing one transaction also categorizes similar uncategorized ones.
- **Bank CSV import:** works with most bank and card exports. Columns and date formats are detected automatically, and re-importing an overlapping file skips rows you already have. Categories you've used before are applied automatically.
- **Net worth:** track assets and liabilities, update balances over time, and chart your net worth.
- **Backup & restore:** export everything to a JSON file and restore it on any device.
- **Works offline** and installs on desktop and mobile.

## Privacy

There are no accounts, no cloud sync, and no bank logins. Your transactions and balances are stored in your browser's IndexedDB and never leave your device.

The app can optionally send an **anonymous, opt-in** usage count: a random ID generated on the device, the app version, and an event name (`opt_in`, `active` at most once a day, or `install`). It never sends amounts, descriptions, account names or any other financial data. Users choose on first launch and can change it in Settings.

## Development

```bash
npm install
npm run dev      # app at http://localhost:5173/projects/finance-tracker/app/ (usage pings are disabled in dev)
npm test         # unit + UI tests
npm run build    # type-check and production build into dist/
```

To run the production build together with the usage-ping Worker and a local database:

```bash
npx wrangler d1 migrations apply finance-tracker-telemetry --local
npm run build && npx wrangler dev
npm run stats -- --local
```

## Deploying to Cloudflare

The app is served by a Cloudflare Worker: static files for the app, plus `POST /api/ping` storing usage counts in a D1 database.

One-time setup:

```bash
npx wrangler d1 create finance-tracker-telemetry   # copy the database_id into wrangler.jsonc
npm run db:migrate                                 # create the events table
```

Then deploy:

```bash
npm run deploy
```

## Usage numbers

```bash
npm run stats
```

Shows opted-in devices, installs, daily/weekly/monthly active devices, weekly new users, devices that came back in a second week, and active devices per app version.

## Project layout

```
src/lib/        data model, money/date parsing, CSV import, reports, backup, telemetry
src/components/ screens: Overview, Transactions, Import, Net worth, Settings
worker/         Cloudflare Worker: serves the app and records usage pings
migrations/     D1 schema for usage events
test/           unit tests and UI tests (Vitest + Testing Library)
```
