import { products, dimsLabel, formatPrice } from '../store/catalog.js';
import { lineIntersection, solveCamera, scaleFromReference, estimateAccuracy } from './solver.js';
import { LineOverlay, LINE_DEFS } from './lines.js';
import { PhotoProjector } from './projector.js';

/**
 * Track 4: reconstruct the user's room from a single photograph.
 *
 * Flow: load a photo -> trace two pairs of parallel wall edges -> give one real
 * measurement -> place products into the recovered space.
 *
 * This page is deliberately separate from room.html and ar.html. It is a
 * DIFFERENT accuracy tier -- measured from a photograph rather than from
 * sensors -- and the UI says so rather than letting it pass as the AR claim.
 */
const els = {
  drop: document.getElementById('drop'),
  file: document.getElementById('file'),
  wrap: document.getElementById('canvas-wrap'),
  photo: document.getElementById('photo-canvas'),
  overlay: document.getElementById('overlay-canvas'),
  note: document.getElementById('stage-note'),
  stepLines: document.getElementById('step-lines'),
  stepScale: document.getElementById('step-scale'),
  stepPlace: document.getElementById('step-place'),
  legend: document.getElementById('line-legend'),
  solveState: document.getElementById('solve-state'),
  refCm: document.getElementById('ref-cm'),
  apply: document.getElementById('apply'),
  catalog: document.getElementById('catalog'),
  selected: document.getElementById('selected'),
  selName: document.getElementById('sel-name'),
  selDims: document.getElementById('sel-dims'),
  placeControls: document.getElementById('place-controls'),
  stepWalls: document.getElementById('step-walls'),
  occlusionOn: document.getElementById('occlusion-on'),
  collisionOn: document.getElementById('collision-on'),
  wallNear: document.getElementById('wall-near'),
  wallFar: document.getElementById('wall-far'),
  accuracy: document.getElementById('accuracy'),
  restart: document.getElementById('restart')
};

let image = null;
let overlay = null;
let projector = null;
let solution = null;

renderLegend();
bindInput();

// ---------------------------------------------------------------- image load

function bindInput() {
  els.file.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
  });

  els.drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.drop.classList.add('is-over');
  });
  els.drop.addEventListener('dragleave', () => els.drop.classList.remove('is-over'));
  els.drop.addEventListener('drop', (e) => {
    e.preventDefault();
    els.drop.classList.remove('is-over');
    const f = e.dataTransfer?.files?.[0];
    if (f) loadFile(f);
  });

  // Paste is the quickest path on a laptop and costs nothing to support.
  window.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
    if (item) loadFile(item.getAsFile());
  });

  els.apply.addEventListener('click', buildSpace);
  els.restart.addEventListener('click', () => location.reload());

  els.refCm.addEventListener('input', () => {
    if (solution) buildSpace();
  });
}

function loadFile(file) {
  if (!file?.type?.startsWith('image/')) {
    fail('That file is not an image.');
    return;
  }
  const img = new Image();
  img.onload = () => {
    image = img;
    setupCanvases(img);
    els.drop.classList.add('hide');
    els.wrap.classList.remove('hide');
    els.stepLines.classList.remove('hide');
    els.stepScale.classList.remove('hide');
    els.restart.classList.remove('hide');
    els.note.textContent = 'Drag the handles onto the room edges they name.';
    els.note.classList.remove('is-error');
    URL.revokeObjectURL(img.src);
  };
  img.onerror = () => fail('That image could not be loaded.');
  img.src = URL.createObjectURL(file);
}

/**
 * Three stacked canvases of identical CSS size: the photo, the WebGL products,
 * and the line overlay on top. They must agree exactly or the traced lines
 * would not correspond to what the solver sees.
 */
function setupCanvases(img) {
  const maxW = els.wrap.parentElement.getBoundingClientRect().width;
  const scale = Math.min(1, maxW / img.width);
  const dispW = Math.round(img.width * scale);
  const dispH = Math.round(img.height * scale);
  const dpr = Math.min(window.devicePixelRatio, 2);

  for (const c of [els.photo, els.overlay]) {
    c.width = Math.round(dispW * dpr);
    c.height = Math.round(dispH * dpr);
    c.style.width = `${dispW}px`;
    c.style.height = `${dispH}px`;
  }
  els.wrap.style.width = `${dispW}px`;
  els.wrap.style.height = `${dispH}px`;

  const ctx = els.photo.getContext('2d');
  ctx.drawImage(img, 0, 0, els.photo.width, els.photo.height);

  overlay = new LineOverlay(els.overlay);
  overlay.onChange = trySolve;
  overlay.reset(img.width, img.height);
}

// ------------------------------------------------------------------- solving

function renderLegend() {
  els.legend.innerHTML = LINE_DEFS.map(
    (d) => `<span class="legend-row"><i style="background:${d.color}"></i>${d.label}</span>`
  ).join('');
}

/**
 * Recompute the camera from the current lines. Runs on every handle move, so
 * the user sees immediately whether their tracing is geometrically possible
 * rather than finding out after pressing a button.
 */
