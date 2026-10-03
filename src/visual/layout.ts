// ─────────────────────────────────────────────────────────────────
// Pure layout maths for the 2D board renderer (no React, no DOM), so it
// can be unit-tested and reused: frame → screen mapping, nice axis ticks,
// line clipping, curve sampling, and collision-free label placement.
//
// Label placement matters: overlapping labels were the visible failure
// twice before (D-2026-09-27-4, D-2026-09-28-2). Every label here is
// placed at the least-crowded of 17 candidate spots around its anchor,
// avoiding other labels, points, boxes, text, tick numbers and the edge.
// ─────────────────────────────────────────────────────────────────
import type { BoardVisual, PlaneFrame, TableEl, Vec2 } from './types';
import { VISUAL_LIMITS } from './types';

export const VIEW_W = 1000;
export const VIEW_H = 600;
export const TABLE_W = 250;

export interface Rect { x: number; y: number; w: number; h: number }

export interface FrameLayout {
  /** Data → screen. */
  toS: (p: Vec2) => Vec2;
  /** Scale per data unit on each axis (screen units). */
  sx: number;
  sy: number;
  /** The drawable area, in screen units. */
  plot: Rect;
  /** The table panel, if any. */
  table: Rect | null;
  plane: PlaneFrame | null;
}

export function layoutFrame(visual: BoardVisual): FrameLayout {
  const tableEl = visual.elements.find((e): e is TableEl => e.kind === 'table');
  const tableLeft = tableEl?.placement === 'left';
  const gap = 24;
  const region: Rect = {
    x: tableEl && tableLeft ? TABLE_W + gap : 0,
    y: 0,
    w: VIEW_W - (tableEl ? TABLE_W + gap : 0),
    h: VIEW_H,
  };
  const table: Rect | null = tableEl
    ? { x: tableLeft ? 8 : VIEW_W - TABLE_W - 8, y: 28, w: TABLE_W - 8, h: 0 }
    : null;

  if (visual.frame.kind === 'canvas') {
    const m = 18;
    const w = region.w - 2 * m, h = region.h - 2 * m;
    const s = Math.min(w / VISUAL_LIMITS.canvasWidth, h / VISUAL_LIMITS.canvasHeight);
    const ox = region.x + m + (w - VISUAL_LIMITS.canvasWidth * s) / 2;
    const oy = region.y + m + (h - VISUAL_LIMITS.canvasHeight * s) / 2;
    return {
      toS: ([x, y]) => [ox + x * s, oy + y * s],
      sx: s, sy: s,
      plot: { x: ox, y: oy, w: VISUAL_LIMITS.canvasWidth * s, h: VISUAL_LIMITS.canvasHeight * s },
      table, plane: null,
    };
  }

  const f = visual.frame;
  const showY = f.axes === 'both' || f.axes === 'y';
  const showX = f.axes === 'both' || f.axes === 'x';
  const m = { l: showY ? 58 : 26, r: 26, t: 22, b: showX ? 46 : 22 };
  const w = region.w - m.l - m.r;
  let h = region.h - m.t - m.b;
  // A number line or timeline has no real vertical scale: keep it a compact band
  // in the middle of the board so notes above it sit close to the line.
  if (f.axes === 'x') {
    const band = Math.min(h, 260);
    m.t += (h - band) / 2;
    h = band;
  }
  const xr = f.x[1] - f.x[0], yr = f.y[1] - f.y[0];
  let sx = w / xr, sy = h / yr;
  if (f.equalScale) sx = sy = Math.min(sx, sy);
  const pw = xr * sx, ph = yr * sy;
  const ox = region.x + m.l + (w - pw) / 2;
  const oy = region.y + m.t + (h - ph) / 2;
  return {
    toS: ([x, y]) => [ox + (x - f.x[0]) * sx, oy + (f.y[1] - y) * sy],
    sx, sy,
    plot: { x: ox, y: oy, w: pw, h: ph },
    table, plane: f,
  };
}

