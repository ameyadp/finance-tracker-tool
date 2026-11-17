import { BASE_PATH } from './base';
import { parsePing } from './ping';

// Serves the app's static files under BASE_PATH, plus one endpoint that records
// anonymous, opt-in usage pings. No financial data ever reaches this Worker.
//
// Requests arrive from the ameyapurandare.com Worker, which forwards everything
// under BASE_PATH here via a service binding.

interface Env {
	DB: D1Database;
	ASSETS: Fetcher;
}

const MAX_BODY_BYTES = 512;
const BASE_NO_SLASH = BASE_PATH.slice(0, -1);

async function handlePing(request: Request, env: Env): Promise<Response> {
	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return new Response(null, { status: 400 });
	}

	const ping = parsePing(body);
	if (!ping) return new Response(null, { status: 400 });

	const day = new Date().toISOString().slice(0, 10);
	// One row per device, event and day: repeated pings on the same day are ignored.
	await env.DB.prepare('INSERT OR IGNORE INTO events (day, event, anon_id, version) VALUES (?, ?, ?, ?)')
		.bind(day, ping.event, ping.id, ping.version)
		.run();

	return new Response(null, { status: 204 });
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		// "/projects/finance-tracker/app" → "/projects/finance-tracker/app/"
		if (url.pathname === BASE_NO_SLASH) {
			url.pathname = BASE_PATH;
			return Response.redirect(url.toString(), 301);
		}
		if (!url.pathname.startsWith(BASE_PATH)) return new Response('Not found', { status: 404 });

		const path = url.pathname.slice(BASE_NO_SLASH.length); // e.g. "/assets/index.js"

		if (path === '/api/ping') {
			if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
			return handlePing(request, env);
		}
		if (path.startsWith('/api/')) return new Response(null, { status: 404 });

		// The built files sit at the root of dist/, so strip the prefix before looking them up.
		// The app's page is served at its folder; asking for index.html explicitly would
		// otherwise redirect to "/", which the browser resolves to the website's homepage.
		url.pathname = path === '/index.html' ? '/' : path;
		const asset = await env.ASSETS.fetch(new Request(url, request));

		// Keep any redirect from the static files inside the app's path.
		const location = asset.headers.get('Location');
		if (asset.status >= 300 && asset.status < 400 && location) {
			const target = new URL(location, url);
			if (target.origin === url.origin && !target.pathname.startsWith(BASE_PATH)) {
				target.pathname = BASE_NO_SLASH + target.pathname;
				const headers = new Headers(asset.headers);
				headers.set('Location', target.toString());
				return new Response(null, { status: asset.status, headers });
			}
			return asset;
		}

		// Unknown page addresses show the app; unknown files (e.g. an old script) stay a 404.
		if (asset.status === 404 && !/\.[a-z0-9]+$/i.test(path)) {
			url.pathname = '/';
			return env.ASSETS.fetch(new Request(url, request));
		}
		return asset;
	},
} satisfies ExportedHandler<Env>;
