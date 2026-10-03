// ─────────────────────────────────────────────────────────────────
// BoardVisualView — draws ANY board picture the AI composed from the
// brick vocabulary (src/visual/types.ts). There is no per-topic code
// here: a graph, a number line, a cycle, a labelled diagram and a
// geometric construction all come through the same few drawing rules.
//
// The picture is a teaching sequence. `step` says how far the tutor
// (or the learner, with the arrows) has built it:
//   • bricks from earlier steps stay, this step's bricks animate in,
//   • this step's focus is spotlighted and everything else dims,
//   • 'all' shows the finished picture.
//
// Server-render safe (no window/document access during render), so the
// smoke test renders real pictures with react-dom/server.
// ─────────────────────────────────────────────────────────────────
import React, { useId, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Layers, PlayCircle } from 'lucide-react';
import type {
  AnyBoardVisual, BoardVisual, VisualColor, VisualElement2D, Vec2, StepPhase,
} from '../visual/types';
import { compileExpr } from '../visual/expr';
import {
  layoutFrame, ticks, fmtTick, clipLine, sampleFunction, placeLabels, textWidth, wrapText, elementRects, TEXT_PX, POINT_R,
  VIEW_W, VIEW_H, Rect, LabelRequest,
} from '../visual/layout';

export const BOARD_COLORS: Record<VisualColor, string> = {
  ink: '#E8ECF8', muted: '#8B93A7', emerald: '#34D399', amber: '#FBBF24',
  sky: '#38BDF8', violet: '#A78BFA', rose: '#FB7185', teal: '#2DD4BF',
};
const BG = '#0B1020';
const MATH_FONT = '"Cambria Math", "STIX Two Math", "Latin Modern Math", Georgia, serif';
const STROKE = { thin: 2, normal: 3, bold: 4.5 } as const;
const LABEL_PX = 17;

export type StepState = number | 'all';

const PHASE_TEXT: Record<StepPhase, string> = {
  hook: 'Look', teach: 'Idea', contrast: 'Test the rule', check: 'Your turn to think', apply: 'Use it',
};

// ─── step controls (shared with the 3D view) ─────────────────────

