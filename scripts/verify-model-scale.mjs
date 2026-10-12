/**
 * Gate 2, run headlessly over every model in products.json.
 * Parses each .glb, walks the node hierarchy applying transforms, and compares
 * the real bounding box against the declared dims_cm.
 *
 *   node scripts/verify-model-scale.mjs
 *
 * Exits non-zero if any present model drifts past tolerance, so this can gate CI.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOLERANCE = 0.02;

function parseGlb(buffer) {
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  const length = dv.getUint32(8, true);

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < length) {
    const chunkLength = dv.getUint32(offset, true);
    const chunkType = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(buffer.subarray(start, start + chunkLength)));
    } else if (chunkType === 0x004e4942) {
      bin = buffer.subarray(start, start + chunkLength);
    }
    offset = start + chunkLength + ((4 - (chunkLength % 4)) % 4);
  }
  return { json, bin };
}

const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(json, bin, index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  const Type = COMPONENT[acc.componentType];
  const n = NUM_COMPONENTS[acc.type];
  const byteOffset = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  // Copy, because the glb slice is not guaranteed to be aligned for the typed array.
  const bytes = bin.subarray(byteOffset, byteOffset + acc.count * n * Type.BYTES_PER_ELEMENT);
  return new Type(new Uint8Array(bytes).buffer);
}

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++) out[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
  return out;
}

function nodeMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const t = node.translation ?? [0, 0, 0];
  const r = node.rotation ?? [0, 0, 0, 1];
  const s = node.scale ?? [1, 1, 1];
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1
  ];
}

function transformPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
  ];
}

function measureGlb(buffer) {
  const { json, bin } = parseGlb(buffer);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  const visit = (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex];
    const world = multiply(parent, nodeMatrix(node));

    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        if (prim.attributes?.POSITION === undefined) continue;
        const pos = readAccessor(json, bin, prim.attributes.POSITION);
        for (let i = 0; i < pos.length; i += 3) {
          const p = transformPoint(world, [pos[i], pos[i + 1], pos[i + 2]]);
          for (let a = 0; a < 3; a++) {
            if (p[a] < min[a]) min[a] = p[a];
            if (p[a] > max[a]) max[a] = p[a];
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };

  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const nodeIndex of json.scenes[json.scene ?? 0].nodes) visit(nodeIndex, identity);

  return {
    size: { w: max[0] - min[0], h: max[1] - min[1], d: max[2] - min[2] },
    minY: min[1]
  };
}

const data = JSON.parse(readFileSync(resolve(root, 'src/data/products.json'), 'utf8'));
const rows = [];
let failures = 0;
let missing = 0;

for (const product of data.products) {
  const modelPath = resolve(root, 'public', product.model.replace(/^\//, ''));
  if (!existsSync(modelPath)) {
    rows.push({ id: product.id, status: 'MISSING', detail: product.model });
    missing++;
    continue;
  }

  try {
    const { size, minY } = measureGlb(readFileSync(modelPath));
    const expectedH = product.dims_cm.h / 100;
    const err = Math.abs(size.h - expectedH) / expectedH;
    const ok = err <= TOLERANCE;
    if (!ok) failures++;

    rows.push({
      id: product.id,
      status: ok ? 'OK' : 'DRIFT',
      detail:
        `asset ${(size.w * 100).toFixed(1)}×${(size.h * 100).toFixed(1)}×${(size.d * 100).toFixed(1)}cm ` +
        `| declared ${product.dims_cm.w}×${product.dims_cm.h}×${product.dims_cm.d}cm ` +
        `| err ${(err * 100).toFixed(2)}% | baseY ${(minY * 100).toFixed(1)}cm`
    });
  } catch (err) {
    rows.push({ id: product.id, status: 'ERROR', detail: err.message });
    failures++;
  }
}

const pad = Math.max(...rows.map((r) => r.id.length));
console.log(`\nScale verification (tolerance ±${TOLERANCE * 100}%)\n`);
for (const row of rows) {
  console.log(`  ${row.status.padEnd(8)} ${row.id.padEnd(pad)}  ${row.detail}`);
}
console.log(`\n  ${rows.length - missing - failures} ok, ${failures} failing, ${missing} not yet sourced\n`);

process.exit(failures > 0 ? 1 : 0);
