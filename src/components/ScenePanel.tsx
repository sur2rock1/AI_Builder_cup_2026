import React, { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Triangle, Box, PenLine, Film, Pause, Play } from 'lucide-react';
import type { LessonClip, VisualRegion } from '../curriculum/topicVisual';
import { ChalkBoard } from './ChalkBoard';
import { Interactive3DVisual } from './Interactive3DVisual';
import { Scene3DData } from '../types';
import { FigureSpec, FigurePart, StudentThinking, BoardNote } from './TeachingCanvas';
import { SceneDef, SceneVertices } from '../scenes/pythagorasScenes';

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

export type PanelMode = 'real' | 'shape' | '3d' | 'chalk' | 'video';
export type BoardSurface = 'photo' | 'diagram' | 'model' | 'chalk' | 'video';

const COL = { a: '#4ADE80', b: '#FBBF24', c: '#F472B6', ink: '#E8ECF8' };

interface Props {
  mode: PanelMode;
  onModeChange: (m: PanelMode) => void;
  scene: SceneDef;
  figure: FigureSpec;
  revealed: FigurePart[];
  focusPart: FigurePart | null;
  studentThinking: StudentThinking | null;
  scene3d?: Scene3DData;
  conceptLabel: string;
  isLessonActive: boolean;
  notes?: BoardNote | null;
  liveNotes?: string[];
  surfaces?: BoardSurface[];
  visualUrl?: string;
  generating?: boolean;
  focusRegion?: VisualRegion | null;
  clip?: LessonClip | null;
  clipPlaying?: boolean;
  clipFrame?: number;
  onToggleClip?: () => void;
}

