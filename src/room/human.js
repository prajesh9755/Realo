import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * A human figure, set to the user's own height, as the room's scale reference.
 *
 * A door or a ceiling is an abstract number; a person your own height standing
 * next to the cabinet is immediately readable. That is the entire point -- the
 * figure exists to be compared against, not to decorate.
 *
 * The source model measures 182.5cm as authored, so it is normalised to an exact
 * height on load and then scaled from that known baseline. Height is the ONLY
 * thing the user may change, and it is uniform, so the figure never distorts.
 */
const MODEL = '/models/human-figure.glb';
const AUTHORED_CM = 182.5;

export const HEIGHT_RANGE = { min: 120, max: 210, default: 170 };

export class HumanFigure {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'human';
    this.group.visible = false;
    this.scene.add(this.group);

    this.model = null;
    this.heightCm = HEIGHT_RANGE.default;
    this.baseHeight = 1;
    this.loading = null;
  }

  async load() {
    if (this.model) return this.model;
    this.loading ??= this.#load();
    return this.loading;
  }

  async #load() {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    loader.setDRACOLoader(draco);

    const gltf = await loader.loadAsync(MODEL);
    const model = gltf.scene;

    // Measure rather than trust: if the asset is ever replaced, the figure must
    // still end up exactly the height the slider says.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    this.baseHeight = size.y || AUTHORED_CM / 100;

    // Seat the feet at y=0 and centre on XZ, same as Gate 3 does for products.
    const centre = box.getCenter(new THREE.Vector3());
    model.position.x -= centre.x;
    model.position.z -= centre.z;
    model.position.y -= box.min.y;

    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });

    this.model = model;
    this.group.add(model);
    this.setHeight(this.heightCm);
    return model;
  }

  /** Uniform scale from the measured baseline, so the figure stays proportional. */
  setHeight(cm) {
    this.heightCm = THREE.MathUtils.clamp(cm, HEIGHT_RANGE.min, HEIGHT_RANGE.max);
    if (!this.model) return this.heightCm;
    const factor = (this.heightCm / 100) / this.baseHeight;
    this.group.scale.setScalar(factor);
    return this.heightCm;
  }

  setPosition(x, z) {
    this.group.position.set(x, 0, z);
  }

  get visible() {
    return this.group.visible;
  }

  setVisible(on) {
    this.group.visible = on;
  }

  /** Measured height of what is actually on screen, for an honest readout. */
  measuredCm() {
    if (!this.model) return this.heightCm;
    const box = new THREE.Box3().setFromObject(this.group);
    return +(box.getSize(new THREE.Vector3()).y * 100).toFixed(1);
  }
}
