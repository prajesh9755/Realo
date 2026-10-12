import * as THREE from 'three';

/**
 * Reticle + hit-test source, following the upstream three.js webxr_ar_hittest pattern.
 * hit-test is the shipped WebXR feature (plane-detection is still a developer trial),
 * and its poses are metric, which is what the true-scale claim rests on.
 */
/** Returns the first reference space the device actually grants. */
async function requestFirstSupportedSpace(session, types) {
  const errors = [];
  for (const type of types) {
    try {
      const space = await session.requestReferenceSpace(type);
      console.info(`[hittest] using '${type}' reference space`);
      return space;
    } catch (err) {
      errors.push(`${type}: ${err.message}`);
    }
  }
  throw new Error(`No usable reference space. Tried ${errors.join(' | ')}`);
}

export function createReticle() {
  const ring = new THREE.RingGeometry(0.07, 0.09, 48).rotateX(-Math.PI / 2);
  const dot = new THREE.CircleGeometry(0.012, 24).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.95 });

  const reticle = new THREE.Group();
  reticle.add(new THREE.Mesh(ring, material));
  reticle.add(new THREE.Mesh(dot, material));
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  return reticle;
}

export class HitTester {
  constructor() {
    this.source = null;
    this.localSpace = null;
    this.lastHitMatrix = new THREE.Matrix4();
    this.hasHit = false;
    this.distance = null;
  }

  async start(session) {
    // Reference-space support varies by device: some ARCore phones reject 'local'
    // even though they offer 'local-floor' or 'viewer'. Try in order of preference
    // rather than assuming, or the session dies right after it starts.
    this.localSpace = await requestFirstSupportedSpace(session, ['local', 'local-floor', 'viewer']);
    const viewerSpace = await session.requestReferenceSpace('viewer');
    this.source = await session.requestHitTestSource({ space: viewerSpace });
  }

  /** Must be called on session end, or re-entering AR silently yields no hits. */
  stop() {
    this.source?.cancel?.();
    this.source = null;
    this.localSpace = null;
    this.hasHit = false;
    this.distance = null;
  }

  update(frame, reticle) {
    if (!this.source || !this.localSpace) return false;

    const results = frame.getHitTestResults(this.source);
    if (results.length === 0) {
      this.hasHit = false;
      if (reticle) reticle.visible = false;
      return false;
    }

    const pose = results[0].getPose(this.localSpace);
    if (!pose) {
      this.hasHit = false;
      if (reticle) reticle.visible = false;
      return false;
    }

    this.lastHitMatrix.fromArray(pose.transform.matrix);
    this.hasHit = true;

    const viewerPose = frame.getViewerPose(this.localSpace);
    if (viewerPose) {
      const p = pose.transform.position;
      const v = viewerPose.transform.position;
      this.distance = Math.hypot(p.x - v.x, p.y - v.y, p.z - v.z);
    }

    if (reticle) {
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    }
    return true;
  }

  /**
   * Position from the hit, yaw only from its orientation: furniture must stand
   * upright even when the surface estimate is tilted or noisy.
   */
  applyToObject(object3d) {
    if (!this.hasHit) return false;

    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    this.lastHitMatrix.decompose(position, quaternion, scale);

    object3d.position.copy(position);
    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
    object3d.rotation.set(0, euler.y, 0);
    return true;
  }
}
