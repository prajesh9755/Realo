import * as THREE from 'three';

export const SCALE_TOLERANCE = 0.02;

/**
 * Gate 2 + Gate 3 of the scale discipline (docs/SCALE.md).
 * Measures the loaded object against the declared real-world dimensions,
 * corrects any authoring drift, and seats the base at y=0 centred on XZ.
 */
export function normalizeToRealWorldScale(object3d, dimsCm, id = 'unknown') {
  const report = measure(object3d);
  const expected = {
    w: dimsCm.w / 100,
    h: dimsCm.h / 100,
    d: dimsCm.d / 100
  };

  // Height is the reference axis: it is the dimension users judge a product by,
  // and it is the one axis glTF exporters rarely swap.
  const factor = expected.h / report.size.y;
  const error = Math.abs(factor - 1);

  if (error > SCALE_TOLERANCE) {
    console.warn(
      `[scale] DRIFT ${id}: asset is ${(report.size.y * 100).toFixed(1)}cm tall, ` +
      `declared ${dimsCm.h}cm (${(error * 100).toFixed(1)}% off). Correcting by x${factor.toFixed(4)}. ` +
      `Fix the .glb in Blender so this warning disappears — see docs/SCALE.md.`
    );
    object3d.scale.multiplyScalar(factor);
  }

  groundAlign(object3d);

  const after = measure(object3d);
  return {
    id,
    declaredCm: { ...dimsCm },
    assetCm: toCm(report.size),
    finalCm: toCm(after.size),
    correctionFactor: factor,
    driftRatio: error,
    corrected: error > SCALE_TOLERANCE,
    withinTolerance: Math.abs(after.size.y - expected.h) / expected.h <= SCALE_TOLERANCE
  };
}

/**
 * Gate 3: seat the base on the detected surface and centre it horizontally,
 * so a model authored around its centroid does not sink or float at the hit point.
 */
export function groundAlign(object3d) {
  const { box } = measure(object3d);
  const centre = box.getCenter(new THREE.Vector3());
  object3d.position.x -= centre.x;
  object3d.position.z -= centre.z;
  object3d.position.y -= box.min.y;
  return object3d;
}

export function measure(object3d) {
  object3d.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object3d);
  return { box, size: box.getSize(new THREE.Vector3()) };
}

function toCm(vec3) {
  return {
    w: +(vec3.x * 100).toFixed(1),
    h: +(vec3.y * 100).toFixed(1),
    d: +(vec3.z * 100).toFixed(1)
  };
}

export function formatDims(dimsCm) {
  return `${dimsCm.w} × ${dimsCm.h} × ${dimsCm.d} cm`;
}
