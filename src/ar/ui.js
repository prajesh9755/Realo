/**
 * dom-overlay UI. The cm readout is the visual proof of the true-scale claim,
 * so it stays on screen the whole session.
 */
export class ArOverlay {
  constructor(root) {
    this.root = root;
    this.el = {
      coach: root.querySelector('[data-coach]'),
      dims: root.querySelector('[data-dims]'),
      badge: root.querySelector('[data-badge]'),
      name: root.querySelector('[data-name]'),
      debug: root.querySelector('[data-debug]'),
      reset: root.querySelector('[data-reset]'),
      exit: root.querySelector('[data-exit]')
    };
  }

  setProduct(name, dimsText) {
    if (this.el.name) this.el.name.textContent = name;
    if (this.el.dims) this.el.dims.textContent = dimsText;
  }

  /** Red badge whenever scale is not 100%, so a stray resize can never pass unnoticed. */
  setTrueScale(isTrue, label = 'true scale') {
    const badge = this.el.badge;
    if (!badge) return;
    badge.textContent = isTrue ? label : 'SCALE MODIFIED';
    badge.classList.toggle('is-true', isTrue);
    badge.classList.toggle('is-false', !isTrue);
  }

  coach(message) {
    if (!this.el.coach) return;
    this.el.coach.textContent = message ?? '';
    this.el.coach.hidden = !message;
  }

  debug(lines) {
    if (!this.el.debug) return;
    this.el.debug.hidden = !lines;
    if (lines) this.el.debug.textContent = lines;
  }

  showPlaced(placed) {
    this.root.classList.toggle('is-placed', placed);
  }
}

/**
 * Tap-to-place wording: the user aims with their finger, not with a reticle, so
 * the instruction names the tap rather than a ring to wait for. `found` is only
 * used when ?reticle=1 puts the ring back on screen.
 */
export const COACH = {
  searching: 'Move the phone slowly over the surface, then tap where you want it.',
  found: 'Tap to place it at its real size.',
  noSurface: 'No surface found there. Move the phone slowly to scan, then tap again.',
  placed: 'Walk around it. Drag to move, twist with two fingers to rotate.',
  lost: 'Tracking lost. Move the phone slowly over a textured surface.'
};
