const REQUIRED = ['hit-test'];
const OPTIONAL = ['local-floor', 'anchors', 'dom-overlay', 'light-estimation'];

/**
 * Tier 1 of the degradation ladder (docs/RISKS.md): is real AR available?
 * Anything other than `ok` must fall back to the non-AR preview rather than erroring.
 */
export async function checkArSupport() {
  if (!window.isSecureContext) {
    return { ok: false, reason: 'insecure-context', message: 'AR needs HTTPS. Open the deployed URL, or use adb reverse over USB.' };
  }
  if (!navigator.xr) {
    return { ok: false, reason: 'no-webxr', message: 'This browser has no WebXR. Use Chrome on Android.' };
  }
  try {
    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    return supported
      ? { ok: true }
      : { ok: false, reason: 'no-immersive-ar', message: 'No AR support here. On Android, check Google Play Services for AR.' };
  } catch (err) {
    return { ok: false, reason: 'check-failed', message: err.message };
  }
}

export async function requestArSession({ overlayRoot } = {}) {
  const init = { requiredFeatures: [...REQUIRED], optionalFeatures: [...OPTIONAL] };
  if (overlayRoot) init.domOverlay = { root: overlayRoot };

  const session = await navigator.xr.requestSession('immersive-ar', init);
  return { session, enabled: enabledFeatures(session) };
}

export function enabledFeatures(session) {
  const list = session.enabledFeatures ? Array.from(session.enabledFeatures) : [];
  return {
    list,
    // enabledFeatures is itself not universally reported; absence is not proof of absence,
    // so callers must still guard the actual API call.
    anchors: list.includes('anchors'),
    domOverlay: list.includes('dom-overlay'),
    lightEstimation: list.includes('light-estimation')
  };
}

export function isDebug() {
  return new URLSearchParams(location.search).get('debug') === '1';
}

export function getProductIdFromUrl() {
  return new URLSearchParams(location.search).get('product');
}
