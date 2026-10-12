# Demo runbook

**Print this.** Work top to bottom. Rehearse it three times before demo day, ideally on the
actual floor you will present on.

---

## T-1 day

- [ ] `npm run verify:scale` → all sourced models **OK**
- [ ] `npm run imgly:vendor` → `public/imgly/` populated (~76MB)
- [ ] `npm run build` → clean
- [ ] Deploy to Vercel/Netlify. **Open the live URL on the phone and run the full flow.**
- [ ] Record the backup video (see below)
- [ ] Charge phone to 100%, charge power bank
- [ ] Print: one A4 sheet at 100% scale, and this runbook
- [ ] Pack: tape measure, patterned mat or newspaper, USB cable, power bank

## Backup video (record while everything works)

Record on the phone, screen + room:
1. Store grid → PDP → View in real life
2. Reticle finding the floor → tap → model appears
3. Walk around it — it stays anchored
4. **Tape measure against the 1 m calibration cube** ← the money shot
5. Track 2: paste a poster → cutout → place

Keep it under 90 seconds. This is tier 3 of the fallback ladder and your insurance.

---

## T-30 minutes — phone setup

- [ ] **Battery saver OFF** — it throttles ARCore and causes tracking loss
- [ ] **Do Not Disturb ON** — an incoming notification can drop the XR session
- [ ] Screen timeout → 10 minutes
- [ ] Auto-rotate locked to portrait
- [ ] Brightness up (judges are watching a mirrored screen)
- [ ] Google Play Services for AR updated
- [ ] Chrome updated; close all other tabs
- [ ] Load the live URL once so assets are cached
- [ ] Airplane mode off, wifi connected

## T-10 minutes — mirroring

```bash
adb devices                                   # confirm the phone is listed
scrcpy --stay-awake --window-title "AR Demo"
# laggy on a weak laptop:
scrcpy -m 1024 -b 4M
```

- [ ] scrcpy window open and responsive
- [ ] Drag it to the projector/second screen, sized large
- [ ] Use the **live deployed URL** on stage, not the dev server — fewer moving parts

<details>
<summary>If you must use the dev server (no deploy available)</summary>

```bash
npm run dev
adb reverse tcp:5173 tcp:5173
# open http://localhost:5173 ON THE PHONE — counts as a secure context
```
WebXR needs a secure context; `adb reverse` gives you one over USB without certificates.
</details>

## T-2 minutes — the step people skip

- [ ] **Pre-walk the demo area** with the AR page open, pointing at the floor where you
      will present. ARCore builds a feature map as it sees the surface; doing this in
      advance prevents most on-stage tracking failures.
- [ ] If the floor is plain, shiny, dark, or reflective: **put down the patterned mat or a
      sheet of newspaper.** Instant texture for ARCore to track.
- [ ] Place the tape measure and A4 sheet on the table, visible.

---

## The demo (5 minutes)

**Lead with the problem, not the tech.**

1. **(20s) The problem.** "You order a planter online. It arrives, and it's twice the size
   you pictured. Photos have no scale."
2. **(60s) Track 1.** Store grid → it looks like any shop, flat photos → open the planter →
   "View in real life" → point at the floor → tap. *"That's 40 cm tall, which is its real
   size."*
3. **(45s) Prove it.** Place the **1 m calibration cube**. Lay the tape measure against it.
   Let them read it. **This is the single most persuasive thing you will do** — do not skip
   it to save time.
4. **(40s) Anchoring.** Walk around the object. It stays where you put it.
5. **(40s) Track 2.** Paste a poster from a real store → background removed → pick "Poster
   60 cm" → place it on the wall. Say plainly: *"this one's a flat cutout and the size is my
   estimate — the measured 3D is the store catalog."*
6. **(30s) Honesty + close.** "Accurate to within a couple of percent; the limit is the
   phone's floor estimate, not the rendering." Then the pitch: fewer returns, more confident
   buying.

### If asked

- **"Why not run it on the laptop?"** → Real scale needs the phone's gyroscope and
  accelerometer; a video stream alone has the metric information stripped out. Identical
  pixels can be a 40 cm pot or a 4 m pot. ([ARCHITECTURE.md](ARCHITECTURE.md))
- **"How do you know it's the right size?"** → Three gates: Blender authoring, a runtime
  assertion that auto-corrects drift, and ground alignment. Plus the tape measure, live.
- **"Does it work on iPhone?"** → Not for live AR; Safari has no WebXR AR. It degrades
  automatically to a 3D preview. Production path would be USDZ + AR Quick Look.
- **"Could it do any product on any site?"** → Track 2 does, as a flat cutout. True 3D
  needs a model; generating one from a single photo is unreliable today, so we don't
  pretend to. ([DECISIONS.md](DECISIONS.md) #5)
- **"Licensing?"** → Models individually attributed in [MODELS.md](MODELS.md);
  `@imgly/background-removal` is AGPL, fine here, needs a licence commercially.

---

## When something breaks

| Symptom | Do this |
|---|---|
| Reticle never appears | Point lower at the floor, move the phone **slowly** side to side. Throw down the patterned mat. |
| Tracking drifts / object jumps | Stop moving, re-scan the floor slowly, tap **Place again**. |
| Session won't start | Check camera permission, reload once. If it fails twice, go to the fallback. |
| Model floats or sinks | Known Gate-3 case — tap **Place again** on a flatter spot. |
| Phone hot / frame rate drops | Exit AR, let it cool. Keep AR sessions under ~5 minutes. |
| Wifi dead | The deploy is cached; if not, `adb reverse` and serve from the laptop. |
| **Total AR failure** | Don't debug on stage. Say *"let me show you the recorded version"* and play the backup video. Then walk the architecture — judges respect a clear explanation of a known failure mode. |

Add `?debug=1` to the AR URL for a 1 m floor grid and live reticle distance in metres.
It tells you instantly whether a problem is **scale** or **tracking**.

---

## Teardown

- [ ] Stop scrcpy, unplug
- [ ] Re-enable battery saver, turn off Do Not Disturb
- [ ] Note anything that went wrong in [RISKS.md](RISKS.md) while it is fresh
