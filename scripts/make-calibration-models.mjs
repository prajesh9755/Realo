/**
 * Writes exactly-dimensioned calibration cubes as .glb.
 * These prove the pipeline is metric before any sourced asset is involved:
 * if the 1 m cube does not measure 1 m against a tape, the bug is ours, not the asset's.
 *
 *   node scripts/make-calibration-models.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CUBES = [
  { file: 'calibration-cube-1m.glb', size: 1.0, color: [0.14, 0.72, 0.51, 1] },
  { file: 'calibration-cube-30cm.glb', size: 0.3, color: [0.96, 0.62, 0.04, 1] }
];

function buildGlb(size) {
  const h = size / 2;
  // 24 vertices (4 per face) so each face gets a correct outward normal.
  const faces = [
    { n: [0, 0, 1], v: [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]] },
    { n: [0, 0, -1], v: [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]] },
    { n: [0, 1, 0], v: [[-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h]] },
    { n: [0, -1, 0], v: [[-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]] },
    { n: [1, 0, 0], v: [[h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h]] },
    { n: [-1, 0, 0], v: [[-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h]] }
  ];

  const positions = [];
  const normals = [];
  const indices = [];
  faces.forEach((face, f) => {
    face.v.forEach((vertex) => {
      positions.push(...vertex);
      normals.push(...face.n);
    });
    const o = f * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });

  const posArray = new Float32Array(positions);
  const normArray = new Float32Array(normals);
  const idxArray = new Uint16Array(indices);

  const pad4 = (n) => (4 - (n % 4)) % 4;
  const posLen = posArray.byteLength;
  const normLen = normArray.byteLength;
  const idxLen = idxArray.byteLength;
  const idxPad = pad4(idxLen);
  const binLength = posLen + normLen + idxLen + idxPad;

  const bin = new Uint8Array(binLength);
  bin.set(new Uint8Array(posArray.buffer), 0);
  bin.set(new Uint8Array(normArray.buffer), posLen);
  bin.set(new Uint8Array(idxArray.buffer), posLen + normLen);

  const gltf = {
    asset: { version: '2.0', generator: 'true-scale-ar calibration generator' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    // Base seated at y=0 so the cube rests on the detected floor.
    nodes: [{ mesh: 0, translation: [0, h, 0], name: `calibration_${size}m` }],
    meshes: [{
      name: `cube_${size}m`,
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }]
    }],
    materials: [{
      name: 'calibration',
      pbrMetallicRoughness: { baseColorFactor: [0.14, 0.72, 0.51, 1], metallicFactor: 0.0, roughnessFactor: 0.75 }
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: posArray.length / 3, type: 'VEC3',
        min: [-h, -h, -h], max: [h, h, h] },
      { bufferView: 1, componentType: 5126, count: normArray.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: idxArray.length, type: 'SCALAR' }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posLen, target: 34962 },
      { buffer: 0, byteOffset: posLen, byteLength: normLen, target: 34962 },
      { buffer: 0, byteOffset: posLen + normLen, byteLength: idxLen, target: 34963 }
    ],
    buffers: [{ byteLength: binLength }]
  };

  return { gltf, bin };
}

function packGlb({ gltf, bin }, color) {
  gltf.materials[0].pbrMetallicRoughness.baseColorFactor = color;

  const enc = new TextEncoder();
  let jsonBytes = enc.encode(JSON.stringify(gltf));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(jsonBytes.length + jsonPad).fill(0x20);
    padded.set(jsonBytes);
    jsonBytes = padded;
  }

  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let o = 0;

  dv.setUint32(o, 0x46546c67, true); o += 4;   // "glTF"
  dv.setUint32(o, 2, true); o += 4;
  dv.setUint32(o, total, true); o += 4;

  dv.setUint32(o, jsonBytes.length, true); o += 4;
  dv.setUint32(o, 0x4e4f534a, true); o += 4;   // "JSON"
  out.set(jsonBytes, o); o += jsonBytes.length;

  dv.setUint32(o, bin.length, true); o += 4;
  dv.setUint32(o, 0x004e4942, true); o += 4;   // "BIN"
  out.set(bin, o);

  return out;
}

const outDir = resolve(root, 'public/models');
mkdirSync(outDir, { recursive: true });

for (const cube of CUBES) {
  const glb = packGlb(buildGlb(cube.size), cube.color);
  const path = resolve(outDir, cube.file);
  writeFileSync(path, glb);
  console.log(`wrote ${cube.file}  ${cube.size * 100}cm  ${glb.length} bytes`);
}
