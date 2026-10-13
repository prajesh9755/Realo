import * as THREE from 'three';
import { groundAlign } from './scale.js';

/**
 * Holds the placed object and, where available, its XRAnchor.
 * Anchors are optional-only: on phones without them the object stays put in
 * `local` space, which ARCore keeps tracked well enough for a demo.
 */
export class Placement {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    this.content = null;
    this.anchor = null;
    this.anchorSpace = null;
    this.placed = false;
    this.yawOffset = 0;
  }

  setContent(object3d) {
    if (this.content) this.group.remove(this.content);
    this.content = object3d;
    groundAlign(object3d);
    this.group.add(object3d);
    this.group.add(createContactShadow(object3d));
    return this;
  }

  place(hitTester, { frame, enabled, preferTap = false } = {}) {
    if (!this.content) return false;

    // When the device can aim at the finger, the finger is the ONLY authority. If
    // the tap missed a surface we refuse rather than quietly substituting the
    // centre ray: landing the object somewhere the user did not point is the kind
    // of silent wrong answer this project exists to avoid. They can tap again.
    const canPlace = preferTap ? hitTester.hasTapHit : hitTester.hasHit;
    if (!canPlace) return false;

    hitTester.applyToObject(this.group, { preferTap });
    this.yawOffset = 0;
    this.group.visible = true;
    this.placed = true;

    if (enabled?.anchors && frame?.createAnchor) {
      this.#tryAnchor(frame, hitTester);
    }
    return true;
  }

  async #tryAnchor(frame, hitTester) {
    try {
      const pose = new XRRigidTransform(
        { x: this.group.position.x, y: this.group.position.y, z: this.group.position.z },
        { x: this.group.quaternion.x, y: this.group.quaternion.y, z: this.group.quaternion.z, w: this.group.quaternion.w }
      );
      this.anchor = await frame.createAnchor(pose, hitTester.localSpace);
      this.anchorSpace = this.anchor?.anchorSpace ?? null;
    } catch (err) {
      console.warn('[place] anchor unavailable, staying in local space:', err.message);
      this.anchor = null;
      this.anchorSpace = null;
    }
  }

  /** Track the anchor if we got one; otherwise the local-space transform already holds. */
  update(frame, refSpace) {
    if (!this.anchorSpace || !this.placed) return;
    const pose = frame.getPose(this.anchorSpace, refSpace);
    if (!pose) return;
    this.group.matrix.fromArray(pose.transform.matrix);
    this.group.matrix.decompose(this.group.position, this.group.quaternion, this.group.scale);
    this.group.rotateY(this.yawOffset);
  }

  rotateBy(radians) {
    this.yawOffset += radians;
    this.group.rotateY(radians);
  }

  moveTo(hitTester, { preferTap = false } = {}) {
    if (!this.placed) return false;
    // Same rule as place(): follow the finger or do nothing. A drag that jumped to
    // screen centre whenever the finger left the floor would feel broken.
    if (!(preferTap ? hitTester.hasTapHit : hitTester.hasHit)) return false;
    const yaw = this.yawOffset;
    hitTester.applyToObject(this.group, { preferTap });
    this.group.rotateY(yaw);
    return true;
  }

  reset() {
    this.group.visible = false;
    this.placed = false;
    this.anchor?.delete?.();
    this.anchor = null;
    this.anchorSpace = null;
    this.yawOffset = 0;
  }
}

/** A soft ellipse under the object so it reads as sitting on the floor, not floating. */
function createContactShadow(object3d) {
  const box = new THREE.Box3().setFromObject(object3d);
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) * 0.6;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.42)');
  gradient.addColorStop(0.55, 'rgba(0,0,0,0.16)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false
    })
  );
  mesh.position.y = 0.001;
  return mesh;
}
