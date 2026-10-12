# Design system

Source of truth: the reference screens in [`UI SCREENS/`](../UI%20SCREENS/). Values below
were sampled from those images, not invented. Implemented in
[`src/styles.css`](../src/styles.css) as custom properties on `:root`.

**Character: light, white, minimal.** Near-black ink on white, one accent used sparingly,
generous whitespace, square product tiles, no decoration for its own sake.

---

## Colour

Sampled from `04-color-library.png`.

| Token | Hex | Use |
|---|---|---|
| `--primary` | `#000000` | Pure black, reserved |
| `--blue` | `#377DFF` | Secondary |
| `--green` | `#38CB89` | Sale badges, the true-scale badge |
| `--orange` | `#FFAB00` | Secondary |
| `--red` | `#FF5630` | Errors, the scale-modified warning |

Neutrals, dark to light:

| Token | Hex | Use |
|---|---|---|
| `--n07` | `#141718` | **`--ink`** — body text, buttons, headings |
| `--n06` | `#232627` | |
| `--n05` | `#343839` | Button hover |
| `--n04` | `#6C7275` | **`--ink-muted`** — secondary text |
| `--n03` | `#E8ECEF` | **`--line`** — borders, rules |
| `--n02` | `#F3F5F7` | **`--tile`** — product tile background |
| `--n01` | `#FEFEFE` | |
| — | `#FFFFFF` | **`--page`** — page background |

**Rules.** Never hardcode a hex in a rule; use the token. Backgrounds are solid, never
gradient. Text is `--ink` or `--ink-muted`, never a secondary colour.

---

## Type

**Poppins** throughout (400/500/600/700), from `03-typography.png`. Geometric sans with a
single-storey `g` and flat-topped `1`. Deliberately not Inter, Geist, Space Grotesk or Roboto.

Headings are `600`, `line-height: 1.1`, `letter-spacing: -0.02em`.

| Token | Size | Used for |
|---|---|---|
| `--h1` … `--h7` | 54 / 40 / 34 / 28 / 24 / 20 / 16 px | Headings |
| `--t26` … `--t12` | 26 / 20 / 18 / 16 / 14 / 12 px | Body and UI text |

Body default is `--t16` at `line-height: 1.6`. Sizes come from this scale, never chosen
ad hoc per screen.

---

## Components

**Product card** (`01-product-grid.png`) — square tile on `--tile`, image with
`mix-blend-mode: multiply` so photo backgrounds disappear. Badges top-left, stacked: white
`NEW`, green `-50%`. Circular favourite button top-right, revealed on hover. Black action
bar slides up from the bottom on hover. Below the tile: stars, name, dimensions, price with
struck-through original.

On mobile the hover affordances are always visible, since there is no hover.

**Buttons** (`06-components-forms-buttons.png`) — fully rounded (`border-radius: 80px`).
Filled is `--ink` on white text; outline is transparent with a `--ink` border. One size
step down via `.btn-sm`.

**Badges** (`07-components-badges-rating.png`) — 4px radius, `--t12`, weight 600. White
for `NEW`, green for discount, `--ink` for `REFERENCE` (our calibration objects).

**Links with arrows** (`01-product-grid.png`) — `.link-arrow`, underlined via
`border-bottom`, trailing arrow icon.

**Breadcrumbs** (`06`) — `Shop › Product`, muted with chevron separators, current page in
`--ink`.

**Icons** (`05-icons.png`) — one stroke set in [`src/ui/icons.js`](../src/ui/icons.js).
Uniform `stroke-width: 1.5`, round caps and joins, `currentColor`. Do not mix in another
icon set. **No emoji anywhere**, including status text and errors.

---

## Prohibitions

Carried from the general anti-slop rules and verified against this codebase:

- No emoji in any UI text, ever. SVG icons only.
- No gradient glows, no neon, no "AI SaaS" hero backgrounds.
- No eyebrow numbering (`01`, `02` above headings).
- No hardcoded hex values in rules; use tokens.
- No fake browser-chrome mockups.
- Max one type family here (Poppins); the general rule is two.
- Avoid em-dash chains in copy. Use periods and commas.
- Empty and error states are designed, never blank.

---

## Known gap

`public/photos/*.svg` are generated to-scale silhouettes, not product photography. They use
the light palette and Poppins so they sit correctly on the tiles, but they read as
placeholders by design. Replace with real images as models are sourced; the store reads
whatever `products.json` points at. See [MODELS.md](MODELS.md).
