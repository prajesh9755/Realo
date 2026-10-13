import * as THREE from 'three';

/**
 * Reticle + hit-test sources, following the upstream three.js webxr_ar_hittest pattern.
 * hit-test is the shipped WebXR feature (plane-detection is still a developer trial),
 * and its poses are metric, which is what the true-scale claim rests on.
 *
 * TWO SOURCES, because WebXR offers two and they answer different questions:
 *
 * - The VIEWER source raycasts straight out of the camera centre. Its ray direction
 *   is fixed, so it cannot answer "what is under the user's finger" -- there is no
 *   API to aim a viewer-space source at a screen coordinate.
 * - The TRANSIENT source (requestHitTestSourceForTransientInput) is keyed to touch
 *   input and raycasts through the actual touch point, which is what tap-to-place
 *   needs.
 *
 * We keep both: transient for placement where the device supports it, viewer as the
 * fallback and for the drag-to-reposition loop. Both return metric poses, so the
 * scale guarantee is identical either way -- this changes aiming, not measurement.
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
    this.transientSource = null;
    this.localSpace = null;
    this.lastHitMatrix = new THREE.Matrix4();
    this.hasHit = false;
    this.distance = null;
    // Set when a tap produced its own hit, so callers can tell a deliberate
    // placement from whatever the centre ray happened to be pointing at.
    this.lastTapMatrix = new THREE.Matrix4();
    this.hasTapHit = false;
  }

  async start(session) {
    // Reference-space support varies by device: some ARCore phones reject 'local'
    // even though they offer 'local-floor' or 'viewer'. Try in order of preference
    // rather than assuming, or the session dies right after it starts.
    this.localSpace = await requestFirstSupportedSpace(session, ['local', 'local-floor', 'viewer']);
    const viewerSpace = await session.requestReferenceSpace('viewer');
    this.source = await session.requestHitTestSource({ space: viewerSpace });

    // Optional: absent on older ARCore builds, so never let it fail the session.
    // Without it we simply fall back to the centre ray, which is how this worked
    // before tap-to-place existed.
    try {
      // Guard both the method AND XRRay: `new XRRay()` in the argument list would
      // be evaluated before the optional call could short-circuit, so a device
      // missing XRRay would throw here rather than fall back.
      if (typeof session.requestHitTestSourceForTransientInput !== 'function' ||
          typeof XRRay !== 'function') {
        throw new Error('requestHitTestSourceForTransientInput / XRRay not available');
      }
      this.transientSource = await session.requestHitTestSourceForTransientInput({
        profile: 'generic-touchscreen',
        offsetRay: new XRRay()
      }) ?? null;
    } catch (err) {
      console.info('[hittest] transient input unavailable, using centre ray:', err.message);
      this.transientSource = null;
    }
  }

  get supportsTapTarget() {
    return !!this.transientSource;
  }

  /** Must be called on session end, or re-entering AR silently yields no hits. */
  stop() {
    this.source?.cancel?.();
    this.transientSource?.cancel?.();
    this.source = null;
    this.transientSource = null;
    this.localSpace = null;
    this.hasHit = false;
    this.distance = null;
    this.hasTapHit = false;
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
   * Hit under the user's finger, for this frame only. Transient results exist
   * just while a touch is active, so this must be read during the frame the tap
   * is handled -- there is nothing to query afterwards.
   *
   * Returns true when a tap-aimed hit was found; the pose lands in lastTapMatrix.
   */
  updateTransient(frame) {
    this.hasTapHit = false;
    if (!this.transientSource || !this.localSpace) return false;

    for (const perInput of frame.getHitTestResultsForTransientInput(this.transientSource)) {
      const hit = perInput.results?.[0];
      if (!hit) continue;
      const pose = hit.getPose(this.localSpace);
      if (!pose) continue;
      this.lastTapMatrix.fromArray(pose.transform.matrix);
      this.hasTapHit = true;
      return true;
    }
    return false;
  }

  /**
   * Position from the hit, yaw only from its orientation: furniture must stand
   * upright even when the surface estimate is tilted or noisy.
   *
   * `preferTap` uses the tap-aimed pose when this frame produced one, so the
   * object lands under the finger rather than at the screen centre.
   */
  applyToObject(object3d, { preferTap = false } = {}) {
    const useTap = preferTap && this.hasTapHit;
    if (!useTap && !this.hasHit) return false;

    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const matrix = useTap ? this.lastTapMatrix : this.lastHitMatrix;
    matrix.decompose(position, quaternion, scale);

    object3d.position.copy(position);
    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');
    object3d.rotation.set(0, euler.y, 0);
    return true;
  }
}
