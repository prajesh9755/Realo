/**
 * Headless Gate 2 with no three.js dependency.
 *
 * Scene Viewer renders the .glb itself, so scale cannot be corrected at runtime
 * any more: the file on disk must already be right. This parses the GLB directly
 * to report whether it is.
 *
 * Importing three.js here would load a second copy alongside the one model-viewer
 * bundles, and the resulting clash stops model-viewer rendering entirely.
 */
const TOLERANCE = 0.02;

const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function parseGlb(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  const total = dv.getUint32(8, true);
  let offset = 12, json = null, bin = null;
  while (offset < total) {
    const len = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len)));
    else if (type === 0x004e4942) bin = new Uint8Array(buffer, start, len);
    offset = start + len + ((4 - (len % 4)) % 4);
  }
  return { json, bin };
}

function readPositions(json, bin, index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  const Type = COMPONENT[acc.componentType];
  const n = NUM[acc.type];
  const off = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const slice = bin.slice(off, off + acc.count * n * Type.BYTES_PER_ELEMENT);
  return new Type(slice.buffer);
}

function multiply(a, b) {
  const o = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
  return o;
}

function nodeMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const t = node.translation ?? [0, 0, 0], r = node.rotation ?? [0, 0, 0, 1], s = node.scale ?? [1, 1, 1];
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1
  ];
}

const transform = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
];

export async function verifyModelScale(product) {
  try {
    const res = await fetch(product.model);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { json, bin } = parseGlb(await res.arrayBuffer());

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    const visit = (index, parent) => {
      const node = json.nodes[index];
      const world = multiply(parent, nodeMatrix(node));
      if (node.mesh !== undefined) {
        for (const prim of json.meshes[node.mesh].primitives) {
          if (prim.attributes?.POSITION === undefined) continue;
          const pos = readPositions(json, bin, prim.attributes.POSITION);
          for (let i = 0; i < pos.length; i += 3) {
            const p = transform(world, [pos[i], pos[i + 1], pos[i + 2]]);
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
    for (const index of json.scenes[json.scene ?? 0].nodes) visit(index, identity);

    const size = { w: max[0] - min[0], h: max[1] - min[1], d: max[2] - min[2] };
    const expectedH = product.dims_cm.h / 100;
    const driftRatio = Math.abs(size.h - expectedH) / expectedH;

    return {
      id: product.id,
      declaredCm: { ...product.dims_cm },
      assetCm: {
        w: +(size.w * 100).toFixed(1),
        h: +(size.h * 100).toFixed(1),
        d: +(size.d * 100).toFixed(1)
      },
      baseYcm: +(min[1] * 100).toFixed(1),
      driftRatio,
      withinTolerance: driftRatio <= TOLERANCE
    };
  } catch (err) {
    console.warn('[verify] scale check failed:', err.message);
    return null;
  }
}
