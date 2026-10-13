import { getProduct, dimsLabel } from '../store/catalog.js';
import { getProductIdFromUrl } from './session.js';
import { verifyModelScale } from './verify.js';
import { loadCalibration, isSignificant, disclosure } from './calibration.js';
import { icon } from '../ui/icons.js';

const product = getProduct(getProductIdFromUrl());

if (!product) {
  document.querySelector('.arview-grid').innerHTML =
    '<p class="status is-error">Product not found. <a href="/" style="text-decoration:underline">Back to the store</a>.</p>';
} else {
  init();
}

async function init() {
  document.title = `${product.name} — in your room`;
  document.getElementById('ar-icon').innerHTML = icon('cube');

  document.getElementById('crumb').innerHTML =
    `<a href="/">Shop</a><span class="sep">${icon('chevronRight')}</span>` +
    `<span class="here">${esc(product.name)}</span>`;

  document.getElementById('p-name').textContent = product.name;
  document.getElementById('p-blurb').textContent = product.blurb;
  document.getElementById('p-dims').textContent = dimsLabel(product.dims_cm);
  document.getElementById('p-w').textContent = `${product.dims_cm.w} cm`;
  document.getElementById('p-h').textContent = `${product.dims_cm.h} cm`;
  document.getElementById('p-d').textContent = `${product.dims_cm.d} cm`;

  // The scale guarantee still runs, just headlessly: Scene Viewer renders the .glb
  // itself, so the file on disk must already be correct. This reports whether it is.
  verifyModelScale(product).then(report => {
    const el = document.getElementById('p-verified');
    if (!report) { el.textContent = ''; return; }

    if (!report.withinTolerance) {
      el.textContent = `WARNING: asset is ${report.assetCm.h}cm, declared ${product.dims_cm.h}cm`;
      el.classList.add('is-warn');
      return;
    }

    // This is a statement about the ASSET only: the .glb matches its declared
    // dimensions. Device placement error is a separate claim, disclosed below.
    el.textContent = `asset verified to ±${(report.driftRatio * 100).toFixed(1)}%`;
  });

  const mv = document.getElementById('mv');

  // No runtime scale correction is applied, deliberately. Scene Viewer renders
  // the .glb from disk and ar-scale="fixed" makes it honour the file's own
  // dimensions, so a `scale` attribute here would change the page preview and
  // nothing in AR. The file is already exact (verify:scale gates it); this
  // device's floor-plane error is reported instead. See calibration.js.
  const calibration = loadCalibration();
  const deviceNote = document.getElementById('p-device');
  if (isSignificant(calibration)) {
    deviceNote.textContent = disclosure(product.dims_cm.h, calibration);
    deviceNote.classList.remove('hide');
  }

  mv.setAttribute('src', product.model);
  mv.setAttribute('alt', product.name);
  // Shown inside Scene Viewer's own UI, so the size claim survives the handoff.
  mv.setAttribute('ar-placement', product.placement === 'wall' ? 'wall' : 'floor');

  const note = document.getElementById('stage-note');
  const label = document.getElementById('ar-label');

  mv.addEventListener('load', () => {
    note.textContent = 'Drag to orbit. Tap the button to place it in your room at real size.';
  });

  mv.addEventListener('error', (e) => {
    note.textContent = `Could not load the model. ${e.detail?.sourceError?.message ?? ''}`;
    note.classList.add('is-error');
  });

  // canActivateAR is false on desktop and on iOS without Quick Look.
  const sync = () => {
    const btn = document.getElementById('ar-button');
    if (!btn) return;
    if (mv.canActivateAR) {
      label.textContent = `View at ${product.dims_cm.h} cm`;
      btn.classList.remove('hide');
    } else {
      btn.classList.add('hide');
      note.textContent = 'This device cannot open AR. Use Chrome on an Android phone with ARCore, or Safari on a recent iPhone. The 3D preview above still works.';
    }
  };
  mv.addEventListener('load', sync);
  setTimeout(sync, 1200);

  mv.addEventListener('ar-status', (e) => {
    if (e.detail.status === 'session-started') note.textContent = 'Placing at real size.';
    if (e.detail.status === 'not-presenting') note.textContent = 'Back from AR. Tap again to place it once more.';
    if (e.detail.status === 'failed') {
      note.textContent = 'AR could not start. Check that Google Play Services for AR is installed and up to date.';
      note.classList.add('is-error');
    }
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

