# Decisions

Short ADR-style log. Each entry records what was chosen, what was rejected, and *why* —
so the reasoning survives after the details are forgotten.

---

## 1. AR runs on the phone, not the laptop

**Decided.** The AR page executes in Chrome on the Android phone; the phone is mirrored to
a laptop via `scrcpy` for an audience.

**Rejected:** streaming the phone camera to a laptop and computing AR there.

**Why.** Real-world scale requires ARCore's gyroscope/accelerometer fusion, and those
sensors are on the phone. A bare video stream has the metric information stripped out — a
40 cm pot at 1 m and a 4 m pot at 10 m are identical pixels. This is missing information,
not insufficient compute, so a faster laptop does not help. Full argument in
[ARCHITECTURE.md](ARCHITECTURE.md).

**Cost accepted:** the demo depends on one Android phone. Mitigated by the tier-2 fallback
and a pre-recorded video.

---

## 2. Build on `hit-test`, not `plane-detection`

**Decided.** `requiredFeatures: ['hit-test']`. Plane detection is not used at all.

**Why.** Per Google's ARCore/WebXR comparison, `hit-test` is **shipped** in Chrome on
Android while `plane-detection` is still a **developer trial** requiring a flag — unusable
for a demo on someone else's device. Hit-test raycasts into the real world and returns a
pose in metres, which is all true scale needs. Plane geometry would be a nicety.

**Revisit if:** plane detection ships, and we want occlusion or multi-surface snapping.

---

## 3. `anchors` is optional, never required

**Decided.** `anchors` goes in `optionalFeatures`; on absence we keep a static pose in the
`local` reference space.

**Why.** Anchors are documented mainly for Android XR devices and MDN still marks
`XRAnchor` experimental; support on ordinary ARCore phones is unconfirmed. Requiring it
would fail session creation outright. ARCore keeps `local` space tracked well enough that
a placed object stays put for a demo-length session.

---

## 4. three.js + raw WebXR, not `<model-viewer>` as primary

**Decided.** Vanilla three.js r0.186 driving WebXR directly.

**Rejected:** `<model-viewer>` as the primary AR path; `@react-three/xr` v6; A-Frame.

**Why.**
- `<model-viewer>`'s AR mode hands off to **Scene Viewer**, a separate Android app. That
  would cost us the custom reticle and the live cm readout — and the readout *is* the
  visible proof of the core claim. Kept for tier-2 fallback, where it is excellent.
- `@react-three/xr` v6 rewrote its API (`createXRStore`, `useXRHitTest`); docs were thin
  and conflicting on the hit-test/anchors option shape. Wrong bet on a 5-day clock.
- A-Frame's entity-component indirection fights explicit metric logic.
- The upstream three.js `webxr_ar_hittest` example is ~80 lines and years-proven. It *is*
  the AR core.

---

## 5. No AI image-to-3D generation

**Decided.** Track 1 uses pre-made `.glb` models with hand-verified dimensions. We built
our own store precisely so we control the catalog.

**Rejected:** generating 3D from product photos (TripoSR, Hunyuan3D, etc.).

**Why.** Single-photo 3D generation needs GPU infrastructure, takes ~10s–minutes per item,
and produces unreliable geometry (melted backs, wrong proportions). Worst of all it would
make dimensions *guessed*, which contradicts the single thing this project claims. It would
have consumed the entire timeline for a weaker result.

**Note.** This is why Track 2 uses a flat cutout rather than generated 3D — a cutout's
limitations are obvious and honest, whereas a bad mesh looks authoritative while being wrong.

---

## 6. Clipboard paste as Track 2's primary input

**Decided.** `paste` is primary, file upload is the backup, drop zone is a convenience.
A browser extension is a stretch goal.

**Rejected:** dragging an image between two browser windows.

**Why.** Dragging an image usually transfers a **URL**, not pixels, and most e-commerce
CDNs block cross-origin fetches — so it would work on some sites and fail on others, which
is the worst possible behaviour for a live demo. The clipboard carries **real pixel data**,
so CORS never applies. It is also ~10 lines of code.

---

## 7. No free pinch-to-scale

**Decided.** Scale is locked at 100%. Drag repositions, two-finger twist yaws.

**Why.** A user pinch-zooming would silently break the one guarantee the product makes,
and would never know. If a resize is added later, the badge must flip to a red
`SCALE MODIFIED` — `ArOverlay.setTrueScale(false)` already supports this.

---

## 8. Self-host the background-removal model

**Decided.** `npm run imgly:vendor` downloads the quint8 model + ONNX runtime (~76MB) into
`public/imgly/`, and `removebg.js` prefers it, falling back to IMG.LY's CDN if absent.

**Why.** By default the library streams ~42MB from `staticimgly.com` on first use. That is
a third-party single point of failure in the middle of a live demo on venue wifi. We also
**pre-warm on page load** so the download is never in the demo's critical path.

**Also:** `isnet_quint8` (42.3MB) over the default `isnet_fp16` (84.1MB) — verified against
the IMG.LY manifest. Halves the download for a quality difference nobody will see on a
phone screen.

---

## 9. `@imgly/background-removal` despite AGPL

**Decided.** Use it, and disclose the licence prominently.

**Why.** It is the only mature option that runs fully client-side with no server or GPU.
AGPL is fine for a competition entry. Commercial use would need a licence from IMG.LY, or
a swap to a permissively-licensed model. Flagged in [TRACK2.md](TRACK2.md) and the README
rather than buried — volunteering a licence constraint reads as rigour.

---

