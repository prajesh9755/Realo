import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { normalizeToRealWorldScale } from '../ar/scale.js';

/**
 * Renders products over the photo, using the camera recovered by solver.js.
 *
 * Reuses normalizeToRealWorldScale from the AR path on purpose: a product in a
 * photo must be the same measured size it is in AR, or the two paths would
 * disagree about the same object. Nothing in src/ar or src/room is modified.
 *
 * The three.js camera is built to MATCH the real camera that took the photo:
 * same focal length (as a vertical FOV) and same orientation relative to the
 * room. Get those right and a product standing on the floor lines up with the
 * photo's own perspective.
 */
export class PhotoProjector {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);

    // Catches shadows so products look seated on the real floor, but is
    // otherwise invisible over the photo.
    this.shadowFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
      new THREE.ShadowMaterial({ opacity: 0.28 })
    );
    this.shadowFloor.receiveShadow = true;
    this.scene.add(this.shadowFloor);

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
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.dragOffset = new THREE.Vector3();
    this.isDragging = false;
    this.solution = null;

    this.#bindInput();
    this.renderer.setAnimationLoop(() => this.renderer.render(this.scene, this.camera));
  }

  /**
   * Point the virtual camera the way the real one was pointing.
   *
   * The solver gives the room's three axes as seen BY the camera. Building a
   * basis from them and inverting it turns "where the room is relative to the
   * camera" into "where the camera is relative to the room", which is what
   * three.js needs.
   */
  applySolution(solution, { imageWidth, imageHeight, cameraDistanceM, eyeHeightM = 1.45 }) {
    this.solution = solution;
    const { axes, focalPx } = solution;

    // Focal length in pixels becomes a vertical FOV for an image this tall.
    const fovRad = 2 * Math.atan(imageHeight / (2 * focalPx));
    this.camera.fov = THREE.MathUtils.radToDeg(fovRad);
    this.camera.aspect = imageWidth / imageHeight;
    this.camera.updateProjectionMatrix();

    const x = new THREE.Vector3(axes.x.x, axes.x.y, axes.x.z).normalize();
    const z = new THREE.Vector3(axes.z.x, axes.z.y, axes.z.z).normalize();
    // Rebuild Y from the other two rather than trusting the solved value: the
    // solved axes can be a hair off, and a non-orthogonal basis skews every
    // object placed in it.
    const y = new THREE.Vector3().crossVectors(z, x).normalize();

    const basis = new THREE.Matrix4().makeBasis(x, y, z);
    const camRot = new THREE.Matrix4().copy(basis).invert();
    const q = new THREE.Quaternion().setFromRotationMatrix(camRot);
    this.camera.quaternion.copy(q);

    // Place the camera so the floor (y=0) sits where the photo says it does.
    //
    // Standing it at the origin put the lens ON the floor, so everything was
    // viewed from ground level and products loomed. The camera was held at eye
    // or chest height, and the solved Y axis tells us which way is down in
    // camera space, so we can lift it back to a real holding height.
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const pos = forward.clone().multiplyScalar(-cameraDistanceM);
    pos.y = eyeHeightM;
    this.camera.position.copy(pos);

    // Look at a point on the floor ahead, so the horizon sits where the photo
    // has it rather than at the vertical centre of the frame.
    const lookAhead = forward.clone();
    lookAhead.y = 0;
    lookAhead.normalize().multiplyScalar(cameraDistanceM * 0.75);
    this.camera.lookAt(lookAhead.x, 0, lookAhead.z);
    this.camera.updateMatrixWorld(true);

    this.cameraDistanceM = cameraDistanceM;
    this.#buildOccluders(cameraDistanceM);
  }

  /**
   * Invisible walls that hide whatever is behind them.
   *
   * Without these a product pushed "into" the corner still draws on top of the
   * photo, so it reads as a sticker rather than an object in the room. These
   * meshes write DEPTH ONLY -- colorWrite false -- so they paint nothing
   * themselves but stop the renderer drawing anything further away. The photo
   * shows through, and a chair pushed past the wall is correctly cut off.
   *
   * The walls are placed using the same axes the solver recovered, so they sit
   * where the real walls are rather than at arbitrary distances.
   */
  #buildOccluders(cameraDistanceM) {
    if (this.occluders) {
      this.scene.remove(this.occluders);
      this.occluders.traverse((o) => o.geometry?.dispose());
    }

    const g = new THREE.Group();
    g.name = 'occluders';

    const mat = new THREE.MeshBasicMaterial({
      colorWrite: false,   // contributes depth, never pixels
      depthWrite: true
    });

    // The corner sits roughly where the camera is looking, at the solved
    // distance. Walls run along the two recovered horizontal axes.
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    forward.normalize();
    const corner = forward.clone().multiplyScalar(cameraDistanceM);
    corner.add(this.camera.position);
    corner.y = 0;

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0;
    right.normalize();

    const SIZE = 14;      // generous: better to over-cover than leave a gap
    const HEIGHT = 3.2;

    // Back wall: faces the camera, through the corner.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, HEIGHT), mat);
    back.position.set(corner.x, HEIGHT / 2, corner.z);
    back.lookAt(this.camera.position.x, HEIGHT / 2, this.camera.position.z);
    g.add(back);

    // Side wall: perpendicular to it, meeting at the same corner.
    const side = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, HEIGHT), mat);
    const sideCentre = corner.clone().add(right.clone().multiplyScalar(-SIZE / 2));
    side.position.set(sideCentre.x, HEIGHT / 2, sideCentre.z);
    side.lookAt(
      sideCentre.x + right.x, HEIGHT / 2, sideCentre.z + right.z
    );
    g.add(side);

    // Rendered before everything else so the depth buffer is primed when the
    // products are drawn.
    g.traverse((o) => { o.renderOrder = -1; });
    this.occluders = g;
    this.occluders.visible = this.occlusionEnabled !== false;
    this.scene.add(g);

    // The same two walls as maths, for collision. A product dragged into a wall
    // should STOP against it, the way real furniture does -- sliding through and
    // disappearing is physically wrong and reads as a bug even when the
    // occlusion itself is correct.
    //
    // Each plane's normal points back toward the camera, into the room, so a
    // positive distance means "on the room side of this wall".
    const toCamera = this.camera.position.clone().setY(0).sub(corner).normalize();
    const backNormal = toCamera.clone();
    const sideNormal = right.clone();
    // Make the side wall's normal point into the room as well.
    if (sideNormal.dot(this.camera.position.clone().setY(0).sub(sideCentre)) < 0) {
      sideNormal.negate();
    }

    this.walls = [
      { point: corner.clone(), normal: backNormal },
      { point: sideCentre.clone().setY(0), normal: sideNormal }
    ];
  }

  /**
   * Push an XZ position out of any wall it has entered, allowing for the
   * object's own footprint so its back edge rests against the wall rather than
   * its centre.
   */
  #clampToWalls(x, z, group) {
    if (!this.walls || this.wallCollision === false) return { x, z };

    const p = new THREE.Vector3(x, 0, z);

    // Two passes: pushing out of one wall can push into the other (in a corner),
    // so resolve again. Two is enough for two perpendicular planes.
    for (let pass = 0; pass < 2; pass++) {
      for (const wall of this.walls) {
        // How far this object actually reaches toward THIS wall, given its own
        // shape and current rotation. A chair reaches further on its wide axis
        // than its narrow one, and rotating it swaps which is which.
        const reach = this.#reachToward(group, wall.normal);
        const distance = p.clone().sub(wall.point).dot(wall.normal);
        if (distance < reach) {
          p.addScaledVector(wall.normal, reach - distance);
        }
      }
    }
    return { x: p.x, z: p.z };
  }

  /**
   * Distance from the object's centre to its outermost point in the direction
   * of -normal, i.e. how far it sticks out toward that wall.
   *
   * This is the support function of the object's footprint. Using one number
   * for every direction (the old Math.min of width and depth) meant the leading
   * edge punched through the wall on the wider axis -- a chair leg or a cupboard
   * back would visibly cross the line. Projecting the four corners of the
   * rotated footprint onto the wall normal gives the true reach, so whichever
   * part is nearest the wall is what comes to rest against it.
   */
  #reachToward(group, normal) {
    const fp = this.#footprintOf(group);
    // Rotate the footprint's half-extents into world space, then take the
    // largest projection onto the inward normal.
    const yaw = group.rotation.y;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    let reach = 0;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      // Corner offset from centre, in the object's own axes.
      const ox = sx * fp.hx;
      const oz = sz * fp.hz;
      // Same corner in world axes after the object's yaw.
      const wx = ox * cos + oz * sin;
      const wz = -ox * sin + oz * cos;
      // Project onto -normal: how far this corner reaches toward the wall.
      reach = Math.max(reach, -(wx * normal.x + wz * normal.z));
    }
    return reach;
  }

  /**
   * The object's unrotated half-extents on X and Z, measured once.
   *
   * Measured with the group's yaw temporarily removed, so the cached numbers
   * describe the SHAPE rather than its current orientation -- rotation is then
   * applied per query in #reachToward. Recomputing a Box3 every pointermove is
   * the stutter that bit the room page.
   */
  #footprintOf(group) {
    this.footprints ??= new WeakMap();
    let fp = this.footprints.get(group);
    if (fp) return fp;

    const yaw = group.rotation.y;
    group.rotation.y = 0;
    group.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    group.rotation.y = yaw;
    group.updateMatrixWorld(true);

    fp = { hx: size.x / 2, hz: size.z / 2 };
    this.footprints.set(group, fp);
    return fp;
  }

  /**
   * Half the object's footprint, cached. Recomputing a Box3 on every pointermove
   * is the stutter that bit the room page; the footprint does not change while
   * dragging, so it is computed once per object.
   */


  /** Lets the UI turn wall collision off independently of occlusion. */
  setWallCollision(on) {
    this.wallCollision = on;
  }

  /** Lets the UI turn occlusion off, since a wrong wall is worse than none. */
  setOcclusion(on) {
    this.occlusionEnabled = on;
    if (this.occluders) this.occluders.visible = on;
  }

  /** Nudge the occluder walls nearer or further, to line them up by eye. */
  nudgeOccluders(deltaM) {
    if (!this.occluders) return;
    this.occluderOffset = (this.occluderOffset ?? 0) + deltaM;
    this.#buildOccluders((this.cameraDistanceM ?? 3) + this.occluderOffset);
  }

  async add(product) {
    let template = this.cache.get(product.id);
    if (!template) {
      const gltf = await this.loader.loadAsync(product.model);
      template = gltf.scene;
      const report = normalizeToRealWorldScale(template, product.dims_cm, product.id);
      console.info('[photo] scale', product.id, report.finalCm);
      this.cache.set(product.id, template);
    }

    const model = template.clone(true);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    const group = new THREE.Group();
    group.add(model);

    // Drop it on the floor at roughly the depth the room itself occupies, not a
    // fixed 1.6m: with the camera 3.8m back that put the product in the lens.
    const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    ahead.y = 0;
    ahead.normalize().multiplyScalar((this.cameraDistanceM ?? 3) * 0.72);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    side.y = 0;
    side.normalize().multiplyScalar(this.items.length * 0.5);

    group.position.set(
      this.camera.position.x + ahead.x + side.x,
      0,
      this.camera.position.z + ahead.z + side.z
    );
    group.userData.product = product;

    this.scene.add(group);
    // Footprint needs the model in the scene before it can be measured, and a
    // product must not spawn already inside a wall.
    const spawn = this.#clampToWalls(group.position.x, group.position.z, group);
    group.position.set(spawn.x, 0, spawn.z);
    this.items.push(group);
    this.select(group);
    return group;
  }

  remove(group) {
    if (!group) return;
    this.footprints?.delete(group);
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
    if (!this.selected) return;
    this.selected.rotation.y += radians;
    // Turning an object presents a different edge to the wall, which can leave
    // it overlapping; settle it back out.
    const c = this.#clampToWalls(this.selected.position.x, this.selected.position.z, this.selected);
    this.selected.position.set(c.x, 0, c.z);
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  #bindInput() {
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => this.#onDown(e));
    el.addEventListener('pointermove', (e) => this.#onMove(e));
    el.addEventListener('pointerup', () => this.#setDrag(false));
    el.addEventListener('pointerleave', () => this.#setDrag(false));
  }

  #updatePointer(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  #onDown(e) {
    if (!this.solution) return;
    this.#updatePointer(e);
    const hits = this.raycaster.intersectObjects(this.items, true);
    if (hits.length === 0) {
      this.select(null);
      return;
    }

    const group = this.#ownerOf(hits[0].object);
    this.select(group);

    // Drag on a plane through the GRAB POINT, not the floor. Grabbing a tall
    // object near its top would otherwise send it flying, because the cursor
    // ray meets the floor far behind the object. Same lesson as the room page.
    const grab = hits[0].point;
    this.dragPlane.set(new THREE.Vector3(0, 1, 0), -grab.y);

    const point = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.dragPlane, point)) {
      this.dragOffset.set(group.position.x - point.x, 0, group.position.z - point.z);
    } else {
      this.dragOffset.set(0, 0, 0);
    }
    this.#setDrag(true, e.pointerId);
  }

  #onMove(e) {
    if (!this.isDragging || !this.selected) return;
    this.#updatePointer(e);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, point)) return;
    // Stop at the walls rather than passing through them.
    const clamped = this.#clampToWalls(
      point.x + this.dragOffset.x,
      point.z + this.dragOffset.z,
      this.selected
    );
    this.selected.position.set(clamped.x, 0, clamped.z);
  }

  #setDrag(on, pointerId) {
    if (this.isDragging === on) return;
    this.isDragging = on;
    if (on && pointerId !== undefined) this.canvas.setPointerCapture?.(pointerId);
    this.onDragStateChange?.(on);
  }

  #ownerOf(object) {
    let o = object;
    while (o && !this.items.includes(o)) o = o.parent;
    return o;
  }
}
