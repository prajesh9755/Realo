/**
 * Draggable edge-tracing overlay for the photo page.
 *
 * Self-contained: no imports from src/room or src/ar. Canvas 2D only.
 *
 * The user drags four lines onto real room edges -- two along each of the two
 * horizontal wall directions -- plus one yellow reference line onto something
 * whose real size they know. Those five lines are everything the solver needs.
 *
 * Lines are drawn in IMAGE pixel space and converted for display, so the
 * geometry stays correct whatever size the canvas is shown at.
 */
export const LINE_DEFS = [
  { id: 'a1', group: 'A', color: '#377DFF', label: 'Wall A — upper edge' },
  { id: 'a2', group: 'A', color: '#377DFF', label: 'Wall A — lower edge' },
  { id: 'b1', group: 'B', color: '#14B8A6', label: 'Wall B — upper edge' },
  { id: 'b2', group: 'B', color: '#14B8A6', label: 'Wall B — lower edge' },
  { id: 'ref', group: 'REF', color: '#F5A524', label: 'Reference — a known length' }
];

const HANDLE_R = 11;

export class LineOverlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.imageSize = { w: 1, h: 1 };
    this.lines = new Map();
    this.dragging = null;
    this.onChange = null;
    this.#bind();
  }

  /** Lay the five lines out sensibly for a fresh image. */
  reset(imageW, imageH) {
    this.imageSize = { w: imageW, h: imageH };
    const W = imageW, H = imageH;
    const put = (id, x1, y1, x2, y2) =>
      this.lines.set(id, { p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });

    // Spread them where a corner shot usually has its edges, so the user is
    // nudging rather than building from scratch.
    put('a1', W * 0.52, H * 0.34, W * 0.95, H * 0.30);
    put('a2', W * 0.54, H * 0.62, W * 0.95, H * 0.70);
    put('b1', W * 0.48, H * 0.10, W * 0.08, H * 0.06);
    put('b2', W * 0.50, H * 0.63, W * 0.12, H * 0.72);
    put('ref', W * 0.50, H * 0.09, W * 0.50, H * 0.62);
    this.draw();
    this.onChange?.();
  }

  get(id) { return this.lines.get(id); }

  /** Length of the reference line in image pixels. */
  refPixelLength() {
    const l = this.lines.get('ref');
    if (!l) return 0;
    return Math.hypot(l.p2.x - l.p1.x, l.p2.y - l.p1.y);
  }

  /**
   * Image pixels -> canvas backing pixels.
   *
   * Derived from the canvas's own width attribute, NOT from
   * getBoundingClientRect. The overlay is absolutely positioned with inset:0,
   * so its laid-out rect can still be 0 wide when reset() first draws, which
   * made k = 0 and collapsed every line to a single point -- the lines were
   * being drawn, just infinitely small.
   */
  #scale() {
    return { k: this.canvas.width / this.imageSize.w };
  }

  /** Canvas backing pixels, which is the space draw() works in. */
  toDisplay(p) {
    const { k } = this.#scale();
    return { x: p.x * k, y: p.y * k };
  }

  /** Client coords -> image pixels, via the rect actually on screen. */
  toImage(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const kx = rect.width / this.imageSize.w;
    const ky = rect.height / this.imageSize.h;
    const k = kx || ky || 1;
    return { x: (clientX - rect.left) / k, y: (clientY - rect.top) / k };
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);

    // Stroke widths are scaled with the canvas so lines stay the same apparent
    // thickness whatever resolution the photo came in at.
    const px = Math.max(1, w / 900);

    ctx.save();
    for (const def of LINE_DEFS) {
      const line = this.lines.get(def.id);
      if (!line) continue;
      const a = this.toDisplay(line.p1);
      const b = this.toDisplay(line.p2);

      // Halo first, so a line stays visible over both dark and bright photos.
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 7 * px;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

      ctx.strokeStyle = def.color;
      ctx.lineWidth = 3.5 * px;
      if (def.group === 'REF') ctx.setLineDash([12 * px, 8 * px]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);

      for (const p of [a, b]) {
        ctx.beginPath(); ctx.arc(p.x, p.y, HANDLE_R * px, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill();
        ctx.lineWidth = 3.5 * px; ctx.strokeStyle = def.color; ctx.stroke();
      }
    }
    ctx.restore();
  }

  #hit(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const kDisplay = (rect.width / this.imageSize.w) || 1;
    const tolerance = (HANDLE_R + 10) / kDisplay;
    for (const def of [...LINE_DEFS].reverse()) {
      const line = this.lines.get(def.id);
      if (!line) continue;
      const p = this.toImage(clientX, clientY);
      for (const key of ['p1', 'p2']) {
        if (Math.hypot(line[key].x - p.x, line[key].y - p.y) < tolerance) {
          return { id: def.id, key };
        }
      }
    }
    return null;
  }

  #bind() {
    const el = this.canvas;
    const down = (e) => {
      const t = e.touches?.[0] ?? e;
      const hit = this.#hit(t.clientX, t.clientY);
      if (!hit) return;
      this.dragging = hit;
      el.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };
    const move = (e) => {
      if (!this.dragging) return;
      const t = e.touches?.[0] ?? e;
      const p = this.toImage(t.clientX, t.clientY);
      const line = this.lines.get(this.dragging.id);
      // Keep handles on the image: a vanishing point off-canvas is fine, a
      // handle off-canvas is unreachable.
      line[this.dragging.key] = {
        x: Math.max(0, Math.min(this.imageSize.w, p.x)),
        y: Math.max(0, Math.min(this.imageSize.h, p.y))
      };
      this.draw();
      this.onChange?.();
      e.preventDefault();
    };
    const up = () => { this.dragging = null; };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }
}
