# Risks

Live register. Update the status column as things are mitigated or bite.

Status: **OPEN** (unmitigated) · **MITIGATED** (handled, verify before demo) · **ACCEPTED** (known, living with it)

---

## Highest impact first

### 1. WebXR fails on stage — **MITIGATED**

The whole demo is one API on one device.

**Mitigation:** a three-tier ladder that degrades *automatically* via `checkArSupport()`,
not by manual switching:

| Tier | Trigger | Shown |
|---|---|---|
| 1 | Android Chrome + ARCore + HTTPS | Live AR, true scale |
| 2 | No WebXR, iOS, denied camera, model load failure | `<model-viewer>` 3D preview + why there's no camera |
| 3 | CDN unreachable | Flat product photo |

Plus a **pre-recorded video** (see [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md)) as the human-operated
tier 4. *Verify tier 2 by opening `ar.html` in desktop Chrome.*

### 2. ARCore can't track the floor — **MITIGATED**

Plain, shiny, dark, reflective, or carpet-on-carpet surfaces give ARCore nothing to lock onto.
Conference venues are full of exactly these.

**Mitigation:** bring a **patterned mat or a sheet of newspaper** to throw on the floor —
instant trackable features. Coaching overlay tells the user to move slowly. **Pre-walk the
demo area** so the feature map is built before judges watch.

### 3. Model has the wrong real-world size — **MITIGATED**

The likeliest *silent* killer: a model that looks fine but is 2.54× or 100× off, and nobody
notices until a judge measures it.

**Mitigation:** Gate 2 in [`src/ar/scale.js`](../src/ar/scale.js) measures every model on
load, auto-corrects drift beyond 2%, and logs the real numbers. `npm run verify:scale` runs
the same check headlessly and exits non-zero, so it can gate CI. Per-product sign-off in
[SCALE_VERIFICATION.md](SCALE_VERIFICATION.md).

### 4. Sourcing good CC models takes longer than planned — **OPEN**

Currently **5 of 7 models are not sourced**. Finding well-made, correctly-licensed `.glb`
files and fixing their units is the most reliably underestimated task in this project.

**Mitigation:** the two calibration cubes are generated and exact, so the *true-scale claim
is already demonstrable* with zero sourced models. Cut to **5 good products rather than 8
sloppy ones**; a convincing demo needs 2–3. Checklist in [MODELS.md](MODELS.md).

### 5. Venue wifi is dead or hostile — **MITIGATED**

**Mitigation:** deploy ahead and load once on the phone to cache. `npm run imgly:vendor`
removes the `staticimgly.com` dependency (~42MB mid-demo otherwise). `adb reverse` can serve
from the laptop over USB with no network at all.

### 6. Thermal throttling / battery drain — **ACCEPTED**

AR runs the camera, GPU, and sensors simultaneously. Phones get hot and throttle, which
degrades tracking.

**Mitigation:** charge to 100%, battery saver **off** (it throttles ARCore), keep sessions
under ~5 minutes, power bank on hand, exit AR between runs.

---

## Moderate

### 7. Phone notification drops the XR session — **MITIGATED**
Do Not Disturb **on**; in the runbook checklist.

### 8. Wall placement is unreliable — **ACCEPTED**
Vertical hit-test results are flakier than floor ones. Track 2 poster/frame presets target
walls. **Default to floor placement when demoing**; treat wall as a bonus.

### 9. Session re-entry yields no hits — **MITIGATED**
A stale `XRHitTestSource` after a session ends breaks the second entry. `HitTester.stop()`
nulls it on the `end` event. *Verify by entering and exiting AR twice.*

### 10. `anchors` unavailable on the demo phone — **MITIGATED**
Optional-only; falls back to a static pose in `local` space, which ARCore keeps tracked
adequately for a demo-length session.

### 11. Judge picks up an iPhone — **ACCEPTED**
Expected: Safari has no WebXR AR. Tier 2 renders with an explanation. Production path is
USDZ + AR Quick Look.

### 12. Licence challenge — **MITIGATED**
Per-model attribution in [MODELS.md](MODELS.md); `@imgly/background-removal` AGPL disclosed
in the README and [TRACK2.md](TRACK2.md). Volunteer it rather than be caught by it.

---

## Low

### 13. Flat cutout undermines the core claim — **MITIGATED**
A cutout of a volumetric item reads as a cardboard standee, and its size is user-asserted.
Badge says **"your size"** not "true scale"; the page states the limitation. Demo Track 2
only on posters, frames, and boxes.

### 14. 637KB three.js chunk — **ACCEPTED**
Cached after first load and needed before the AR session starts. Not worth splitting.

### 15. `public/imgly/` is gitignored — **ACCEPTED**
A fresh clone must run `npm run imgly:vendor`. Documented in README and T-1 checklist;
`removebg.js` falls back to the CDN with a console notice rather than failing.

---

## Post-demo notes

Record what actually happened here while it is fresh — surprises are worth more than
predictions.

| Date | What happened | Follow-up |
|---|---|---|
| | | |
