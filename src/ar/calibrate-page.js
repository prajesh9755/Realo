import { icon } from '../ui/icons.js';
import { loadCalibration, saveCalibration, clearCalibration, describe } from './calibration.js';

const REFERENCE_CM = 100;

document.getElementById('ar-icon').innerHTML = icon('ruler');

const measured = document.getElementById('measured');
const result = document.getElementById('result');
const current = document.getElementById('current');
const currentText = document.getElementById('current-text');
const note = document.getElementById('stage-note');

render();

document.getElementById('mv').addEventListener('load', () => {
  note.textContent = 'Place it on the floor, then measure one upright edge.';
});

document.getElementById('save').addEventListener('click', () => {
  const value = Number(measured.value);
  if (!value || !isFinite(value)) {
    fail('Enter the number the tape measure showed.');
    return;
  }
  try {
    const record = saveCalibration({ referenceCm: REFERENCE_CM, measuredCm: value });
    result.classList.remove('is-error');
    result.textContent = record.offsetCm === 0
      ? 'No correction needed on this device.'
      : `Saved. Models will be corrected by ${record.offsetCm > 0 ? '\u2212' : '+'}${Math.abs(record.offsetCm).toFixed(1)} cm.`;
    render();
  } catch (err) {
    fail(err.message);
  }
});

document.getElementById('clear').addEventListener('click', () => {
  clearCalibration();
  result.textContent = 'Calibration removed. Models render at their exact declared size.';
  result.classList.remove('is-error');
  measured.value = '';
  render();
});

function fail(message) {
  result.textContent = message;
  result.classList.add('is-error');
}

function render() {
  const calibration = loadCalibration();
  current.classList.toggle('hide', !calibration);
  if (calibration) {
    currentText.textContent =
      ` This device reads ${calibration.offsetCm > 0 ? 'tall' : 'short'} by ${describe(calibration)}. ` +
      `Measured against a ${calibration.referenceCm} cm reference.`;
  }
}
