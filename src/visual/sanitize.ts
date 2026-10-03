// ─────────────────────────────────────────────────────────────────
// Board-visual sanitizer and fact-checker.
//
// Model output is untrusted. Before a picture can reach a child it is
//   1. SANITIZED — shape-checked brick by brick; malformed bricks are
//      dropped, ids de-duplicated, numbers clamped, the frame widened to
//      fit what is drawn, step references repaired; and
//   2. FACT-CHECKED — every label that makes a checkable claim about the
//      geometry is compared with what is actually drawn:
//        • "Point B(2, 1)"       vs the point's real position
//        • "x = 2", "y = 2x + 1" vs the line's two defining points
//        • "y = x^2 - 4"         vs the plotted function
//        • right-angle marks and "35°" labels vs the real angle
//        • "5 cm", "r = 3"       vs real lengths (only when axes are shown,
//                                   because a scale drawing may shrink them)
//        • "3 × 4 × 5"            vs a cuboid's real size
//        • coordinates quoted in captions vs points actually on the board
//
// Issues come back with a severity:
//   fix   — already corrected here, informational
//   warn  — worth asking the model to fix, never auto-removed
//   error — a false statement; sent back to the model for repair, and if
//           it survives the repair, stripUnverifiedClaims() removes the
//           false label rather than show a child something untrue.
// ─────────────────────────────────────────────────────────────────
import {
  AnyBoardVisual, BoardVisual, BoardVisual3D, Frame2D, PlaneFrame, SpaceFrame,
  VisualElement2D, VisualElement3D, VisualStep, VisualColor, Vec2, Vec3,
  VISUAL_COLORS, VISUAL_LIMITS, ELEMENT_KINDS_2D, ELEMENT_KINDS_3D, STEP_PHASES,
  ArrowEnds, Weight, TextSize, VisualPurpose,
} from './types';
import { compileExpr } from './expr';
import { REPRESENTATION_DESCRIPTIONS } from '../persona/representations';

export type IssueSeverity = 'fix' | 'warn' | 'error';

export interface VisualIssue {
  severity: IssueSeverity;
  message: string;
  elementId?: string;
  /** For 'error' issues: which claims to remove if the repair does not fix them. */
  strip?: Array<'label' | 'name' | 'right' | 'element'>;
}

export interface SanitizeResult<T> {
  visual: T | null;
  issues: VisualIssue[];
}

const REPRESENTATIONS = Object.keys(REPRESENTATION_DESCRIPTIONS);
const TEXT_SIZES: TextSize[] = ['sm', 'md', 'lg', 'xl'];
const ARROWS: ArrowEnds[] = ['none', 'start', 'end', 'both'];
const WEIGHTS: Weight[] = ['thin', 'normal', 'bold'];
const PURPOSES: VisualPurpose[] = ['teach', 'contrast', 'apply'];
const MAX_ABS = 1e6;

const COLOR_ALIASES: Record<string, VisualColor> = {
  red: 'rose', pink: 'rose', crimson: 'rose',
  green: 'emerald', lime: 'emerald',
  blue: 'sky', navy: 'sky', indigo: 'violet',
  purple: 'violet', magenta: 'violet',
  orange: 'amber', yellow: 'amber', gold: 'amber', brown: 'amber',
  cyan: 'teal', turquoise: 'teal',
  white: 'ink', black: 'ink', default: 'ink',
  gray: 'muted', grey: 'muted', silver: 'muted',
};

// ─── primitive coercion ──────────────────────────────────────────

function num(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= MAX_ABS ? n : null;
}

function vec2(v: unknown): Vec2 | null {
  if (Array.isArray(v) && v.length >= 2) {
    const x = num(v[0]); const y = num(v[1]);
    return x === null || y === null ? null : [x, y];
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const x = num(o.x); const y = num(o.y);
    return x === null || y === null ? null : [x, y];
  }
  return null;
}

function vec3(v: unknown): Vec3 | null {
  if (Array.isArray(v) && v.length >= 3) {
    const x = num(v[0]); const y = num(v[1]); const z = num(v[2]);
    return x === null || y === null || z === null ? null : [x, y, z];
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const x = num(o.x); const y = num(o.y); const z = num(o.z);
    return x === null || y === null || z === null ? null : [x, y, z];
  }
  return null;
}

