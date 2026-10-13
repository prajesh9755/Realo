# Models — provenance, licensing, and scale fixes

Every `.glb` in `public/models/` is recorded here: where it came from, its licence, who to
credit, and what was changed to make its dimensions real.

Two reasons this file exists. First, CC licences require attribution and judges may ask.
Second, "what did we change about this asset" is exactly the thing nobody remembers a week
later when a model turns out to be the wrong size.

---

## Status

| Model | Author | Licence | Real dims (W×H×D cm) | Tris | Size | Scale fix applied | Verified |
|---|---|---|---|---|---|---|---|
| `calibration-cube-1m.glb` | this project | CC0 | 100 × 100 × 100 | 12 | 2KB | n/a, written exact | **0.00%** |
| `calibration-cube-30cm.glb` | this project | CC0 | 30 × 30 × 30 | 12 | 2KB | n/a, written exact | **0.00%** |
| `pot-plant.glb` | Jakers_H | **TBD** | 36 × 72 × 31 | 1,756 | 176KB | **×0.2025** + base to y=0 | **0.00%** |
| `stool-wooden.glb` | Poly by Google | **TBD** | 33 × 45 × 33 | 232 | 8KB | **×0.1443** + base to y=0 | **0.00%** |
| `closet.glb` | Poly by Google | **TBD** | 191 × 180 × 44 | 366 | 30KB | **×0.5253** + base to y=0 | **0.00%** |
| `lamp-table.glb` | CreativeTrio | **TBD** | 16 × 33 × 16 | 786 | 62KB | none needed | **1.54%** |
| `chair-wooden.glb` | Zsky | **TBD** | 48 × 104 × 53 | 886 | 61KB | ×1.0026 + base to y=0 | **0.00%** |

**Total: 342KB, all five product models.** Well inside the 5MB-per-model budget, and light
on triangles, so phone performance is not a concern.

> **Deferred: exact licence and source URL.** Author names were recovered from the original
> download filenames and are recorded above, which covers the substance of a CC-BY credit.
> The precise licence and source page for each model are **not yet filled in**.
>
> This is fine for building and for a private demo. Before anything **public** — a published
> repo, a hosted demo, or distributing a build — confirm each licence, because Poly by Google
> and Sketchfab assets are commonly CC-BY and attribution is then required. If a judge asks
> where the assets came from, the author names above are the honest answer available today.

Originals are kept unmodified in `3D Models/originals/` so a bad rescale can always be
reverted.

### What the scale fixes tell you

Two of five models arrived correctly scaled in metres (lamp, chair). Three were authored in
arbitrary units and were out by roughly 5×, 7× and 2×. **This is the normal case**, which is
why Gate 2 exists. The fix is baked into the `.glb` by `npm run models:rescale`, so no
warning fires at demo time.

---

## Sourcing checklist

Budget generously for this. Finding good CC-licensed `.glb` files and fixing their units is
the most reliably underestimated task in the project.

Good sources:
- **Poly Haven** — CC0, consistently well-made, real-world scaled. Try here first.
- **Sketchfab** — large, but filter by *Downloadable* + CC licence, and check the licence
  on each individual model.
- **Google Poly archives / Khronos glTF sample models** — CC-BY / CC0.

Per model:

1. **Check the licence before downloading.** CC0 needs no attribution; CC-BY does. Avoid
   anything NoDerivatives (we rescale, which is a derivative) or NonCommercial if the
   competition has any commercial dimension.
2. Record source URL, author name, and exact licence in the table above.
3. Prefer `.glb` with embedded textures. Keep it under ~5MB — venue wifi.
4. Apply **Gate 1** from [SCALE.md](SCALE.md): metric units, set Dimensions, Apply All
   Transforms, export +Y up at scale 1.00.
5. Run `npm run verify:scale` and confirm **OK** with `baseY ≈ 0`.
6. Note what you changed in the "Scale fix applied" column — e.g. *"imported at 2.4 m tall
   (authored in inches), rescaled to 0.45 m and applied transforms."*

---

## Fixing scale without Blender

For a pure scale or origin problem, you do not need Blender at all:

```bash
npm run models:rescale -- <product-id>    # one model
npm run models:rescale -- --all           # every drifting model
npm run verify:scale                      # confirm
```

It measures the `.glb` against `dims_cm`, then wraps the scene roots in a single node
carrying the correction and a base-to-y=0 offset. Mesh data and materials are untouched,
and originals are backed up in `3D Models/originals/`.

Reach for Blender when the model needs more than scaling: wrong axis (Z-up), broken
materials, oversized textures, or excessive geometry.

---

## Common problems and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `verify:scale` reports huge drift (e.g. 100× or 2.54×) | Authored in cm or inches | Set Dimensions in metres, Apply All Transforms |
| Right in Blender, wrong in browser | Object-level scale not applied | **Object → Apply → All Transforms** |
| Model lies on its side | Z-up source (Blender default) | Export glTF with **+Y up** |
| `baseY` is large and negative | Origin at centroid, not base | Harmless — Gate 3 corrects at runtime |
| Model is black in AR | Missing/unsupported material | Re-export with a simple PBR material |
| Model is enormous in file size | 4K textures | Downscale textures to 1K–2K |

---

## Regenerating the product card images

`public/photos/*.png` are rendered from the `.glb` files themselves, so a card always
depicts the geometry AR will place:

```bash
npm run dev        # in one terminal — the renderer drives the real pages
npm run photos     # in another; needs Playwright installed
```

Swap in real photography instead by dropping files in `public/photos/` and updating the
`photo` field in `src/data/products.json`. The store reads whatever that field points at,
so no code changes.
