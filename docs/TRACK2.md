# Track 2 — any product image

Paste a product image from any store, remove its background, and stand the cutout in your
room at a size you choose.

This shows the idea generalises beyond our own catalog. It is **secondary** to Track 1 and
designed to be cut first if time runs short.

---

## What this track honestly is

Read this before demoing it.

| | Track 1 | Track 2 |
|---|---|---|
| Geometry | Real measured 3D model | **Flat plane** |
| Scale | **Measured** against declared dims | **Asserted** by the user |
| Depth | Real | **None** |
| Supports the true-scale claim? | **Yes** | **No** |

The badge in AR says **"your size"**, not "true scale", and `try.html` states the
limitation on the page. This is deliberate: a cutout of a sofa reads as a cardboard
standee, and pretending otherwise would undermine the one claim that matters.

**Demo it on flat goods** — a poster, a framed print, a shipping box, a phone. Those are
genuinely convincing. Don't paste a sofa in front of judges.

---

## Pipeline

```
paste (Ctrl+V) ──> Blob
   │   clipboard carries real PIXELS, so CORS never applies
   ▼
@imgly/background-removal  (ONNX + WASM, fully client-side)
   ▼
measureAlphaBounds()  ──> trim transparent margin, derive true aspect ratio
   ▼
preset or slider ──> ONE dimension in cm; aspect derives the other
   ▼
Billboard(texture, widthM, heightM)  ──> same hit-test placement as Track 1
```

### Why paste, not drag

Dragging an image between windows usually transfers a **URL**, not pixels — and most
e-commerce CDNs block cross-origin fetches. It would work on some sites and fail on others,
which is the worst behaviour for a live demo. The clipboard carries real pixel data, so the
whole CORS problem disappears. File upload is kept as the never-fails backup.

---

## The unknown-dimensions problem

A product image carries no size metadata. A 60 cm poster and a 6 cm sticker can be the same
JPEG. So the size has to come from the user — but asking for raw numbers cold is a bad
experience.

**Approach: infer what we can, ask for the minimum, show the result.**

1. **Aspect ratio is measured, not asked.** `measureAlphaBounds()` reads the cutout's alpha
   bounding box, so proportions are exact and free.
2. **One-tap presets** set a single dimension:

   | Preset | Sets | Size | Surface |
   |---|---|---|---|
   | Poster / Art | width | 60 cm | wall |
   | Picture frame | width | 30 cm | wall |
   | Shipping box | height | 40 cm | floor |
   | Phone | height | 15 cm | floor |
   | Mug | height | 10 cm | floor |

   Defined in `products.json` under `track2_presets`.
3. **Slider + number field**, bound together, for anything else.
4. **Live derived readout:** *"Will appear 60 cm wide × 84 cm tall (you set width; the other
   follows the image proportions)."* The user always sees both numbers before placing.

---

## Making a flat plane convincing

Two cheap touches that matter more than they sound:

- **Y-axis billboarding.** The plane yaws to face the camera but never pitches or rolls, so
  it never reveals that it has zero thickness. Pitching would make it read as a floating
  sticker.
- **Contact shadow.** A soft radial-gradient ellipse at the base (from `place.js`, shared
  with Track 1) makes the object read as *sitting on* the floor rather than hovering above
  it. Without it, scale perception collapses.

Floor presets stand the cutout upright on the surface; wall presets mount it vertically.
**Vertical hit-test results are flakier than floor ones**, so default to floor when
demoing and treat wall placement as a bonus.

---

## Self-hosting the model (do this before any demo)

```bash
npm run imgly:vendor      # ~76MB into public/imgly/
```

By default the library streams its model from `staticimgly.com` on first use — a
third-party single point of failure mid-demo on venue wifi. The vendor script downloads:

| Asset | Size |
|---|---|
| `models/isnet_quint8` | 42.3 MB |
| `onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm` | 21.9 MB |
| `onnxruntime-web/ort-wasm-simd-threaded.wasm` | 11.3 MB |
| `.mjs` loaders | ~0 MB |

Chunks are content-addressed by hash and validated against the manifest's declared sizes on
reassembly, so a partial download fails loudly instead of producing a corrupt model.

`removebg.js` probes `/imgly/resources.json` and uses the local copy if present, otherwise
falls back to the CDN with a console notice. `public/imgly/` is **gitignored** — re-run the
script on a fresh clone.

**Model choice:** `isnet_quint8` (42.3 MB) over the default `isnet_fp16` (84.1 MB) — sizes
verified against the IMG.LY manifest. Halves the download for a difference nobody sees on a
phone screen. There is also a full `isnet` at 168 MB; we never load it.

**Pre-warming.** `prewarm()` runs on page load, so the download happens while the user is
reading the page rather than after they paste. Failures are non-fatal and retried on first use.

---

## Licence caveat

**`@imgly/background-removal` is AGPL-3.0.**

Fine for a competition entry. **Commercial use requires a licence from IMG.LY**
(support@img.ly), or swapping to a permissively-licensed segmentation model.

Disclose this if asked about productisation — volunteering a known constraint reads better
than being caught by it. It is also in the README.

---

## Stretch goal: browser extension

Not built. A Manifest V3 extension with a right-click **"Try in real life"** on any image
would be the real product vision: a content script reads the image where CORS does not
apply and opens `try.html` with the bytes.

Deliberately deprioritised — paste already solves the CORS problem with ~10 lines of code,
and the extension adds a manifest, content scripts, permissions, and a reload-to-test loop
for little demo gain. **First thing on the cut list.**