function trySolve() {
  if (!image || !overlay) return;

  const a1 = overlay.get('a1'), a2 = overlay.get('a2');
  const b1 = overlay.get('b1'), b2 = overlay.get('b2');

  const vpA = lineIntersection(a1.p1, a1.p2, a2.p1, a2.p2);
  const vpB = lineIntersection(b1.p1, b1.p2, b2.p1, b2.p2);

  if (!vpA || !vpB) {
    setSolveState(false, 'Those two edges are parallel on screen. Angle them so they converge.');
    solution = null;
    return;
  }

  const result = solveCamera({
    vpWidth: vpA,
    vpDepth: vpB,
    imageWidth: image.width,
    imageHeight: image.height
  });

  if (!result.ok) {
    setSolveState(false, result.detail ?? 'Those edges do not form a right angle in 3D.');
    solution = null;
    return;
  }

  // A phone lens is roughly 60-80 degrees; far outside that means the tracing
  // is geometrically valid but not describing a real photograph.
  const odd = result.fovDeg < 20 || result.fovDeg > 120;
  solution = result;
  setSolveState(
    !odd,
    odd
      ? `Solved, but the implied lens is ${result.fovDeg.toFixed(0)}° wide, which is unusual. Check the edges.`
      : `Solved. Lens ${result.fovDeg.toFixed(0)}° — consistent with a phone camera.`
  );
}

function setSolveState(ok, message) {
  els.solveState.textContent = message;
  els.solveState.classList.toggle('is-ok', ok);
  els.solveState.classList.toggle('is-bad', !ok);
  els.apply.disabled = !solution;
}

// ------------------------------------------------------------- build + place

function buildSpace() {
  if (!solution || !image) return;

  const referenceCm = Number(els.refCm.value);
  const pixelLength = overlay.refPixelLength();
  if (!referenceCm || pixelLength < 10) {
    fail('Drag the yellow line onto something you can measure, then give its real size.');
    return;
  }

  const scale = scaleFromReference({
    referenceCm,
    pixelLength,
    focalPx: solution.focalPx
  });
  if (!scale) {
    fail('Could not derive a scale from that measurement.');
    return;
  }

  projector ??= createProjector();
  projector.applySolution(solution, {
    imageWidth: image.width,
    imageHeight: image.height,
    cameraDistanceM: scale.impliedDepthM
  });

  const acc = estimateAccuracy({
    residual: solution.residual,
    referencePixelLength: pixelLength,
    imageDiagonal: Math.hypot(image.width, image.height)
  });

  els.stepPlace.classList.remove('hide');
  els.stepWalls.classList.remove('hide');
  els.accuracy.classList.remove('hide');
  els.accuracy.innerHTML =
    `<strong>Measured from a photo, ${acc.display}.</strong> ` +
    `The camera stood about ${scale.impliedDepthM.toFixed(1)} m away. ` +
    `This is less certain than placing it in AR, where the phone measures the room with its own sensors — ` +
    `everything here rests on the ${referenceCm} cm you just entered being right.`;

  els.note.textContent = 'Click a product to drop it into the room. Drag it along the floor.';
}

function createProjector() {
  // The WebGL canvas sits between the photo and the overlay.
  const canvas = document.createElement('canvas');
  canvas.id = 'gl-canvas';
  els.wrap.insertBefore(canvas, els.overlay);

  const rect = els.photo.getBoundingClientRect();
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;

  const p = new PhotoProjector(canvas);
  p.resize(rect.width, rect.height);

  p.onSelectionChange = (group) => {
    const product = group?.userData.product;
    els.selected.classList.toggle('hide', !product);
    els.placeControls.classList.toggle('hide', !product);
    if (!product) return;
    els.selName.textContent = product.name;
    const price = formatPrice(product.price);
    els.selDims.textContent = dimsLabel(product.dims_cm) + (price ? ` · ${price}` : '');
  };

  // Once products are placed, the tracing lines are just clutter and would
  // swallow every click meant for a product.
  els.overlay.classList.add('is-faded');

  renderCatalog();

  // Occlusion: invisible walls so a product pushed into the corner is hidden
  // behind them rather than drawn on top of the photo. The walls are derived
  // from the solve, but the user can correct them by eye.
  els.occlusionOn.addEventListener('change', () => p.setOcclusion(els.occlusionOn.checked));
  els.collisionOn.addEventListener('change', () => p.setWallCollision(els.collisionOn.checked));
  els.wallNear.addEventListener('click', () => p.nudgeOccluders(-0.15));
  els.wallFar.addEventListener('click', () => p.nudgeOccluders(0.15));

  document.getElementById('rot-left').addEventListener('click', () => p.rotateSelected(-Math.PI / 12));
  document.getElementById('rot-right').addEventListener('click', () => p.rotateSelected(Math.PI / 12));
  document.getElementById('remove').addEventListener('click', () => p.remove(p.selected));
  return p;
}

function renderCatalog() {
  if (els.catalog.dataset.ready) return;
  els.catalog.dataset.ready = '1';
  els.catalog.innerHTML = products
    .filter((p) => !p.calibration)
    .map(
      (p) => `
      <button class="room-chip" data-id="${p.id}">
        <img src="${p.photo}" alt="" loading="lazy" />
        <span class="room-chip-name">${esc(p.name)}</span>
        <span class="room-chip-dims">${dimsLabel(p.dims_cm)}</span>
      </button>`
    )
    .join('');

  els.catalog.addEventListener('click', async (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (!id || !projector) return;
    const product = products.find((p) => p.id === id);
    els.note.textContent = `Loading ${product.name}…`;
    try {
      await projector.add(product);
      els.note.textContent = 'Drag it along the floor to position it.';
    } catch (err) {
      fail(`Could not load ${product.name}. ${err.message}`);
    }
  });
}

function fail(message) {
  els.note.textContent = message;
  els.note.classList.add('is-error');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
