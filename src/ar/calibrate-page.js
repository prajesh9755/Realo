import { icon } from '../ui/icons.js';
import { loadCalibration, saveCalibration, clearCalibration, describe } from './calibration.js';

/**
 * Reference sizes, largest first. A bigger cube gives a better calibration:
 * a tape reading carries roughly +/-1cm of error, which is 1% of a metre but
 * over 3% of 30cm, and that error propagates into every later placement.
 * 75cm is the default as the best trade of floor space against accuracy.
 */
const REFERENCES = [
  { cm: 100, model: '/models/calibration-cube-1m.glb', note: 'most accurate, needs space' },
  { cm: 75, model: '/models/calibration-cube-75cm.glb', note: 'recommended' },
  { cm: 50, model: '/models/calibration-cube-50cm.glb', note: 'tight spaces' },
  { cm: 30, model: '/models/calibration-cube-30cm.glb', note: 'least accurate' }
];

let reference = REFERENCES[1];

const mv = document.getElementById('mv');
const measured = document.getElementById('measured');
const result = document.getElementById('result');
const current = document.getElementById('current');
const currentText = document.getElementById('current-text');
const note = document.getElementById('stage-note');
const refDims = document.getElementById('ref-dims');
const arLabel = document.getElementById('ar-label');

document.getElementById('ar-icon').innerHTML = icon('ruler');

renderRefs();
applyReference(reference);
render();

mv.addEventListener('load', () => {
  note.textContent = 'Place it on the floor, then measure one upright edge.';
});

document.getElementById('refs').addEventListener('click', (e) => {
  const cm = Number(e.target.closest('[data-cm]')?.dataset.cm);
  if (!cm) return;
  const next = REFERENCES.find((r) => r.cm === cm);
  if (next) {
    reference = next;
    applyReference(next);
    renderRefs();
  }
});

document.getElementById('save').addEventListener('click', () => {
  const value = Number(measured.value);
  if (!value || !isFinite(value)) {
    fail('Enter the number the tape measure showed.');
    return;
  }
  try {
    const record = saveCalibration({ referenceCm: reference.cm, measuredCm: value });
    result.classList.remove('is-error');
    result.textContent = Math.abs(record.offsetCm) < 1
      ? 'This device places objects accurately. Nothing to disclose.'
      : `Saved. Product pages will now disclose that this phone places objects about ` +
        `${Math.abs(record.offsetCm).toFixed(0)} cm ${record.offsetCm > 0 ? 'taller' : 'shorter'} than truth.`;
    render();
  } catch (err) {
    fail(err.message);
  }
});

document.getElementById('clear').addEventListener('click', () => {
  clearCalibration();
  result.textContent = 'Measurement removed. Product pages will stop showing the device note.';
  result.classList.remove('is-error');
  measured.value = '';
  render();
});

function applyReference(ref) {
  mv.setAttribute('src', ref.model);
  refDims.textContent = `${ref.cm} cm`;
  arLabel.textContent = `Place the ${ref.cm} cm cube`;
  measured.placeholder = String(ref.cm + 10);
  measured.min = String(Math.max(5, Math.round(ref.cm * 0.5)));
  measured.max = String(Math.round(ref.cm * 2));
}

function renderRefs() {
  document.getElementById('refs').innerHTML = REFERENCES
    .map((r) => `<button class="preset${r.cm === reference.cm ? ' is-active' : ''}" data-cm="${r.cm}">${r.cm} cm</button>`)
    .join('');
}

function fail(message) {
  result.textContent = message;
  result.classList.add('is-error');
}

function render() {
  const calibration = loadCalibration();
  current.classList.toggle('hide', !calibration);
  if (calibration) {
    currentText.textContent =
      ` This device places objects ${calibration.offsetCm > 0 ? 'tall' : 'short'} by ${describe(calibration)}, ` +
      `measured against a ${calibration.referenceCm} cm reference. ` +
      `Product pages disclose this; the models themselves are unchanged and still exact.`;
  }
}
