import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { products, dimsLabel, formatPrice } from '../store/catalog.js';
import { buildRoom, buildLighting, ROOM } from './scene.js';
import { RoomPlacer } from './placer.js';

const canvas = document.getElementById('room-canvas');
const note = document.getElementById('room-note');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeceae6);

// 55deg is close to a natural interior-photo lens; wider distorts the room's
// proportions and undermines the point of drawing it to measurement.
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 60);
// INSIDE the room, at standing eye height, near the back of the floor. Sitting
// outside showed the far side of the walls and read as a dollhouse.
// Behind the (absent) front wall at standing eye height. A 4m-deep room cannot
// show both side walls from inside it, and the window and door ARE the scale
// references the sidebar points at, so they have to be in frame. This is the
// standard interior-photograph viewpoint for exactly that reason.
camera.position.set(0, 1.55, ROOM.depth / 2 + 2.6);

scene.add(buildRoom());
scene.add(buildLighting());

const controls = new OrbitControls(camera, canvas);
// Look at the middle of the far half of the room, slightly below eye height,
// which is where furniture against the back wall actually sits.
controls.target.set(0, 1.05, -ROOM.depth / 2 + 0.8);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.2;
// Keep the camera from backing out through the wall behind it.
controls.maxDistance = ROOM.depth + 0.6;
// Never let the camera drop under the floor or rise to a plan view: both read as
// broken rather than as a feature.
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.update();

const placer = new RoomPlacer(scene, camera, canvas);
// Dragging an object must not also orbit the camera.
placer.onDragStateChange = (dragging) => { controls.enabled = !dragging; };

renderCatalog();
bindControls();
resize();
window.addEventListener('resize', resize);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

note.textContent = 'Click a product to add it. Drag it across the floor; drag the background to look around.';

function renderCatalog() {
  document.getElementById('catalog').innerHTML = products
    .filter((p) => !p.calibration)
    .map((p) => `
      <button class="room-chip" data-id="${p.id}">
        <img src="${p.photo}" alt="" loading="lazy" />
        <span class="room-chip-name">${esc(p.name)}</span>
        <span class="room-chip-dims">${dimsLabel(p.dims_cm)}</span>
      </button>`)
    .join('');

  document.getElementById('catalog').addEventListener('click', async (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (!id) return;
    const product = products.find((p) => p.id === id);
    note.textContent = `Loading ${product.name}…`;
    try {
      await placer.add(product);
      note.textContent = 'Drag it across the floor. Drag the background to look around.';
    } catch (err) {
      note.textContent = `Could not load ${product.name}. ${err.message}`;
      note.classList.add('is-error');
    }
  });
}

function bindControls() {
  const box = document.getElementById('selected');
  const panel = document.getElementById('controls');

  placer.onSelectionChange = (group) => {
    const product = group?.userData.product;
    box.classList.toggle('hide', !product);
    panel.classList.toggle('hide', !product);
    if (!product) return;
    document.getElementById('sel-name').textContent = product.name;
    const price = formatPrice(product.price);
    document.getElementById('sel-dims').textContent =
      dimsLabel(product.dims_cm) + (price ? ` · ${price}` : '');
  };

  document.getElementById('rot-left').addEventListener('click', () => placer.rotateSelected(-Math.PI / 12));
  document.getElementById('rot-right').addEventListener('click', () => placer.rotateSelected(Math.PI / 12));
  document.getElementById('remove').addEventListener('click', () => placer.remove(placer.selected));
  document.getElementById('clear').addEventListener('click', () => {
    placer.clear();
    note.textContent = 'Room cleared. Click a product to add it.';
  });
}

function resize() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = rect.width;
  const h = Math.max(380, Math.min(window.innerHeight * 0.68, w * 0.62));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
