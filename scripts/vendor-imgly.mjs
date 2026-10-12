/**
 * Self-hosts the @imgly/background-removal assets into public/imgly/.
 *
 *   npm run imgly:vendor
 *
 * Why: by default the library streams its model and ONNX runtime from
 * staticimgly.com at runtime. On venue wifi that is a single point of failure in
 * the middle of a live demo. Vendoring them means the only network dependency is
 * our own deploy. See docs/TRACK2.md.
 *
 * Downloads only the quint8 model (~42MB) and the ONNX runtime (~33MB), not the
 * fp16/full models we never ask for.
 *
 * Assets are written as the content-addressed chunks the library actually
 * fetches (it reads resources.json and requests each chunk by name), never as
 * one concatenated file. That is also what keeps us deployable: the reassembled
 * model is 42MB and Cloudflare Pages rejects any file over 25MB, while no
 * single chunk exceeds 4MB.
 */
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/imgly');

const DATA_VERSION = '1.7.0';
const BASE = `https://staticimgly.com/@imgly/background-removal-data/${DATA_VERSION}/dist`;

// Everything the quint8 path touches. Skip isnet_fp16 and isnet: 250MB we never load.
const WANTED = [
  '/models/isnet_quint8',
  '/onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm',
  '/onnxruntime-web/ort-wasm-simd-threaded.wasm',
  '/onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs',
  '/onnxruntime-web/ort-wasm-simd-threaded.mjs'
];

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

async function exists(path) {
  try {
    const s = await stat(path);
    return s.size > 0;
  } catch {
    return false;
  }
}

console.log(`Vendoring @imgly background-removal data ${DATA_VERSION} -> public/imgly/\n`);

const manifest = await (await fetchOk(`${BASE}/resources.json`)).json();
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'resources.json'), JSON.stringify(manifest), 'utf8');

let totalBytes = 0;

for (const key of WANTED) {
  const entry = manifest[key];
  if (!entry) {
    console.warn(`  !  ${key} not in manifest, skipping`);
    continue;
  }

  // Chunks are content-addressed: each lives at {BASE}/{hash} and the library
  // reassembles them in the browser from resources.json. We mirror that layout
  // flat in public/imgly/ rather than concatenating, so each file stays small.
  let keyBytes = 0;
  let fetched = 0;

  for (let i = 0; i < entry.chunks.length; i++) {
    const chunk = entry.chunks[i];
    const name = chunk.name ?? chunk.hash;
    const target = join(outDir, name);
    const [start, end] = chunk.offsets ?? [];
    const expected = end !== undefined ? end - start : undefined;

    if (await exists(target)) {
      keyBytes += expected ?? (await stat(target)).size;
      continue;
    }

    const res = await fetchOk(`${BASE}/${name}`);
    const bytes = Buffer.from(await res.arrayBuffer());

    if (expected !== undefined && bytes.length !== expected) {
      throw new Error(`${key} chunk ${i + 1}: expected ${expected} bytes, got ${bytes.length}`);
    }

    await writeFile(target, bytes);
    keyBytes += bytes.length;
    fetched++;
    process.stdout.write(`\r  .. ${key} chunk ${i + 1}/${entry.chunks.length}   `);
  }

  if (entry.size && keyBytes !== entry.size) {
    throw new Error(`${key}: chunks total ${keyBytes} bytes, manifest says ${entry.size}`);
  }

  totalBytes += keyBytes;
  const note = fetched === 0 ? 'already vendored' : `${entry.chunks.length} chunks`;
  console.log(`\r  OK ${key.padEnd(46)} ${(keyBytes / 1048576).toFixed(1)}MB  (${note})`);
}

console.log(`\nVendored ${(totalBytes / 1048576).toFixed(1)}MB into public/imgly/`);
console.log('Set publicPath to "/imgly/" in src/track2/removebg.js (already wired).');
