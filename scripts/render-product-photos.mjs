/**
 * Renders each product .glb to a PNG for the store cards, using model-viewer in
 * headless Chromium. Better than stock photography here: the card shows exactly
 * the model the user will place in AR, so the listing cannot misrepresent it.
 *
 *   npm run dev          (in another terminal - the page loads models over http)
 *   npm run photos
 *
 * Requires playwright (npm i -D playwright && npx playwright install chromium).
 * Re-run whenever a model or its declared dimensions change.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(`${ROOT}/src/data/products.json`, 'utf8'));
const SIZE = 900;

const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 2 });
page.on('console', m => { if (m.type()==='error') console.log('  [console]', m.text().slice(0,120)); });

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.4.0/dist/model-viewer.min.js', type: 'module' });
await page.waitForFunction(() => !!customElements.get('model-viewer'), null, { timeout: 60000 });

for (const p of data.products) {
  const out = `${ROOT}/public/photos/${p.id}.png`;
  const ok = await page.evaluate(async ({ model, size }) => {
    document.body.style.cssText = 'margin:0;background:#F3F5F7';
    document.body.innerHTML = '';
    const mv = document.createElement('model-viewer');
    mv.style.cssText = `width:${size}px;height:${size}px;display:block;background:#F3F5F7`;
    mv.setAttribute('src', model);
    // Three-quarter view reads as a product shot; slight elevation shows the top.
    mv.setAttribute('camera-orbit', '35deg 72deg auto');
    mv.setAttribute('shadow-intensity', '1.1');
    mv.setAttribute('shadow-softness', '0.9');
    mv.setAttribute('exposure', '1.05');
    mv.setAttribute('environment-image', 'neutral');
    mv.setAttribute('interaction-prompt', 'none');
    mv.setAttribute('disable-zoom', '');
    document.body.appendChild(mv);
    try {
      await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('timeout')), 30000);
        mv.addEventListener('load', () => { clearTimeout(t); res(); }, { once: true });
        mv.addEventListener('error', () => { clearTimeout(t); rej(new Error('load error')); }, { once: true });
      });
      // Let the frame settle so shadows and IBL are resolved before capture.
      await new Promise(r => setTimeout(r, 1200));
      return true;
    } catch { return false; }
  }, { model: p.model, size: SIZE });

  if (!ok) { console.log(`  FAIL  ${p.id}`); continue; }
  await page.locator('model-viewer').screenshot({ path: out, omitBackground: false });
  console.log(`  ok    ${p.id} -> photos/${p.id}.png`);
}

await browser.close();
