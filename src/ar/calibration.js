/**
 * Device characterisation for ARCore's floor-plane offset.
 *
 * WHAT THIS IS
 * ------------
 * A measurement instrument, not a correction. The user places a known cube,
 * tape-measures it, and we record how far this device's AR placement departs
 * from truth. That number is then DISCLOSED in the UI. It is never silently
 * applied to a model.
 *
 * WHY IT IS NOT A CORRECTION (read before "fixing" this)
 * ------------------------------------------------------
 * Track 1 hands the raw .glb to Scene Viewer, Google's own AR app, which
 * renders the file as it is on disk. We get no runtime hook: a `scale`
 * attribute on <model-viewer> affects only the in-page 3D preview, and
 * ar-scale="fixed" exists precisely to tell Scene Viewer to honour the file's
 * literal dimensions. An earlier version set that attribute and believed it
 * was correcting AR. It was not. It silently shrank the page preview and
 * changed nothing in AR. See docs/DECISIONS.md #13.
 *
 * Baking the offset into the .glb was the alternative. Rejected: it would make
 * the shipped file no longer match its declared dims_cm, which puts it in
 * direct conflict with `npm run verify:scale` — the gate that is the project's
 * actual evidence of correctness. We keep the asset chain exact and report the
 * device error instead.
 *
 * WHAT THE MEASUREMENT MEANS
 * --------------------------
 * Measured on the demo device (OnePlus 6T, Android 11): a 30 cm cube taped at
 * ~40 cm, 75 cm at ~84 cm, 100 cm at ~110 cm. Roughly +9-10 cm in every case,
 * independent of the cube's own size.
 *
 * That independence is the tell. A SCALE error would grow with the object
 * (1.33x would have put the metre cube at 133 cm, and it read 110). A constant
 * additive error means ARCore is placing the floor plane a fixed distance below
 * the real floor, so objects are seated too low and read too tall at the top
 * edge regardless of their height. It is a POSITION error in the floor
 * estimate, not a sizing error — the renderer itself is exactly metric.
 *
 * Stored per device/browser. Room- and device-specific: re-measure if the
 * demo venue changes.
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
    // Private mode or blocked storage: the measurement just will not persist.
  }
  return record;
}

export function clearCalibration() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
}

/** True when a measurement exists and is large enough to be worth disclosing. */
export function isSignificant(calibration) {
  return !!calibration && Math.abs(calibration.offsetCm) >= 1;
}

/**
 * The offset as a percentage of a given object's height — how much this
 * device's floor error matters for THIS product. A constant 9 cm is 30% of a
 * 30 cm lamp but 9% of a metre-tall cabinet, so the same device error is
 * material for small objects and nearly irrelevant for large ones. Shown to
 * the user so the disclosure is specific rather than generic.
 */
export function relativeError(declaredHeightCm, calibration) {
  if (!isSignificant(calibration) || !declaredHeightCm) return 0;
  return Math.abs(calibration.offsetCm) / declaredHeightCm;
}

export function describe(calibration) {
  if (!calibration) return null;
  const sign = calibration.offsetCm >= 0 ? '+' : '\u2212';
  return `${sign}${Math.abs(calibration.offsetCm).toFixed(1)} cm, measured ${new Date(calibration.at).toLocaleDateString()}`;
}

/** One-line disclosure for a product page, or null when there is nothing to say. */
export function disclosure(declaredHeightCm, calibration) {
  if (!isSignificant(calibration)) return null;
  const pct = relativeError(declaredHeightCm, calibration) * 100;
  const dir = calibration.offsetCm > 0 ? 'taller' : 'shorter';
  return `This phone places objects about ${Math.abs(calibration.offsetCm).toFixed(0)} cm ${dir} than truth ` +
         `(~${pct.toFixed(0)}% at this size). Measured on this device, not estimated.`;
}
