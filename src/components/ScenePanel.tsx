import React, { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Triangle, Box, PenLine } from 'lucide-react';
import { ChalkBoard } from './ChalkBoard';
import { Interactive3DVisual } from './Interactive3DVisual';
import { Scene3DData } from '../types';
import { FigureSpec, FigurePart, StudentThinking, BoardNote } from './TeachingCanvas';
import { SceneDef, SceneVertices } from '../scenes/pythagorasScenes';


// ─────────────────────────────────────────────────────────────────
// Concept-map types (exported so ImmersiveStage and App can use them)
// ─────────────────────────────────────────────────────────────────
export interface ConceptMapNode {
  id: string;
  label: string;
  sublabel?: string;
  category?: string;
  color?: string;
  details?: string;
}
export interface ConceptMapConnection {
  from: string;
  to: string;
  label?: string;
}
export interface ConceptMapDiagram {
  diagramType?: string;
  title?: string;
  description?: string;
  nodes: ConceptMapNode[];
  connections: ConceptMapConnection[];
}

// ─────────────────────────────────────────────────────────────────
// ScenePanel — a lens onto the maths, not a classroom board.
//
//   real  — a real situation with the triangle traced over it in light
//   shape — the same triangle, lifted out and drawn to true proportion
//   3d    — the existing 3D model
//
// Colour is meaning, and it is the same in every view:
//   a (C→B) green · b (C→A) amber · c (A→B, the hypotenuse) pink
// ─────────────────────────────────────────────────────────────────

export type PanelMode = 'real' | 'shape' | '3d' | 'chalk';

const COL = { a: '#4ADE80', b: '#FBBF24', c: '#F472B6', ink: '#E8ECF8' };

interface Props {
  mode: PanelMode;
  onModeChange: (m: PanelMode) => void;
  scene: SceneDef | null;
  figure: FigureSpec;
  revealed: FigurePart[];
  focusPart: FigurePart | null;
  studentThinking: StudentThinking | null;
  scene3d?: Scene3DData;
  /** Pre-generated real-world photo (base64 data URI). Used when scene.photo is absent or fails to load. */
  pregenPhoto?: string | null;
  /** Concept-map diagram for the current topic (from pregen cache). Rendered in shape mode for non-Pythagorean topics. */
  topicDiagram?: ConceptMapDiagram | null;
  conceptLabel: string;
  isLessonActive: boolean;
  notes?: BoardNote | null;
  liveNotes?: string[];
}

