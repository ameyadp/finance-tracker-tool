// Generate the PNG app icons from public/icon.svg.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url));
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname;

await sharp(svg).resize(192, 192).png().toFile(out('icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(out('icon-512.png'));
await sharp(svg).resize(180, 180).png().toFile(out('apple-touch-icon.png'));

// Maskable icons need a safe zone: shrink the artwork onto a full-bleed background.
const inner = await sharp(svg).resize(400, 400).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#1f6f5c' } })
	.composite([{ input: inner, gravity: 'center' }])
	.png()
	.toFile(out('icon-512-maskable.png'));

console.log('Icons written to public/');