/** 1, 2 or 5 × 10^n, aiming for ~`target` ticks across `span`. */
export function niceStep(span: number, target = 8): number {
  if (!(span > 0)) return 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

export function ticks(range: [number, number], requested?: number, target = 8): number[] {
  const span = range[1] - range[0];
  let step = requested && requested > 0 && span / requested <= 30 ? requested : niceStep(span, target);
  if (span / step > 30) step = niceStep(span, target);
  const out: number[] = [];
  const start = Math.ceil((range[0] - 1e-9) / step) * step;
  for (let v = start; v <= range[1] + 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Math.round(v / step) * step);
  return out;
}

export function fmtTick(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const s = v.toFixed(Math.min(4, Math.max(0, -Math.floor(Math.log10(Math.abs(v) || 1)) + 1)));
  return s.replace(/\.?0+$/, '');
}

/**
 * Clip the infinite line p + t(q - p) to the rectangle (data space).
 * tMin = -Infinity for a line, 0 for a ray. Returns null if it misses.
 */
export function clipLine(p: Vec2, q: Vec2, box: { x: [number, number]; y: [number, number] }, tMin = -Infinity): [Vec2, Vec2] | null {
  const dx = q[0] - p[0], dy = q[1] - p[1];
  let t0 = tMin, t1 = Infinity;
  const edges: Array<[number, number]> = [
    [-dx, p[0] - box.x[0]], [dx, box.x[1] - p[0]],
    [-dy, p[1] - box.y[0]], [dy, box.y[1] - p[1]],
  ];
  for (const [pp, qq] of edges) {
    if (Math.abs(pp) < 1e-12) {
      if (qq < 0) return null;
      continue;
    }
    const r = qq / pp;
    if (pp < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return [[p[0] + t0 * dx, p[1] + t0 * dy], [p[0] + t1 * dx, p[1] + t1 * dy]];
}

/**
 * Sample y = fn(x) across [x0, x1] into screen-space runs, breaking at
 * gaps, asymptotes and wherever the curve leaves the visible band.
 */
export function sampleFunction(
  fn: (x: number) => number, x0: number, x1: number, yRange: [number, number], toS: (p: Vec2) => Vec2, samples = 320,
): Vec2[][] {
  const runs: Vec2[][] = [];
  let run: Vec2[] = [];
  const yr = yRange[1] - yRange[0];
  const lo = yRange[0] - yr * 0.5, hi = yRange[1] + yr * 0.5;
  let prevY: number | null = null;
  for (let i = 0; i <= samples; i++) {
    const x = x0 + ((x1 - x0) * i) / samples;
    const y = fn(x);
    const inBand = Number.isFinite(y) && y >= lo && y <= hi;
    const jump = prevY !== null && Number.isFinite(y) && Math.abs(y - prevY) > yr * 1.5;
    if (!inBand || jump) {
      if (run.length > 1) runs.push(run);
      run = [];
      prevY = inBand ? y : null;
      if (inBand) run.push(toS([x, y]));
      continue;
    }
    run.push(toS([x, y]));
    prevY = y;
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

// ─── labels ──────────────────────────────────────────────────────

export interface LabelRequest {
  key: string;
  text: string;
  anchor: Vec2;
  fontSize: number;
  /** Preferred direction(s) first; the rest are still tried. */
  prefer?: Array<'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'c'>;
  /** Distance from the anchor to the nearest label edge. */
  gap?: number;
}

export interface PlacedLabel extends LabelRequest {
  rect: Rect;
  /** Text baseline anchor (centre-x, baseline-y). */
  tx: number;
  ty: number;
}

export function textWidth(text: string, fontSize: number): number {
  // Average glyph advance for the UI font; slightly generous so halos never touch.
  let w = 0;
  for (const ch of text) w += /[MW@#%]/.test(ch) ? 0.86 : /[A-Z0-9=+]/.test(ch) ? 0.64 : /[il.,:;'|!()[\]\s]/.test(ch) ? 0.3 : 0.54;
  return w * fontSize + 8;
}

/** Unit direction per compass position: -1 = left/above, 1 = right/below, 0 = centred. */
const DIRS: Record<string, Vec2> = {
  n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0], nw: [-1, -1], c: [0, 0],
};
const ORDER = ['ne', 'n', 'e', 'nw', 'se', 'w', 's', 'sw'] as const;

/**
 * Standard 8-position placement: a label to the right starts `dist` right of
 * the anchor, a label above ends `dist` above it, a centred one straddles it.
 * `row` pushes the label a further label-height away (for crowded spots).
 */
function candidateRect(anchor: Vec2, d: string, w: number, h: number, dist: number, row: number): Rect {
  const [ux, uy] = DIRS[d];
  const x = ux > 0 ? anchor[0] + dist : ux < 0 ? anchor[0] - dist - w : anchor[0] - w / 2;
  const shift = row * (h + 3);
  const y = uy < 0 ? anchor[1] - dist - h - shift : uy > 0 ? anchor[1] + dist + shift : anchor[1] - h / 2 + (row ? (row % 2 ? -1 : 1) * Math.ceil(row / 2) * (h + 3) : 0);
  return { x, y, w, h };
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Greedy placement: each label takes its least-crowded candidate spot. */
export function placeLabels(requests: LabelRequest[], obstacles: Rect[], bounds: Rect): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  for (const req of requests) {
    const w = textWidth(req.text, req.fontSize);
    const h = req.fontSize * 1.3;
    const gap = req.gap ?? 10;
    const dirs = [...(req.prefer ?? []), ...ORDER.filter((d) => !(req.prefer ?? []).includes(d))];
    let bestRect: Rect = candidateRect(req.anchor, dirs[0], w, h, gap, 0);
    let bestScore = Infinity;
    // Pass 0 hugs the anchor; later passes stack further out, one label-height at a time.
    for (let pass = 0; pass < 4; pass++) {
      for (const [rank, d] of dirs.entries()) {
        const rect = candidateRect(req.anchor, d, w, h, gap, pass);
        let score = rank * 6 + pass * 40;
        for (const p of placed) score += overlap(rect, p.rect) * 3;
        for (const o of obstacles) score += overlap(rect, o) * 2;
        const out = Math.max(0, bounds.x - rect.x) + Math.max(0, rect.x + rect.w - (bounds.x + bounds.w))
          + Math.max(0, bounds.y - rect.y) + Math.max(0, rect.y + rect.h - (bounds.y + bounds.h));
        score += out * 60;
        if (score < bestScore) { bestScore = score; bestRect = rect; }
      }
      if (bestScore < 60) break; // a clean spot at the near distance — don't push labels further out
    }
    placed.push({ ...req, rect: bestRect, tx: bestRect.x + bestRect.w / 2, ty: bestRect.y + bestRect.h * 0.76 });
  }
  return placed;
}

/** Split a label into lines of at most `max` characters, on word boundaries. */
export function wrapText(text: string, max: number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if ((line + ' ' + word).length <= max) line += ' ' + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/.{0,1}$/, '…');
    return kept;
  }
  return lines;
}

// ─── shared metrics ──────────────────────────────────────────────
// The renderer (BoardVisualView) and the quality lints (src/quality/visualLint.ts)
// must agree on how big a text or a box is, otherwise a lint can pass a picture
// whose labels collide on screen. Both import these.
export const TEXT_PX = { sm: 15, md: 19, lg: 25, xl: 32 } as const;
export const POINT_R = { sm: 5, md: 7, lg: 9 } as const;

/** Screen rects of the bricks that labels and connectors must respect (points, boxes, texts, circles). */
export function elementRects(visual: BoardVisual, L: FrameLayout): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  for (const e of visual.elements) {
    if (e.kind === 'point') {
      const [x, y] = L.toS(e.at); const r = POINT_R[e.size ?? 'md'] + 3;
      rects.set(e.id, { x: x - r, y: y - r, w: 2 * r, h: 2 * r });
    } else if (e.kind === 'box') {
      const [x, y] = L.toS(e.at);
      const lines = wrapText(e.text, 22, 2);
      const w = e.w ? e.w * L.sx : Math.min(270, Math.max(110, Math.max(...lines.map((l) => textWidth(l, 18)), e.sub ? textWidth(e.sub, 13.5) : 0) + 30));
      const h = e.h ? e.h * L.sy : 22 + lines.length * 22 + (e.sub ? 20 : 0);
      rects.set(e.id, { x: x - w / 2, y: y - h / 2, w, h });
    } else if (e.kind === 'text') {
      const [x, y] = L.toS(e.at); const size = TEXT_PX[e.size ?? 'md'];
      const w = textWidth(e.text, size); const align = e.align ?? 'middle';
      const left = align === 'start' ? x : align === 'end' ? x - w : x - w / 2;
      rects.set(e.id, { x: left, y: y - size, w, h: size * 1.3 });
    } else if (e.kind === 'circle') {
      const [x, y] = L.toS(e.center); const rx = e.r * L.sx, ry = (e.ry ?? e.r) * L.sy;
      rects.set(e.id, { x: x - rx, y: y - ry, w: 2 * rx, h: 2 * ry });
    }
  }
  return rects;
}