export const StepBar: React.FC<{
  visual: AnyBoardVisual;
  step: StepState;
  onStepChange?: (s: StepState) => void;
}> = ({ visual, step, onStepChange }) => {
  const n = visual.steps.length;
  const current = step === 'all' ? null : visual.steps[Math.min(step, n - 1)];
  const idx = step === 'all' ? n - 1 : Math.min(step, n - 1);
  const btn = 'w-8 h-8 rounded-full flex items-center justify-center border border-white/15 bg-white/5 text-white/80 hover:bg-white/15 disabled:opacity-30 disabled:cursor-default cursor-pointer transition';
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        <h3 className="text-[16px] font-semibold text-white truncate">{visual.title}</h3>
        {onStepChange && n > 1 && (
          <div className="ml-auto flex items-center gap-1.5 shrink-0">
            {step === 'all' ? (
              <button className="px-3 h-8 rounded-full text-[12.5px] font-semibold flex items-center gap-1.5 border border-white/15 bg-white/5 text-white/85 hover:bg-white/15 cursor-pointer"
                onClick={() => onStepChange(0)}>
                <PlayCircle className="w-3.5 h-3.5" /> Walk me through it
              </button>
            ) : (
              <>
                <button className={btn} aria-label="Previous step" disabled={idx <= 0} onClick={() => onStepChange(Math.max(0, idx - 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[12.5px] text-white/70 tabular-nums w-[74px] text-center">Step {idx + 1} of {n}</span>
                <button className={btn} aria-label="Next step" disabled={idx >= n - 1} onClick={() => onStepChange(Math.min(n - 1, idx + 1))}>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button className="ml-1 px-3 h-8 rounded-full text-[12.5px] font-semibold flex items-center gap-1.5 border border-white/15 bg-white/5 text-white/75 hover:bg-white/15 cursor-pointer"
                  onClick={() => onStepChange('all')}>
                  <Layers className="w-3.5 h-3.5" /> Whole picture
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {current ? (
        <p className="text-[15px] leading-snug text-white/90 min-h-[1.4em]">
          {current.phase && (
            <span className="mr-2 inline-block px-2 py-[1px] rounded-full text-[11px] uppercase tracking-wide font-semibold bg-white/10 text-white/70 align-[2px]">
              {PHASE_TEXT[current.phase]}
            </span>
          )}
          {current.caption}
        </p>
      ) : visual.checkQuestion ? (
        <p className="text-[15px] leading-snug text-white/85 min-h-[1.4em]">
          <span className="mr-2 inline-block px-2 py-[1px] rounded-full text-[11px] uppercase tracking-wide font-semibold bg-white/10 text-white/70 align-[2px]">Think</span>
          {visual.checkQuestion}
        </p>
      ) : null}
    </div>
  );
};

// ─── the picture ─────────────────────────────────────────────────

interface Props {
  visual: BoardVisual;
  step: StepState;
  onStepChange?: (s: StepState) => void;
  /** Extra bricks to spotlight (the tutor's highlight_concept / reveal_part of a brick). */
  spotlight?: string[];
  showControls?: boolean;
  /** SVG id prefix. Defaults to a React useId; set it when several pictures are server-rendered into one page. */
  idPrefix?: string;
}

const col = (c: VisualColor | undefined, fallback: VisualColor = 'ink') => BOARD_COLORS[c ?? fallback] ?? BOARD_COLORS.ink;
const pts = (list: Vec2[]) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const LAYER: Record<VisualElement2D['kind'], number> = {
  table: 0, polygon: 1, circle: 1, function: 2, line: 2, ray: 2, segment: 2, polyline: 2, angle: 2, connector: 2, box: 3, point: 4, text: 5,
};

function rectEdgePoint(r: Rect, toward: Vec2, pad = 4): Vec2 {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const dx = toward[0] - cx, dy = toward[1] - cy;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return [cx, cy];
  const hw = r.w / 2 + pad, hh = r.h / 2 + pad;
  const s = Math.min(Math.abs(dx) > 1e-9 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-9 ? hh / Math.abs(dy) : Infinity);
  return [cx + dx * s, cy + dy * s];
}

export const BoardVisualView: React.FC<Props> = ({ visual, step, onStepChange, spotlight, showControls = true, idPrefix }) => {
  const rawId = useId();
  const uid = `bv${(idPrefix ?? rawId).replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const drawing = useMemo(() => {
    const L = layoutFrame(visual);
    const { toS, plane } = L;
    const n = visual.steps.length;
    const cur = step === 'all' ? n - 1 : Math.max(0, Math.min(step, n - 1));

    const stepOf = new Map<string, number>();
    visual.steps.forEach((s, i) => s.show.forEach((id) => stepOf.set(id, i)));
    const visible = (id: string) => step === 'all' || !stepOf.has(id) || stepOf.get(id)! <= cur;
    const entering = (id: string) => step !== 'all' && stepOf.get(id) === cur;
    const focus = new Set<string>(spotlight ?? []);
    if (step !== 'all') {
      const s = visual.steps[cur];
      (s.focus ?? s.show).forEach((id) => focus.add(id));
    }
    const dimOthers = focus.size > 0 && step !== 'all';
    const byId = new Map<string, VisualElement2D>(visual.elements.map((e) => [e.id, e] as [string, VisualElement2D]));

    // Screen rects of bricks that labels and connectors must respect (shared with the quality lints).
    const rects = elementRects(visual, L);

    const nodes: React.ReactNode[] = [];
    const labels: Array<LabelRequest & { color: string; entering: boolean; dim: boolean; pill?: boolean }> = [];
    const obstacles: Rect[] = [];

    // ── axes & grid (plane frames) ──
    const axisNodes: React.ReactNode[] = [];
    if (plane) {
      const xs = ticks(plane.x, plane.xStep, Math.max(4, Math.round(L.plot.w / 90)));
      const ys = ticks(plane.y, plane.yStep, Math.max(3, Math.round(L.plot.h / 70)));
      const showX = plane.axes === 'both' || plane.axes === 'x';
      const showY = plane.axes === 'both' || plane.axes === 'y';
      const axisY = plane.y[0] <= 0 && plane.y[1] >= 0 ? 0 : plane.y[0];
      const axisX = plane.x[0] <= 0 && plane.x[1] >= 0 ? 0 : plane.x[0];
      if (plane.grid) {
        xs.forEach((v) => { const [a] = toS([v, 0]); axisNodes.push(<line key={`gx${v}`} x1={a} y1={L.plot.y} x2={a} y2={L.plot.y + L.plot.h} stroke="rgba(255,255,255,.07)" strokeWidth={1} />); });
        // A number line has no meaningful y: no horizontal grid.
        if (plane.axes !== 'x') ys.forEach((v) => { const [, b] = toS([0, v]); axisNodes.push(<line key={`gy${v}`} x1={L.plot.x} y1={b} x2={L.plot.x + L.plot.w} y2={b} stroke="rgba(255,255,255,.07)" strokeWidth={1} />); });
      }
      const axisStroke = 'rgba(232,236,248,.55)';
      if (showX) {
        const [x1, y1] = toS([plane.x[0], axisY]); const [x2] = toS([plane.x[1], axisY]);
        axisNodes.push(<line key="ax" x1={x1} y1={y1} x2={x2 + 10} y2={y1} stroke={axisStroke} strokeWidth={2} markerEnd={`url(#${uid}-axis)`} />);
        obstacles.push({ x: x1, y: y1 - 3, w: x2 - x1 + 10, h: 6 }); // labels keep off the axis line
        xs.forEach((v) => {
          if (showY && v === axisX && plane.axes === 'both') return;
          const [a, b] = toS([v, axisY]);
          axisNodes.push(<line key={`tx${v}`} x1={a} y1={b - 5} x2={a} y2={b + 5} stroke={axisStroke} strokeWidth={1.5} />);
          const t = fmtTick(v); const w = textWidth(t, 14);
          obstacles.push({ x: a - w / 2, y: b + 8, w, h: 18 });
          axisNodes.push(<text key={`tlx${v}`} x={a} y={b + 23} textAnchor="middle" fontSize={14} fill="rgba(232,236,248,.6)">{t}</text>);
        });
        if (plane.xLabel) axisNodes.push(<text key="xl" x={x2 + 4} y={y1 - 12} textAnchor="end" fontSize={16} fontStyle="italic" fill="rgba(232,236,248,.8)">{plane.xLabel}</text>);
      }
      if (showY) {
        const [x1, y1] = toS([axisX, plane.y[0]]); const [, y2] = toS([axisX, plane.y[1]]);
        axisNodes.push(<line key="ay" x1={x1} y1={y1} x2={x1} y2={y2 - 10} stroke={axisStroke} strokeWidth={2} markerEnd={`url(#${uid}-axis)`} />);
        obstacles.push({ x: x1 - 3, y: y2 - 10, w: 6, h: y1 - y2 + 10 });
        ys.forEach((v) => {
          if (showX && v === axisY && plane.axes === 'both') return;
          const [a, b] = toS([axisX, v]);
          axisNodes.push(<line key={`ty${v}`} x1={a - 5} y1={b} x2={a + 5} y2={b} stroke={axisStroke} strokeWidth={1.5} />);
          const t = fmtTick(v); const w = textWidth(t, 14);
          obstacles.push({ x: a - 10 - w, y: b - 9, w, h: 18 });
          axisNodes.push(<text key={`tly${v}`} x={a - 10} y={b + 5} textAnchor="end" fontSize={14} fill="rgba(232,236,248,.6)">{t}</text>);
        });
        if (plane.yLabel) axisNodes.push(<text key="yl" x={x1 + 12} y={y2 + 4} textAnchor="start" fontSize={16} fontStyle="italic" fill="rgba(232,236,248,.8)">{plane.yLabel}</text>);
      }
      if (showX && showY && plane.axes === 'both' && axisX === 0 && axisY === 0) {
        const [a, b] = toS([0, 0]);
        axisNodes.push(<text key="origin" x={a - 8} y={b + 20} textAnchor="end" fontSize={14} fill="rgba(232,236,248,.6)">0</text>);
      }
    }

    // ── bricks ──
    const ordered = [...visual.elements].sort((a, b) => LAYER[a.kind] - LAYER[b.kind]);
    for (const e of ordered) {
      if (!visible(e.id)) continue;
      if (e.kind === 'connector' && (!visible(e.from) || !visible(e.to))) continue;
      const isEnter = entering(e.id);
      const isFocus = focus.has(e.id);
      const isDim = dimOthers && !isFocus;
      const color = col(e.color, e.kind === 'box' ? 'violet' : 'ink');
      const sw = (w?: 'thin' | 'normal' | 'bold') => STROKE[w ?? 'normal'] + (isFocus ? 1 : 0);
      const drawCls = isEnter ? 'bv-draw' : undefined;
      const markerFor = (arrow: string | undefined, c: VisualColor | undefined) => ({
        markerEnd: arrow === 'end' || arrow === 'both' ? `url(#${uid}-arrow-${c ?? 'ink'})` : undefined,
        markerStart: arrow === 'start' || arrow === 'both' ? `url(#${uid}-arrow-${c ?? 'ink'})` : undefined,
      });
      const label = (text: string | undefined, anchor: Vec2, prefer?: LabelRequest['prefer'], extra?: Partial<LabelRequest> & { pill?: boolean }) => {
        if (text) labels.push({ key: e.id, text, anchor, fontSize: LABEL_PX, prefer, color, entering: isEnter, dim: isDim, ...extra });
      };
      let node: React.ReactNode = null;

      switch (e.kind) {
        case 'point': {
          const [x, y] = toS(e.at); const r = POINT_R[e.size ?? 'md'];
          node = e.style === 'open'
            ? <circle cx={x} cy={y} r={r} fill={BG} stroke={color} strokeWidth={3} />
            : <circle cx={x} cy={y} r={r} fill={color} stroke={BG} strokeWidth={1.5} />;
          obstacles.push(rects.get(e.id)!);
          label(e.label, [x, y], ['ne', 'nw', 'se', 'sw', 'n', 'e']);
          break;
        }
        case 'segment': {
          const [a, b] = [toS(e.from), toS(e.to)];
          node = <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={sw(e.weight)} strokeLinecap="round"
            strokeDasharray={e.dashed ? '9 7' : undefined} pathLength={e.dashed ? undefined : 1} className={e.dashed ? undefined : drawCls}
            {...markerFor(e.arrow, e.color)} />;
          const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const horizontalish = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
          label(e.label, mid, horizontalish ? ['n', 's'] : ['e', 'w']);
          break;
        }
        case 'line': case 'ray': {
          if (!plane) break;
          const [p, q] = e.kind === 'line' ? e.through : [e.from, e.through];
          const clipped = clipLine(p, q, { x: plane.x, y: plane.y }, e.kind === 'ray' ? 0 : -Infinity);
          if (!clipped) break;
          let [a, b] = [toS(clipped[0]), toS(clipped[1])];
          // Label near the right-hand (or top) end.
          if (a[0] > b[0] + 0.5 || (Math.abs(a[0] - b[0]) <= 0.5 && a[1] < b[1])) [a, b] = [b, a];
          node = <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={sw(e.weight)} strokeLinecap="round"
            strokeDasharray={e.dashed ? '10 8' : undefined} pathLength={e.dashed ? undefined : 1} className={e.dashed ? undefined : drawCls}
            markerEnd={e.kind === 'ray' ? `url(#${uid}-arrow-${e.color ?? 'ink'})` : undefined} />;
          const t = e.kind === 'ray' ? 0.8 : 0.9;
          const anchor: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          const vertical = Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1]);
          label(e.label, anchor, vertical ? ['e', 'w', 'ne', 'nw'] : ['n', 'ne', 's', 'se']);
          break;
        }
        case 'polygon': case 'polyline': {
          const sp = e.points.map(toS);
          const common = {
            stroke: color, strokeWidth: e.kind === 'polyline' ? sw(e.weight) : sw('normal') - 0.5,
            strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const,
            strokeDasharray: e.dashed ? '9 7' : undefined,
          };
          if (e.kind === 'polygon') {
            node = <polygon points={pts(sp)} fill={e.fill ? color : 'none'} fillOpacity={e.fill ? 0.16 : undefined} {...common}
              pathLength={e.dashed ? undefined : 1} className={e.dashed ? undefined : drawCls} />;
            const c: Vec2 = [sp.reduce((s, p) => s + p[0], 0) / sp.length, sp.reduce((s, p) => s + p[1], 0) / sp.length];
            label(e.label, c, e.fill ? ['c', 'n', 's'] : ['n', 'c']);
          } else {
            node = <polyline points={pts(sp)} fill="none" {...common} pathLength={e.dashed ? undefined : 1} className={e.dashed ? undefined : drawCls}
              {...markerFor(e.arrow, e.color)} />;
            const m = sp[Math.floor((sp.length - 1) / 2)];
            label(e.label, m, ['n', 'ne', 's']);
          }
          break;
        }
        case 'circle': {
          const [x, y] = toS(e.center); const rx = e.r * L.sx, ry = (e.ry ?? e.r) * L.sy;
          node = <ellipse cx={x} cy={y} rx={rx} ry={ry} stroke={color} strokeWidth={sw('normal') - 0.5}
            fill={e.fill ? color : 'none'} fillOpacity={e.fill ? 0.14 : undefined}
            strokeDasharray={e.dashed ? '9 7' : undefined} pathLength={e.dashed ? undefined : 1} className={e.dashed ? undefined : drawCls} />;
          label(e.label, [x, y - ry], ['n', 'ne', 'nw']);
          break;
        }
        case 'angle': {
          const v = toS(e.vertex), p = toS(e.from), q = toS(e.to);
          const unit = (a: Vec2): Vec2 => { const d = Math.hypot(a[0] - v[0], a[1] - v[1]) || 1; return [(a[0] - v[0]) / d, (a[1] - v[1]) / d]; };
          const u1 = unit(p), u2 = unit(q);
          if (e.right) {
            const s = 17;
            const c1: Vec2 = [v[0] + u1[0] * s, v[1] + u1[1] * s], c3: Vec2 = [v[0] + u2[0] * s, v[1] + u2[1] * s];
            const c2: Vec2 = [c1[0] + u2[0] * s, c1[1] + u2[1] * s];
            node = <polyline points={pts([c1, c2, c3])} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="miter" className={isEnter ? 'bv-enter' : undefined} />;
          } else {
            const r = 32;
            const a: Vec2 = [v[0] + u1[0] * r, v[1] + u1[1] * r], b: Vec2 = [v[0] + u2[0] * r, v[1] + u2[1] * r];
            const sweep = u1[0] * u2[1] - u1[1] * u2[0] > 0 ? 1 : 0;
            node = <path d={`M ${a[0]} ${a[1]} A ${r} ${r} 0 0 ${sweep} ${b[0]} ${b[1]}`} fill="none" stroke={color} strokeWidth={2.5}
              pathLength={1} className={drawCls} />;
          }
          let bx = u1[0] + u2[0], by = u1[1] + u2[1];
          const bl = Math.hypot(bx, by);
          if (bl < 1e-6) { bx = -u1[1]; by = u1[0]; } else { bx /= bl; by /= bl; }
          label(e.label, [v[0] + bx * 46, v[1] + by * 46], ['c']);
          break;
        }
        case 'function': {
          if (!plane) break;
          const c = compileExpr(e.expr);
          if (c.ok === false) break;
          const x0 = Math.max(plane.x[0], e.domain?.[0] ?? -Infinity), x1 = Math.min(plane.x[1], e.domain?.[1] ?? Infinity);
          if (!(x1 > x0)) break;
          const runs = sampleFunction(c.fn, x0, x1, plane.y, toS);
          if (!runs.length) break;
          // Curves may run past the frame (sampled with a margin): clip them to the plot.
          node = (
            <g clipPath={`url(#${uid}-clip)`}>
              {runs.map((run, i) => (
                <polyline key={i} points={pts(run)} fill="none" stroke={color} strokeWidth={sw(e.weight)} strokeLinejoin="round" strokeLinecap="round"
                  strokeDasharray={e.dashed ? '10 8' : undefined} pathLength={e.dashed ? undefined : 1} className={e.dashed ? undefined : drawCls} />
              ))}
            </g>
          );
          // Label where the curve is visible, towards its right-hand end.
          const longest = runs.reduce((a, b) => (b.length > a.length ? b : a));
          const at = longest[Math.floor(longest.length * 0.82)];
          label(e.label, at, ['ne', 'nw', 'e', 'se']);
          break;
        }
        case 'text': {
          const [x, y] = toS(e.at); const size = TEXT_PX[e.size ?? 'md'];
          node = <text x={x} y={y} textAnchor={e.align ?? 'middle'} fontSize={size} fill={color}
            fontFamily={e.math ? MATH_FONT : undefined} fontWeight={e.size === 'lg' || e.size === 'xl' ? 600 : 500}
            style={{ paintOrder: 'stroke' }} stroke={BG} strokeWidth={4} strokeLinejoin="round">{e.text}</text>;
          obstacles.push(rects.get(e.id)!);
          if (e.label) label(e.label, [x, y - size], ['n']);
          break;
        }
        case 'box': {
          const r = rects.get(e.id)!;
          const lines = wrapText(e.text, 22, 2);
          const cx = r.x + r.w / 2;
          const top = r.y + (r.h - (lines.length * 22 + (e.sub ? 20 : 0))) / 2;
          node = (
            <g>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={14} fill={color} fillOpacity={isFocus ? 0.26 : 0.15} stroke={color} strokeWidth={isFocus ? 3 : 2} />
              {lines.map((l, i) => (
                <text key={i} x={cx} y={top + 17 + i * 22} textAnchor="middle" fontSize={18} fontWeight={650} fill="#FFFFFF">{l}</text>
              ))}
              {e.sub && <text x={cx} y={top + lines.length * 22 + 15} textAnchor="middle" fontSize={13.5} fill="rgba(232,236,248,.75)">{e.sub}</text>}
            </g>
          );
          obstacles.push(r);
          if (e.label) label(e.label, [cx, r.y], ['n']);
          break;
        }
        case 'connector': {
          const from = byId.get(e.from), to = byId.get(e.to);
          if (!from || !to) break;
          const center = (el: VisualElement2D): Vec2 | null => {
            const r = rects.get(el.id);
            if (r) return [r.x + r.w / 2, r.y + r.h / 2];
            if (el.kind === 'segment') { const a = toS(el.from), b = toS(el.to); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
            if (el.kind === 'polygon') { const s = el.points.map(toS); return [s.reduce((t, p) => t + p[0], 0) / s.length, s.reduce((t, p) => t + p[1], 0) / s.length]; }
            return null;
          };
          const ca = center(from), cb = center(to);
          if (!ca || !cb) break;
          const ra = rects.get(from.id), rb = rects.get(to.id);
          const a = ra ? rectEdgePoint(ra, cb) : ca;
          const b = rb ? rectEdgePoint(rb, ca, 7) : cb;
          const bend = e.bend ?? 0;
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
          const c: Vec2 = [mx - (dy / len) * bend * len * 0.5, my + (dx / len) * bend * len * 0.5];
          const d = bend ? `M ${a[0]} ${a[1]} Q ${c[0]} ${c[1]} ${b[0]} ${b[1]}` : `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`;
          node = <path d={d} fill="none" stroke={color} strokeWidth={sw('normal') - 0.5} strokeLinecap="round"
            strokeDasharray={e.dashed ? '9 7' : undefined} pathLength={e.dashed ? undefined : 1} className={e.dashed ? undefined : drawCls}
            {...markerFor(e.arrow ?? 'end', e.color)} />;
          const mid: Vec2 = bend ? [0.25 * a[0] + 0.5 * c[0] + 0.25 * b[0], 0.25 * a[1] + 0.5 * c[1] + 0.25 * b[1]] : [mx, my];
          label(e.label, mid, ['c', 'n', 's'], { pill: true, fontSize: 15 });
          break;
        }
        case 'table': {
          const t = L.table;
          if (!t) break;
          const rowH = 32, cols = e.rows[0].length, cw = t.w / cols;
          const h = rowH * e.rows.length;
          node = (
            <g>
              <rect x={t.x} y={t.y} width={t.w} height={h} rx={10} fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.18)" />
              <rect x={t.x} y={t.y} width={t.w} height={rowH} rx={10} fill="rgba(255,255,255,.09)" />
              {e.rows.map((row, ri) => row.map((cell, ci) => (
                <text key={`${ri}-${ci}`} x={t.x + cw * ci + cw / 2} y={t.y + rowH * ri + 21} textAnchor="middle"
                  fontSize={15} fontWeight={ri === 0 ? 700 : 500} fill={ri === 0 ? '#FFFFFF' : color}>{cell}</text>
              )))}
              {e.rows.slice(1).map((_, ri) => (
                <line key={`h${ri}`} x1={t.x + 6} x2={t.x + t.w - 6} y1={t.y + rowH * (ri + 1)} y2={t.y + rowH * (ri + 1)} stroke="rgba(255,255,255,.1)" />
              ))}
            </g>
          );
          obstacles.push({ x: t.x, y: t.y, w: t.w, h });
          if (e.label) label(e.label, [t.x + t.w / 2, t.y + h], ['s']);
          break;
        }
      }
      if (!node) continue;
      nodes.push(
        <g key={e.id} data-brick={e.id}
          className={[isEnter ? 'bv-enter' : '', isFocus && dimOthers ? 'bv-focus' : ''].filter(Boolean).join(' ') || undefined}
          opacity={isDim ? 0.38 : 1}
          filter={isFocus && dimOthers && e.kind !== 'table' && e.kind !== 'box' ? `url(#${uid}-glow)` : undefined}>
          {node}
        </g>,
      );
    }

    const placed = placeLabels(labels, obstacles, { x: 4, y: 4, w: VIEW_W - 8, h: VIEW_H - 8 });
    const labelNodes = placed.map((p, i) => {
      const meta = labels[i];
      // Dim the ink, not the group: the pill stays opaque so a line behind it never shows through.
      return (
        <g key={`lbl-${p.key}-${i}`} className={meta.entering ? 'bv-enter' : undefined}>
          {meta.pill && <rect x={p.rect.x} y={p.rect.y} width={p.rect.w} height={p.rect.h} rx={p.rect.h / 2} fill={BG} stroke={meta.color} strokeOpacity={meta.dim ? 0.15 : 0.35} />}
          <text x={p.tx} y={p.ty} textAnchor="middle" fontSize={p.fontSize} fontWeight={650} fill={meta.color} fillOpacity={meta.dim ? 0.45 : 1}
            style={{ paintOrder: 'stroke' }} stroke={BG} strokeOpacity={meta.dim ? 0.45 : 1} strokeWidth={meta.pill ? 0 : 5} strokeLinejoin="round">{p.text}</text>
        </g>
      );
    });

    return { axisNodes, nodes, labelNodes, plot: L.plot, isPlane: !!plane };
  }, [visual, step, spotlight, uid]);

  const clipId = `${uid}-clip`;
  return (
    <div className="w-full h-full flex flex-col gap-2 min-h-0">
      {showControls && <StepBar visual={visual} step={step} onStepChange={onStepChange} />}
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full flex-1 min-h-0" preserveAspectRatio="xMidYMid meet"
        role="img" aria-label={visual.title}>
        <defs>
          <style>{`
            .bv-enter { animation: ${uid}-fade .55s ease-out both; }
            .bv-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: ${uid}-draw 1s ease-out .05s forwards; }
            @keyframes ${uid}-fade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes ${uid}-draw { to { stroke-dashoffset: 0 } }
            @media (prefers-reduced-motion: reduce) { .bv-enter, .bv-draw { animation: none; stroke-dasharray: none; stroke-dashoffset: 0; } }
          `}</style>
          {/* Region in board coordinates: a bounding-box region is zero-wide for a vertical or
              horizontal line, which made exactly the spotlighted line vanish. */}
          <filter id={`${uid}-glow`} filterUnits="userSpaceOnUse" x={0} y={0} width={VIEW_W} height={VIEW_H}>
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <marker id={`${uid}-axis`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M0,1 L9,5 L0,9 z" fill="rgba(232,236,248,.55)" />
          </marker>
          {(Object.keys(BOARD_COLORS) as VisualColor[]).map((c) => (
            <marker key={c} id={`${uid}-arrow-${c}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="13" markerHeight="13"
              markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0,1 L9,5 L0,9 z" fill={BOARD_COLORS[c]} />
            </marker>
          ))}
          {drawing.isPlane && (
            <clipPath id={clipId}>
              <rect x={drawing.plot.x - 2} y={drawing.plot.y - 2} width={drawing.plot.w + 4} height={drawing.plot.h + 4} />
            </clipPath>
          )}
        </defs>
        <g>{drawing.axisNodes}</g>
        <g>{drawing.nodes}</g>
        <g>{drawing.labelNodes}</g>
      </svg>
    </div>
  );
};