export const ScenePanel: React.FC<Props> = ({
  mode, onModeChange, scene, figure, revealed, focusPart,
  studentThinking, scene3d, pregenPhoto, topicDiagram, conceptLabel, isLessonActive, notes, liveNotes = [],
}) => {
  // Photo resolution: scene photo → pregenPhoto (base64 from pregen cache) → illustration SVG.
  const [scenePhotoOk, setScenePhotoOk] = useState(false);
  useEffect(() => {
    setScenePhotoOk(false);
    if (!scene?.photo) return;
    const img = new Image();
    img.onload = () => setScenePhotoOk(true);
    img.onerror = () => setScenePhotoOk(false);
    img.src = scene.photo;
  }, [scene?.photo]);

  // The effective photo: prefer the scene-specific photo, fall back to the pre-generated one.
  const photoOk = scenePhotoOk || !!pregenPhoto;
  const activePhoto = scenePhotoOk ? (scene?.photo ?? '') : (pregenPhoto ?? '');

  const photoCalibrated = scenePhotoOk && !!scene?.photoVertices;
  const v: SceneVertices | null = scene ? (photoCalibrated ? scene.photoVertices! : scene.vertices) : null;
  // Show the trace overlay when we have the calibrated scene photo; for the pregen
  // photo (which has no vertex mapping) we show the shape inset instead.
  const showOverlay = photoCalibrated && !!v;

  // Detect Pythagorean topics — only those use the concreteness-fading right-triangle figure.
  // All other topics show the concept-map diagram in shape mode.
  const isPythagorean = /pythag/i.test(conceptLabel);
  const hasDiagram = !!(topicDiagram?.nodes?.length);

  const shown = (p: FigurePart) => revealed.includes(p);
  const u = figure.unitLabel ? ` ${figure.unitLabel}` : '';
  const c = Math.sqrt(figure.a ** 2 + figure.b ** 2);
  const n = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
  const val = (side: 'a' | 'b' | 'c') =>
    figure.unknownSide === side ? '?' : n(side === 'a' ? figure.a : side === 'b' ? figure.b : c) + u;

  return (
    <div className="relative w-full h-full rounded-[26px] overflow-hidden border border-white/15 bg-[#0B1020]/55 backdrop-blur-xl shadow-[0_30px_80px_rgba(0,0,0,0.45)]">

      {/* mode switch */}
      <div className="absolute top-3.5 left-3.5 z-30 flex items-center gap-1 rounded-full bg-black/45 backdrop-blur-md border border-white/12 p-1">
        {([
          { m: 'real', icon: ImageIcon, label: 'Real world' },
          { m: 'shape', icon: Triangle, label: 'Shape' },
          { m: '3d', icon: Box, label: '3D' },
          { m: 'chalk', icon: PenLine, label: 'Chalkboard' },
        ] as const).map(({ m, icon: Icon, label }) => (
          <button key={m} onClick={() => onModeChange(m)}
            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              mode === m ? 'bg-white text-[#0B1020]' : 'text-white/70 hover:text-white'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── REAL WORLD ─────────────────────────────────────────── */}
      {mode === 'real' && (
        <div className="absolute inset-0 animate-fadeIn">
          {photoOk ? (
            <img src={activePhoto} alt={scene?.title ?? conceptLabel} className="absolute inset-0 w-full h-full object-cover" />
          ) : scene ? (
            <div className="absolute inset-0"><scene.Illustration /></div>
          ) : (
            <TopicPlaceholder label={conceptLabel} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/25" />

          {showOverlay && v && scene ? (
            <TraceOverlay v={v} names={scene.names} val={val} shown={shown} focusPart={focusPart} />
          ) : scene && !hasDiagram ? (
            // No calibrated overlay: show the shape as a compact inset so the
            // real-world photo still gives context while the triangle stays visible.
            <div className="absolute right-4 bottom-4 w-[34%] aspect-[16/10] rounded-2xl bg-[#0B1020]/80 backdrop-blur-md border border-white/15 p-2">
              <ShapeFigure figure={figure} names={scene.names} val={val} shown={shown} focusPart={focusPart} compact />
            </div>
          ) : null}

          <div className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-white/12 text-[12.5px] text-white/85 font-medium">
            {scene?.title ?? conceptLabel}
          </div>
        </div>
      )}

      {/* ── SHAPE ──────────────────────────────────────────────── */}
      {mode === 'shape' && (
        <div className="absolute inset-0 animate-fadeIn"
             style={{ background: 'radial-gradient(120% 100% at 30% 20%, #1A2140 0%, #0B1020 70%)' }}>
          <div className="absolute inset-0 opacity-40"
               style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.14) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
          <div className="absolute inset-0 pt-14 pb-4 px-6">
            {hasDiagram && !isPythagorean ? (
              <ConceptMapRenderer diagram={topicDiagram!} />
            ) : isPythagorean && scene ? (
              // Pythagorean topics use the concreteness-fading right-triangle figure
              <ShapeFigure figure={figure} names={scene.names} val={val} shown={shown} focusPart={focusPart} />
            ) : hasDiagram ? (
              // Fallback: pregen diagram exists but isPythagorean was true — show it
              <ConceptMapRenderer diagram={topicDiagram!} />
            ) : (
              <TopicPlaceholder label={conceptLabel} />
            )}
          </div>
        </div>
      )}

      {/* ── CHALKBOARD ─────────────────────────────────────────── */}
      {mode === 'chalk' && (
        <div className="absolute inset-0 animate-fadeIn">
          <ChalkBoard title={notes?.title} lines={notes?.lines || []} formula={notes?.formula} liveNotes={liveNotes} />
        </div>
      )}

      {/* ── 3D ─────────────────────────────────────────────────── */}
      {mode === '3d' && (
        <div className="absolute inset-0 bg-[#070B16] animate-fadeIn">
          <Interactive3DVisual sceneData={scene3d} topic={conceptLabel} subject="Mathematics" />
        </div>
      )}

      {/* the child's own reasoning, pinned to whatever view is showing */}
      {studentThinking && mode !== '3d' && mode !== 'chalk' && (
        <div className="absolute right-4 top-16 z-20 max-w-[42%]">
          <div className="rounded-2xl bg-black/55 backdrop-blur-md border px-4 py-3"
               style={{ borderColor: studentThinking.verdict === 'sound' ? 'rgba(74,222,128,.5)'
                        : studentThinking.verdict === 'breaks_down' ? 'rgba(251,113,133,.55)' : 'rgba(255,255,255,.18)' }}>
            <div className="text-[10.5px] uppercase tracking-[0.15em] font-semibold text-white/50 mb-1">You said</div>
            <p className="text-[15px] leading-snug text-white">“{studentThinking.method}”</p>
            {studentThinking.faultyStep && (
              <p className="text-[13px] mt-1.5 text-[#FDA4AF]">Let's test this step: {studentThinking.faultyStep}</p>
            )}
          </div>
        </div>
      )}

      {!revealed.includes('triangle') && !hasDiagram && mode !== '3d' && mode !== 'chalk' && (
        <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center">
          <span className="px-4 py-2 rounded-full bg-black/45 backdrop-blur-md text-[13px] text-white/75">
            {isLessonActive ? 'Dr. Marcus is setting the scene…' : 'Start the session and we’ll begin'}
          </span>
        </div>
      )}
    </div>
  );
};

// ─── The triangle traced over the picture, in light ─────────────
const TraceOverlay: React.FC<{
  v: SceneVertices;
  names: SceneDef['names'];
  val: (s: 'a' | 'b' | 'c') => string;
  shown: (p: FigurePart) => boolean;
  focusPart: FigurePart | null;
}> = ({ v, names, val, shown, focusPart }) => {
  const [ax, ay] = v.A, [bx, by] = v.B, [cx, cy] = v.C;
  const dim = (p: FigurePart) => (focusPart && focusPart !== p ? 0.55 : 1);
  const w = (p: FigurePart, base: number) => (focusPart === p ? base * 1.9 : base);
  // The panel is 16:10, so a 16:9 frame loses ~80px each side. Keep labels inside.
  const clampX = (x: number) => Math.min(1330, Math.max(270, x));
  // right-angle marker, oriented into the triangle whichever way it faces
  const sx = Math.sign(bx - cx) || 1, sy = Math.sign(ay - cy) || -1, k = 34;

  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
      <defs>
        <filter id="glow" filterUnits="userSpaceOnUse" x="-200" y="-200" width="2000" height="1300">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {shown('triangle') && (
        <polygon points={`${ax},${ay} ${bx},${by} ${cx},${cy}`} fill="#fff" opacity="0.10" />
      )}
      {shown('leg-a') && (
        <g>
          <line x1={cx} y1={cy} x2={bx} y2={by} stroke={COL.a} strokeWidth={w('leg-a', 7)} strokeLinecap="round" filter="url(#glow)" opacity={dim('leg-a')} />
          <Tag x={clampX((cx + bx) / 2)} y={cy + 52} color={COL.a} text={`${names.a} · ${val('a')}`} />
        </g>
      )}
      {shown('leg-b') && (
        <g>
          <line x1={cx} y1={cy} x2={ax} y2={ay} stroke={COL.b} strokeWidth={w('leg-b', 7)} strokeLinecap="round" filter="url(#glow)" opacity={dim('leg-b')} />
          <Tag x={clampX(cx - sx * 140)} y={(cy + ay) / 2} color={COL.b} text={`${names.b} · ${val('b')}`} />
        </g>
      )}
      {shown('hypotenuse') && (
        <g>
          <line x1={ax} y1={ay} x2={bx} y2={by} stroke={COL.c} strokeWidth={w('hypotenuse', 8)} strokeLinecap="round" filter="url(#glow)" opacity={dim('hypotenuse')} />
          <Tag x={clampX((ax + bx) / 2 + sx * 110)} y={(ay + by) / 2 - 40} color={COL.c} text={`${names.c} · ${val('c')}`} strong />
        </g>
      )}
      {shown('right-angle') && (
        <polyline points={`${cx},${cy - sy * -k} ${cx + sx * k},${cy - sy * -k} ${cx + sx * k},${cy}`}
                  transform={`translate(0,0)`}
                  fill="none" stroke="#fff" strokeWidth={focusPart === 'right-angle' ? 6 : 4} opacity={dim('right-angle')} />
      )}
      {[v.A, v.B, v.C].map(([x, y], i) => shown('triangle') && (
        <circle key={i} cx={x} cy={y} r="9" fill="#fff" filter="url(#glow)" />
      ))}
    </svg>
  );
};

const Tag: React.FC<{ x: number; y: number; color: string; text: string; strong?: boolean }> = ({ x, y, color, text, strong }) => {
  const width = Math.max(150, text.length * (strong ? 17 : 15.5) + 40);
  return (
    <g transform={`translate(${x - width / 2},${y - 26})`}>
      <rect width={width} height="52" rx="26" fill="rgba(8,12,24,.78)" stroke={color} strokeWidth="3" />
      <text x={width / 2} y="35" textAnchor="middle" fontSize={strong ? 29 : 27} fontWeight={strong ? 700 : 600} fill="#fff"
            fontFamily="ui-sans-serif, system-ui, sans-serif">{text}</text>
    </g>
  );
};

// ─── The same triangle, lifted out, true proportion ─────────────
const ShapeFigure: React.FC<{
  figure: FigureSpec;
  names: SceneDef['names'];
  val: (s: 'a' | 'b' | 'c') => string;
  shown: (p: FigurePart) => boolean;
  focusPart: FigurePart | null;
  compact?: boolean;
}> = ({ figure, names, val, shown, focusPart, compact }) => {
  const g = useMemo(() => {
    const BOX = compact ? 240 : 330;
    const s = BOX / Math.max(figure.a, figure.b);
    const w = figure.a * s, h = figure.b * s;
    const cx = 400 - w / 2, cy = 250 + h / 2;
    return { w, h, C: [cx, cy], A: [cx, cy - h], B: [cx + w, cy], sq: shown('squares') };
  }, [figure, compact, shown]);
  const [cx, cy] = g.C, [ax, ay] = g.A, [bx, by] = g.B;
  const dim = (p: FigurePart) => (focusPart && focusPart !== p ? 0.55 : 1);
  const lw = (p: FigurePart, base: number) => (focusPart === p ? base * 1.8 : base);
  const fs = compact ? 30 : 22;

  return (
    <svg viewBox="0 0 800 500" className="w-full h-full">
      <defs>
        <filter id="glow2" filterUnits="userSpaceOnUse" x="-200" y="-200" width="1200" height="900">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {g.sq && (
        <g opacity=".9">
          <rect x={cx} y={cy} width={g.w} height={Math.min(g.w, 500 - cy)} fill={COL.a} fillOpacity=".12" stroke={COL.a} strokeOpacity=".5" />
          <rect x={cx - g.h} y={cy - g.h} width={g.h} height={g.h} fill={COL.b} fillOpacity=".12" stroke={COL.b} strokeOpacity=".5" />
        </g>
      )}
      {shown('triangle') && <polygon points={`${ax},${ay} ${bx},${by} ${cx},${cy}`} fill="#fff" opacity=".06" />}
      {shown('leg-a') && (
        <g opacity={dim('leg-a')}>
          <line x1={cx} y1={cy} x2={bx} y2={by} stroke={COL.a} strokeWidth={lw('leg-a', 5)} strokeLinecap="round" filter="url(#glow2)" />
          <text x={(cx + bx) / 2} y={cy + 38} textAnchor="middle" fontSize={fs} fontWeight="600" fill={COL.a}>{names.a} · {val('a')}</text>
        </g>
      )}
      {shown('leg-b') && (
        <g opacity={dim('leg-b')}>
          <line x1={cx} y1={cy} x2={ax} y2={ay} stroke={COL.b} strokeWidth={lw('leg-b', 5)} strokeLinecap="round" filter="url(#glow2)" />
          <text x={cx - 18} y={(cy + ay) / 2} textAnchor="end" fontSize={fs} fontWeight="600" fill={COL.b}>{names.b} · {val('b')}</text>
        </g>
      )}
      {shown('hypotenuse') && (
        <g opacity={dim('hypotenuse')}>
          <line x1={ax} y1={ay} x2={bx} y2={by} stroke={COL.c} strokeWidth={lw('hypotenuse', 6)} strokeLinecap="round" filter="url(#glow2)" />
          <text x={(ax + bx) / 2 + 22} y={(ay + by) / 2 - 14} fontSize={fs + 2} fontWeight="700" fill={COL.c}>{names.c} · {val('c')}</text>
        </g>
      )}
      {shown('right-angle') && (
        <polyline points={`${cx},${cy - 26} ${cx + 26},${cy - 26} ${cx + 26},${cy}`} fill="none"
                  stroke="#fff" strokeWidth={focusPart === 'right-angle' ? 4 : 2.5} opacity={dim('right-angle')} />
      )}
      {shown('formula') && !compact && (
        <g opacity={dim('formula')}>
          <rect x="540" y="420" width="240" height="60" rx="16" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.2)" />
          <text x="660" y="461" textAnchor="middle" fontSize="30" fontWeight="700" fill={COL.ink}
                fontFamily="ui-monospace, SFMono-Regular, monospace">
            <tspan fill={COL.a}>a²</tspan> + <tspan fill={COL.b}>b²</tspan> = <tspan fill={COL.c}>c²</tspan>
          </text>
        </g>
      )}
    </svg>
  );
};

// ─── Concept-map diagram renderer ───────────────────────────────
const CONCEPT_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  emerald: { border: '#10B981', bg: 'rgba(16,185,129,0.18)', text: '#34D399' },
  sky:     { border: '#0EA5E9', bg: 'rgba(14,165,233,0.18)', text: '#38BDF8' },
  violet:  { border: '#8B5CF6', bg: 'rgba(139,92,246,0.18)', text: '#A78BFA' },
  rose:    { border: '#F43F5E', bg: 'rgba(244,63,94,0.18)',  text: '#FB7185' },
  amber:   { border: '#F59E0B', bg: 'rgba(245,158,11,0.18)', text: '#FCD34D' },
  blue:    { border: '#3B82F6', bg: 'rgba(59,130,246,0.18)', text: '#60A5FA' },
  green:   { border: '#22C55E', bg: 'rgba(34,197,94,0.18)',  text: '#4ADE80' },
  orange:  { border: '#F97316', bg: 'rgba(249,115,22,0.18)', text: '#FB923C' },
};
const DEFAULT_COLOR = { border: '#7C6CFF', bg: 'rgba(124,108,255,0.18)', text: '#A78BFA' };

