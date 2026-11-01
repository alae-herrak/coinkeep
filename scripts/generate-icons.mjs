/**
 * Renders the PWA icons from public/icon.svg (run: npm run icons).
 * The PNGs are committed, so a normal build doesn't need this script or sharp.
 *
 *   pwa-64x64.png, pwa-192x192.png, pwa-512x512.png   "any" icons (rounded square)
 *   maskable-icon-192x192.png, maskable-icon-512x512.png   full-bleed for Android masks
 *   apple-touch-icon-180x180.png                           full-bleed (iOS rounds it itself)
 *   shortcut-expense-96x96.png, shortcut-paycheck-96x96.png   manifest shortcut icons
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { __iconData as plusIcon } from 'lucide-react/dist/esm/icons/plus.mjs';
import { __iconData as handCoinsIcon } from 'lucide-react/dist/esm/icons/hand-coins.mjs';

const ACCENT = '#4f46e5';
const pub = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));

const source = await readFile(pub('icon.svg'), 'utf8');
// Full-bleed variant: same artwork on a square background (no rounded corners).
const fullBleed = source.replace(/<rect width="512" height="512" rx="112"/, '<rect width="512" height="512"');

async function render(svg, size, file) {
  await sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(pub(file));
  console.log('wrote', file);
}

for (const size of [64, 192, 512]) await render(source, size, `pwa-${size}x${size}.png`);
for (const size of [192, 512]) await render(fullBleed, size, `maskable-icon-${size}x${size}.png`);
await render(fullBleed, 180, 'apple-touch-icon-180x180.png');

/** A lucide glyph, white, centered on an accent circle — the style Android uses for shortcuts. */
function shortcutSvg(icon) {
  const children = icon.node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <circle cx="48" cy="48" r="48" fill="${ACCENT}"/>
  <g transform="translate(24 24) scale(2)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</g>
</svg>`;
}

await render(shortcutSvg(plusIcon), 96, 'shortcut-expense-96x96.png');
await render(shortcutSvg(handCoinsIcon), 96, 'shortcut-paycheck-96x96.png');

await writeFile(pub('favicon.svg'), source);
console.log('wrote favicon.svg');