function str(v: unknown, max: number = VISUAL_LIMITS.maxTextChars): string | undefined {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

function color(v: unknown): VisualColor | undefined {
  if (typeof v !== 'string') return undefined;
  const c = v.trim().toLowerCase();
  if ((VISUAL_COLORS as readonly string[]).includes(c)) return c as VisualColor;
  return COLOR_ALIASES[c];
}

function pick<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

function slugId(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function range(v: unknown): [number, number] | null {
  const r = vec2(v);
  if (!r) return null;
  const [a, b] = r[0] <= r[1] ? r : [r[1], r[0]];
  return b - a > 1e-9 ? [a, b] : null;
}

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

// ─── claim parsing (shared by fact-checks) ───────────────────────

const NUM = '(-?\\d+(?:\\.\\d+)?)';
const PAIR_RE = new RegExp(`\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*\\)`, 'g');
const TRIPLE_RE = new RegExp(`\\(\\s*${NUM}\\s*,\\s*${NUM}\\s*,\\s*${NUM}\\s*\\)`);

/** Coordinate pairs quoted in free text, e.g. "Point B (2, 1)". */
export function coordinatePairs(text: string | undefined): Vec2[] {
  if (!text) return [];
  const out: Vec2[] = [];
  const re = new RegExp(PAIR_RE.source, 'g');
  let m: RegExpExecArray | null;
  const cleaned = text.replace(/[−–]/g, '-');
  while ((m = re.exec(cleaned))) {
    // Skip triples: "(1, 2, 3)" contains "(1, 2" but no ")" right after — regex already requires ")".
    out.push([Number(m[1]), Number(m[2])]);
  }
  return out;
}

export type LineClaim =
  | { kind: 'x'; c: number }
  | { kind: 'y'; c: number }
  | { kind: 'fn'; expr: string }
  /** a·x + b·y = c, e.g. "2x - 5y = 32" */
  | { kind: 'gen'; a: number; b: number; c: number };

const coef = (raw: string): number | null => {
  const t = raw.replace(/\s+/g, '');
  if (t === '' || t === '+') return 1;
  if (t === '-') return -1;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** "2x - 5y = 32", "x + 2y = 8", "3y = 4x - 1" is NOT handled here (needs both terms on the left). */
export function generalLinearClaim(text: string | undefined): { a: number; b: number; c: number } | null {
  if (!text) return null;
  const t = text.replace(/[−–]/g, '-').replace(/\s+/g, '').replace(/^.*?(?=[+-]?\d*\.?\d*[xy][+-])/, '');
  const m = /^([+-]?\d*\.?\d*)([xy])([+-]\d*\.?\d*)([xy])=(-?\d+(?:\.\d+)?)(?:$|[^\d.a-z])/i.exec(t);
  if (!m || m[2].toLowerCase() === m[4].toLowerCase()) return null;
  const c1 = coef(m[1]); const c2 = coef(m[3]);
  if (c1 === null || c2 === null) return null;
  const [a, b] = m[2].toLowerCase() === 'x' ? [c1, c2] : [c2, c1];
  return { a, b, c: Number(m[5]) };
}

/** "x = 2", "y = -3", "y = 2x + 1", "2x - 5y = 32" → claim; else null. */
export function lineClaim(text: string | undefined): LineClaim | null {
  if (!text) return null;
  const t = text.replace(/[−–]/g, '-');
  const gen = generalLinearClaim(t);
  if (gen) return { kind: 'gen', ...gen };
  const mx = /(?:^|[^a-z])x\s*=\s*(-?\d+(?:\.\d+)?)\s*(?:$|[^\d.a-z(])/i.exec(t);
  if (mx && !/y\s*=/.test(t)) return { kind: 'x', c: Number(mx[1]) };
  const my = /(?:^|[^a-z0-9.])y\s*=\s*([^,;:]+)$/i.exec(t.trim());
  if (!my) return null;
  const rhs = my[1].trim().replace(/\s*\(.*?\)\s*$/, (s) => (/x/.test(s) ? s : '')); // drop trailing "(gradient 0)" notes
  const constant = /^(-?\d+(?:\.\d+)?)$/.exec(rhs);
  if (constant) return { kind: 'y', c: Number(constant[1]) };
  if (!/x/.test(rhs)) return null;
  return compileExpr(rhs).ok ? { kind: 'fn', expr: rhs } : null;
}

/** "35°", "angle = 90 degrees" → 35 / 90. */
function degreeClaim(text: string | undefined): number | null {
  if (!text) return null;
  const m = /(-?\d+(?:\.\d+)?)\s*(?:°|degrees?\b|deg\b)/i.exec(text);
  return m ? Number(m[1]) : null;
}

/** "5", "5 cm", "c = 5", "r = 3 m", "length 7" → number; null otherwise. */
function measureClaim(text: string | undefined): number | null {
  if (!text) return null;
  const m = /^(?:[a-z]{1,8}\s*(?:=|:)?\s*)?(\d+(?:\.\d+)?)\s*(?:mm|cm|m|km|units?|u)?$/i.exec(text.trim());
  return m ? Number(m[1]) : null;
}

// ─── frame sanitation ────────────────────────────────────────────

function inferFrameKind(rawEls: any[]): 'plane' | 'canvas' {
  const kinds = new Set(rawEls.map((e) => e?.kind));
  if (kinds.has('line') || kinds.has('ray') || kinds.has('function') || kinds.has('angle')) return 'plane';
  if (kinds.has('box') || kinds.has('connector')) return 'canvas';
  return 'plane';
}

function planeFrame(raw: any, issues: VisualIssue[]): PlaneFrame {
  const x = range(raw?.x) ?? range([raw?.xMin, raw?.xMax]);
  const y = range(raw?.y) ?? range([raw?.yMin, raw?.yMax]);
  if (!x || !y) issues.push({ severity: 'fix', message: 'plane frame range missing or invalid — fitted to the drawn elements' });
  const axes = pick(raw?.axes, ['both', 'x', 'y', 'none'] as const) ?? 'both';
  return {
    kind: 'plane',
    x: x ?? [NaN, NaN],
    y: y ?? [NaN, NaN],
    axes,
    grid: bool(raw?.grid) ?? axes !== 'none',
    equalScale: bool(raw?.equalScale) ?? axes === 'both',
    xLabel: str(raw?.xLabel, 40),
    yLabel: str(raw?.yLabel, 40),
    xStep: num(raw?.xStep) ?? undefined,
    yStep: num(raw?.yStep) ?? undefined,
  };
}

// ─── 2D element sanitation ───────────────────────────────────────

function base(raw: any) {
  return {
    name: str(raw?.name, 60),
    label: str(raw?.label, 60),
    color: color(raw?.color),
  };
}

function points(v: unknown, min: number): Vec2[] | null {
  if (!Array.isArray(v)) return null;
  const pts = v.map(vec2).filter((p): p is Vec2 => !!p).slice(0, VISUAL_LIMITS.maxPolygonPoints);
  return pts.length >= min ? pts : null;
}

function element2D(raw: any, id: string, frameKind: 'plane' | 'canvas'): { el: VisualElement2D | null; why?: string } {
  const kind = raw?.kind;
  if (!(ELEMENT_KINDS_2D as readonly string[]).includes(kind)) return { el: null, why: `unknown kind "${kind}"` };
  const b = { id, ...base(raw) };
  const planeOnly = ['line', 'ray', 'function', 'angle'];
  if (frameKind === 'canvas' && planeOnly.includes(kind)) return { el: null, why: `"${kind}" needs a plane frame` };
  if (frameKind === 'plane' && kind === 'box') return { el: null, why: '"box" is for canvas frames; use text or polygon on a plane' };

  switch (kind) {
    case 'point': {
      const at = vec2(raw.at);
      if (!at) return { el: null, why: 'point without a valid "at"' };
      return { el: { ...b, kind, at, style: pick(raw.style, ['solid', 'open'] as const), size: pick(raw.size, ['sm', 'md', 'lg'] as const) } };
    }
    case 'segment': {
      const from = vec2(raw.from); const to = vec2(raw.to);
      if (!from || !to) return { el: null, why: 'segment needs "from" and "to"' };
      if (close(from[0], to[0], 1e-9) && close(from[1], to[1], 1e-9)) return { el: null, why: 'segment has zero length' };
      return { el: { ...b, kind, from, to, arrow: pick(raw.arrow, ARROWS), dashed: bool(raw.dashed), weight: pick(raw.weight, WEIGHTS) } };
    }
    case 'line': {
      const pts = Array.isArray(raw.through) ? raw.through.map(vec2) : [];
      if (!pts[0] || !pts[1]) return { el: null, why: 'line needs two "through" points' };
      if (close(pts[0][0], pts[1][0], 1e-9) && close(pts[0][1], pts[1][1], 1e-9)) return { el: null, why: 'line through two identical points' };
      return { el: { ...b, kind, through: [pts[0], pts[1]], dashed: bool(raw.dashed), weight: pick(raw.weight, WEIGHTS) } };
    }
    case 'ray': {
      const from = vec2(raw.from); const through = vec2(raw.through);
      if (!from || !through) return { el: null, why: 'ray needs "from" and "through"' };
      if (close(from[0], through[0], 1e-9) && close(from[1], through[1], 1e-9)) return { el: null, why: 'ray has no direction' };
      return { el: { ...b, kind, from, through, dashed: bool(raw.dashed), weight: pick(raw.weight, WEIGHTS) } };
    }
    case 'polygon': {
      const pts = points(raw.points, 3);
      if (!pts) return { el: null, why: 'polygon needs 3+ points' };
      return { el: { ...b, kind, points: pts, fill: bool(raw.fill), dashed: bool(raw.dashed) } };
    }
    case 'polyline': {
      const pts = points(raw.points, 2);
      if (!pts) return { el: null, why: 'polyline needs 2+ points' };
      return { el: { ...b, kind, points: pts, arrow: pick(raw.arrow, ARROWS), dashed: bool(raw.dashed), weight: pick(raw.weight, WEIGHTS) } };
    }
    case 'circle': {
      const center = vec2(raw.center); const r = num(raw.r);
      if (!center || r === null || r <= 0) return { el: null, why: 'circle needs "center" and a positive "r"' };
      const ry = num(raw.ry);
      return { el: { ...b, kind, center, r, ry: ry !== null && ry > 0 ? ry : undefined, fill: bool(raw.fill), dashed: bool(raw.dashed) } };
    }
    case 'angle': {
      const vertex = vec2(raw.vertex); const from = vec2(raw.from); const to = vec2(raw.to);
      if (!vertex || !from || !to) return { el: null, why: 'angle needs "vertex", "from", "to"' };
      return { el: { ...b, kind, vertex, from, to, right: bool(raw.right) } };
    }
    case 'function': {
      const expr = str(raw.expr, 160);
      if (!expr) return { el: null, why: 'function needs "expr"' };
      const c = compileExpr(expr);
      if (c.ok === false) return { el: null, why: `function expr "${expr}" does not parse: ${c.error}` };
      const domain = range(raw.domain) ?? undefined;
      return { el: { ...b, kind, expr: c.normalized, domain, dashed: bool(raw.dashed), weight: pick(raw.weight, WEIGHTS) } };
    }
    case 'text': {
      const at = vec2(raw.at); const text = str(raw.text);
      if (!at || !text) return { el: null, why: 'text needs "at" and "text"' };
      return { el: { ...b, kind, at, text, size: pick(raw.size, TEXT_SIZES), align: pick(raw.align, ['start', 'middle', 'end'] as const), math: bool(raw.math) } };
    }
    case 'box': {
      const at = vec2(raw.at); const text = str(raw.text, 60);
      if (!at || !text) return { el: null, why: 'box needs "at" and "text"' };
      const w = num(raw.w); const h = num(raw.h);
      return {
        el: {
          ...b, kind, at, text, sub: str(raw.sub, 70),
          w: w !== null && w >= 6 && w <= 60 ? w : undefined,
          h: h !== null && h >= 4 && h <= 30 ? h : undefined,
        },
      };
    }
    case 'connector': {
      const from = slugId(raw.from); const to = slugId(raw.to);
      if (!from || !to || from === to) return { el: null, why: 'connector needs two different element ids' };
      const bend = num(raw.bend);
      return { el: { ...b, kind, from, to, arrow: pick(raw.arrow, ARROWS), dashed: bool(raw.dashed), bend: bend === null ? undefined : Math.max(-1, Math.min(1, bend)) } };
    }
    case 'table': {
      if (!Array.isArray(raw.rows)) return { el: null, why: 'table needs "rows"' };
      const rows = raw.rows
        .filter(Array.isArray)
        .slice(0, VISUAL_LIMITS.maxTableRows)
        .map((r: unknown[]) => r.slice(0, VISUAL_LIMITS.maxTableCols).map((c) => str(c, 24) ?? ''));
      if (rows.length < 2 || !rows[0].length) return { el: null, why: 'table needs a header and at least one row' };
      const width = rows[0].length;
      return { el: { ...b, kind, rows: rows.map((r: string[]) => [...r, ...Array(Math.max(0, width - r.length)).fill('')].slice(0, width)), placement: pick(raw.placement, ['left', 'right'] as const) } };
    }
  }
  return { el: null, why: `unsupported kind "${kind}"` };
}

/** Every concrete 2D coordinate an element occupies (for frame fitting / caption checks). */
export function coords2D(el: VisualElement2D): Vec2[] {
  switch (el.kind) {
    case 'point': return [el.at];
    case 'segment': return [el.from, el.to];
    case 'polygon': case 'polyline': return el.points;
    case 'circle': {
      const ry = el.ry ?? el.r;
      return [[el.center[0] - el.r, el.center[1] - ry], [el.center[0] + el.r, el.center[1] + ry]];
    }
    case 'angle': return [el.vertex];
    case 'text': return [el.at];
    case 'box': return [el.at];
    case 'ray': return [el.from];
    case 'line': return [];          // infinite: clipped, never widens the frame
    case 'function': return [];
    default: return [];
  }
}

function fitRange(current: [number, number], values: number[], issues: VisualIssue[], axis: string): [number, number] {
  const finite = values.filter(Number.isFinite);
  const ok = Number.isFinite(current[0]) && Number.isFinite(current[1]);
  if (!finite.length) return ok ? current : [-5, 5];
  const lo = Math.min(...finite); const hi = Math.max(...finite);
  if (ok && lo >= current[0] && hi <= current[1]) return current;
  const a = ok ? Math.min(current[0], lo) : lo;
  const b = ok ? Math.max(current[1], hi) : hi;
  const pad = Math.max((b - a) * 0.08, 0.5);
  if (ok) issues.push({ severity: 'fix', message: `${axis}-range widened to fit elements drawn outside it` });
  return [a - pad, b + pad];
}

// ─── steps ───────────────────────────────────────────────────────

function sanitizeSteps(rawSteps: unknown, ids: Set<string>, idMap: Map<string, string>, issues: VisualIssue[]): VisualStep[] {
  const resolve = (v: unknown) => {
    const s = slugId(v);
    return idMap.get(s) ?? (ids.has(s) ? s : null);
  };
  const list = Array.isArray(rawSteps) ? rawSteps : [];
  const seenIds = new Set<string>();
  let steps: VisualStep[] = [];
  list.forEach((raw: any, i) => {
    if (!raw || typeof raw !== 'object') return;
    const show = (Array.isArray(raw.show) ? raw.show : []).map(resolve).filter((x: string | null): x is string => !!x);
    const focus = (Array.isArray(raw.focus) ? raw.focus : []).map(resolve).filter((x: string | null): x is string => !!x);
    const caption = str(raw.caption, VISUAL_LIMITS.maxCaptionChars);
    const name = str(raw.name, 48) ?? (caption ? caption.split(' ').slice(0, 5).join(' ') : undefined);
    if (!name || (!caption && !show.length && !focus.length)) return;
    let id = slugId(raw.id) || `s${i + 1}`;
    while (seenIds.has(id)) id = `${id}-${i + 1}`;
    seenIds.add(id);
    steps.push({ id, name, caption: caption ?? name, show, focus: focus.length ? focus : undefined, phase: pick(raw.phase, STEP_PHASES) });
  });

  if (!steps.length) {
    issues.push({ severity: 'fix', message: 'no usable steps — one step now shows the whole picture' });
    return [{ id: 's1', name: 'the picture', caption: 'Here is the whole picture.', show: [...ids], phase: 'teach' }];
  }

  if (steps.length > VISUAL_LIMITS.maxSteps) {
    const keep = steps.slice(0, VISUAL_LIMITS.maxSteps);
    const extra = steps.slice(VISUAL_LIMITS.maxSteps).flatMap((s) => s.show);
    keep[keep.length - 1] = { ...keep[keep.length - 1], show: [...keep[keep.length - 1].show, ...extra] };
    issues.push({ severity: 'fix', message: `more than ${VISUAL_LIMITS.maxSteps} steps — extra steps merged into the last` });
    steps = keep;
  }

  // Each element appears once: its first step wins.
  const shown = new Set<string>();
  steps = steps.map((s) => {
    const show = s.show.filter((id) => (shown.has(id) ? false : (shown.add(id), true)));
    return { ...s, show };
  });
  return steps;
}

/** A connector can't appear before both ends are on the board — move it later. */
function orderConnectors(steps: VisualStep[], elements: VisualElement2D[], issues: VisualIssue[]): VisualStep[] {
  const stepOf = new Map<string, number>();
  steps.forEach((s, i) => s.show.forEach((id) => stepOf.set(id, i)));
  const firstVisible = (id: string) => (stepOf.has(id) ? stepOf.get(id)! : -1); // -1 = always visible
  const out = steps.map((s) => ({ ...s, show: [...s.show] }));
  for (const el of elements) {
    if (el.kind !== 'connector' || !stepOf.has(el.id)) continue;
    const at = stepOf.get(el.id)!;
    const needed = Math.max(firstVisible(el.from), firstVisible(el.to));
    if (needed > at) {
      out[at].show = out[at].show.filter((id) => id !== el.id);
      out[needed].show.push(el.id);
      issues.push({ severity: 'fix', message: `connector "${el.id}" moved to step ${needed + 1}, where both its ends are visible`, elementId: el.id });
    }
  }
  return out;
}

// ─── fact-checks (2D) ────────────────────────────────────────────

function angleDeg(v: Vec2, a: Vec2, b: Vec2): number {
  const ux = a[0] - v[0], uy = a[1] - v[1], wx = b[0] - v[0], wy = b[1] - v[1];
  const d = Math.hypot(ux, uy) * Math.hypot(wx, wy);
  if (d === 0) return NaN;
  return (Math.acos(Math.max(-1, Math.min(1, (ux * wx + uy * wy) / d))) * 180) / Math.PI;
}

function factCheck2D(v: BoardVisual, issues: VisualIssue[]) {
  const plane = v.frame.kind === 'plane' ? v.frame : null;
  const span = plane ? Math.max(plane.x[1] - plane.x[0], plane.y[1] - plane.y[0]) : 100;
  const tol = Math.max(1e-6, span * 0.004);
  const measured = plane && plane.axes !== 'none';

  for (const el of v.elements) {
    const texts = [el.label, el.name].filter(Boolean) as string[];

    if (plane && el.kind === 'point') {
      for (const t of texts) {
        for (const [px, py] of coordinatePairs(t)) {
          if (!close(px, el.at[0], tol) || !close(py, el.at[1], tol)) {
            issues.push({
              severity: 'error', elementId: el.id, strip: ['label', 'name'],
              message: `point "${el.id}" says (${fmt(px)}, ${fmt(py)}) but is drawn at (${fmt(el.at[0])}, ${fmt(el.at[1])})`,
            });
          }
        }
      }
    }

    if (plane && (el.kind === 'line' || el.kind === 'segment' || el.kind === 'ray')) {
      const [p, q] = el.kind === 'line' ? el.through : el.kind === 'segment' ? [el.from, el.to] : [el.from, el.through];
      for (const t of texts) {
        const claim = lineClaim(t);
        if (!claim) continue;
        let bad = false;
        if (claim.kind === 'x') bad = !close(p[0], claim.c, tol) || !close(q[0], claim.c, tol);
        else if (claim.kind === 'y') bad = !close(p[1], claim.c, tol) || !close(q[1], claim.c, tol);
        else if (claim.kind === 'gen') bad = [p, q].some(([x, y]) => !close(claim.a * x + claim.b * y, claim.c, Math.max(tol * (Math.abs(claim.a) + Math.abs(claim.b)), Math.abs(claim.c) * 0.01)));
        else {
          const c = compileExpr(claim.expr);
          if (c.ok) bad = [p, q].some(([x, y]) => !Number.isFinite(c.fn(x)) || !close(c.fn(x), y, Math.max(tol, Math.abs(y) * 0.01)));
        }
        if (bad) {
          issues.push({
            severity: 'error', elementId: el.id, strip: ['label', 'name'],
            message: `${el.kind} "${el.id}" is labelled "${t}" but passes through (${fmt(p[0])}, ${fmt(p[1])}) and (${fmt(q[0])}, ${fmt(q[1])})`,
          });
        }
      }
      if (measured && el.kind === 'segment' && el.label) {
        const claimed = measureClaim(el.label);
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (claimed !== null && plane!.equalScale && !close(claimed, len, Math.max(tol, len * 0.02))) {
          issues.push({
            severity: 'error', elementId: el.id, strip: ['label'],
            message: `segment "${el.id}" is labelled ${el.label} but its length on the drawn axes is ${fmt(len)}`,
          });
        }
      }
    }

    if (plane && el.kind === 'function') {
      const drawn = compileExpr(el.expr);
      for (const t of texts) {
        const claim = lineClaim(t);
        if (!claim || !drawn.ok) continue;
        const [lo, hi] = el.domain ?? plane.x;
        const xs = [0, 0.2, 0.45, 0.7, 0.95].map((f) => lo + (hi - lo) * f);
        const claimedFn = claim.kind === 'fn' ? compileExpr(claim.expr) : null;
        const bad = xs.some((x) => {
          const y = drawn.fn(x);
          if (!Number.isFinite(y)) return false;
          if (claim.kind === 'gen') return !close(claim.a * x + claim.b * y, claim.c, Math.max(tol * (Math.abs(claim.a) + Math.abs(claim.b)), Math.abs(claim.c) * 0.01));
          const c = claim.kind === 'y' ? claim.c : claim.kind === 'x' ? NaN : claimedFn?.ok ? claimedFn.fn(x) : NaN;
          return !Number.isFinite(c) || !close(c, y, Math.max(tol, Math.abs(y) * 0.01));
        });
        if (bad) {
          issues.push({
            severity: 'error', elementId: el.id, strip: ['label', 'name'],
            message: `function "${el.id}" is labelled "${t}" but plots y = ${el.expr}`,
          });
        }
      }
    }

    if (plane && el.kind === 'angle') {
      const deg = angleDeg(el.vertex, el.from, el.to);
      if (el.right && Number.isFinite(deg) && Math.abs(deg - 90) > 1.5) {
        issues.push({
          severity: 'error', elementId: el.id, strip: ['right', 'label'],
          message: `angle "${el.id}" is marked as a right angle but measures ${fmt(Math.round(deg * 10) / 10)}°`,
        });
      }
      const claimed = degreeClaim(el.label);
      if (claimed !== null && Number.isFinite(deg) && plane.equalScale && Math.abs(claimed - deg) > 1.5 && Math.abs(360 - claimed - deg) > 1.5) {
        issues.push({
          severity: 'error', elementId: el.id, strip: ['label'],
          message: `angle "${el.id}" is labelled ${el.label} but measures ${fmt(Math.round(deg * 10) / 10)}°`,
        });
      }
    }

    if (measured && el.kind === 'circle' && el.label && plane!.equalScale) {
      const m = /\br\s*=\s*(\d+(?:\.\d+)?)/i.exec(el.label);
      if (m && !close(Number(m[1]), el.r, Math.max(tol, el.r * 0.02))) {
        issues.push({
          severity: 'error', elementId: el.id, strip: ['label'],
          message: `circle "${el.id}" is labelled ${el.label} but its radius is ${fmt(el.r)}`,
        });
      }
    }
  }

  if (plane) checkAttachedClaims(v, plane, tol, span, issues);

  // Coordinates quoted in captions / the title should be somewhere on the board:
  // a point or vertex, or on a drawn line, segment, ray, curve or circle.
  if (plane) {
    const texts = [...v.steps.map((s) => s.caption), v.title];
    for (const t of texts) {
      for (const [x, y] of coordinatePairs(t)) {
        if (!isOnBoard(v.elements, x, y, tol)) {
          issues.push({ severity: 'warn', message: `text "${t}" mentions (${fmt(x)}, ${fmt(y)}) but nothing on the board passes through it` });
        }
      }
    }
  }
}

function distToLine(px: number, py: number, a: Vec2, b: Vec2, clampT: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - a[0], py - a[1]);
  const t = Math.max(clampT[0], Math.min(clampT[1], ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/** Is (x, y) on something drawn? Used to check coordinates quoted in text. */
export function isOnBoard(elements: VisualElement2D[], x: number, y: number, tol: number): boolean {
  const near = (p: Vec2) => close(p[0], x, tol) && close(p[1], y, tol);
  return elements.some((e) => {
    switch (e.kind) {
      case 'point': return near(e.at);
      case 'segment': return distToLine(x, y, e.from, e.to, [0, 1]) <= tol;
      case 'line': return distToLine(x, y, e.through[0], e.through[1], [-Infinity, Infinity]) <= tol;
      case 'ray': return distToLine(x, y, e.from, e.through, [0, Infinity]) <= tol;
      case 'polygon': case 'polyline': {
        const pts = e.kind === 'polygon' ? [...e.points, e.points[0]] : e.points;
        return pts.some(near) || pts.slice(1).some((p, i) => distToLine(x, y, pts[i], p, [0, 1]) <= tol);
      }
      case 'circle': return !e.ry && Math.abs(Math.hypot(x - e.center[0], y - e.center[1]) - e.r) <= tol;
      case 'function': {
        const c = compileExpr(e.expr);
        if (!c.ok) return false;
        if (e.domain && (x < e.domain[0] - tol || x > e.domain[1] + tol)) return false;
        const fy = c.fn(x);
        return Number.isFinite(fy) && close(fy, y, Math.max(tol, Math.abs(y) * 0.01));
      }
      case 'angle': return near(e.vertex);
      default: return false;
    }
  });
}

// ─── free-standing labels must sit on the curve they name ────────────
// A `text` brick that says "y = x + 2" is a claim about a drawn curve. The
// model often places such texts near the wrong curve, or a few units away
// from every curve (review: "solving graphically" labels swapped / floating).
type Curve = { el: VisualElement2D; satisfies: (c: LineClaim) => boolean; dist: (x: number, y: number) => number };

function curveOf(el: VisualElement2D, tol: number, xr: [number, number]): Curve | null {
  if (el.kind === 'line' || el.kind === 'segment' || el.kind === 'ray') {
    const [p, q] = el.kind === 'line' ? el.through : el.kind === 'segment' ? [el.from, el.to] : [el.from, el.through];
    const clampT: [number, number] = el.kind === 'line' ? [-Infinity, Infinity] : el.kind === 'segment' ? [0, 1] : [0, Infinity];
    return {
      el,
      dist: (x, y) => distToLine(x, y, p, q, clampT),
      satisfies: (c) => {
        if (c.kind === 'x') return close(p[0], c.c, tol) && close(q[0], c.c, tol);
        if (c.kind === 'y') return close(p[1], c.c, tol) && close(q[1], c.c, tol);
        if (c.kind === 'gen') return [p, q].every(([x, y]) => close(c.a * x + c.b * y, c.c, Math.max(tol * (Math.abs(c.a) + Math.abs(c.b)), Math.abs(c.c) * 0.01)));
        const f = compileExpr(c.expr);
        return f.ok && [p, q].every(([x, y]) => Number.isFinite(f.fn(x)) && close(f.fn(x), y, Math.max(tol, Math.abs(y) * 0.01)));
      },
    };
  }
  if (el.kind === 'function') {
    const drawn = compileExpr(el.expr);
    if (!drawn.ok) return null;
    const [lo, hi] = el.domain ?? xr;
    const xs = Array.from({ length: 60 }, (_, i) => lo + ((hi - lo) * i) / 59);
    return {
      el,
      dist: (x, y) => Math.min(...xs.map((sx) => { const sy = drawn.fn(sx); return Number.isFinite(sy) ? Math.hypot(sx - x, sy - y) : Infinity; })),
      satisfies: (c) => {
        const probe = xs.filter((_, i) => i % 12 === 0);
        if (c.kind === 'x') return false;
        if (c.kind === 'y') return probe.every((x) => close(drawn.fn(x), c.c, tol));
        if (c.kind === 'gen') return probe.every((x) => close(c.a * x + c.b * drawn.fn(x), c.c, Math.max(tol * (Math.abs(c.a) + Math.abs(c.b)), Math.abs(c.c) * 0.01)));
        const f = compileExpr(c.expr);
        return f.ok && probe.every((x) => close(f.fn(x), drawn.fn(x), Math.max(tol, Math.abs(drawn.fn(x)) * 0.01)));
      },
    };
  }
  return null;
}

function checkAttachedClaims(v: BoardVisual, plane: PlaneFrame, tol: number, span: number, issues: VisualIssue[]) {
  const curves = v.elements.map((e) => curveOf(e, tol, plane.x)).filter((c): c is Curve => !!c);
  if (!curves.length) return;
  for (const el of v.elements) {
    if (el.kind !== 'text') continue;
    const claim = lineClaim(el.text);
    if (!claim) continue;
    const [ax, ay] = el.at;
    const matching = curves.filter((c) => c.satisfies(claim));
    if (!matching.length) {
      issues.push({
        severity: 'error', elementId: el.id, strip: ['element'],
        message: `text "${el.id}" says "${el.text}" but no drawn line or curve is that equation`,
      });
      continue;
    }
    const nearestMatch = Math.min(...matching.map((c) => c.dist(ax, ay)));
    const others = curves.filter((c) => !matching.includes(c));
    const nearestOther = others.length ? Math.min(...others.map((c) => c.dist(ax, ay))) : Infinity;
    if (nearestOther + tol < nearestMatch) {
      issues.push({
        severity: 'error', elementId: el.id, strip: ['element'],
        message: `text "${el.id}" says "${el.text}" but sits next to a different line (${fmt(nearestOther)} away) than the one that is "${el.text}" (${fmt(nearestMatch)} away)`,
      });
    } else if (nearestMatch > span * 0.15) {
      issues.push({
        severity: 'error', elementId: el.id, strip: ['element'],
        message: `text "${el.id}" says "${el.text}" but floats ${fmt(nearestMatch)} units from that line — put the label on the line or label the line itself`,
      });
    } else if (nearestMatch > span * 0.08) {
      issues.push({ severity: 'warn', elementId: el.id, message: `text "${el.id}" ("${el.text}") is ${fmt(nearestMatch)} units from its line — move it closer` });
    }
  }
}


// ─── 3D ──────────────────────────────────────────────────────────

function element3D(raw: any, id: string): { el: VisualElement3D | null; why?: string } {
  const kind = raw?.kind;
  if (!(ELEMENT_KINDS_3D as readonly string[]).includes(kind)) return { el: null, why: `unknown 3D kind "${kind}"` };
  const b = { id, ...base(raw) };
  switch (kind) {
    case 'point': {
      const at = vec3(raw.at);
      return at ? { el: { ...b, kind, at } } : { el: null, why: 'point needs "at" [x,y,z]' };
    }
    case 'segment': {
      const from = vec3(raw.from); const to = vec3(raw.to);
      if (!from || !to) return { el: null, why: 'segment needs "from" and "to" [x,y,z]' };
      return { el: { ...b, kind, from, to, arrow: pick(raw.arrow, ARROWS), dashed: bool(raw.dashed) } };
    }
    case 'polygon': {
      const pts = Array.isArray(raw.points) ? raw.points.map(vec3).filter((p: Vec3 | null): p is Vec3 => !!p).slice(0, VISUAL_LIMITS.maxPolygonPoints) : [];
      return pts.length >= 3 ? { el: { ...b, kind, points: pts, fill: bool(raw.fill) } } : { el: null, why: 'polygon needs 3+ points' };
    }
    case 'sphere': {
      const center = vec3(raw.center); const r = num(raw.r);
      return center && r !== null && r > 0 ? { el: { ...b, kind, center, r, wireframe: bool(raw.wireframe) } } : { el: null, why: 'sphere needs "center" and positive "r"' };
    }
    case 'cuboid': {
      const center = vec3(raw.center); const size = vec3(raw.size);
      return center && size && size.every((s) => s > 0) ? { el: { ...b, kind, center, size, wireframe: bool(raw.wireframe) } } : { el: null, why: 'cuboid needs "center" and positive "size" [w,h,d]' };
    }
    case 'cylinder': {
      const from = vec3(raw.from); const to = vec3(raw.to); const r = num(raw.r);
      if (!from || !to || r === null || r < 0) return { el: null, why: 'cylinder needs "from", "to", "r"' };
      const rTop = num(raw.rTop);
      return { el: { ...b, kind, from, to, r, rTop: rTop !== null && rTop >= 0 ? rTop : undefined, wireframe: bool(raw.wireframe) } };
    }
    case 'label': {
      const at = vec3(raw.at); const text = str(raw.text, 60);
      return at && text ? { el: { ...b, kind, at, text } } : { el: null, why: 'label needs "at" and "text"' };
    }
  }
  return { el: null, why: `unsupported 3D kind "${kind}"` };
}

function coords3D(el: VisualElement3D): Vec3[] {
  switch (el.kind) {
    case 'point': case 'label': return [el.at];
    case 'segment': return [el.from, el.to];
    case 'polygon': return el.points;
    case 'sphere': return [[el.center[0] - el.r, el.center[1] - el.r, el.center[2] - el.r], [el.center[0] + el.r, el.center[1] + el.r, el.center[2] + el.r]];
    case 'cuboid': return [
      [el.center[0] - el.size[0] / 2, el.center[1] - el.size[1] / 2, el.center[2] - el.size[2] / 2],
      [el.center[0] + el.size[0] / 2, el.center[1] + el.size[1] / 2, el.center[2] + el.size[2] / 2],
    ];
    case 'cylinder': {
      const r = Math.max(el.r, el.rTop ?? el.r);
      return [el.from, el.to].flatMap(([x, y, z]) => [[x - r, y - r, z - r], [x + r, y + r, z + r]] as Vec3[]);
    }
  }
}

function factCheck3D(v: BoardVisual3D, issues: VisualIssue[]) {
  const span = Math.max(v.frame.x[1] - v.frame.x[0], v.frame.y[1] - v.frame.y[0], v.frame.z[1] - v.frame.z[0]);
  const tol = Math.max(1e-6, span * 0.004);
  for (const el of v.elements) {
    const texts = [el.label, el.name].filter(Boolean) as string[];
    if (el.kind === 'point') {
      for (const t of texts) {
        const m = TRIPLE_RE.exec(t.replace(/[−–]/g, '-'));
        if (m && [0, 1, 2].some((i) => !close(Number(m[i + 1]), el.at[i], tol))) {
          issues.push({ severity: 'error', elementId: el.id, strip: ['label', 'name'], message: `point "${el.id}" says (${m[1]}, ${m[2]}, ${m[3]}) but is drawn at (${el.at.map(fmt).join(', ')})` });
        }
      }
    }
    if (el.kind === 'cuboid' && el.label) {
      const dims = /(\d+(?:\.\d+)?)\s*(?:×|x|\*|by)\s*(\d+(?:\.\d+)?)\s*(?:×|x|\*|by)\s*(\d+(?:\.\d+)?)/i.exec(el.label);
      if (dims) {
        const claimed = [dims[1], dims[2], dims[3]].map(Number).sort((a, b) => a - b);
        const real = [...el.size].sort((a, b) => a - b);
        if (claimed.some((c, i) => !close(c, real[i], Math.max(tol, real[i] * 0.02)))) {
          issues.push({ severity: 'error', elementId: el.id, strip: ['label'], message: `cuboid "${el.id}" is labelled ${el.label} but is ${el.size.map(fmt).join(' × ')}` });
        }
      }
    }
    if ((el.kind === 'sphere' || el.kind === 'cylinder') && el.label) {
      const m = /\br\s*=\s*(\d+(?:\.\d+)?)/i.exec(el.label);
      if (m && !close(Number(m[1]), el.r, Math.max(tol, el.r * 0.02))) {
        issues.push({ severity: 'error', elementId: el.id, strip: ['label'], message: `${el.kind} "${el.id}" is labelled ${el.label} but its radius is ${fmt(el.r)}` });
      }
    }
  }
}

// ─── entry points ────────────────────────────────────────────────

function header(raw: any, issues: VisualIssue[]) {
  const representation = typeof raw?.representation === 'string' && REPRESENTATIONS.includes(raw.representation)
    ? raw.representation : 'visual_diagram';
  if (raw?.representation && representation !== raw.representation) {
    issues.push({ severity: 'fix', message: `unknown representation "${raw.representation}" — using visual_diagram` });
  }
  return {
    version: 1 as const,
    title: str(raw?.title, 80) ?? 'On the board',
    purpose: pick(raw?.purpose, PURPOSES) ?? 'teach',
    representation,
    why: str(raw?.why, 220) ?? '',
    focus: str(raw?.focus, 120),
    misconceptionId: str(raw?.misconceptionId, 60),
    checkQuestion: str(raw?.checkQuestion, 200),
  };
}

/** Assign unique slug ids; returns elements with ids plus a map from the model's ids. */
function assignIds<T>(rawEls: any[], make: (raw: any, id: string) => { el: T | null; why?: string }, issues: VisualIssue[]) {
  const used = new Set<string>();
  const idMap = new Map<string, string>();
  const out: T[] = [];
  rawEls.slice(0, VISUAL_LIMITS.maxElements * 2).forEach((raw, i) => {
    const wanted = slugId(raw?.id) || `${String(raw?.kind || 'el')}-${i + 1}`;
    let id = wanted;
    let n = 2;
    while (used.has(id)) id = `${wanted}-${n++}`;
    const { el, why } = make(raw, id);
    if (!el) {
      issues.push({ severity: 'fix', message: `dropped element "${wanted}": ${why}` });
      return;
    }
    if (out.length >= VISUAL_LIMITS.maxElements) {
      issues.push({ severity: 'fix', message: `more than ${VISUAL_LIMITS.maxElements} elements — "${wanted}" dropped` });
      return;
    }
    used.add(id);
    if (!idMap.has(wanted)) idMap.set(wanted, id);
    out.push(el);
  });
  return { elements: out, idMap };
}

export function sanitizeBoardVisual2D(raw: any): SanitizeResult<BoardVisual> {
  const issues: VisualIssue[] = [];
  if (!raw || typeof raw !== 'object') return { visual: null, issues: [{ severity: 'error', message: 'visual is not an object' }] };
  const rawEls: any[] = Array.isArray(raw.elements) ? raw.elements : [];
  const frameKind: 'plane' | 'canvas' = raw.frame?.kind === 'canvas' ? 'canvas' : raw.frame?.kind === 'plane' ? 'plane' : inferFrameKind(rawEls);

  let frame: Frame2D = frameKind === 'canvas' ? { kind: 'canvas' } : planeFrame(raw.frame, issues);
  const { elements: first, idMap } = assignIds<VisualElement2D>(rawEls, (r, id) => element2D(r, id, frameKind), issues);

  // Connectors must point at real, non-connector, non-table elements.
  const targetIds = new Set(first.filter((e) => e.kind !== 'connector' && e.kind !== 'table').map((e) => e.id));
  let tables = 0;
  const elements = first.filter((e) => {
    if (e.kind === 'connector') {
      const from = idMap.get(e.from) ?? e.from; const to = idMap.get(e.to) ?? e.to;
      if (!targetIds.has(from) || !targetIds.has(to)) {
        issues.push({ severity: 'fix', message: `dropped connector "${e.id}": it points at an element that does not exist`, elementId: e.id });
        return false;
      }
      e.from = from; e.to = to;
    }
    if (e.kind === 'table' && ++tables > 1) {
      issues.push({ severity: 'fix', message: `only one table per picture — dropped "${e.id}"`, elementId: e.id });
      return false;
    }
    return true;
  });

  if (!elements.length) return { visual: null, issues: [...issues, { severity: 'error', message: 'no drawable elements' }] };

  if (frame.kind === 'plane') {
    const pts = elements.flatMap(coords2D);
    frame = {
      ...frame,
      x: fitRange(frame.x, pts.map((p) => p[0]), issues, 'x'),
      y: fitRange(frame.y, pts.map((p) => p[1]), issues, 'y'),
    };
    // A number line / timeline: y is decorative, never equal-scaled.
    if (frame.axes === 'x' || frame.axes === 'none') {
      if (frame.axes === 'x' && frame.equalScale) issues.push({ severity: 'fix', message: 'number-line frame drawn without equal scaling' });
      if (frame.axes === 'x') frame.equalScale = false;
    } else {
      const aspect = (frame.x[1] - frame.x[0]) / (frame.y[1] - frame.y[0]);
      const lopsided = aspect > 6 || aspect < 1 / 6;
      // Angles and circles only look like what they are when 1 unit on x
      // equals 1 unit on y — otherwise a marked right angle is drawn skewed.
      const needsTrueShape = elements.some((e) => e.kind === 'angle' || (e.kind === 'circle' && !e.ry));
      if (frame.equalScale && lopsided) {
        frame.equalScale = false;
        issues.push({ severity: 'fix', message: 'equal scaling switched off: the ranges are too lopsided to read' });
      } else if (!frame.equalScale && needsTrueShape && !lopsided) {
        frame.equalScale = true;
        issues.push({ severity: 'fix', message: 'equal scaling switched on so angles and circles are drawn true to shape' });
      }
    }
  } else {
    // Canvas: keep everything on the board.
    for (const e of elements) {
      const clamp = (p: Vec2) => {
        const q: Vec2 = [Math.max(0, Math.min(VISUAL_LIMITS.canvasWidth, p[0])), Math.max(0, Math.min(VISUAL_LIMITS.canvasHeight, p[1]))];
        if (q[0] !== p[0] || q[1] !== p[1]) issues.push({ severity: 'fix', message: `"${e.id}" moved back inside the canvas`, elementId: e.id });
        return q;
      };
      if (e.kind === 'point' || e.kind === 'text' || e.kind === 'box') e.at = clamp(e.at);
      else if (e.kind === 'segment') { e.from = clamp(e.from); e.to = clamp(e.to); }
      else if (e.kind === 'polygon' || e.kind === 'polyline') e.points = e.points.map(clamp);
      else if (e.kind === 'circle') e.center = clamp(e.center);
    }
  }

  const ids = new Set(elements.map((e) => e.id));
  let steps = sanitizeSteps(raw.steps, ids, idMap, issues);
  steps = orderConnectors(steps, elements, issues);

  // Plain JSON out (no undefined fields): exactly what storage will hold and read back.
  const visual: BoardVisual = JSON.parse(JSON.stringify({ ...header(raw, issues), dim: '2d', frame, elements, steps }));
  factCheck2D(visual, issues);
  return { visual, issues };
}

export function sanitizeBoardVisual3D(raw: any): SanitizeResult<BoardVisual3D> {
  const issues: VisualIssue[] = [];
  if (!raw || typeof raw !== 'object') return { visual: null, issues: [{ severity: 'error', message: 'visual is not an object' }] };
  const rawEls: any[] = Array.isArray(raw.elements) ? raw.elements : [];
  const { elements, idMap } = assignIds<VisualElement3D>(rawEls, element3D, issues);
  if (!elements.length) return { visual: null, issues: [...issues, { severity: 'error', message: 'no drawable 3D elements' }] };

  const f = raw.frame || {};
  const pts = elements.flatMap(coords3D);
  const frame: SpaceFrame = {
    kind: 'space',
    x: fitRange(range(f.x) ?? [NaN, NaN], pts.map((p) => p[0]), issues, 'x'),
    y: fitRange(range(f.y) ?? [NaN, NaN], pts.map((p) => p[1]), issues, 'y'),
    z: fitRange(range(f.z) ?? [NaN, NaN], pts.map((p) => p[2]), issues, 'z'),
    axes: bool(f.axes) ?? true,
  };
  const ids = new Set(elements.map((e) => e.id));
  const steps = sanitizeSteps(raw.steps, ids, idMap, issues);
  const visual: BoardVisual3D = JSON.parse(JSON.stringify({ ...header(raw, issues), dim: '3d', frame, elements, steps }));
  factCheck3D(visual, issues);
  return { visual, issues };
}

/** Dispatch on raw.dim (or the expected dimension). */
export function sanitizeBoardVisual(raw: any, expect?: '2d' | '3d'): SanitizeResult<AnyBoardVisual> {
  const dim = expect ?? (raw?.dim === '3d' || raw?.frame?.kind === 'space' ? '3d' : '2d');
  return dim === '3d' ? sanitizeBoardVisual3D(raw) : sanitizeBoardVisual2D(raw);
}

/** Issues worth sending back to the model. */
export function repairableIssues(issues: VisualIssue[]): VisualIssue[] {
  return issues.filter((i) => i.severity !== 'fix');
}

/**
 * Last line of defence: remove every claim a fact-check proved false.
 * Geometry stays (it is what the model actually computed); the false text goes.
 */
export function stripUnverifiedClaims<T extends AnyBoardVisual>(visual: T, issues: VisualIssue[]): { visual: T; stripped: VisualIssue[] } {
  const errors = issues.filter((i) => i.severity === 'error' && i.elementId && i.strip?.length);
  if (!errors.length) return { visual, stripped: [] };
  const byId = new Map<string, Set<string>>();
  for (const e of errors) {
    const set = byId.get(e.elementId!) ?? new Set<string>();
    e.strip!.forEach((f) => set.add(f));
    byId.set(e.elementId!, set);
  }
  const removed = new Set<string>();
  const elements = (visual.elements as any[]).flatMap((el) => {
    const fields = byId.get(el.id);
    if (!fields) return [el];
    if (fields.has('element')) { removed.add(el.id); return []; }
    const copy = { ...el };
    if (fields.has('label')) delete copy.label;
    if (fields.has('name')) delete copy.name;
    if (fields.has('right')) copy.right = false;
    return [copy];
  });
  const steps = removed.size
    ? visual.steps.map((st) => ({ ...st, show: st.show.filter((id) => !removed.has(id)), focus: st.focus?.filter((id) => !removed.has(id)) }))
    : visual.steps;
  return {
    visual: { ...visual, elements, steps } as T,
    stripped: errors.map((e) => ({ ...e, severity: 'fix' as const, message: `removed unverified claim — ${e.message}` })),
  };
}
