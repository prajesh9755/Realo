/**
 * Placeholder store photos: a to-scale silhouette per product so the store reads
 * correctly before real product photography exists. Replace with real photos when available.
 *
 *   node scripts/make-placeholder-photos.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(resolve(root, 'src/data/products.json'), 'utf8'));

const outDir = resolve(root, 'public/photos');
mkdirSync(outDir, { recursive: true });

// Tallest product sets the scale so silhouettes are comparable across the grid.
const maxCm = Math.max(...data.products.map((p) => p.dims_cm.h));

for (const product of data.products) {
  const { w, h } = product.dims_cm;
  const box = 400;
  const pad = 46;
  const usable = box - pad * 2;
  const pxPerCm = usable / maxCm;

  const dh = h * pxPerCm;
  const dw = Math.min(w * pxPerCm, usable);
  const x = (box - dw) / 2;
  const y = box - pad - dh;
  // Light palette from UI SCREENS/04-color-library.png — these sit on #F3F5F7 tiles.
  const ink = '#141718';
  const muted = '#6C7275';
  const line = '#E8ECEF';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${box}" height="${box}" role="img" aria-label="${esc(product.name)}">
  <rect width="${box}" height="${box}" fill="#F3F5F7"/>
  <line x1="${pad * 0.6}" y1="${box - pad}" x2="${box - pad * 0.6}" y2="${box - pad}" stroke="${line}" stroke-width="1.5"/>
  <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${dw.toFixed(1)}" height="${dh.toFixed(1)}" rx="2"
        fill="#FFFFFF" stroke="${ink}" stroke-width="1.5"/>
  <text x="${box / 2}" y="${box - pad + 23}" fill="${muted}" font-family="Poppins,sans-serif" font-size="13" text-anchor="middle">${w} × ${h} × ${product.dims_cm.d} cm</text>
  <text x="${box / 2}" y="${(y + dh / 2 + 5).toFixed(1)}" fill="${ink}" font-family="Poppins,sans-serif" font-size="14" font-weight="500" text-anchor="middle">${esc(product.name)}</text>
</svg>
`;

  const file = product.photo.replace(/^\/photos\//, '');
  writeFileSync(resolve(outDir, file), svg, 'utf8');
  console.log(`wrote ${file}`);
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
