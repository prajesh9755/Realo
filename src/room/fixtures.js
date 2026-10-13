import * as THREE from 'three';
import { ROOM } from './scene.js';

/**
 * Built-in room fixtures: an open wardrobe on the accent wall.
 *
 * These are PART OF THE ROOM, not catalogue products -- they are not draggable
 * and do not appear in the sidebar. Their job is to make the space read as a
 * real room and to give the eye more familiar objects to judge scale against.
 *
 * Every dimension is a real one. A wardrobe is the kind of thing people know
 * the size of, so getting it wrong would undermine the room as a reference
 * exactly as a wrong product would.
 *
 *   carcass 220cm tall x 180cm wide x 60cm deep  (a common 3-bay fitted unit)
 *   hanging rail at 160cm . shelves at 40/80/185cm . plinth 8cm
 *   shirt on a hanger ~75cm long, ~40cm across the shoulders
 */
const DIM = {
  // Spans the accent wall, stopping just short of each corner so the side walls
  // and skirting stay readable. A fitted wall-to-wall unit, 240cm tall.
  width: ROOM.width - 0.5,
  height: 2.40,
  depth: 0.62,
  plinth: 0.08,
  panel: 0.018,
  railY: 1.60
};

const MAT = {
  carcass: () => new THREE.MeshStandardMaterial({ color: 0xe8e4dd, roughness: 0.75 }),
  interior: () => new THREE.MeshStandardMaterial({ color: 0xd7d1c7, roughness: 0.9 }),
  door: () => new THREE.MeshStandardMaterial({ color: 0xdfdad1, roughness: 0.5, metalness: 0.05 }),
  rail: () => new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.3, metalness: 0.85 }),
  handle: () => new THREE.MeshStandardMaterial({ color: 0x7d8286, roughness: 0.35, metalness: 0.9 })
};

const SHIRT_COLORS = [0xf5f3ef, 0xc9d6e3, 0xe6e1d6, 0x8fa5b8, 0xf0ece4, 0xb8c4cf, 0xdcd6ca];

/** Floor area the wardrobe occupies, so products never spawn inside it. */
export const WARDROBE_FOOTPRINT = {
  minX: -DIM.width / 2,
  maxX: DIM.width / 2,
  maxZ: -ROOM.depth / 2 + DIM.depth + 0.02
};

