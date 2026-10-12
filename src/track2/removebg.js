/**
 * Client-side background removal via @imgly/background-removal (ONNX + WASM).
 * No server and no GPU. NOTE: the package is AGPL — fine for a competition entry,
 * but commercial use needs a licence from IMG.LY. See docs/TRACK2.md.
 */

// quint8 (42MB) over the default fp16 (84MB): on venue wifi the smaller model
// is the difference between a demo and a progress bar.
//
// publicPath points at our own vendored copy (npm run imgly:vendor) so a live
// demo never depends on staticimgly.com. Falls back to their CDN if absent.
const CONFIG = {
  model: 'isnet_quint8',
  output: { format: 'image/png', quality: 0.9 }
};

let publicPath;

async function resolvePublicPath() {
  if (publicPath !== undefined) return publicPath;
  try {
    // A real GET, not HEAD: dev servers may abort HEAD, which would silently
    // send us to the CDN even though the vendored assets are present.
    const res = await fetch('/imgly/resources.json', { cache: 'no-store' });
    const manifest = res.ok ? await res.json() : null;
    publicPath = manifest?.['/models/isnet_quint8'] ? `${location.origin}/imgly/` : null;
  } catch {
    publicPath = null;
  }
  if (!publicPath) {
    console.info('[removebg] vendored assets not found, using IMG.LY CDN. Run `npm run imgly:vendor` before the demo.');
  }
  return publicPath;
}

async function config(onProgress) {
  const path = await resolvePublicPath();
  return {
    ...CONFIG,
    ...(path ? { publicPath: path } : {}),
    ...(onProgress ? { progress: onProgress } : {})
  };
}

let modulePromise = null;
let warmed = false;

function loadModule() {
  modulePromise ??= import('@imgly/background-removal');
  return modulePromise;
}

/**
 * Fetch the model before the user needs it, so the download is not sitting in
 * the demo's critical path. Safe to call on page load; failures are non-fatal.
 */
export async function prewarm(onProgress) {
  if (warmed) return true;
  try {
    const { preload } = await loadModule();
    await preload(await config(onProgress));
    warmed = true;
    return true;
  } catch (err) {
    console.warn('[removebg] prewarm failed, will retry on first use:', err.message);
    return false;
  }
}

export async function removeBg(file, onProgress) {
  const { removeBackground } = await loadModule();
  return removeBackground(file, await config(onProgress));
}

export function isWarmed() {
  return warmed;
}

export function formatProgress(key, current, total) {
  const pct = total ? Math.round((current / total) * 100) : 0;
  const what = String(key).includes('fetch') ? 'Downloading model' : 'Processing';
  return `${what}… ${pct}%`;
}
