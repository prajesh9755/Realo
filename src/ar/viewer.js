import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { checkArSupport, requestArSession, isDebug } from './session.js';
import { createReticle, HitTester } from './hittest.js';
import { Placement } from './place.js';
import { normalizeToRealWorldScale, formatDims } from './scale.js';
import { ArOverlay, COACH } from './ui.js';

export class ArViewer {
  constructor({ canvas, overlayRoot }) {
    this.canvas = canvas;
    this.overlay = new ArOverlay(overlayRoot);
    this.overlayRoot = overlayRoot;
    this.debug = isDebug();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.xr.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 40);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(0.5, 3, 0.8);
    this.scene.add(dir);

    // Tap-to-place is the default: no roaming reticle, the object lands where the
    // user's finger is. The reticle is kept behind ?reticle=1 because it is the
    // only way to see what the centre ray is doing when diagnosing a bad surface.
    this.showReticle = new URLSearchParams(location.search).get('reticle') === '1';
    this.reticle = createReticle();
    this.reticle.visible = false;
    if (this.showReticle) this.scene.add(this.reticle);

    this.hitTester = new HitTester();
    this.placement = new Placement(this.scene);
    this.session = null;
    this.enabled = {};
    this.scaleReport = null;
    this.product = null;
    this.billboard = null;
    this.debugGrid = null;
    this.isDragging = false;

    this.renderer.setAnimationLoop((t, frame) => this.#onFrame(frame));
    this.#bindInput();
  }

  async loadProduct(product) {
    this.product = product;
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    loader.setDRACOLoader(draco);

    const gltf = await loader.loadAsync(product.model);
    const model = gltf.scene;

    // Gate 2 + Gate 3: never trust the asset's own units.
    this.scaleReport = normalizeToRealWorldScale(model, product.dims_cm, product.id);
    console.info('[scale] report', this.scaleReport);

    this.placement.setContent(model);
    this.overlay.setProduct(product.name, formatDims(product.dims_cm));
    this.overlay.setTrueScale(true);
    return this.scaleReport;
  }

  /**
   * Track 2: a flat cutout at a user-asserted size. The badge says "your size"
   * rather than "true scale", because nothing here was measured.
   */
  setBillboard(billboard, { name, dimsText }) {
    this.billboard = billboard;
    this.placement.setContent(billboard);
    this.overlay.setProduct(name, dimsText);
    this.overlay.setTrueScale(true, 'your size');
  }

  async start() {
    const support = await checkArSupport();
    if (!support.ok) throw Object.assign(new Error(support.message), { reason: support.reason });

    const { session, enabled } = await requestArSession({
      overlayRoot: this.overlayRoot
    });
    this.session = session;
    this.enabled = enabled;

    await this.renderer.xr.setSession(session);

    try {
      await this.hitTester.start(session);
    } catch (err) {
      // Session is live but unusable; close it so the caller can fall back cleanly
      // instead of leaving the user on a dead black screen.
      document.body.classList.remove('xr-active');
      await session.end().catch(() => {});
      throw err;
    }

    // Transient hit-test results exist ONLY while the touch is live. `select`
    // fires on release, by which time the input source is gone and the results
    // are empty -- so the tap pose must be captured on `selectstart`, while the
    // finger is still down, and consumed by `select`.
    session.addEventListener('selectstart', () => this.#onSelectStart());
    session.addEventListener('select', () => this.#onSelect());
    session.addEventListener('end', () => this.#onEnd());

    document.body.classList.add('xr-active');
    this.overlay.coach(COACH.searching);
    if (this.debug) this.#addDebugGrid();
    return session;
  }

  async end() {
    await this.session?.end();
  }

  /** Capture the tap-aimed pose while the finger is still down. */
  #onSelectStart() {
    if (this.placement.placed) return;
    const frame = this.renderer.xr.getFrame();
    if (!frame || !this.hitTester.supportsTapTarget) return;
    this.hitTester.updateTransient(frame);
  }

  #onSelect() {
    if (this.placement.placed) return;
    const frame = this.renderer.xr.getFrame();
    if (!frame) return;

    // hasTapHit was set by #onSelectStart; do NOT re-read transient results here,
    // the touch has ended and they are empty.
    const preferTap = this.hitTester.supportsTapTarget;

    if (this.placement.place(this.hitTester, { frame, enabled: this.enabled, preferTap })) {
      this.overlay.coach(COACH.placed);
      this.overlay.showPlaced(true);
      this.reticle.visible = false;
    } else {
      // Nothing under the finger. Say which surface failed rather than going silent,
      // which is the failure mode the roaming reticle used to make visible.
      this.overlay.coach(COACH.noSurface);
    }
    this.hitTester.hasTapHit = false;
  }

  #onEnd() {
    document.body.classList.remove('xr-active');
    this.hitTester.stop();
    this.placement.reset();
    this.overlay.showPlaced(false);
    this.overlay.coach(null);
    this.session = null;
    this.onEnded?.();
  }

