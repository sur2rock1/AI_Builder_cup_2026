import React, { useMemo } from 'react';
import { HelpCircle, Repeat, Gauge, Hand, Check, AlertTriangle, Search } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────
// TeachingCanvas — one board, one idea, revealed by the tutor's voice.
//
// Design constraints, each traceable to a cognitive-load principle:
//   coherence          nothing on the board that is not being talked about
//   signaling          exactly one part highlighted at a time
//   redundancy         the tutor's words are NOT duplicated as on-screen text
//   spatial contiguity labels sit ON the figure, never in a legend
//
// The figure is real geometry computed from the side lengths, not a generic
// node-and-arrow template. A right-angled triangle is not a five-stage pipeline.
// ─────────────────────────────────────────────────────────────────

export interface FigureSpec {
  a: number;              // horizontal leg
  b: number;              // vertical leg
  unitLabel?: string;
  unknownSide?: 'a' | 'b' | 'c' | null;
}

export interface StudentThinking {
  method: string;
  faultyStep?: string;
  verdict: 'sound' | 'checking' | 'breaks_down';
}

export interface LiveAssessment {
  classification: string;
  understandingDepth: string;
  confidence: 'high' | 'medium' | 'low';
  reasoningSummary?: string;
  faultyStep?: string | null;
  probeQuestion?: string | null;
  shouldProbe?: boolean;
  concept?: { id: string; label: string } | null;
  mastery?: { before: number; after: number; derivation: string } | null;
  misconceptions?: Array<{ id: string; text: string; status: string }>;
}

export interface BoardNote {
  title?: string;
  lines: string[];
  formula?: string;
}

export const FIGURE_PARTS = [
  'triangle', 'right-angle', 'leg-a', 'leg-b', 'hypotenuse',
  'vertices', 'formula', 'squares',
] as const;
export type FigurePart = typeof FIGURE_PARTS[number];

/** Maps whatever the tutor says into a part of the figure. */
export function resolvePart(phrase: string): FigurePart | null {
  const t = (phrase || '').toLowerCase();
  if (/hypoten|longest side|side c\b|opposite the right/.test(t)) return 'hypotenuse';
  if (/right angle|90|square corner|perpendicular/.test(t))       return 'right-angle';
  if (/square on|area of the square|squares/.test(t))             return 'squares';
  if (/formula|theorem|a.?2.*b.?2|equation/.test(t))              return 'formula';
  if (/base|horizontal|adjacent|side a\b/.test(t))                return 'leg-a';
  if (/height|vertical|opposite side|side b\b|altitude/.test(t))  return 'leg-b';
  if (/vertex|vertices|corner|point a|point b|point c/.test(t))   return 'vertices';
  if (/triangle/.test(t))                                         return 'triangle';
  return null;
}

interface Props {
  topic: string;
  conceptLabel?: string;
  figure: FigureSpec;
  revealed: FigurePart[];
  focusPart: FigurePart | null;
  studentThinking: StudentThinking | null;
  assessment: LiveAssessment | null;
  notes: BoardNote | null;
  masteryScore: number;
  misconceptions: Array<{ id: string; text: string; status: string }>;
  isLessonActive: boolean;
  onConfusion: (signal: string, about?: string) => void;
}

const ACCENT = '#4F46E5';
const INK = '#161A22';
const MUTED = '#626B7B';
const CAUTION = '#B45309';
const SOUND = '#047857';

