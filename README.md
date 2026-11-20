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

Usage counting is anonymous:

- **Installs and opens are always counted.** The app sends `install` (once per device) or `open_app` / `open_web` (once per session, installed app vs. browser tab), the app version and a one-off random number that isn't stored, so a count can't be linked to anything else.
- **Everything else is opt-in.** The app sends a random ID kept on the device, the app version and an event (`opt_in`, or `active` at most once a day). Users choose on first launch and can change it in Settings.

It never sends amounts, descriptions, account names or any other financial data.

## Install sign-up

Installing the app requires a one-time sign-up on that device: **name, email and location only**, typed by the person. It appears on the install screen, or on the installed app's first launch if it was installed from the browser's own menu. In a browser tab, people get **3 free sessions** first: a session is one visit in a tab (reloads don't count), counted only in that browser and never sent anywhere. After the third, the sign-up is required to keep using the browser version. Signed-up devices are never counted.

- `POST api/register` validates the three fields, rate-limits per visitor, and ignores anything else. No IP address is stored.
- Rows live in the `registrations` table of this app's D1 database, one per email (signing up again updates name and location).
- The form states the purpose (understanding who uses the app, occasional emails about major updates) and that people can email support@ameyapurandare.com to see or delete their data.
- To view sign-ups from both apps, run `npm run signups` in the website repo, or open ameyapurandare.com/admin/signups (protected by Cloudflare Access).

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
npm run stats   # includes app opens per day (installed vs browser) -- --local
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
