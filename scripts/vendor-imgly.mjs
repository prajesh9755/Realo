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

  const target = join(outDir, key.replace(/^\//, ''));
  await mkdir(dirname(target), { recursive: true });

  if (await exists(target)) {
    console.log(`  =  ${key} already vendored`);
    continue;
  }

  // Chunks are content-addressed: each lives at {BASE}/{hash} and they
  // concatenate in manifest order to reconstruct the file.
  const parts = [];
  for (let i = 0; i < entry.chunks.length; i++) {
    const chunk = entry.chunks[i];
    const res = await fetchOk(`${BASE}/${chunk.name ?? chunk.hash}`);
    const bytes = Buffer.from(await res.arrayBuffer());

    const [start, end] = chunk.offsets ?? [];
    if (end !== undefined && bytes.length !== end - start) {
      throw new Error(`${key} chunk ${i + 1}: expected ${end - start} bytes, got ${bytes.length}`);
    }

    parts.push(bytes);
    process.stdout.write(`\r  .. ${key} chunk ${i + 1}/${entry.chunks.length}   `);
  }

  const buffer = Buffer.concat(parts);
  if (entry.size && buffer.length !== entry.size) {
    throw new Error(`${key}: reassembled ${buffer.length} bytes, manifest says ${entry.size}`);
  }

  await writeFile(target, buffer);
  totalBytes += buffer.length;
  console.log(`\r  OK ${key.padEnd(46)} ${(buffer.length / 1048576).toFixed(1)}MB`);
}

console.log(`\nVendored ${(totalBytes / 1048576).toFixed(1)}MB into public/imgly/`);
console.log('Set publicPath to "/imgly/" in src/track2/removebg.js (already wired).');