## 10. Light, minimal design system from supplied reference screens

**Decided.** The UI follows the reference screens in `UI SCREENS/`: white page, near-black
ink, **Poppins**, square product tiles on `#F3F5F7`, pill buttons, stroke icons. Full spec
in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

**Rejected:** the dark theme (`#0b0f14` surfaces, green accent) built in the first pass. It
was discarded wholesale, not adapted.

**Why.** The first pass invented a dark "developer demo" aesthetic with no reference. The
supplied screens define an actual storefront design system, and this product *is* a
storefront. Values were **sampled from the images** rather than estimated: the palette by
reading pixels out of `04-color-library.png`, the type scale off `03-typography.png`.

**Also decided:** `docs/07-anti-ai-slop-ui-rules.md` arrived from an unrelated Flutter
project. Its general prohibitions apply; its `AppTheme`, Devanagari and `stitch_design.md`
specifics do not and were removed rather than left to mislead.

---

## 11. Product card images rendered from the models themselves — *supersedes placeholder SVGs*

**Originally decided.** `scripts/make-placeholder-photos.mjs` rendered a to-scale
silhouette per product, so the store was legible before real assets existed.

**Now decided.** `npm run photos` (`scripts/render-product-photos.mjs`) screenshots each
`.glb` through `<model-viewer>` on the dev server, via Playwright. The placeholder script
is gone. Landed in commit `b7ef232`.

**Why.** Once the models were sourced and verified, a silhouette was strictly worse than a
render of the thing itself — and the render is guaranteed to depict the same geometry that
AR will place, because it comes from the same file.

**Cost accepted:** `npm run photos` needs the dev server up and Playwright installed, so
it is a manual step rather than part of `npm run build`.
---

## 12. model-viewer / Scene Viewer as the primary AR path

**Decided.** `ar.html` is built around `<model-viewer>` with `ar-modes="scene-viewer webxr quick-look"`
and `ar-scale="fixed"`. Raw WebXR is no longer the Track 1 path.

**Why.** On the demo device (OnePlus 6T, Android 11) raw WebXR placed the object but tracking
drifted and the model did not hold position when walking around it. Scene Viewer is Google's
native AR app and tracks noticeably more solidly on older hardware.

**What it costs.** Scene Viewer renders in its own app, so our in-AR overlay is gone: no live
cm readout, no custom reticle, no `?debug=1` while placed. The scale claim therefore moves
*before* the handoff — a `.scale-card` showing the real dimensions, a verification line, and
the AR button itself reading "View at 104 cm".

**How the scale guarantee survives.** Scene Viewer renders the `.glb` directly, so runtime
correction is impossible: the file on disk must already be right. `scripts/rescale-model.mjs`
bakes the fix in, `npm run verify:scale` gates it, and `src/ar/verify.js` re-checks in the
browser to display the verification state. `ar-scale="fixed"` stops the user pinch-resizing.

**Two traps worth remembering.**
1. **Never import three.js on a page using model-viewer.** It bundles its own copy; a second
   instance stops it rendering entirely. This is why `verify.js` parses the GLB by hand rather
   than reusing `scale.js`.
2. **model-viewer needs a resolved height and a *visible* element.** It uses Intersection
   Observer to skip rendering when not visible, so a backgrounded tab reports `loaded: false`
   and a 0x0 canvas. That is idle behaviour, not a failure — do not debug it as one.

**WebXR is retained for Track 2**, where a runtime-generated cutout cannot be handed to
Scene Viewer.

---

---

## 13. The ARCore floor offset is measured and disclosed, not corrected

**Decided.** `calibrate.html` measures this device's floor-plane offset and stores it.
Every product page then **states** it (`#p-device`). No model is rescaled at runtime.

**Rejected:** applying a per-object correction factor so objects measure correctly in AR.

**Why it cannot work.** An earlier version did exactly that — `ar/main.js` set
`mv.setAttribute('scale', ...)` with a height-dependent factor. **It was a no-op in AR.**
`scale` is a model-viewer *scene-graph* property: it transforms the in-page 3D preview.
Track 1 AR hands off to Scene Viewer, which receives a URL and renders the `.glb` from
disk, and `ar-scale="fixed"` explicitly tells it to honour the file's own dimensions. The
net effect was a page preview silently shrunk to 2/3 size and **zero** change in AR — the
worst case, because the UI claimed a correction that did not exist.

**Why not bake it into the `.glb` instead.** That is the only way to really change what
Scene Viewer renders, and it was rejected: the shipped file would no longer match its
declared `dims_cm`, so `npm run verify:scale` — the gate that is this project's actual
evidence of correctness — would start failing or have to be weakened. Trading away the
proof to patch a symptom is a bad trade. Calibration is also per-device and discovered at
runtime on the phone, so build-time baking cannot see it anyway.

**What the measurement showed.** 30→40, 75→84, 100→110 cm: **+9-10 cm, constant across
cube sizes.** Constant, not proportional — a 1.33× scale error would have put the metre
cube at 133 cm. So ARCore seats the floor plane ~9-10 cm too low: objects sit too low and
read too tall at the top edge regardless of their own height. It is a **position** error in
the floor estimate, and the renderer itself is exactly metric.

**What we say instead.** "This phone places objects about 9 cm taller than truth (~30% at
this size). Measured on this device, not estimated." A characterised error source, stated
in the product's own terms, is stronger than a silent fudge — and it is the honest version
of the same information.

**Revisit if:** Track 1 moves off Scene Viewer back to raw WebXR, where we control the
scene graph and a real correction becomes possible (see #12 for why we left).