/**
 * Bakes a real-world scale (and a base-at-origin offset) into a .glb's root nodes.
 *
 *   node scripts/rescale-model.mjs <id>        fix one product by its products.json id
 *   node scripts/rescale-model.mjs --all       fix every product that currently drifts
 *
 * Why this exists: sourced models are routinely authored in arbitrary units. The runtime
 * Gate-2 check already corrects drift, but baking the fix in keeps `npm run verify:scale`
 * green and stops a warning firing on every demo load. See docs/SCALE.md.
 *
 * It only edits the scene's ROOT node transforms, so mesh data and materials are untouched.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOLERANCE = 0.02;

function parseGlb(buffer) {
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  const length = dv.getUint32(8, true);
  let offset = 12, json = null, bin = null;
  while (offset < length) {
    const cl = dv.getUint32(offset, true);
    const ct = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    if (ct === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(buffer.subarray(start, start + cl)));
    else if (ct === 0x004e4942) bin = buffer.subarray(start, start + cl);
    offset = start + cl + ((4 - (cl % 4)) % 4);
  }
  return { json, bin };
}

function packGlb(json, bin) {
  const enc = new TextEncoder();
  let jsonBytes = enc.encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(jsonBytes.length + jsonPad).fill(0x20);
    padded.set(jsonBytes);
    jsonBytes = padded;
  }
  const binPad = bin ? (4 - (bin.length % 4)) % 4 : 0;
  const binTotal = bin ? bin.length + binPad : 0;
  const total = 12 + 8 + jsonBytes.length + (bin ? 8 + binTotal : 0);

  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let o = 0;
  dv.setUint32(o, 0x46546c67, true); o += 4;
  dv.setUint32(o, 2, true); o += 4;
  dv.setUint32(o, total, true); o += 4;
  dv.setUint32(o, jsonBytes.length, true); o += 4;
  dv.setUint32(o, 0x4e4f534a, true); o += 4;
  out.set(jsonBytes, o); o += jsonBytes.length;
  if (bin) {
    dv.setUint32(o, binTotal, true); o += 4;
    dv.setUint32(o, 0x004e4942, true); o += 4;
    out.set(bin, o);
  }
  return out;
}

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAcc(json, bin, i) {
  const a = json.accessors[i];
  const v = json.bufferViews[a.bufferView];
  const T = COMP[a.componentType];
  const n = NC[a.type];
  const off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const bytes = bin.subarray(off, off + a.count * n * T.BYTES_PER_ELEMENT);
  return new T(new Uint8Array(bytes).buffer);
}

const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j*4+i] += a[k*4+i]*b[j*4+k];
  return o;
};

function nodeMat(n) {
  if (n.matrix) return n.matrix.slice();
  const t = n.translation ?? [0,0,0], r = n.rotation ?? [0,0,0,1], s = n.scale ?? [1,1,1];
  const [x,y,z,w] = r;
  const x2=x+x,y2=y+y,z2=z+z, xx=x*x2,xy=x*y2,xz=x*z2, yy=y*y2,yz=y*z2,zz=z*z2, wx=w*x2,wy=w*y2,wz=w*z2;
  return [(1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0, (xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0, (xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0, t[0],t[1],t[2],1];
}

const tp = (m,p) => [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];

function measure(json, bin) {
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  const visit = (ni, parent) => {
    const n = json.nodes[ni];
    const world = mul(parent, nodeMat(n));
    if (n.mesh !== undefined) {
      for (const prim of json.meshes[n.mesh].primitives) {
        if (prim.attributes?.POSITION === undefined) continue;
        const pos = readAcc(json, bin, prim.attributes.POSITION);
        for (let i = 0; i < pos.length; i += 3) {
          const p = tp(world, [pos[i], pos[i+1], pos[i+2]]);
          for (let a = 0; a < 3; a++) { if (p[a] < min[a]) min[a] = p[a]; if (p[a] > max[a]) max[a] = p[a]; }
        }
      }
    }
    for (const c of n.children ?? []) visit(c, world);
  };
  const I = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  for (const ni of json.scenes[json.scene ?? 0].nodes) visit(ni, I);
  return { min, max, size: [max[0]-min[0], max[1]-min[1], max[2]-min[2]] };
}

/**
 * Wrap the scene roots in a single new node carrying the scale and offset.
 * Safer than editing each root in place: it composes correctly whatever
 * transforms the roots already have.
 */
function applyTransform(json, factor, offset) {
  const scene = json.scenes[json.scene ?? 0];
  const wrapper = {
    name: 'realo_scale_fix',
    children: [...scene.nodes],
    scale: [factor, factor, factor],
    translation: offset
  };
  json.nodes.push(wrapper);
  scene.nodes = [json.nodes.length - 1];
}

const data = JSON.parse(readFileSync(resolve(root, 'src/data/products.json'), 'utf8'));
const arg = process.argv[2];
if (!arg) {
  console.error('usage: node scripts/rescale-model.mjs <product-id>|--all');
  process.exit(2);
}

const targets = arg === '--all'
  ? data.products.filter((p) => !p.calibration)
  : data.products.filter((p) => p.id === arg);

if (targets.length === 0) {
  console.error(`no product matching "${arg}"`);
  process.exit(2);
}

let changed = 0;

for (const product of targets) {
  const path = resolve(root, 'public', product.model.replace(/^\//, ''));
  let buffer;
  try {
    buffer = readFileSync(path);
  } catch {
    console.log(`  skip   ${product.id} (no file at ${product.model})`);
    continue;
  }

  const { json, bin } = parseGlb(buffer);
  const before = measure(json, bin);
  const expectedH = product.dims_cm.h / 100;
  const factor = expectedH / before.size[1];
  const drift = Math.abs(factor - 1);

  // Base to y=0 and centred on XZ, measured AFTER scaling.
  const offset = [
    -((before.min[0] + before.max[0]) / 2) * factor,
    -before.min[1] * factor,
    -((before.min[2] + before.max[2]) / 2) * factor
  ];
  const needsOffset = offset.some((v) => Math.abs(v) > 0.001);

  if (drift <= TOLERANCE && !needsOffset) {
    console.log(`  ok     ${product.id} already correct`);
    continue;
  }

  applyTransform(json, factor, offset);
  writeFileSync(path, packGlb(json, bin));

  const after = measure(json, bin);
  const cm = (v) => (v * 100).toFixed(1);
  console.log(
    `  fixed  ${product.id.padEnd(14)} x${factor.toFixed(4)}  ` +
    `${cm(before.size[0])}×${cm(before.size[1])}×${cm(before.size[2])} -> ` +
    `${cm(after.size[0])}×${cm(after.size[1])}×${cm(after.size[2])}cm  baseY ${cm(after.min[1])}cm`
  );
  changed++;
}

console.log(`\n${changed} model(s) rewritten. Run \`npm run verify:scale\` to confirm.`);
