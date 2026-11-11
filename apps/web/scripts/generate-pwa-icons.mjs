// Generates the installable-app icons in public/icons from the site logo (app/icon.svg).
// Run after changing the logo: `node scripts/generate-pwa-icons.mjs` (from apps/web).
//  - icon-192 / icon-512: the logo as it is (rounded tile), purpose "any".
//  - maskable-512: full-bleed background with the mark inside the 80% safe zone, purpose "maskable".
//  - apple-touch-icon (180): full-bleed square; iOS rounds the corners itself.
//  - badge-96: the mark alone in white on transparent, for the Android status bar.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logo = readFileSync(path.join(root, 'app', 'icon.svg'), 'utf8');
const out = path.join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });

const defs = logo.match(/<defs>[\s\S]*?<\/defs>/)?.[0] ?? '';
const mark = logo.match(/<g [\s\S]*<\/g>/)?.[0];
if (!mark) throw new Error('app/icon.svg has no <g> mark to reuse');
// The mark is drawn in a 24-unit box placed at (4, 4) of the 32-unit logo.
const markInner = mark.replace(/^<g transform="translate\(4 4\)"/, '<g');

function fullBleed(scale) {
  const size = 24 * scale;
  const offset = (32 - size) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${defs}<rect width="32" height="32" fill="url(#g)"/><g transform="translate(${offset} ${offset}) scale(${scale})">${markInner}</g></svg>`;
}

const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${markInner}</svg>`;

async function render(svg, size, file) {
  await sharp(Buffer.from(svg), { density: 2400 }).resize(size, size).png().toFile(path.join(out, file));
  console.log(`wrote public/icons/${file}`);
}

await render(logo, 192, 'icon-192.png');
await render(logo, 512, 'icon-512.png');
await render(fullBleed(0.75), 512, 'maskable-512.png');
await render(fullBleed(0.85), 180, 'apple-touch-icon.png');
// Next links app/apple-icon.png as the page's apple-touch-icon.
copyFileSync(path.join(out, 'apple-touch-icon.png'), path.join(root, 'app', 'apple-icon.png'));
await render(badge, 96, 'badge-96.png');
