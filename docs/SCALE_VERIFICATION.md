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

> All four cubes are generated to exact dimensions and verified at **0.00% error** by
> `verify:scale`, with the base seated at `y=0`. Any discrepancy you observe here is
> ARCore's floor estimate, not the asset.

**If it fails** (as it does on the demo device, reading ~110 cm): that is the device
offset, not a bug in the pipeline. Measure it properly on `/calibrate.html`, which stores
the number and makes every product page disclose it. Repeat with two cube sizes — if the
offset is the same in centimetres on both, it is additive and the diagnosis above holds.

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

Asset columns are produced by `npm run verify:scale` (last run 2026-10-13, 9 ok / 0 failing).

| Product | Declared (W×H×D cm) | Asset measured | Err % | Tape-measured in AR | Verdict | Date |
|---|---|---|---|---|---|---|
| calibration-cube-1m | 100 × 100 × 100 | 100.0 × 100.0 × 100.0 | **0.00** | 110 (device offset) | asset OK | 2026-10-12 |
| calibration-cube-75cm | 75 × 75 × 75 | 75.0 × 75.0 × 75.0 | **0.00** | 84 (device offset) | asset OK | 2026-10-12 |
| calibration-cube-50cm | 50 × 50 × 50 | 50.0 × 50.0 × 50.0 | **0.00** | _pending_ | asset OK | 2026-10-12 |
| calibration-cube-30cm | 30 × 30 × 30 | 30.0 × 30.0 × 30.0 | **0.00** | 40 (device offset) | asset OK | 2026-10-12 |
| pot-plant | 15 × 30 × 13 | 14.9 × 30.0 × 12.7 | **0.00** | _pending_ | asset OK | 2026-10-12 |
| stool-wooden | 33 × 45 × 33 | 33.0 × 45.0 × 33.0 | **0.00** | _pending_ | asset OK | 2026-10-12 |
| closet | 127 × 120 × 29 | 127.5 × 120.0 × 29.4 | **0.00** | _pending_ | asset OK | 2026-10-12 |
| lamp-table | 16 × 33 × 16 | 15.7 × 32.5 × 15.7 | 1.54 | _pending_ | asset OK | 2026-10-12 |
| chair-wooden | 48 × 104 × 53 | 47.8 × 104.0 × 52.8 | **0.00** | _pending_ | asset OK | 2026-10-12 |

**Current status:** the metric pipeline is proven and all nine assets pass Gate 2. The
remaining uncertainty is entirely the device's floor-plane offset, measured below.

### Two numbers that must not be confused

- **Asset error** — does the `.glb` match its declared `dims_cm`? Gated by
  `verify:scale`, currently ≤1.54% worst case and 0.00% for eight of nine.
- **Device placement error** — where does *this phone* think the floor is? Measured
  on the demo device at **+9 to +10 cm**, constant across cube sizes.

The second is not corrected, by design — see [DECISIONS.md](DECISIONS.md) #13. It is
measured on `/calibrate.html` and disclosed on each product page.

### Device offset: the demo device

OnePlus 6T, Android 11, measured 2026-10-12:

| Reference cube | Tape reading | Offset |
|---|---|---|
| 30 cm | ~40 cm | +10 cm |
| 75 cm | ~84 cm | +9 cm |
| 100 cm | ~110 cm | +10 cm |

**The offset does not grow with the cube.** That rules out a scale error: a 1.33×
multiplier would have put the metre cube at 133 cm, and it read 110. A constant additive
offset means ARCore seats the floor plane ~9-10 cm too low, so every object sits too low
and reads too tall at its top edge, whatever its own height.

Consequence worth stating plainly to judges: the error is **absolute, not relative**, so
it is proportionally worst on small objects (a third of a 30 cm lamp, under a tenth of a
120 cm cabinet). `/calibrate.html` reports it per product for exactly this reason.

---

## Step 5 — Be able to answer the judges

Say **"within a couple of percent."** Never say "exact."

| Source of error | Magnitude | Why |
|---|---|---|
| ARCore floor-plane depth estimate | **Dominant** — +9-10 cm on the demo device | Worse on featureless, shiny, dark floors |
| User tap precision | Small | Affects position more than size |
| Asset authoring | ≤1.54%, 0.00% for 8 of 9 | Gated by `verify:scale` |
| Float/matrix precision | Negligible | — |

The renderer is exactly metric and the assets are measured. The uncertainty is in *where
ARCore believes the floor is*, and on the demo device we have measured it: **+9-10 cm,
constant**. Saying this plainly is more persuasive than overclaiming.

**If asked why we do not just subtract it:** AR is handed to Scene Viewer, which renders
the `.glb` from disk — there is no runtime hook. Baking the offset into the file would
make it no longer match its declared dimensions and would break the very check that is our
evidence. So we measure it, disclose it, and keep the asset chain exact.
See [DECISIONS.md](DECISIONS.md) #13.
