import * as THREE from 'three';

/**
 * A room built from real measurements, not a photograph.
 *
 * Every dimension here is in METRES and chosen to match a plausible real room,
 * because the whole point is that a product placed in it is comparably sized.
 * A photo backdrop would have been faster and would look better immediately,
 * but products in front of a 2D image have no depth to be correct about --
 * their size would be eyeballed, which is the one thing this project refuses.
 *
 * Reference heights worth keeping in view while editing:
 *   door 2.03m . interior ceiling 2.4-2.7m . window sill 0.9m . skirting 0.1m
 */
export const ROOM = {
  width: 5.0,   // X
  depth: 4.0,   // Z
  height: 2.6,  // Y -- standard Indian interior ceiling
  skirting: 0.1,
  window: { width: 1.2, height: 1.4, sill: 0.9 }
};

const PALETTE = {
  floor: 0xd9c3a5,
  wallWarm: 0xf2efe9,
  wallAccent: 0x1e3a5f,  // the deep navy from the reference
  skirting: 0xfaf9f7,
  ceiling: 0xfbfbfb
};

/**
 * Walls are single-sided planes facing inward rather than a box with flipped
 * normals: it keeps the camera able to sit outside the room for the orbit view
 * without the far wall occluding everything.
 */
export function buildRoom() {
  const room = new THREE.Group();
  room.name = 'room';

  const { width: W, depth: D, height: H } = ROOM;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: PALETTE.floor, roughness: 0.85, metalness: 0 })
  );
  floor.receiveShadow = true;
  floor.name = 'floor';
  room.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2),
    // FrontSide only: seen from outside/below the room it would otherwise cap the
    // view and hide everything inside.
    new THREE.MeshStandardMaterial({ color: PALETTE.ceiling, roughness: 1, side: THREE.FrontSide })
  );
  ceiling.position.y = H;
  room.add(ceiling);

  // Back wall carries the accent colour, as in the reference image.
  room.add(wall({ w: W, h: H, color: PALETTE.wallAccent, pos: [0, H / 2, -D / 2], rotY: 0 }));
  room.add(wall({ w: D, h: H, color: PALETTE.wallWarm, pos: [-W / 2, H / 2, 0], rotY: Math.PI / 2 }));
  room.add(wall({ w: D, h: H, color: PALETTE.wallWarm, pos: [W / 2, H / 2, 0], rotY: -Math.PI / 2 }));

  room.add(skirtingRun(W, [0, 0, -D / 2 + 0.001], 0));
  room.add(skirtingRun(D, [-W / 2 + 0.001, 0, 0], Math.PI / 2));
  room.add(skirtingRun(D, [W / 2 - 0.001, 0, 0], -Math.PI / 2));

  room.add(windowFrame());
  room.add(doorway());

  return room;
}

function wall({ w, h, color, pos, rotY }) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.FrontSide })
  );
  mesh.position.set(...pos);
  mesh.rotation.y = rotY;
  mesh.receiveShadow = true;
  return mesh;
}

/** Skirting board: a strong, familiar scale cue at exactly 10cm. */
function skirtingRun(length, pos, rotY) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, ROOM.skirting, 0.02),
    new THREE.MeshStandardMaterial({ color: PALETTE.skirting, roughness: 0.6 })
  );
  mesh.position.set(pos[0], ROOM.skirting / 2, pos[2]);
  mesh.rotation.y = rotY;
  return mesh;
}

/**
 * A window on the left wall. Its sill at 0.9m and 1.2x1.4m opening are ordinary
 * real dimensions, so it reads as a size reference rather than decoration.
 */
function windowFrame() {
  const g = new THREE.Group();
  const { width: w, height: h, sill } = ROOM.window;
  const x = -ROOM.width / 2 + 0.02;

  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h).rotateY(Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0xbcd4e6, roughness: 0.1, metalness: 0.1,
      transparent: true, opacity: 0.55
    })
  );
  pane.position.set(x, sill + h / 2, 0);
  g.add(pane);

  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.7 });
  const t = 0.04;
  for (const [dy, len, vertical] of [
    [h / 2, w, false], [-h / 2, w, false]
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, t, len), frameMat);
    bar.position.set(x, sill + h / 2 + dy, 0);
    g.add(bar);
  }
  for (const dz of [-w / 2, 0, w / 2]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, t), frameMat);
    bar.position.set(x, sill + h / 2, dz);
    g.add(bar);
  }
  return g;
}

/** A 2.03m door on the right wall: the single most legible human-scale cue. */
function doorway() {
  const g = new THREE.Group();
  const h = 2.03;
  const w = 0.86;
  const x = ROOM.width / 2 - 0.02;
  const z = ROOM.depth / 2 - 1.2;

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h).rotateY(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xece7df, roughness: 0.8 })
  );
  panel.position.set(x, h / 2, z);
  g.add(panel);

  const casingMat = new THREE.MeshStandardMaterial({ color: 0xfaf9f7, roughness: 0.6 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, w + 0.12), casingMat);
  top.position.set(x, h, z);
  g.add(top);
  for (const dz of [-w / 2 - 0.03, w / 2 + 0.03]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, 0.06), casingMat);
    side.position.set(x, h / 2, z + dz);
    g.add(side);
  }

  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.3, metalness: 0.8 })
  );
  knob.position.set(x - 0.04, 1.0, z - w / 2 + 0.08);
  g.add(knob);

  return g;
}

/** Lighting tuned so the floor reads flat and products cast a believable contact shadow. */
export function buildLighting() {
  const g = new THREE.Group();

  g.add(new THREE.HemisphereLight(0xffffff, 0xcfc3b4, 2.1));

  // Keyed to the window, so the room's brightest side matches where light enters.
  const sun = new THREE.DirectionalLight(0xfff4e6, 1.5);
  sun.position.set(-2.8, 2.6, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -4;
  sun.shadow.camera.right = 4;
  sun.shadow.camera.top = 4;
  sun.shadow.camera.bottom = -4;
  sun.shadow.camera.far = 20;
  sun.shadow.bias = -0.0008;
  g.add(sun);

  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  fill.position.set(2.5, 2.2, 3.0);
  g.add(fill);

  return g;
}
