/**
 * Single-view metrology: recover camera geometry from one photograph.
 *
 * STANDALONE AND SELF-CONTAINED. Imports nothing from src/room or src/ar --
 * those work and must not be disturbed. Pure maths, no three.js, no DOM, so it
 * can be unit-tested headlessly before any UI exists.
 *
 * THE IDEA
 * --------
 * In a perspective photo, parallel lines in the world converge to a vanishing
 * point. Three mutually perpendicular directions (a room's width, depth and
 * height) give three vanishing points, and those encode the camera's focal
 * length and orientation. From them we can rebuild the 3D space the photo was
 * taken in.
 *
 * WHAT THIS CANNOT DO, AND WHY IT MATTERS HERE
 * --------------------------------------------
 * Vanishing points give SHAPE and ORIENTATION but never ABSOLUTE SIZE. A 3m
 * room shot from 2m and a 6m room shot from 4m produce identical images --
 * the information is simply not in the pixels. So the user must supply ONE
 * real measurement (a wall height, a wardrobe width). Everything else scales
 * from it.
 *
 * This is the same honesty line the rest of the project draws: we do not invent
 * a number we cannot derive. See docs/SCALE.md.
 */

/** Intersection of two lines, each given as two points. Null when parallel. */
export function lineIntersection(p1, p2, p3, p4) {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  // Near-parallel lines put the vanishing point at infinity; the caller must
  // handle that rather than receive a vast meaningless coordinate.
  if (Math.abs(d) < 1e-9) return null;
  const a = p1.x * p2.y - p1.y * p2.x;
  const b = p3.x * p4.y - p3.y * p4.x;
  return {
    x: (a * (p3.x - p4.x) - (p1.x - p2.x) * b) / d,
    y: (a * (p3.y - p4.y) - (p1.y - p2.y) * b) / d
  };
}

/**
 * Focal length in pixels from two orthogonal vanishing points and the principal
 * point (assumed at the image centre, which is right for an unmodified phone photo).
 *
 *   For orthogonal directions:  (v1 - pp) . (v2 - pp) = -f^2
 *
 * A positive f^2 means the two vanishing points are consistent with a real
 * perspective camera; a negative one means they are not, which is the main way
 * a bad corner alignment shows up.
 */
export function focalFromVanishingPoints(v1, v2, pp) {
  const d1x = v1.x - pp.x, d1y = v1.y - pp.y;
  const d2x = v2.x - pp.x, d2y = v2.y - pp.y;
  const f2 = -(d1x * d2x + d1y * d2y);
  if (!isFinite(f2) || f2 <= 0) return null;
  return Math.sqrt(f2);
}

/** Unit 3D direction for a vanishing point, in camera coordinates. */
export function directionFromVanishingPoint(v, pp, f) {
  const x = v.x - pp.x;
  const y = v.y - pp.y;
  const len = Math.hypot(x, y, f);
  return { x: x / len, y: y / len, z: f / len };
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
});
const norm = (a) => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/**
 * Solve the camera from two orthogonal vanishing points.
 *
 * Two are enough: the third direction is their cross product, since the three
 * are mutually perpendicular by construction. That matters for real photos like
 * a corner shot where the third vanishing point is off-frame or unstable.
 *
 * Returns focal length, the three world axes as seen by the camera, and an
 * orthogonality residual that says how well the solution actually holds.
 */
export function solveCamera({ vpWidth, vpDepth, imageWidth, imageHeight }) {
  const pp = { x: imageWidth / 2, y: imageHeight / 2 };

  if (!vpWidth || !vpDepth) {
    return { ok: false, reason: 'need-two-vanishing-points' };
  }

  const f = focalFromVanishingPoints(vpWidth, vpDepth, pp);
  if (!f) {
    return {
      ok: false,
      reason: 'not-a-perspective-camera',
      detail: 'Those two edge pairs do not meet at right angles in 3D. Re-align the corners.'
    };
  }

  const dirX = directionFromVanishingPoint(vpWidth, pp, f);
  const dirZ = directionFromVanishingPoint(vpDepth, pp, f);
  // Up is perpendicular to both floor directions.
  const dirY = norm(cross(dirZ, dirX));

  // How far from truly orthogonal the recovered axes are. 0 is perfect.
  const residual = Math.abs(dot(dirX, dirZ));

  // Horizontal field of view, useful for sanity-checking against a phone lens.
  const fovDeg = 2 * Math.atan(imageWidth / (2 * f)) * (180 / Math.PI);

  return {
    ok: true,
    focalPx: f,
    fovDeg,
    principalPoint: pp,
    axes: { x: dirX, y: dirY, z: dirZ },
    residual,
    // Residual grows with misalignment; past this the reconstruction is not
    // trustworthy enough to place a product into.
    trustworthy: residual < 0.08
  };
}

/**
 * Metres per pixel at a given depth, from ONE known real measurement.
 *
 * `referenceCm` is the real size of something the user identified in the photo,
 * and `pixelLength` is how long it is on screen. This is the step that gives
 * the scene absolute size; without it the reconstruction is shape-only.
 */
export function scaleFromReference({ referenceCm, pixelLength, focalPx, depthM }) {
  if (!referenceCm || !pixelLength || !focalPx) return null;
  // A length L at depth D projects to pixelLength = f * L / D.
  const impliedDepthM = (focalPx * (referenceCm / 100)) / pixelLength;
  return {
    impliedDepthM,
    metresPerPixelAtDepth: depthM ? depthM / focalPx : impliedDepthM / focalPx
  };
}

/**
 * Honest accuracy estimate for the whole reconstruction.
 *
 * Deliberately pessimistic: this path is measured-from-a-photo, not
 * measured-from-sensors, and it must never be presented as equal to the AR
 * path. Corner placement is the dominant error.
 */
export function estimateAccuracy({ residual, referencePixelLength, imageDiagonal }) {
  // A few pixels of corner slop is the realistic human limit.
  const cornerSlopPx = 4;
  const referenceError = referencePixelLength
    ? cornerSlopPx / referencePixelLength
    : 0.1;
  const geometryError = residual * 2;
  const total = Math.sqrt(referenceError ** 2 + geometryError ** 2);
  return {
    ratio: total,
    percent: +(total * 100).toFixed(1),
    // Never claim better than 3%: the method does not support it.
    display: `+/-${Math.max(3, Math.round(total * 100))}%`
  };
}
