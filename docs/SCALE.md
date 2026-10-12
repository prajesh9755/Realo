# Scale — the three-gate discipline

True real-world scale is the whole product. If it is merely *usually* right, the product
is worse than useless, because it misleads with confidence.

So scale is not left to careful authoring. It is enforced mechanically at three gates,
and the second one runs on every single load.

---

## Why metres work at all

WebXR world units **are metres**. ARCore's hit-test returns a pose in metres relative to a
tracked reference space. So a glTF asset authored such that a 40 cm pot is `0.4` units tall
lands in the camera feed at genuinely 40 cm against the real floor.

Nothing clever is required. The entire mechanism is: *author in metres, place at a metric
pose, do not rescale.* Every gate below exists to protect that one invariant.

---

## Gate 1 — Author (Blender)

The asset must be correct before it ships.

1. Scene Properties → Units → **Unit System: Metric**, **Unit Scale: 1.0**.
2. Select the mesh. In the N-panel sidebar, read **Dimensions** (in metres).
3. Set Dimensions to the real product's measured size.
4. **Object → Apply → All Transforms.** This bakes the scale into vertex data.
   An unapplied object-level scale survives glTF export inconsistently — this is the
   single most common cause of a model that is "right in Blender, wrong in the browser."
5. Export **glTF 2.0 (.glb)**, **+Y up**, export scale **1.00**.
6. Record the real dimensions in `src/data/products.json` under `dims_cm`.

`products.json` is the single source of truth. It describes the *real product*, never the
asset. If the asset disagrees, the asset is wrong.

---

## Gate 2 — Load (code) — the important one

Never trust the asset. [`src/ar/scale.js`](../src/ar/scale.js) measures the loaded object
and compares it against the declared dimensions:

```js
const box = new THREE.Box3().setFromObject(model);
const size = box.getSize(new THREE.Vector3());   // metres
const factor = (dimsCm.h / 100) / size.y;

if (Math.abs(factor - 1) > 0.02) {
  console.warn(`[scale] DRIFT ${id}: asset is ${size.y*100}cm, declared ${dimsCm.h}cm`);
  model.scale.multiplyScalar(factor);            // self-heal
}
```

Two properties matter here:

- **It self-heals.** A mis-exported model is corrected at runtime, so a bad asset cannot
  silently ruin a demo.
- **It is loud.** The correction is logged with the actual numbers, so the underlying
  authoring bug gets fixed rather than hidden.

**Height is the reference axis.** It is the dimension people judge a product by, and the
one axis glTF exporters rarely swap. Width/depth are reported but not used for correction,
because a legitimately asymmetric model would otherwise fight the check.

Tolerance is **±2%**, in `SCALE_TOLERANCE`.

### Run it headlessly

`npm run verify:scale` parses every `.glb` in `products.json` outside the browser — walking
the node hierarchy and applying transforms — and exits non-zero on drift, so it can gate CI.

```
OK       calibration-cube-1m    asset 100.0×100.0×100.0cm | declared 100×100×100cm | err 0.00% | baseY 0.0cm
OK       calibration-cube-30cm  asset 30.0×30.0×30.0cm    | declared 30×30×30cm    | err 0.00% | baseY -0.0cm
```

---

## Gate 3 — Ground

A model authored around its centroid will float or sink when placed at a hit point, which
*reads as wrong scale* even when the size is perfect. So `groundAlign()` seats the base at
`y = 0` and centres it on XZ:

```js
object3d.position.x -= centre.x;
object3d.position.z -= centre.z;
object3d.position.y -= box.min.y;    // base on the floor
```

`npm run verify:scale` reports `baseY`, which should be ~0 for a well-authored asset.

---

## What is deliberately *not* built

**No free pinch-to-scale.** A user resizing the model by accident would silently destroy
the one claim the product makes, and they would never know. Scale is locked at 100%.

If a resize is ever added, the UI badge must flip from `true scale` to a red
`SCALE MODIFIED` — `ArOverlay.setTrueScale(false)` already implements exactly this.

Track 2's billboard is labelled **"your size"**, not "true scale", because nothing about
it was measured. See [TRACK2.md](TRACK2.md).

---

## Honest error sources

Be able to answer this from the judges. Say "within a couple of percent," never "exact."

| Source | Magnitude | Notes |
|---|---|---|
| ARCore floor-plane depth estimate | **Dominant** | Worse on featureless, shiny, or dark floors |
| User tap precision | Small | Affects position more than size |
| Asset authoring | Zero after Gate 2 | Corrected and logged |
| Float/matrix precision | Negligible | — |

The rendering pipeline is exactly metric; the uncertainty is in *where ARCore thinks the
floor is*, not in how big we draw the object.
