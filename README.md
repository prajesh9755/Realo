# Realo — See online products in your room, at true scale

Buying physical goods online is guesswork about size. Product photos carry no scale
reference, so a planter that looks right in a listing arrives too big for the shelf.

Realo places the product in your actual room, through your phone's camera, **at its real
measured size** — so you can check whether it fits before you buy.

The core claim is narrow and testable: **the 3D model is the product's real measured
size.** You can check it on the spot with a tape measure, and we show you how in
[docs/SCALE_VERIFICATION.md](docs/SCALE_VERIFICATION.md).

Two error sources, kept separate because they have different fixes:

- **The asset** — does the `.glb` match its declared dimensions? Gated by
  `npm run verify:scale` on every build. Currently 0.00% for eight of nine models,
  1.54% worst case.
- **The device** — where does your phone think the floor is? ARCore's estimate is
  imperfect; on our demo device it is **+9-10 cm, constant**. We *measure* this on
  `/calibrate.html` and *disclose* it on the product page. We deliberately do not
  silently correct it — [why](docs/DECISIONS.md).

---

## Two tracks

| | Track 1 — demo store | Track 2 — any product image |
|---|---|---|
| Input | Our catalog of 9 items | Any image you paste |
| Geometry | Real measured 3D model | Flat cutout, background removed |
| Scale | **Measured** against declared dimensions | **Asserted** by you from a preset |
| Honest? | Yes — this is the real claim | Width/height only; no depth |
| Best for | Furniture, pots, cupboards | Posters, frames, boxes |

Track 1 is the centrepiece. Track 2 is a convenience that shows the idea generalises;
it does **not** support the true-scale claim, and we say so on the page itself.

---

## Quickstart

```bash
npm install
npm run models:calibration     # generate the 1m / 30cm reference cubes
npm run verify:scale           # headless Gate-2 check over every model
npm run imgly:vendor           # ~76MB, self-host the background-removal model
npm run dev                    # vite --host
```

Then open the Network URL it prints **on an Android phone** (see below for why).

### Why it has to run on the phone

AR needs to know where your floor is, in metres. That comes from **ARCore**, which fuses
the camera with the phone's gyroscope and accelerometer — physical sensors on the phone.

Streaming the camera to a laptop and computing there does not work, and not because a
laptop is too slow. A bare video stream has the metric information stripped out: a 40 cm
pot at 1 m and a 4 m pot at 10 m are *identical pixels*. The distinguishing data was in
the sensors. A laptop has more compute and no motion sensors; infinite compute does not
recover what was never in the frames.

So the phone runs the AR, and for an audience you **mirror the phone to a laptop**:

```bash
adb devices
scrcpy --stay-awake --window-title "AR Demo"
# weak laptop? scrcpy -m 1024 -b 4M
```

### Dev over USB (no HTTPS certificate needed)

WebXR requires a secure context. `localhost` is exempt but your phone's IP is not. Rather
than wrangling self-signed certs, forward the port over the cable already running scrcpy:

```bash
adb reverse tcp:5173 tcp:5173
# now open http://localhost:5173 ON THE PHONE — a secure context
```

---

## Requirements

- **Android** phone with ARCore (Google Play Services for AR), Chrome.
- **iOS is not supported** for live AR — Safari has no WebXR AR. The app detects this and
  degrades to a 3D preview automatically rather than erroring.
- Node 20+.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on all interfaces |
| `npm run build` / `preview` | Production build / serve it |
| `npm run verify:scale` | **Parses every `.glb` and checks it against `products.json`. Exits non-zero on drift.** |
| `npm run models:calibration` | Writes the exactly-dimensioned reference cubes |
| `npm run models:rescale -- <id>\|--all` | Bakes correct scale + base-at-y=0 into a `.glb` |
| `npm run photos` | Re-renders the product card images (needs dev server + Playwright) |
| `npm run imgly:vendor` | Downloads the background-removal model locally (~76MB) |

## Project layout

```
index.html  product.html  ar.html  try.html
src/
  data/products.json     SINGLE SOURCE OF TRUTH for real dimensions
  ar/      session, hittest, place, scale, billboard, ui, viewer, main
  track2/  clipboard, removebg, main
  store/   catalog, store, pdp
scripts/   verify-model-scale, make-calibration-models, rescale-model, render-product-photos, vendor-imgly
public/    models/*.glb  photos/*.png  imgly/ (vendored, gitignored)
docs/      see below
```

## Documentation

| Doc | Read it for |
|---|---|
| [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Palette, type scale and components, sampled from `UI SCREENS/` |
| [07-anti-ai-slop-ui-rules.md](docs/07-anti-ai-slop-ui-rules.md) | What the UI must never look like |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the pieces fit, and why AR must run phone-side |
| [SCALE.md](docs/SCALE.md) | The three-gate discipline that makes true scale true |
| [SCALE_VERIFICATION.md](docs/SCALE_VERIFICATION.md) | The tape-measure protocol + results table |
| [MODELS.md](docs/MODELS.md) | Per-model provenance, licence and attribution |
| [TRACK2.md](docs/TRACK2.md) | Cutout pipeline, preset sizing, AGPL caveat |
| [DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md) | Printable demo-day checklist |
| [RISKS.md](docs/RISKS.md) | What can fail and what we do about it |
| [DECISIONS.md](docs/DECISIONS.md) | Why hit-test, why three.js, why no AI 3D generation |

## Licences

- Code in this repo: see repository licence.
- 3D models by **Jakers_H**, **Poly by Google**, **CreativeTrio** and **Zsky**. Per-model
  detail in [docs/MODELS.md](docs/MODELS.md); exact licences are still to be confirmed
  before any public release. The calibration cubes are generated by this project (CC0).
- **`@imgly/background-removal` is AGPL-3.0.** Fine for a competition entry; commercial
  use needs a licence from IMG.LY. See [docs/TRACK2.md](docs/TRACK2.md).
- `three.js` MIT · `@google/model-viewer` Apache-2.0 (loaded from CDN on the fallback path only).
