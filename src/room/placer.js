import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { normalizeToRealWorldScale } from '../ar/scale.js';
import { ROOM } from './scene.js';
import { WARDROBE_FOOTPRINT } from './fixtures.js';

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
    // Draggable but not a product: the human figure. Kept separate so clear()
    // and the catalogue listing never touch it.
    this.extras = [];
    this.selected = null;
    this.onSelectionChange = null;
    this.onDragStateChange = null;

    this.loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.loader.setDRACOLoader(draco);
    this.cache = new Map();
    this.footprints = new WeakMap();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    // Drag happens against the floor plane, so an object never climbs a wall or
    // sinks: y stays 0 and only X/Z change.
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    // The plane the CURRENT drag runs on. Set on pointerdown to the height the
    // user actually grabbed, which is not the floor -- see #onDown.
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
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
    this.footprints.delete(group);
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
    const width = (product.dims_cm?.w ?? 40) / 100;
    let x = -ROOM.width / 2 + 0.8 + (n % 4) * 1.1;
    let z = -ROOM.depth / 2 + depth / 2 + 0.25 + Math.floor(n / 4) * 0.9;

    // The wardrobe is a fixed part of the room, so a new product must not land
    // inside it. Step out to its right rather than stacking on top of it.
    const w = WARDROBE_FOOTPRINT;
    const overlapsX = x + width / 2 > w.minX && x - width / 2 < w.maxX;
    if (overlapsX && z - depth / 2 < w.maxZ) {
      x = w.maxX + width / 2 + 0.25 + (n % 3) * 0.75;
      if (x + width / 2 > ROOM.width / 2) {
        // Out of room to the right: drop it forward into open floor instead.
        x = -ROOM.width / 2 + 0.8 + (n % 4) * 1.1;
        z = w.maxZ + depth / 2 + 0.45;
      }
    }
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

  /** Register a draggable that is not a catalogue product. */
  addExtra(group) {
    if (!this.extras.includes(group)) this.extras.push(group);
  }

  get draggable() {
    return [...this.items, ...this.extras.filter((g) => g.visible)];
  }

  #onDown(e) {
    this.#updatePointer(e);
    const hits = this.raycaster.intersectObjects(this.draggable, true);
    if (hits.length === 0) {
      this.select(null);
      return;
    }

    const group = this.#ownerOf(hits[0].object);
    this.select(group);

    // Drag on a horizontal plane through the GRAB POINT, not through the floor.
    //
    // Grabbing a 170cm figure by the chest means the cursor ray meets the floor
    // plane far behind their feet, so every pixel of cursor movement became a
    // much larger movement on the floor and the object shot away. Short objects
    // barely showed it; the human made it obvious. Using the grab height keeps
    // the object pinned under the cursor at any height.
    const grab = hits[0].point;
    this.dragPlane.set(new THREE.Vector3(0, 1, 0), -grab.y);

    const point = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.dragPlane, point)) {
      // Offset in XZ only: the plane carries the height, and y is forced to 0
      // on every move anyway.
      this.dragOffset.set(group.position.x - point.x, 0, group.position.z - point.z);
    } else {
      this.dragOffset.set(0, 0, 0);
    }
    this.#setDragging(true, e.pointerId);
    // Stop OrbitControls from spinning the camera while dragging an object.
    e.stopPropagation();
  }

  #onMove(e) {
    if (!this.isDragging || !this.selected) return;
    this.#updatePointer(e);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, point)) return;

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
    const { hx, hz } = this.#footprintOf(group);
    // The front of the room is open (the camera sits there), so stop short of it:
    // an object dragged to the very edge ends up in the viewer's face.
    const frontLimit = ROOM.depth / 2 - hz - 0.35;
    return [
      THREE.MathUtils.clamp(x, -ROOM.width / 2 + hx, ROOM.width / 2 - hx),
      0,
      THREE.MathUtils.clamp(z, -ROOM.depth / 2 + hz, frontLimit)
    ];
  }

  /**
   * Half-extents on X/Z, cached per object.
   *
   * This used to call Box3.setFromObject on every pointermove. For a product
   * that is a handful of static meshes; for the human figure it walks ten
   * SKINNED meshes and their skeletons, every move event, which made dragging
   * the figure visibly stutter while products stayed smooth. The footprint does
   * not change while dragging, so it is computed once.
   *
   * Invalidated on scale change (the height slider) via invalidateFootprint().
   */
  #footprintOf(group) {
    let fp = this.footprints.get(group);
    if (fp) return fp;
    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    fp = { hx: size.x / 2, hz: size.z / 2 };
    this.footprints.set(group, fp);
    return fp;
  }

  /** Call when an object's size changes, e.g. the human's height slider. */
  invalidateFootprint(group) {
    this.footprints.delete(group);
  }

  #ownerOf(object) {
    const all = this.draggable;
    let o = object;
    while (o && !all.includes(o)) o = o.parent;
    return o;
  }
}
