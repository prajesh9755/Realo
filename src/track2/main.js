import * as THREE from 'three';
import { track2Presets } from '../store/catalog.js';
import { onImageInput, measureAlphaBounds, cropToBounds } from './clipboard.js';
import { prewarm, removeBg, formatProgress } from './removebg.js';
import { Billboard, sizeFromPreset, sizeFromAxis } from '../ar/billboard.js';
import { checkArSupport } from '../ar/session.js';
import { ArViewer } from '../ar/viewer.js';
import { icon } from '../ui/icons.js';

for (const [attr, name] of [['data-icon-close', 'close'], ['data-icon-refresh', 'refresh']]) {
  const node = document.querySelector(`[${attr}]`);
  if (node) node.innerHTML = icon(name);
}
document.getElementById('go-icon').innerHTML = icon('cube');

const ui = {
  drop: document.getElementById('drop'),
  file: document.getElementById('file'),
  status: document.getElementById('status'),
  editor: document.getElementById('editor'),
  cutout: document.getElementById('cutout'),
  presets: document.getElementById('presets'),
  range: document.getElementById('size-range'),
  num: document.getElementById('size-num'),
  derived: document.getElementById('derived'),
  goAr: document.getElementById('go-ar'),
  canvas: document.getElementById('ar-canvas'),
  arUi: document.getElementById('ar-ui')
};

const state = {
  cutoutBlob: null,
  cutoutUrl: null,
  aspect: 1,
  axis: 'w',
  cm: 60,
  placement: 'wall',
  presetId: 'poster'
};

let viewer = null;

init();

function init() {
  renderPresets();
  bindSizeInputs();

  onImageInput(handleImage, { dropZone: ui.drop, fileInput: ui.file });

  ui.goAr.addEventListener('click', enterAr);

  // Pull the model down now, not when the user is waiting on stage.
  setStatus('Getting the background remover ready…');
  prewarm((k, c, t) => setStatus(formatProgress(k, c, t))).then((ok) => {
    setStatus(ok ? 'Ready. Copy a product image and press Ctrl+V.' : 'Ready. (Model will load on first use.)');
  });
}

async function handleImage(file, source) {
  if (!file) {
    setStatus('That drop had no image in it. Copy the image and press Ctrl+V instead.', true);
    return;
  }

  try {
    setStatus(source === 'paste' ? 'Got the pasted image. Removing background…' : 'Removing background…');
    ui.goAr.disabled = true;

    const raw = await removeBg(file, (k, c, t) => setStatus(formatProgress(k, c, t)));

    const bounds = await measureAlphaBounds(raw);
    const cropped = await cropToBounds(raw, bounds);

    if (state.cutoutUrl) URL.revokeObjectURL(state.cutoutUrl);
    state.cutoutBlob = cropped;
    state.cutoutUrl = URL.createObjectURL(cropped);
    state.aspect = bounds.aspect || 1;

    ui.cutout.src = state.cutoutUrl;
    ui.editor.classList.remove('hide');
    ui.goAr.disabled = false;

    applyPreset(track2Presets.find((p) => p.id === state.presetId) ?? track2Presets[0]);
    setStatus(`Background removed. Shape is ${state.aspect.toFixed(2)}:1 — now set its real size.`);
  } catch (err) {
    console.error('[track2] failed', err);
    setStatus(`Could not process that image: ${err.message}`, true);
    ui.goAr.disabled = true;
  }
}

function renderPresets() {
  ui.presets.innerHTML = track2Presets
    .map((p) => `<button class="preset" data-preset="${p.id}">${p.label} · ${p.cm}cm</button>`)
    .join('');

  ui.presets.addEventListener('click', (e) => {
    const id = e.target.closest('[data-preset]')?.dataset.preset;
    if (!id) return;
    const preset = track2Presets.find((p) => p.id === id);
    if (preset) applyPreset(preset);
  });
}

function applyPreset(preset) {
  state.presetId = preset.id;
  state.axis = preset.axis;
  state.cm = preset.cm;
  state.placement = preset.placement;

  ui.range.value = String(preset.cm);
  ui.num.value = String(preset.cm);

  for (const btn of ui.presets.querySelectorAll('.preset')) {
    btn.classList.toggle('is-active', btn.dataset.preset === preset.id);
  }
  updateDerived();
}

function bindSizeInputs() {
  const sync = (value) => {
    const cm = Math.max(1, Math.min(400, Number(value) || 1));
    state.cm = cm;
    ui.range.value = String(Math.min(250, cm));
    ui.num.value = String(cm);
    // A hand-typed size is no longer any of the presets.
    for (const btn of ui.presets.querySelectorAll('.preset')) btn.classList.remove('is-active');
    state.presetId = null;
    updateDerived();
  };

  ui.range.addEventListener('input', (e) => sync(e.target.value));
  ui.num.addEventListener('input', (e) => sync(e.target.value));
}

function currentSize() {
  return sizeFromAxis(state.axis, state.cm, state.aspect);
}

function updateDerived() {
  const { w, h } = currentSize();
  ui.derived.textContent =
    `Will appear ${w.toFixed(0)} cm wide × ${h.toFixed(0)} cm tall ` +
    `(you set ${state.axis === 'w' ? 'width' : 'height'}; the other follows the image proportions).`;
}

async function enterAr() {
  const support = await checkArSupport();
  if (!support.ok) {
    setStatus(`${support.message} Open this page in Chrome on an Android phone.`, true);
    return;
  }

  try {
    ui.goAr.disabled = true;
    setStatus('Starting AR…');

    viewer ??= new ArViewer({ canvas: ui.canvas, overlayRoot: ui.arUi });

    const texture = await loadTexture(state.cutoutUrl);
    const { w, h } = currentSize();
    const billboard = new Billboard(texture, {
      widthM: w / 100,
      heightM: h / 100,
      placement: state.placement
    });

    viewer.setBillboard(billboard, {
      name: 'Pasted product',
      dimsText: `${w.toFixed(0)} × ${h.toFixed(0)} cm`
    });

    await viewer.start();
    ui.canvas.classList.remove('hide');
    ui.arUi.classList.remove('hide');
    document.getElementById('page').classList.add('hide');

    viewer.onEnded = () => {
      ui.canvas.classList.add('hide');
      ui.arUi.classList.add('hide');
      document.getElementById('page').classList.remove('hide');
      setStatus('Back from AR. Adjust the size or paste another image.');
    };
  } catch (err) {
    console.error('[track2] ar failed', err);
    setStatus(err.message || 'Could not start AR.', true);
  } finally {
    ui.goAr.disabled = false;
  }
}

function loadTexture(url) {
  return new THREE.TextureLoader().loadAsync(url);
}

function setStatus(message, isError = false) {
  ui.status.textContent = message;
  ui.status.classList.toggle('is-error', isError);
}