function wrapLabel(text: string, maxChars = 22): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length <= maxChars) { cur = candidate; }
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

function buildLevelLayout(
  nodes: ConceptMapNode[],
  connections: ConceptMapConnection[],
  W = 780, H = 440,
): Array<ConceptMapNode & { x: number; y: number }> {
  if (!nodes.length) return [];
  const labelToId = new Map(nodes.map(n => [n.label, n.id]));
  const inCount = new Map<string, number>(nodes.map(n => [n.id, 0]));
  const outEdges = new Map<string, string[]>(nodes.map(n => [n.id, []]));
  for (const c of connections) {
    const f = labelToId.get(c.from), t = labelToId.get(c.to);
    if (f && t) { inCount.set(t, (inCount.get(t) ?? 0) + 1); outEdges.get(f)?.push(t); }
  }
  // BFS level assignment
  const levels = new Map<string, number>();
  const queue: string[] = nodes.filter(n => !(inCount.get(n.id) ?? 0)).map(n => n.id);
  if (!queue.length) nodes.forEach((n, i) => levels.set(n.id, Math.floor(i / 3)));
  else queue.forEach(id => levels.set(id, 0));
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++]; const lv = levels.get(cur) ?? 0;
    for (const to of outEdges.get(cur) ?? []) {
      if (!levels.has(to)) { levels.set(to, lv + 1); queue.push(to); }
    }
  }
  nodes.forEach(n => { if (!levels.has(n.id)) levels.set(n.id, 0); });
  // Group by level
  const byLevel = new Map<number, string[]>();
  for (const [id, lv] of levels) { if (!byLevel.has(lv)) byLevel.set(lv, []); byLevel.get(lv)!.push(id); }
  const maxLv = Math.max(...levels.values());
  const rows = maxLv + 1;
  const padY = 55, rowH = rows > 1 ? (H - padY * 2) / (maxLv) : 0;
  const pos = new Map<string, { x: number; y: number }>();
  for (let lv = 0; lv <= maxLv; lv++) {
    const ids = byLevel.get(lv) ?? [];
    const y = padY + lv * rowH;
    ids.forEach((id, i) => pos.set(id, { x: (W / (ids.length + 1)) * (i + 1), y }));
  }
  return nodes.map(n => ({ ...n, x: pos.get(n.id)?.x ?? W / 2, y: pos.get(n.id)?.y ?? H / 2 }));
}

