# Scale verification

The project claims real-world accuracy, so the claim gets tested rather than asserted.
**Run this on Day 3, not on demo morning, and film it.** The footage doubles as the backup
demo and as evidence for judges.

Target: **±2%**.

---

## Step 0 — Headless check (every build)

```bash
npm run verify:scale
```

Parses each `.glb`, walks the node hierarchy applying transforms, and compares the real
bounding box against `dims_cm`. Exits non-zero on drift, so it can gate CI.

This catches authoring errors but says nothing about ARCore. Steps 1–3 test the rest.

---

## Step 1 — Calibrate the pipeline (do this first)

**Why first:** this isolates *our* error from *per-asset* error. If the metre cube measures
a metre, the pipeline is metric and any later discrepancy is the individual model's fault.

1. `npm run models:calibration` (already committed: `calibration-cube-1m`, `calibration-cube-30cm`).
2. Open the store on the phone → **Calibration Cube (1 m)** → View in real life.
3. Place it on the floor. Lay a real tape measure along its base edge, in frame.
4. Photograph straight-on at ~2 m, phone at waist height.
5. Read the tape against the rendered edge.

**Pass:** the edge spans 100 cm ±2 cm. Repeat with the 30 cm cube for close range.

> Both cubes are generated to exact dimensions and verified at **0.00% error** by
> `verify:scale`, with the base seated at `y=0`. Any discrepancy you observe here is
> ARCore's floor estimate, not the asset.

---

## Step 2 — A4 reference sheet

A printed A4 page is a free precision ruler: exactly **210 × 297 mm**.

1. Print one A4 page at 100% scale (**not** "fit to page"). Verify with a ruler.
2. Lay it flat on the floor.
3. Place the 30 cm calibration cube beside it and compare against the known edges.

**Pass:** edges agree within a couple of millimetres per 100 mm.

A mismatch *here*, when step 1 passed, points at **tracking** (surface texture, lighting),
not scale. That distinction is what makes this step worth doing.

---

## Step 3 — Real-object A/B

1. Tape-measure a real object you own — a stool, a shelf, a chair.
2. Record its true height in `products.json` for the matching model.
3. Place the model **beside** the real object.
4. Photograph both from ~2 m at phone height.

**Pass:** heights agree within a few percent, and the two look plainly comparable.

This is the most convincing single image for judges, because it needs no explanation.

---

## Step 4 — Per-product sign-off

Fill this in as models land. `verify:scale` produces the asset column.

| Product | Declared (W×H×D cm) | Asset measured | Err % | Tape-measured in AR | Verdict | Date |
|---|---|---|---|---|---|---|
| calibration-cube-1m | 100 × 100 × 100 | 100.0 × 100.0 × 100.0 | **0.00** | _pending_ | asset OK | 2026-10-11 |
| calibration-cube-30cm | 30 × 30 × 30 | 30.0 × 30.0 × 30.0 | **0.00** | _pending_ | asset OK | 2026-10-11 |
| pot-terracotta | 28 × 40 × 28 | _not sourced_ | — | — | blocked | — |
| stool-wooden | 40 × 45 × 35 | _not sourced_ | — | — | blocked | — |
| cupboard-oak | 90 × 180 × 45 | _not sourced_ | — | — | blocked | — |
| lamp-floor | 35 × 160 × 35 | _not sourced_ | — | — | blocked | — |
| chair-dining | 45 × 85 × 50 | _not sourced_ | — | — | blocked | — |

**Current status:** the metric pipeline is proven (both cubes exact). The five product
models are not yet sourced — that is the Day 2 Blender task. See [MODELS.md](MODELS.md).

---

## Step 5 — Be able to answer the judges

Say **"within a couple of percent."** Never say "exact."

| Source of error | Magnitude | Why |
|---|---|---|
| ARCore floor-plane depth estimate | **Dominant** | Worse on featureless, shiny, dark floors |
| User tap precision | Small | Affects position more than size |
| Asset authoring | Zero after Gate 2 | Auto-corrected and logged |
| Float/matrix precision | Negligible | — |

The renderer is exactly metric. The uncertainty is in *where ARCore believes the floor is*.
Saying this plainly is more persuasive than overclaiming — and `?debug=1` shows the live
reticle distance in metres if anyone wants to see the raw number.
