/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { BASE_PATH } from './worker/base';

export default defineConfig({
	base: BASE_PATH,
	define: {
		__APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
	},
	plugins: [
		react(),
		VitePWA({
			registerType: 'autoUpdate',
			includeAssets: ['icon.svg', 'apple-touch-icon.png'],
			manifest: {
				name: 'Finance Tracker',
				short_name: 'Finance',
				description: 'Track spending and net worth privately. Your data never leaves your device.',
				theme_color: '#1f6f5c',
				background_color: '#ffffff',
				display: 'standalone',
				start_url: BASE_PATH,
				scope: BASE_PATH,
				id: BASE_PATH,
				icons: [
					{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
					{ src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
				],
			},
			workbox: {
				// The usage ping must always go to the network, never the offline cache.
				navigateFallbackDenylist: [/\/api\//],
			},
		}),
	],
	test: {
		environment: 'node',
		setupFiles: ['fake-indexeddb/auto'],
	},
});