export const ScenePanel: React.FC<Props> = ({
  mode, onModeChange, scene, figure, revealed, focusPart,
  studentThinking, scene3d, conceptLabel, isLessonActive, notes, liveNotes = [],
  surfaces = ['photo', 'diagram', 'video', 'chalk'], visualUrl, generating,
  focusRegion, clip, clipPlaying, clipFrame = 0, onToggleClip,
}) => {
  // Use the generated photo only if it actually exists; otherwise the illustration.
  const [photoOk, setPhotoOk] = useState(false);
  useEffect(() => {
    setPhotoOk(false);
    const img = new Image();
    img.onload = () => setPhotoOk(true);
    img.onerror = () => setPhotoOk(false);
    img.src = scene.photo;
  }, [scene.photo]);

  const photoCalibrated = photoOk && !!scene.photoVertices;
  const v: SceneVertices = photoCalibrated ? scene.photoVertices! : scene.vertices;
  const showOverlay = !photoOk || photoCalibrated;

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
          { m: 'real' as PanelMode, s: 'photo' as BoardSurface, icon: ImageIcon, label: 'Picture' },
          { m: 'shape' as PanelMode, s: 'diagram' as BoardSurface, icon: Triangle, label: surfaces.includes('model') ? 'Shape' : 'Diagram' },
          { m: 'video' as PanelMode, s: 'video' as BoardSurface, icon: Film, label: 'Video' },
          { m: '3d' as PanelMode, s: 'model' as BoardSurface, icon: Box, label: '3D' },
          { m: 'chalk' as PanelMode, s: 'chalk' as BoardSurface, icon: PenLine, label: 'Chalkboard' },
        ]).filter(t => surfaces.includes(t.s)).map(({ m, icon: Icon, label }) => (
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
          {visualUrl ? (
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={visualUrl}
                alt={conceptLabel}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out"
                style={focusRegion ? {
                  transform: `scale(${focusRegion.zoom})`,
                  transformOrigin: `${focusRegion.x}% ${focusRegion.y}%`,
                } : undefined}
              />
              {focusRegion && (
                <>
                  <div className="absolute w-28 h-28 rounded-full border-2 border-[#ffb95f] shadow-[0_0_30px_rgba(255,185,95,0.55)] pointer-events-none"
                       style={{ left: `${focusRegion.x}%`, top: `${focusRegion.y}%`, transform: 'translate(-50%, -50%)' }} />
                  <div className="absolute left-5 bottom-5 max-w-[70%] rounded-2xl bg-black/60 backdrop-blur-md border border-[#ffb95f]/40 px-4 py-2.5">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#ffb95f] font-semibold">Look here</p>
                    <p className="text-[15px] text-white font-medium">{focusRegion.label}</p>
                  </div>
                </>
              )}
            </div>
          ) : surfaces.includes('model') && photoOk ? (
            <img src={scene.photo} alt={scene.title} className="absolute inset-0 w-full h-full object-cover" />
          ) : surfaces.includes('model') ? (
            <div className="absolute inset-0"><scene.Illustration /></div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                 style={{ background: 'radial-gradient(80% 70% at 50% 40%, #1B3A2A 0%, #0B1020 75%)' }}>
              <div className="w-16 h-16 rounded-full border-2 border-emerald-400/40 border-t-emerald-300 animate-spin" />
              <p className="text-white/80 text-[15px] font-medium px-8 text-center">
                {generating ? `Lumen is drawing ${conceptLabel}…` : `Picture of ${conceptLabel} will appear here`}
              </p>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/25" />

          {surfaces.includes('model') && showOverlay && !visualUrl ? (
            <TraceOverlay v={v} names={scene.names} val={val} shown={shown} focusPart={focusPart} />
          ) : surfaces.includes('model') && !visualUrl ? (
            <div className="absolute right-4 bottom-4 w-[34%] aspect-[16/10] rounded-2xl bg-[#0B1020]/80 backdrop-blur-md border border-white/15 p-2">
              <ShapeFigure figure={figure} names={scene.names} val={val} shown={shown} focusPart={focusPart} compact />
            </div>
          ) : null}

          <div className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md border border-white/12 text-[12.5px] text-white/85 font-medium">
            {surfaces.includes('model') && !visualUrl ? scene.title : conceptLabel}
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
            {surfaces.includes('model') ? (
              <ShapeFigure figure={figure} names={scene.names} val={val} shown={shown} focusPart={focusPart} />
            ) : visualUrl ? (
              <img src={visualUrl} alt={conceptLabel} className="w-full h-full object-contain rounded-2xl" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/50 text-sm px-8 text-center">
                Lumen will draw a picture of {conceptLabel} here.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── VIDEO CLIP (Lumen-controlled storyboard) ───────────── */}
      {mode === 'video' && (
        <div className="absolute inset-0 animate-fadeIn bg-[#0a0e14]">
          {clip?.frames?.length ? (
            <>
              <img
                src={clip.frames[Math.min(clipFrame, clip.frames.length - 1)].imageUrl}
                alt={clip.title}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700"
                style={clip.frames[Math.min(clipFrame, clip.frames.length - 1)].zoom ? {
                  transform: `scale(${clip.frames[Math.min(clipFrame, clip.frames.length - 1)].zoom!.scale})`,
                  transformOrigin: `${clip.frames[Math.min(clipFrame, clip.frames.length - 1)].zoom!.x}% ${clip.frames[Math.min(clipFrame, clip.frames.length - 1)].zoom!.y}%`,
                } : undefined}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
              <div className="absolute left-5 right-5 bottom-5 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#c0c1ff] font-semibold">{clip.title}</p>
                  <p className="text-[16px] text-white font-medium mt-1">{clip.frames[Math.min(clipFrame, clip.frames.length - 1)].caption}</p>
                  <p className="text-[12px] text-white/50 mt-1">{Math.min(clipFrame, clip.frames.length - 1) + 1} / {clip.frames.length}</p>
                </div>
                <button onClick={onToggleClip}
                  className="px-4 py-2 rounded-full bg-[#6366f1] text-white text-[13px] font-semibold flex items-center gap-2">
                  {clipPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {clipPlaying ? 'Pause' : 'Play'}
                </button>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm px-8 text-center">
              Ask Lumen to play a short clip of {conceptLabel}.
            </div>
          )}
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

      {surfaces.includes('model') && !revealed.includes('triangle') && !visualUrl && mode !== '3d' && mode !== 'chalk' && (
        <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center">
          <span className="px-4 py-2 rounded-full bg-black/45 backdrop-blur-md text-[13px] text-white/75">
            {isLessonActive ? 'Lumen is setting the scene…' : 'Start the session and we’ll begin'}
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
