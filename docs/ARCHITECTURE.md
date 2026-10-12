# Architecture

A single Vite multi-page app. No backend, no server-side rendering, no database.
Everything — including background removal — runs in the browser.

---

## Why the AR must run on the phone

This is the most consequential design constraint, and the least obvious, so it is first.

The intuition "stream the phone camera to the laptop and compute there, laptops are
faster" is reasonable and wrong. AR here is not mainly a compute problem — it is a
**sensing** problem.

ARCore's actual job is answering *"where is the floor, and where is the camera now, in
metres?"* It answers by fusing the camera feed with the phone's **gyroscope and
accelerometer** at ~100Hz. Those are physical chips on the phone.

| | Camera | Motion sensors | Compute | Can measure a room? |
|---|---|---|---|---|
| Phone | yes | **yes** | moderate | **yes** |
| Laptop | yes | no | high | no |

Send only video to the laptop and the metric information is gone: **a 40 cm pot at 1 m and
a 4 m pot at 10 m are identical pixels.** The data that distinguishes them was in the
sensors, not the frames. No amount of compute reconstructs it.

A laptop cannot tell you which way it is facing from a photograph, however fast it is.
It needs a compass. Here, the phone *is* the compass.

**Consequence:** the AR page runs in Chrome on the Android phone. For an audience, the
phone screen is mirrored to a laptop with `scrcpy`. The viewing experience is identical;
only the device executing the code changes.

---

## Page map

| Page | Role | Entry module |
|---|---|---|
| `index.html` | Store grid — flat 2D photos, like any shop | `src/store/store.js` |
| `product.html` | Product detail + "View in real life" | `src/store/pdp.js` |
| `ar.html` | Track 1 AR viewer (+ auto fallback) | `src/ar/main.js` |
| `try.html` | Track 2 paste → cutout → AR | `src/track2/main.js` |

## Module map

```
src/ar/
  session.js    support check, requestSession, feature negotiation
  hittest.js    reticle + XRHitTestSource; metric poses
  place.js      tap-to-place, anchor-or-fallback, contact shadow
  scale.js      Gate 2 + Gate 3  ← the true-scale guarantee
  billboard.js  Track 2 flat cutout plane
  ui.js         dom-overlay wrapper (cm readout, coaching, badge)
  viewer.js     owns renderer/scene/loop; composes the above
  main.js       ar.html controller + fallback ladder

src/track2/
  clipboard.js  paste/file/drop input, alpha-bounds measurement
  removebg.js   @imgly wrapper, prewarm, vendored-asset resolution
  main.js       try.html controller

src/store/
  catalog.js    products.json accessors (shared by all pages)
```

`viewer.js` is deliberately the only module that knows about `THREE.WebGLRenderer` and the
animation loop. `scale.js` and `hittest.js` are pure enough to test in isolation.

---

## Data flow — Track 1

```
products.json ──> store grid ──> PDP ──> ar.html?product=<id>
                                            │
                      GLTFLoader ──> normalizeToRealWorldScale()   [Gate 2+3]
                                            │
             requestSession('immersive-ar', {requiredFeatures:['hit-test']})
                                            │
                  per frame: getHitTestResults ──> reticle (metric pose)
                                            │
                              'select' ──> Placement.place()
                                            │
                        anchors available? ──> createAnchor()
                                   else ──> static pose in `local` space
```

## Data flow — Track 2

```
clipboard paste ──> Blob ──> @imgly removeBackground()  (client-side ONNX/WASM)
                               │
                   measureAlphaBounds() ──> true aspect ratio
                               │
              preset or slider ──> one dimension in cm; aspect derives the other
                               │
                  Billboard(texture, widthM, heightM) ──> same hit-test flow
```

---

## WebXR feature negotiation

Only `hit-test` is ever required. Everything else is optional and guarded.

```js
requiredFeatures: ['hit-test'],
optionalFeatures: ['anchors', 'dom-overlay', 'light-estimation']
```

| Feature | Status | How we treat it |
|---|---|---|
| `hit-test` | **Shipped** in Chrome/Android | Required. Everything rests on it. |
| `plane-detection` | Developer trial, needs a flag | **Not used.** Never load-bearing. |
| `anchors` | Experimental on phones (MDN) | Optional; fall back to a static `local` pose. |
| `dom-overlay` | Widely available | Optional; UI still works without it. |
| `light-estimation` | Optional | Cosmetic only. |

Rationale in [DECISIONS.md](DECISIONS.md).

---

## Degradation ladder

Never show an error where a preview will do. `checkArSupport()` drives this automatically —
no manual switching on stage.

| Tier | Condition | What the user gets |
|---|---|---|
| 1 | Android Chrome + ARCore + HTTPS | Live AR, true scale, cm readout |
| 2 | No WebXR (desktop, iOS), or session/model failure | `<model-viewer>` 3D orbit preview + an explanation of why there is no camera |
| 3 | `<model-viewer>` CDN unreachable | The flat product photo |

Tier 2 loads `<model-viewer>` from CDN rather than npm: it bundles its own three.js and
pins an older peer range than ours (`^0.183` vs our `0.186`), and keeping it off the npm
graph also keeps it out of the AR bundle.

---

## Build notes

- **COOP/COEP headers** are set in `vite.config.js` so `SharedArrayBuffer` is available,
  which ONNX Runtime uses for faster inference.
- `public/imgly/` holds the vendored background-removal model (~76MB) and is **gitignored** —
  regenerate with `npm run imgly:vendor`.
- The `viewer.js` chunk is ~637KB (three.js). Acceptable: it is cached, and the AR path
  needs it before the session starts.