export function buildWardrobe() {
  const g = new THREE.Group();
  g.name = 'wardrobe';

  const { width: W, height: H, depth: D, panel: T, plinth } = DIM;
  // Centred on the accent wall, flush to it.
  g.position.set(0, 0, -ROOM.depth / 2 + D / 2 + 0.01);

  const carcass = MAT.carcass();
  const interior = MAT.interior();

  // Plinth, sides, top, back.
  g.add(box(W, plinth, D * 0.92, [0, plinth / 2, 0], new THREE.MeshStandardMaterial({ color: 0xcdc7bd, roughness: 0.9 })));
  for (const x of [-W / 2 + T / 2, W / 2 - T / 2]) {
    g.add(box(T, H - plinth, D, [x, plinth + (H - plinth) / 2, 0], carcass));
  }
  g.add(box(W, T, D, [0, H - T / 2, 0], carcass));
  g.add(box(W, H - plinth, T, [0, plinth + (H - plinth) / 2, -D / 2 + T / 2], interior));

  // Five dividers -> six bays across the wall.
  const BAYS = 6;
  const bay = W / BAYS;
  for (let i = 1; i < BAYS; i++) {
    g.add(box(T, H - plinth, D, [-W / 2 + bay * i, plinth + (H - plinth) / 2, 0], carcass));
  }
  const centreOf = (i) => -W / 2 + bay * (i + 0.5);

  // Bay layout across the wall: hanging, shelves, doors, hanging, shelves, doors.
  // A shelf above every bay, as fitted units have.
  const KIND = ['hang', 'shelf', 'door', 'hang', 'shelf', 'door'];
  const doorH = H - plinth - T - 0.01;

  for (let i = 0; i < BAYS; i++) {
    const cx = centreOf(i);
    g.add(box(bay - T, T, D - 0.04, [cx, H - 0.42, 0], interior));

    if (KIND[i] === 'hang') {
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, bay - T, 12).rotateZ(Math.PI / 2),
        MAT.rail()
      );
      rail.position.set(cx, DIM.railY, 0);
      g.add(rail);
      g.add(shirtRow(cx, DIM.railY, bay - T * 2, D));
      // Shoes on the floor of the hanging bay.
      g.add(shoePair(cx - bay * 0.18, 0.12));
      g.add(shoePair(cx + bay * 0.16, 0.12));
    } else if (KIND[i] === 'shelf') {
      for (const y of [0.45, 0.90, 1.35, 1.80]) {
        g.add(box(bay - T, T, D - 0.04, [cx, y, 0], interior));
      }
      for (const [dx, y, w] of [
        [-0.13, 0.45, 0.22], [0.14, 0.45, 0.16],
        [-0.11, 0.90, 0.14], [0.15, 0.90, 0.20],
        [0, 1.35, 0.17], [-0.10, 1.80, 0.19]
      ]) g.add(foldedStack(cx + dx, y, w));
    } else {
      const doorW = (bay - T) / 2;
      for (const dx of [-doorW / 2, doorW / 2]) {
        g.add(box(doorW - 0.004, doorH, 0.018,
          [cx + dx, plinth + doorH / 2, D / 2 - 0.009], MAT.door()));
        const handle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.008, 0.008, 0.16, 10), MAT.handle()
        );
        handle.position.set(
          cx + dx + (dx < 0 ? doorW / 2 - 0.05 : -doorW / 2 + 0.05), 1.15, D / 2 + 0.004
        );
        g.add(handle);
      }
    }
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Shirts on hangers: a simple shoulder-tapered slab reads convincingly at room scale. */
function shirtRow(centerX, railY, span, depth) {
  const g = new THREE.Group();
  const count = 7;
  const step = span / count;
  for (let i = 0; i < count; i++) {
    const x = centerX - span / 2 + step * (i + 0.5);
    const color = SHIRT_COLORS[i % SHIRT_COLORS.length];
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });

    // Hanger hook.
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0025, 6, 12, Math.PI), MAT.rail());
    hook.position.set(x, railY + 0.012, 0);
    hook.rotation.y = Math.PI / 2;
    g.add(hook);

    // Shoulders, then the body hanging below: ~75cm of garment.
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.38), mat);
    shoulders.position.set(x, railY - 0.07, 0);
    shoulders.rotation.x = 0;
    g.add(shoulders);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.62, 0.30), mat);
    body.position.set(x, railY - 0.40, 0);
    g.add(body);
  }
  return g;
}

/** A stack of folded clothes on a shelf. */
function foldedStack(x, shelfY, width) {
  const g = new THREE.Group();
  const layers = 3 + Math.floor(Math.random() * 2);
  let y = shelfY + 0.012;
  for (let i = 0; i < layers; i++) {
    const h = 0.035 + Math.random() * 0.015;
    const color = SHIRT_COLORS[(i * 3 + Math.round(x * 50)) % SHIRT_COLORS.length];
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(width, h, 0.34),
      new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
    );
    m.position.set(x + (Math.random() - 0.5) * 0.012, y + h / 2, 0);
    m.rotation.y = (Math.random() - 0.5) * 0.06;
    g.add(m);
    y += h;
  }
  return g;
}

/** A pair of shoes on the wardrobe floor: another familiar size cue. */
function shoePair(x, z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.7 });
  for (const dx of [-0.055, 0.055]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.27), mat);
    shoe.position.set(x + dx, 0.035 + 0.08, -0.02);
    shoe.rotation.y = dx < 0 ? 0.05 : -0.05;
    g.add(shoe);
  }
  return g;
}

function box(w, h, d, pos, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(...pos);
  return m;
}