const NODE_W = 190, NODE_H = 76;

const ConceptMapRenderer: React.FC<{ diagram: ConceptMapDiagram }> = ({ diagram }) => {
  const { nodes = [], connections = [], title } = diagram;
  if (!nodes.length) return null;
  const laid = buildLevelLayout(nodes, connections);
  const posMap = new Map(laid.map(n => [n.label, { x: n.x, y: n.y }]));

  return (
    <svg viewBox="0 0 780 460" className="w-full h-full" style={{ overflow: 'visible' }}>
      <defs>
        <marker id="cmArrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="rgba(255,255,255,0.4)" />
        </marker>
        <filter id="cmGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Title */}
      {title && (
        <text x="390" y="22" textAnchor="middle" fontSize="14" fontWeight="600" fill="rgba(255,255,255,0.45)"
              fontFamily="ui-sans-serif, system-ui, sans-serif">{title}</text>
      )}

      {/* Connections */}
      {connections.map((conn, i) => {
        const f = posMap.get(conn.from), t = posMap.get(conn.to);
        if (!f || !t) return null;
        // Bezier: exit bottom of from, enter top of to (vertical flow)
        const sx = f.x, sy = f.y + NODE_H / 2 + 3;
        const ex = t.x, ey = t.y - NODE_H / 2 - 3;
        const cy1 = sy + (ey - sy) * 0.45, cy2 = ey - (ey - sy) * 0.45;
        const d = `M${sx},${sy} C${sx},${cy1} ${ex},${cy2} ${ex},${ey}`;
        const mx = (sx + ex) / 2, my = (sy + ey) / 2;
        return (
          <g key={i}>
            <path d={d} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" markerEnd="url(#cmArrow)" />
            {conn.label && (
              <text x={mx} y={my} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.38)"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                    style={{ textShadow: '0 1px 4px #000' }}>{conn.label}</text>
            )}
          </g>
        );
      })}

      {/* Nodes */}
      {laid.map(node => {
        const col = CONCEPT_COLORS[node.color ?? ''] ?? DEFAULT_COLOR;
        const lines = wrapLabel(node.label);
        const hasTwo = lines.length > 1;
        const labelY = hasTwo ? node.y - 14 : node.y - 8;
        return (
          <g key={node.id} filter="url(#cmGlow)">
            {/* Node background */}
            <rect
              x={node.x - NODE_W / 2} y={node.y - NODE_H / 2}
              width={NODE_W} height={NODE_H} rx="14"
              fill={col.bg} stroke={col.border} strokeWidth="1.5"
            />
            {/* Label (1-2 lines) */}
            {lines.map((line, li) => (
              <text key={li}
                x={node.x} y={labelY + li * 18}
                textAnchor="middle" fontSize="13.5" fontWeight="600" fill="white"
                fontFamily="ui-sans-serif, system-ui, sans-serif">{line}</text>
            ))}
            {/* Sublabel */}
            {node.sublabel && (
              <text x={node.x} y={node.y + (hasTwo ? 18 : 12)}
                textAnchor="middle" fontSize="10.5" fill="rgba(255,255,255,0.52)"
                fontFamily="ui-sans-serif, system-ui, sans-serif">{node.sublabel}</text>
            )}
            {/* Category chip */}
            {node.category && (
              <text x={node.x} y={node.y + NODE_H / 2 - 7}
                textAnchor="middle" fontSize="9" fontWeight="600" fill={col.text}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>{node.category}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

// ─── Topic placeholder when no photo or illustration available ───
const TopicPlaceholder: React.FC<{ label: string }> = ({ label }) => (
  <div className="absolute inset-0 flex items-center justify-center"
       style={{ background: 'radial-gradient(120% 100% at 60% 40%, #1A2140 0%, #0B1020 70%)' }}>
    <div className="absolute inset-0 opacity-20"
         style={{ backgroundImage: 'radial-gradient(rgba(124,108,255,.5) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
    <div className="relative z-10 text-center px-10">
      <div className="text-[12px] uppercase tracking-[0.22em] text-white/30 font-semibold mb-3">Real World Connection</div>
      <p className="text-[22px] font-semibold text-white/80 leading-snug max-w-sm">{label}</p>
      <div className="mt-4 text-[13px] text-white/35">Ask Dr. Marcus to show you a real-world example</div>
    </div>
  </div>
);
