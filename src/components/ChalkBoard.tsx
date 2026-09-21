import React, { useLayoutEffect, useMemo, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────
// ChalkBoard — where the tutor writes out working step by step.
// Opens automatically when the tutor calls update_chalkboard_notes or
// write_live_note. Each line is "written" in turn, so the board keeps pace
// with the explanation instead of appearing all at once.
// ─────────────────────────────────────────────────────────────────

interface Props {
  title?: string;
  lines: string[];
  formula?: string;
  liveNotes: string[];
}

const CHALK = '#F4F1E6';
const YELLOW = '#FFE08A';
const PINK = '#FFB3C1';
const BLUE = '#A9D8FF';

/** Maths typed by the model, made to look hand-written: 2 x 3 → 2 × 3, -> → →, sqrt(x) → √x */
function chalkify(s: string): string {
  return s
    .replace(/(\d)\s*[xX*]\s*(?=\d|\()/g, '$1 × ')
    .replace(/->|=>/g, '→')
    .replace(/sqrt\s*\(([^)]+)\)/gi, '√$1')
    .replace(/\^2\b/g, '²').replace(/\^3\b/g, '³')
    .replace(/\s{2,}/g, ' ');
}

/** "Step 1: …" → coloured label + text; "Example: …" likewise. */
function splitLabel(line: string): { label?: string; text: string } {
  const m = line.match(/^\s*((?:Step\s*\d+|Example|Answer|Rule|Check|Note|Remember|Question|Hint|Your turn)\s*[:.)-])\s*(.*)$/i);
  return m ? { label: m[1].replace(/[.)-]$/, ':'), text: m[2] } : { text: line };
}

export const ChalkBoard: React.FC<Props> = ({ title, lines, formula, liveNotes }) => {
  const all = useMemo(() => [...lines, ...liveNotes].map(chalkify), [lines, liveNotes]);
  // Shrink the writing as the board fills up, the way a teacher writes smaller.
  const size = all.length <= 4 ? 30 : all.length <= 6 ? 26 : all.length <= 8 ? 23 : 21;

  // Each line gets its writing timing ONCE, when it first appears, and keeps
  // it across re-renders (the stage re-renders many times a second with the
  // audio level). Only a newly arrived batch is staggered, starting now.
  // Previously every line's delay was counted from the top of the board, so
  // the 10th note waited ~20 s before appearing — the board looked frozen.
  const page = `${title || ''}\u0000${lines.join('\u0001')}\u0000${formula || ''}`;
  const plan = useRef<{ page: string; items: { d: number; dur: number }[]; formulaDelay: number | null }>({ page: '', items: [], formulaDelay: null });
  if (plan.current.page !== page) plan.current = { page, items: [], formulaDelay: null };
  if (plan.current.items.length > all.length) plan.current.items.length = all.length;
  const isFreshPage = plan.current.items.length === 0;
  let delay = isFreshPage && title ? 0.9 : 0.15;
  for (let i = plan.current.items.length; i < all.length; i++) {
    const dur = Math.min(1.6, 0.3 + all[i].length * 0.02);
    plan.current.items.push({ d: delay, dur });
    delay += dur + 0.15;
  }
  // The formula box is written after the first batch, and keeps that timing.
  if (plan.current.formulaDelay === null) plan.current.formulaDelay = Math.min(delay, 6);
  const timed = all.map((l, i) => ({ l, ...plan.current.items[i] }));
  const firstLive = lines.length;

  // Keep the newest writing in view: when the board is full, it scrolls up
  // (like a teacher moving down the board) instead of writing off the bottom.
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (all.length <= 1) el.scrollTop = 0;
    else el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [all.length, page]);

  return (
    <div className="absolute inset-0 overflow-hidden"
         style={{ background: 'radial-gradient(120% 90% at 30% 20%, #2F4238 0%, #23332B 55%, #1A2621 100%)' }}>
      {/* chalk dust and old smudges */}
      <div className="absolute inset-0 opacity-[0.07] pointer-events-none"
           style={{ backgroundImage: 'radial-gradient(#fff 0.6px, transparent 0.8px)', backgroundSize: '5px 5px' }} />
      <div className="absolute -left-20 top-24 w-[420px] h-[160px] rounded-full blur-3xl opacity-[0.06] bg-white pointer-events-none" />
      <div className="absolute right-10 bottom-10 w-[360px] h-[120px] rounded-full blur-3xl opacity-[0.05] bg-white pointer-events-none" />
      {/* chalk ledge */}
      <div className="absolute inset-x-0 bottom-0 h-3 bg-gradient-to-b from-[#5B4632] to-[#3E2F21]" />

      <div className="relative h-full px-12 pt-16 pb-10 flex flex-col font-chalk" style={{ color: CHALK }}>
        {title ? (
          <div className="mb-5">
            <h2 className="chalk-write text-[38px] leading-tight" style={{ animationDuration: '0.8s' }}>{chalkify(title)}</h2>
            <svg width="100%" height="10" className="mt-1 overflow-visible">
              <path d="M2 6 C 120 2, 260 9, 420 4" stroke={YELLOW} strokeWidth="3" fill="none" strokeLinecap="round"
                    className="chalk-underline" />
            </svg>
          </div>
        ) : null}

        <div ref={scroller} className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
             style={{ maskImage: 'linear-gradient(to bottom, transparent 0, #000 14px, #000 100%)' }}>
          {timed.map(({ l, d, dur }, i) => {
            const { label, text } = splitLabel(l);
            return (
              <React.Fragment key={i + l}>
                {i === firstLive && liveNotes.length > 0 && lines.length > 0 && (
                  <div className="border-t-2 border-dashed border-white/20 my-3" />
                )}
                <p className="chalk-write leading-snug" style={{ fontSize: size, animationDelay: `${d}s`, animationDuration: `${dur}s` }}>
                  {label && <span style={{ color: YELLOW }} className="mr-2">{label}</span>}
                  <span>{text}</span>
                </p>
              </React.Fragment>
            );
          })}
          {all.length === 0 && !title && (
            <p className="text-white/35 text-[24px]">Dr. Marcus will write here as he explains.</p>
          )}
        </div>

        {formula && (
          <div className="chalk-write self-start mt-4 px-5 py-2 rounded-xl border-2 shrink-0"
               style={{ borderColor: PINK, color: BLUE, fontSize: size + 6, animationDelay: `${plan.current.formulaDelay}s`, animationDuration: '0.9s' }}>
            {chalkify(formula)}
          </div>
        )}
      </div>
    </div>
  );
};