export const TeachingCanvas: React.FC<Props> = ({
  topic, conceptLabel, figure, revealed, focusPart,
  studentThinking, assessment, notes, masteryScore, misconceptions,
  isLessonActive, onConfusion,
}) => {
  const shown = (p: FigurePart) => revealed.includes(p);
  const isFocus = (p: FigurePart) => focusPart === p;
  // Signaling: when one part is spotlighted, everything else recedes.
  const dim = (p: FigurePart) => (focusPart && focusPart !== p ? 0.34 : 1);

  const geo = useMemo(() => {
    const { a, b } = figure;
    const c = Math.sqrt(a * a + b * b);
    // Fit the triangle into a drawing box, preserving the true shape so a
    // 3-4-5 triangle actually looks like a 3-4-5 triangle.
    const showSquares = revealed.includes('squares');
    const BOX = showSquares ? 190 : 260;
    const scale = BOX / Math.max(a, b);
    const w = a * scale;
    const h = b * scale;
    // Origin = the right angle. Centre the whole drawing in the 700x420 viewBox,
    // reserving room to the left and below for the squares when they are shown.
    const padLeft = showSquares ? h : 0;
    const totalW = w + padLeft;
    const totalH = h + (showSquares ? w : 0);
    const ox = (700 - totalW) / 2 + padLeft;
    const oy = (420 - totalH) / 2 + h;
    return {
      c,
      w, h, ox, oy,
      A: { x: ox, y: oy - h },        // top vertex
      B: { x: ox + w, y: oy },        // right vertex
      C: { x: ox, y: oy },            // right angle
      scale,
    };
  }, [figure, revealed]);

  const { A, B, C, w, h, c } = geo;
  const unit = figure.unitLabel || '';
  const label = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}${unit ? ' ' + unit : ''}`;

  return (
    <div className="w-full h-full flex flex-col bg-[#F6F7F9] text-[#161A22] overflow-hidden">

      {/* ── Header: what we are on right now, and nothing else ── */}
      <div className="shrink-0 px-6 py-3 bg-white border-b border-[#E3E6EC] flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A93A3]">
            Now learning
          </div>
          <h1 className="text-lg font-semibold truncate text-[#161A22]">
            {conceptLabel || topic}
          </h1>
        </div>

        {/* Understanding rail — the learner model, made visible. */}
        <div className="shrink-0 flex items-center gap-3">
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A93A3]">
              Understanding
            </div>
            <div className="text-xs text-[#626B7B]">
              {masteryScore >= 75 ? 'Solid' : masteryScore >= 45 ? 'Getting there' : 'Building'}
            </div>
          </div>
          <div className="w-28 h-2.5 rounded-full bg-[#E8EAEF] overflow-hidden" role="progressbar" aria-valuenow={masteryScore} aria-valuemin={0} aria-valuemax={100}>
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${Math.max(3, masteryScore)}%`, background: ACCENT }}
            />
          </div>
        </div>
      </div>

      {/* ── Main: the figure dominates ── */}
      <div className="flex-1 min-h-0 flex flex-row">
        <div className="flex-1 min-w-0 flex items-center justify-center p-6">
          <svg viewBox="0 0 700 420" className="w-full h-full max-h-[520px]" role="img"
               aria-label={`Right-angled triangle with legs ${figure.a} and ${figure.b}`}>
            <defs>
              <filter id="tc-focus" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor={ACCENT} floodOpacity="0.35" />
              </filter>
            </defs>

            {/* Squares on the sides — the classic proof visual, revealed on request */}
            {shown('squares') && (
              <g opacity={dim('squares')} className="transition-opacity duration-500">
                <rect x={C.x} y={C.y} width={w} height={w} fill={ACCENT} fillOpacity="0.09"
                      stroke={ACCENT} strokeOpacity="0.35" strokeWidth="1.5" />
                <text x={C.x + w / 2} y={C.y + w / 2 + 5} textAnchor="middle"
                      fontSize="15" fill={ACCENT} fontWeight="600">a²</text>

                <rect x={C.x - h} y={C.y - h} width={h} height={h} fill={ACCENT} fillOpacity="0.09"
                      stroke={ACCENT} strokeOpacity="0.35" strokeWidth="1.5" />
                <text x={C.x - h / 2} y={C.y - h / 2 + 5} textAnchor="middle"
                      fontSize="15" fill={ACCENT} fontWeight="600">b²</text>
              </g>
            )}

            {/* The triangle */}
            {shown('triangle') && (
              <g opacity={dim('triangle')} className="transition-opacity duration-500">
                <polygon
                  points={`${C.x},${C.y} ${B.x},${B.y} ${A.x},${A.y}`}
                  fill={ACCENT} fillOpacity="0.07"
                  stroke={INK} strokeWidth="2.5" strokeLinejoin="round"
                />
              </g>
            )}

            {/* Right angle */}
            {shown('right-angle') && (
              <g opacity={dim('right-angle')} className="transition-opacity duration-500"
                 filter={isFocus('right-angle') ? 'url(#tc-focus)' : undefined}>
                <polyline
                  points={`${C.x},${C.y - 26} ${C.x + 26},${C.y - 26} ${C.x + 26},${C.y}`}
                  fill="none" stroke={isFocus('right-angle') ? ACCENT : MUTED}
                  strokeWidth={isFocus('right-angle') ? 3 : 2}
                />
                <text x={C.x + 34} y={C.y - 34} fontSize="14"
                      fill={isFocus('right-angle') ? ACCENT : MUTED} fontWeight="600">90°</text>
              </g>
            )}

            {/* Leg a — label sits ON the side, not in a legend */}
            {shown('leg-a') && (
              <g opacity={dim('leg-a')} className="transition-opacity duration-500">
                <line x1={C.x} y1={C.y} x2={B.x} y2={B.y}
                      stroke={isFocus('leg-a') ? ACCENT : INK}
                      strokeWidth={isFocus('leg-a') ? 5 : 2.5} strokeLinecap="round" />
                <text x={C.x + w / 2} y={C.y + 26} textAnchor="middle" fontSize="15"
                      fill={isFocus('leg-a') ? ACCENT : INK} fontWeight={isFocus('leg-a') ? 700 : 500}>
                  a = {figure.unknownSide === 'a' ? '?' : label(figure.a)}
                </text>
              </g>
            )}

            {/* Leg b */}
            {shown('leg-b') && (
              <g opacity={dim('leg-b')} className="transition-opacity duration-500">
                <line x1={C.x} y1={C.y} x2={A.x} y2={A.y}
                      stroke={isFocus('leg-b') ? ACCENT : INK}
                      strokeWidth={isFocus('leg-b') ? 5 : 2.5} strokeLinecap="round" />
                <text x={C.x - 14} y={C.y - h / 2} textAnchor="middle" fontSize="15"
                      fill={isFocus('leg-b') ? ACCENT : INK} fontWeight={isFocus('leg-b') ? 700 : 500}
                      transform={`rotate(-90 ${C.x - 14} ${C.y - h / 2})`}>
                  b = {figure.unknownSide === 'b' ? '?' : label(figure.b)}
                </text>
              </g>
            )}

            {/* Hypotenuse */}
            {shown('hypotenuse') && (
              <g opacity={dim('hypotenuse')} className="transition-opacity duration-500">
                <line x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                      stroke={isFocus('hypotenuse') ? ACCENT : INK}
                      strokeWidth={isFocus('hypotenuse') ? 5 : 2.5} strokeLinecap="round" />
                <text
                  x={(A.x + B.x) / 2 + 16} y={(A.y + B.y) / 2 - 10}
                  textAnchor="middle" fontSize="15"
                  fill={isFocus('hypotenuse') ? ACCENT : INK}
                  fontWeight={isFocus('hypotenuse') ? 700 : 500}
                  transform={`rotate(${(Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI} ${(A.x + B.x) / 2 + 16} ${(A.y + B.y) / 2 - 10})`}
                >
                  c = {figure.unknownSide === 'c' ? '?' : label(c)}
                </text>
                {isFocus('hypotenuse') && (
                  <text x={(A.x + B.x) / 2 + 60} y={(A.y + B.y) / 2 + 22} fontSize="12" fill={ACCENT}>
                    opposite the right angle
                  </text>
                )}
              </g>
            )}

            {/* Vertices */}
            {shown('vertices') && (
              <g opacity={dim('vertices')} className="transition-opacity duration-500">
                {[[A, 'A'], [B, 'B'], [C, 'C']].map(([pt, name]: any) => (
                  <g key={name}>
                    <circle cx={pt.x} cy={pt.y} r="5" fill={INK} />
                    <text x={pt.x + (name === 'B' ? 14 : -16)} y={pt.y + (name === 'A' ? -10 : 18)}
                          fontSize="14" fill={INK} fontWeight="600">{name}</text>
                  </g>
                ))}
              </g>
            )}

            {/* Formula — placed clear of the figure, never on top of it */}
            {shown('formula') && (
              <g opacity={dim('formula')} className="transition-opacity duration-500">
                <rect x="40" y="36" width="190" height="52" rx="10"
                      fill="#FFFFFF" stroke={isFocus('formula') ? ACCENT : '#DDE1E8'}
                      strokeWidth={isFocus('formula') ? 2.5 : 1.5} />
                <text x="135" y="70" textAnchor="middle" fontSize="22"
                      fill={isFocus('formula') ? ACCENT : INK} fontWeight="700"
                      fontFamily="ui-monospace, SFMono-Regular, monospace">
                  a² + b² = c²
                </text>
              </g>
            )}

            {!shown('triangle') && (
              <text x="350" y="210" textAnchor="middle" fontSize="15" fill="#A4ACBA">
                {isLessonActive ? 'Listening…' : 'Start the lesson and the board will follow along'}
              </text>
            )}
          </svg>
        </div>

        {/* ── Right rail: the child's thinking, and what we know ── */}
        <aside className="w-[320px] shrink-0 border-l border-[#E3E6EC] bg-white flex flex-col overflow-y-auto">

          {/* The child's own method, shown back to them */}
          <section className="p-4 border-b border-[#EDEFF3]">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A93A3] mb-2">
              Your thinking
            </h2>
            {studentThinking ? (
              <div
                className="rounded-xl p-3 border"
                style={{
                  borderColor:
                    studentThinking.verdict === 'sound' ? SOUND
                    : studentThinking.verdict === 'breaks_down' ? CAUTION : '#DDE1E8',
                  background:
                    studentThinking.verdict === 'sound' ? '#ECFDF5'
                    : studentThinking.verdict === 'breaks_down' ? '#FFFBEB' : '#F8F9FB',
                }}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  {studentThinking.verdict === 'sound' && <Check className="w-3.5 h-3.5" style={{ color: SOUND }} />}
                  {studentThinking.verdict === 'checking' && <Search className="w-3.5 h-3.5 text-[#626B7B]" />}
                  {studentThinking.verdict === 'breaks_down' && <AlertTriangle className="w-3.5 h-3.5" style={{ color: CAUTION }} />}
                  <span className="text-[11px] font-semibold uppercase tracking-wide"
                        style={{ color: studentThinking.verdict === 'sound' ? SOUND : studentThinking.verdict === 'breaks_down' ? CAUTION : MUTED }}>
                    {studentThinking.verdict === 'sound' ? 'This method holds up'
                      : studentThinking.verdict === 'breaks_down' ? 'This method breaks here'
                      : 'Let us check this together'}
                  </span>
                </div>
                <p className="text-sm text-[#2B313C] leading-relaxed">{studentThinking.method}</p>
                {studentThinking.faultyStep && (
                  <p className="text-xs mt-2 pt-2 border-t border-black/5" style={{ color: CAUTION }}>
                    {studentThinking.faultyStep}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-[#8A93A3] leading-relaxed">
                When you explain how you worked something out, it appears here so you can see it.
              </p>
            )}
          </section>

          {/* Live probe — visible so the child can re-read the question */}
          {assessment?.probeQuestion && (
            <section className="p-4 border-b border-[#EDEFF3]">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A93A3] mb-2">
                Think about this
              </h2>
              <p className="text-sm text-[#161A22] leading-relaxed font-medium">
                {assessment.probeQuestion}
              </p>
            </section>
          )}

          {/* Notes the tutor writes up */}
          {notes && notes.lines.length > 0 && (
            <section className="p-4 border-b border-[#EDEFF3]">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A93A3] mb-2">
                {notes.title || 'Worth remembering'}
              </h2>
              {notes.formula && (
                <div className="mb-2 px-3 py-2 rounded-lg bg-[#F1F0FE] font-mono text-sm font-semibold"
                     style={{ color: ACCENT }}>
                  {notes.formula}
                </div>
              )}
              <ul className="space-y-1.5">
                {notes.lines.slice(0, 5).map((l, i) => (
                  <li key={i} className="text-sm text-[#2B313C] leading-relaxed flex gap-2">
                    <span className="text-[#C3C8D2] shrink-0">·</span>
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Misconception ledger — suspected vs confirmed, never asserted from one answer */}
          {misconceptions.length > 0 && (
            <section className="p-4 border-b border-[#EDEFF3]">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A93A3] mb-2">
                Things we are working on
              </h2>
              <ul className="space-y-2">
                {misconceptions.map(m => (
                  <li key={m.id} className="flex gap-2 items-start">
                    <span
                      className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        background: m.status === 'confirmed' ? CAUTION
                          : m.status === 'resolved' ? SOUND : '#C3C8D2',
                      }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs text-[#2B313C] leading-snug">{m.text}</p>
                      <span className="text-[10px] uppercase tracking-wide font-semibold"
                            style={{ color: m.status === 'confirmed' ? CAUTION : m.status === 'resolved' ? SOUND : '#A4ACBA' }}>
                        {m.status === 'suspected' ? 'checking' : m.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {/* ── Confusion vocabulary: always available, always welcomed ── */}
      <div className="shrink-0 px-6 py-3 bg-white border-t border-[#E3E6EC] flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A93A3] mr-1">
          Tell Dr. Vance
        </span>
        {[
          { icon: HelpCircle, label: "I don't get it", signal: 'dont_understand' },
          { icon: Repeat, label: 'Say it another way', signal: 'repeat_differently' },
          { icon: Gauge, label: 'Too fast', signal: 'too_fast' },
          { icon: Hand, label: 'I guessed that', signal: 'guessed' },
        ].map(({ icon: Icon, label: text, signal }) => (
          <button
            key={signal}
            onClick={() => onConfusion(signal)}
            disabled={!isLessonActive}
            className="px-3 py-1.5 rounded-full border border-[#DDE1E8] bg-white hover:bg-[#F1F0FE] hover:border-[#C7C4F7] text-sm text-[#2B313C] flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Icon className="w-3.5 h-3.5" style={{ color: ACCENT }} />
            <span>{text}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
