import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { normalizeToRealWorldScale } from '../ar/scale.js';
import { ROOM } from './scene.js';

/**
 * Loads products into the room and lets the user drag them across the floor.
 *
 * Scale is NOT negotiable here: every model goes through the same Gate 2/3
 * normalisation the AR path uses, so a chair in this room is 104cm for exactly
 * the same reason it is 104cm in AR. Dragging moves things on the XZ plane only
 * -- there is no scale handle, by design (DECISIONS #7).
 */
export class RoomPlacer {
  constructor(scene, camera, domElement) {
    this.scene = scene;
    this.camera = camera;
    this.dom = domElement;

    this.items = [];
    this.selected = null;
    this.onSelectionChange = null;
    this.onDragStateChange = null;

    this.loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.loader.setDRACOLoader(draco);
    this.cache = new Map();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    // Drag happens against the floor plane, so an object never climbs a wall or
    // sinks: y stays 0 and only X/Z change.
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.dragOffset = new THREE.Vector3();
    this.isDragging = false;

    this.#bindInput();
  }

  async add(product) {
    let template = this.cache.get(product.id);
    if (!template) {
      const gltf = await this.loader.loadAsync(product.model);
      template = gltf.scene;
      // Same gate as AR: never trust the asset's own units.
      const report = normalizeToRealWorldScale(template, product.dims_cm, product.id);
      console.info('[room] scale', product.id, report.finalCm);
      this.cache.set(product.id, template);
    }

    const model = template.clone(true);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    const group = new THREE.Group();
    group.add(model);
    group.position.set(...this.#freeSpot(product));
    group.userData.product = product;

    this.scene.add(group);
    this.items.push(group);
    this.select(group);
    return group;
  }

  remove(group) {
    if (!group) return;
    this.scene.remove(group);
    this.items = this.items.filter((i) => i !== group);
    if (this.selected === group) this.select(null);
  }

  clear() {
    for (const item of [...this.items]) this.remove(item);
  }

  select(group) {
    this.selected = group;
    this.onSelectionChange?.(group);
  }

  rotateSelected(radians) {
    if (this.selected) this.selected.rotation.y += radians;
  }

  /**
   * Drop new items slightly apart rather than stacking them at the origin,
   * walking along the back wall where furniture usually goes.
   */
  #freeSpot(product) {
    const n = this.items.length;
    const depth = (product.dims_cm?.d ?? 40) / 100;
    const x = -ROOM.width / 2 + 0.8 + (n % 4) * 1.1;
    const z = -ROOM.depth / 2 + depth / 2 + 0.25 + Math.floor(n / 4) * 0.9;
    return [x, 0, z];
  }

  #bindInput() {
    const el = this.dom;
    el.addEventListener('pointerdown', (e) => this.#onDown(e));
    el.addEventListener('pointermove', (e) => this.#onMove(e));
    el.addEventListener('pointerup', () => this.#onUp());
    el.addEventListener('pointerleave', () => this.#onUp());
  }

  #updatePointer(e) {
    const r = this.dom.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  #onDown(e) {
    this.#updatePointer(e);
    const hits = this.raycaster.intersectObjects(this.items, true);
    if (hits.length === 0) {
      this.select(null);
      return;
    }

    const group = this.#ownerOf(hits[0].object);
    this.select(group);

    const point = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.floorPlane, point)) {
      this.dragOffset.subVectors(group.position, point);
    }
    this.#setDragging(true, e.pointerId);
    // Stop OrbitControls from spinning the camera while dragging an object.
    e.stopPropagation();
  }

  #onMove(e) {
    if (!this.isDragging || !this.selected) return;
    this.#updatePointer(e);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, point)) return;

    point.add(this.dragOffset);
    this.selected.position.set(
      ...this.#clampToRoom(point.x, point.z, this.selected)
    );
  }

  #onUp() {
    this.#setDragging(false);
  }

  /** Orbit must be suspended during a drag, or the camera spins with the object. */
  #setDragging(dragging, pointerId) {
    if (this.isDragging === dragging) return;
    this.isDragging = dragging;
    if (dragging && pointerId !== undefined) this.dom.setPointerCapture?.(pointerId);
    this.onDragStateChange?.(dragging);
  }

  /** Keep furniture inside the walls, accounting for its own footprint. */
  #clampToRoom(x, z, group) {
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const hx = size.x / 2;
    const hz = size.z / 2;
    // The front of the room is open (the camera sits there), so stop short of it:
    // an object dragged to the very edge ends up in the viewer's face.
    const frontLimit = ROOM.depth / 2 - hz - 0.35;
    return [
      THREE.MathUtils.clamp(x, -ROOM.width / 2 + hx, ROOM.width / 2 - hx),
      0,
      THREE.MathUtils.clamp(z, -ROOM.depth / 2 + hz, frontLimit)
    ];
  }

  #ownerOf(object) {
    let o = object;
    while (o && !this.items.includes(o)) o = o.parent;
    return o;
  }
}
