import { describe, expect, it } from 'vitest';
import worker from '../worker/index';

const BASE = 'https://ameyapurandare.com/projects/finance-tracker/app';

// Fake static files: "/" and anything under /assets/app exist; everything else is missing.
const env = {
	DB: {} as never,
	REGISTER_LIMITER: { limit: async () => ({ success: true }) } as never,
	ASSETS: {
		fetch: async (r: Request) => {
			const p = new URL(r.url).pathname;
			if (p === '/index.html' || p === '/folder') return new Response(null, { status: 307, headers: { Location: p === '/folder' ? '/folder/' : '/' } });
			return p === '/' || p.startsWith('/assets/app') ? new Response(`asset:${p}`) : new Response('missing', { status: 404 });
		},
	} as never,
};

const call = (path: string) => worker.fetch(new Request(`${BASE}${path}`) as never, env) as Promise<Response>;

describe('worker routing', () => {
	it('serves app files with the URL prefix stripped', async () => {
		expect(await (await call('/')).text()).toBe('asset:/');
		expect(await (await call('/assets/app.js')).text()).toBe('asset:/assets/app.js');
		expect((await call('')).status).toBe(301);
	});

	it('serves index.html as the app page and keeps redirects inside the app', async () => {
		const index = await call('/index.html');
		expect(index.status).toBe(200);
		expect(await index.text()).toBe('asset:/');
		const redirect = await call('/folder');
		expect(redirect.status).toBe(307);
		expect(redirect.headers.get('Location')).toBe(`${BASE}/folder/`);
	});

	it('shows the app for unknown page addresses but 404s for missing files', async () => {
		expect(await (await call('/some/page')).text()).toBe('asset:/');
		expect((await call('/assets/index-OLDHASH.js')).status).toBe(404);
	});
});