  resetPlacement() {
    this.placement.reset();
    this.overlay.showPlaced(false);
    this.overlay.coach(COACH.searching);
  }

  #onFrame(frame) {
    if (!frame) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (!this.placement.placed) {
      // The centre ray still runs: it feeds ?debug=1, the optional reticle, and the
      // fallback placement path on devices without transient input.
      const had = this.hitTester.hasHit;
      const hit = this.hitTester.update(frame, this.showReticle ? this.reticle : null);
      // With a reticle on screen, "found" means the ring locked on. Without one,
      // the centre ray is invisible to the user, so promising "tap to place" off it
      // would be describing something they cannot see.
      if (this.showReticle) {
        if (hit && !had) this.overlay.coach(COACH.found);
        if (!hit && had) this.overlay.coach(COACH.searching);
      }
    } else {
      this.placement.update(frame, this.hitTester.localSpace);
      if (this.isDragging) {
        const preferTap = this.hitTester.supportsTapTarget;
        if (preferTap) this.hitTester.updateTransient(frame);
        this.hitTester.update(frame, null);
        this.placement.moveTo(this.hitTester, { preferTap });
      }
      if (this.billboard) {
        const xrCamera = this.renderer.xr.getCamera();
        this.billboard.update(xrCamera.position);
      }
    }

    if (this.debug) {
      const d = this.hitTester.distance;
      this.overlay.debug(
        [
          `hit: ${this.hitTester.hasHit ? 'yes' : 'no'}`,
          `tap-aim: ${this.hitTester.supportsTapTarget ? 'transient' : 'centre-ray'}`,
          `distance: ${d ? d.toFixed(3) + ' m' : '--'}`,
          `anchors: ${this.enabled.anchors ? 'on' : 'off'}`,
          this.scaleReport
            ? `scale: ${this.scaleReport.finalCm.h}cm / declared ${this.scaleReport.declaredCm.h}cm` +
              (this.scaleReport.corrected ? ' (corrected)' : '')
            : 'scale: --'
        ].join('\n')
      );
      if (this.debugGrid && this.hitTester.hasHit) {
        this.debugGrid.visible = true;
        this.debugGrid.position.setFromMatrixPosition(this.hitTester.lastHitMatrix);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  #addDebugGrid() {
    this.debugGrid = new THREE.GridHelper(1, 10, 0x22d3ee, 0x155e75);
    this.debugGrid.visible = false;
    this.scene.add(this.debugGrid);
  }

  /**
   * Drag to reposition, two-finger twist for yaw. Deliberately no pinch-to-scale:
   * a free resize would silently break the true-scale guarantee.
   */
  #bindInput() {
    const root = this.overlayRoot;
    let lastAngle = null;

    root.addEventListener('touchstart', (e) => {
      if (!this.placement.placed) return;
      if (e.touches.length === 1) this.isDragging = true;
      if (e.touches.length === 2) {
        this.isDragging = false;
        lastAngle = twoFingerAngle(e.touches);
      }
    }, { passive: true });

    root.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && lastAngle !== null) {
        const angle = twoFingerAngle(e.touches);
        this.placement.rotateBy(angle - lastAngle);
        lastAngle = angle;
      }
    }, { passive: true });

    root.addEventListener('touchend', (e) => {
      if (e.touches.length === 0) {
        this.isDragging = false;
        lastAngle = null;
      }
    }, { passive: true });

    this.overlay.el.reset?.addEventListener('click', () => this.resetPlacement());
    this.overlay.el.exit?.addEventListener('click', () => this.end());
  }
}

function twoFingerAngle(touches) {
  return Math.atan2(
    touches[1].clientY - touches[0].clientY,
    touches[1].clientX - touches[0].clientX
  );
}
