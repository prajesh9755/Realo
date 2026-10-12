/**
 * Device calibration for ARCore's floor-plane offset.
 *
 * Measured on the demo device (OnePlus 6T, Android 11): a 30 cm cube taped at
 * ~40 cm and a 100 cm cube at ~110 cm. The error is a CONSTANT +10 cm, not a
 * scale factor, which is why both readings are off by the same absolute amount
 * rather than the same ratio. That points at ARCore placing the floor plane
 * slightly below the real floor, so everything is drawn starting too low.
 *
 * The correction therefore subtracts a fixed height, never a multiplier:
 * scaling would under-correct large objects and over-correct small ones.
 *
 * This is a real measurement the user takes, not a fudge factor. It is stored
 * per device/browser and is always shown in the UI when active.
 */
const KEY = 'realo.calibration.v1';
const MAX_OFFSET_CM = 40;

export function loadCalibration() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (typeof c.offsetCm !== 'number' || !isFinite(c.offsetCm)) return null;
    if (Math.abs(c.offsetCm) > MAX_OFFSET_CM) return null;
    return c;
  } catch {
    return null;
  }
}

export function saveCalibration({ referenceCm, measuredCm }) {
  const offsetCm = measuredCm - referenceCm;
  if (!isFinite(offsetCm) || Math.abs(offsetCm) > MAX_OFFSET_CM) {
    throw new Error(`That reading implies a ${offsetCm.toFixed(0)} cm error, which is outside the plausible range. Re-measure against the real floor.`);
  }
  const record = {
    offsetCm,
    referenceCm,
    measuredCm,
    at: new Date().toISOString()
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // Private mode or blocked storage: calibration just will not persist.
  }
  return record;
}

export function clearCalibration() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
}

/**
 * The scale factor to apply to a model of a given real height so that, once
 * ARCore adds its constant offset back, the object measures correctly.
 *
 *   rendered = declared * factor + offset   and we want rendered == declared
 *   => factor = (declared - offset) / declared
 *
 * Height-dependent by design: a 10 cm offset is a third of a 30 cm object but a
 * tenth of a 1 m one, so a single multiplier cannot serve both.
 */
export function correctionFactor(declaredHeightCm, calibration) {
  if (!calibration || !declaredHeightCm) return 1;
  const corrected = declaredHeightCm - calibration.offsetCm;
  if (corrected <= 0) return 1;
  const factor = corrected / declaredHeightCm;
  // Refuse absurd corrections rather than silently rendering something tiny.
  return factor > 0.2 && factor < 2 ? factor : 1;
}

export function describe(calibration) {
  if (!calibration) return null;
  const sign = calibration.offsetCm >= 0 ? '+' : '';
  return `${sign}${calibration.offsetCm.toFixed(1)} cm, measured ${new Date(calibration.at).toLocaleDateString()}`;
}
