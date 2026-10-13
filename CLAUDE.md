# Realo — working notes for Claude

## Answer style

**Always answer short.** No long recaps, no multi-section summaries, no tables
unless asked. Lead with the answer; a few lines or a short bullet list.

Do the full work — just report it briefly. Still flag wrong numbers and real
problems, but in one line, not a section.

## Project

Competition entry: a demo store where every product can be placed in your real
room at **true real-world scale** via phone AR. Scale accuracy is the single most
important property.

Read `docs/DECISIONS.md` (14 entries, each with reasoning) before changing
anything architectural.

## Traps — do not rediscover

1. **Never import three.js on a page using `<model-viewer>`.** It bundles its own
   copy; a second one stops it rendering. That's why `src/ar/verify.js` parses GLB
   by hand instead of reusing `scale.js`.
2. **model-viewer reports `loaded: false` and a 0x0 canvas when backgrounded.**
   Intersection Observer skips rendering. Idle behaviour, not a failure.
3. **Sourced models have arbitrary units.** `npm run models:rescale` fixes it;
   originals in `3D Models/originals/`.
4. **`verify:scale` cannot tell you a declared size is implausible** — only that
   the model matches it. A 72cm "potted plant" and a 180cm "closet" both shipped.
   Sanity-check rendered images against real objects.
5. **Track 1 AR has no runtime hook.** Scene Viewer renders the `.glb` from disk
   and `ar-scale="fixed"` honours the file's dimensions, so `scale` on
   `<model-viewer>` only affects the page preview. See DECISIONS #13.

## Two numbers, never conflate

- **Asset error** — does the `.glb` match its declared `dims_cm`? Gated by
  `npm run verify:scale`. Currently 9/9, 0.00% for eight of nine.
- **Device error** — where does the phone think the floor is? +9-10cm on the demo
  device, constant across cube sizes (so it's a floor-plane *position* error, not
  a scale error). Measured on `/calibrate.html` and **disclosed, not corrected**.

## Commands

```bash
npm run dev            # vite --host
npm run verify:scale   # parses every .glb vs products.json, non-zero on drift
npm run models:rescale -- <id>|--all
npm run photos         # re-render card images (needs dev server + playwright)
npm run imgly:vendor   # self-host the 42MB background-removal model
```

Phone testing (wifi does not work — firewall + WebXR needs a secure context):

```bash
adb reverse tcp:5173 tcp:5173   # then open http://localhost:5173 ON THE PHONE
adb forward tcp:9222 localabstract:chrome_devtools_remote
```

## Open

- **Model licences unconfirmed.** `license: "TBD"`, `url: null` for all 5 product
  models. Likely CC-BY paperwork, but confirm before anything public.
- Tap-to-place (Track 2) untested on the 6T — needs a real tap to confirm
  `generic-touchscreen` transient input works.
- Calibration is room- and device-specific; re-run if the venue changes.
