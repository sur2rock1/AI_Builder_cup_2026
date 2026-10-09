// ─────────────────────────────────────────────────────────────────
// GuidedBoard — one board that only grows.
//
// Everything the tutor writes stays: headings, lines, rules, worked lines,
// two-column comparisons, and the picture beside them. Blanks ("slots") are
// filled with the learner's own answers; line-by-line beats add one line per
// tool call; the learner's side questions are answered in a yellow side note.
// It is drawn from GuidedBoardState (board.ts) and replaces the standard board
// only when guided mode is active.
// ─────────────────────────────────────────────────────────────────

import { useMediaQuery } from '../utils/useMediaQuery';
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { BoardVisualView, type StepState } from '../components/BoardVisualView';
import type { BoardVisual } from '../visual/types';
import { currentPicture } from './board';
import type { BoardItem, GuidedBoardState, GuidedPayload, PlacedItem } from './types';
import { useTutorName } from '../persona/TutorNameContext';

const CHALK = '#F4F1E6';
const YELLOW = '#FFE08A';
const PINK = '#FFB3C1';
const BLUE = '#A9D8FF';
const GREEN = '#9BE3B0';

/** Maths typed as plain text, made to look hand-written. */
const chalkify = (s: string) => s
  .replace(/->|=>/g, '→').replace(/\^2\b/g, '²').replace(/\^3\b/g, '³')
  // keep an equation together: no line break between an operator and its neighbours
  .replace(/\s([=+×÷<>≤≥≠→])\s/g, '\u00A0$1\u00A0');

interface Props {
  payload: GuidedPayload;
  board: GuidedBoardState;
  conceptLabel?: string;
}

type Block =
  | { kind: 'item'; placed: PlacedItem; delay: number }
  | { kind: 'compare'; left: PlacedItem | null; right: PlacedItem | null; delay: number };

export const GuidedBoard: React.FC<Props> = ({ payload, board, conceptLabel }) => {
  const tutorName = useTutorName();
  const pic = currentPicture(board);
  const visual = pic ? ((payload.visuals[pic.ref] as BoardVisual | undefined) ?? null) : null;
  const step: StepState = useMemo(() => {
    if (!visual) return 0;
    if (!pic || !pic.step || pic.step === 'all') return 'all';
    const i = visual.steps.findIndex((s) => s.id === pic.step);
    return i >= 0 ? i : 'all';
  }, [visual, pic]);

  // Blocks in writing order. Items of the same beat are staggered so the board "writes" as the tutor speaks.
  const blocks = useMemo<Block[]>(() => {
    const out: Block[] = [];
    const nextDelay = (_beatId: string) => 0.05; // items are revealed one at a time by the hook, in step with the tutor's voice
    for (const p of board.items) {
      if (p.item.type === 'picture') continue; // drawn in its own panel
      const delay = nextDelay(p.beatId);
      if (p.item.type === 'compare') {
        const last = out[out.length - 1];
        if (last && last.kind === 'compare' && p.beatId === (last.left ?? last.right)?.beatId && !(p.item.side === 'left' ? last.left : last.right)) {
          if (p.item.side === 'left') last.left = p; else last.right = p;
          continue;
        }
        out.push({ kind: 'compare', left: p.item.side === 'left' ? p : null, right: p.item.side === 'right' ? p : null, delay });
        continue;
      }
      out.push({ kind: 'item', placed: p, delay });
    }
    return out;
  }, [board.items]);

  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [board.items.length, Object.keys(board.filled).length]);

  const narrow = useMediaQuery('(max-width: 639px)');
  const baseSize = board.items.length <= 10 ? 27 : board.items.length <= 18 ? 24 : 21;
  // The board is a small box on a phone: shrink the chalk so a line still holds several words.
  const size = narrow ? Math.max(15, Math.round(baseSize * 0.68)) : baseSize;

  const renderSlot = (id: string, label: string) => {
    const [before, after = ''] = label.includes('___') ? label.split('___') : [label + ' ', ''];
    const filled = board.filled[id];
    return (
      <span>
        {chalkify(before)}
        {filled ? (
          <span className="chalk-write px-1" style={{ color: GREEN, animationDuration: '0.6s', borderBottom: `2px solid ${GREEN}` }}>{chalkify(filled)}</span>
        ) : (
          <span className="inline-block align-baseline mx-1 animate-pulse" style={{ minWidth: 90, borderBottom: `2px dashed ${YELLOW}`, color: 'transparent' }}>_____</span>
        )}
        {chalkify(after)}
      </span>
    );
  };

  const renderItem = (it: BoardItem, delay: number) => {
    const anim = { animationDelay: `${delay}s`, animationDuration: '0.8s' } as React.CSSProperties;
    switch (it.type) {
      case 'heading':
        return (
          <div className="mt-3 first:mt-0">
            <h2 className="chalk-write leading-tight" style={{ ...anim, fontSize: size + 8, color: CHALK }}>{chalkify(it.text)}</h2>
            <svg width="100%" height="8" className="overflow-visible"><path d="M2 5 C 90 2, 200 8, 330 4" stroke={YELLOW} strokeWidth="3" fill="none" strokeLinecap="round" /></svg>
          </div>
        );
      case 'point':
        return <p className="chalk-write leading-snug" style={{ ...anim, fontSize: size, color: CHALK }}>{chalkify(it.text)}</p>;
      case 'rule':
        return (
          <p className="chalk-write self-start px-4 py-1.5 rounded-xl border-2 leading-snug" style={{ ...anim, fontSize: size + 3, color: BLUE, borderColor: PINK }}>{chalkify(it.text)}</p>
        );
      case 'exception':
        return (
          <p className="chalk-write leading-snug" style={{ ...anim, fontSize: size, color: PINK }}>
            <span style={{ color: YELLOW }} className="mr-2">Watch out:</span>{chalkify(it.text)}
          </p>
        );
      case 'work':
        return (
          <div className="chalk-write pl-3 border-l-2 space-y-0.5" style={{ ...anim, borderColor: 'rgba(244,241,230,.35)', color: CHALK, fontSize: size - 1 }}>
            {it.lines.map((l, i) => <div key={i}>{chalkify(l)}</div>)}
          </div>
        );
      case 'slot':
        return <p className="leading-snug" style={{ fontSize: size, color: CHALK }}>{renderSlot(it.id, it.label)}</p>;
      case 'line':
        if (it.style === 'rule') {
          return <p className="chalk-write self-start px-4 py-1.5 rounded-xl border-2 leading-snug" style={{ ...anim, fontSize: size + 3, color: BLUE, borderColor: PINK }}>{chalkify(it.text)}</p>;
        }
        if (it.style === 'point') return <p className="chalk-write leading-snug" style={{ ...anim, fontSize: size, color: CHALK }}>{chalkify(it.text)}</p>;
        return <div className="chalk-write pl-3 border-l-2 leading-snug" style={{ ...anim, borderColor: 'rgba(244,241,230,.35)', color: CHALK, fontSize: size }}>{chalkify(it.text)}</div>;
      case 'aside':
        // The learner's own question, answered on the board, set apart from the lesson.
        return (
          <div className="chalk-write pl-3 border-l-4 leading-snug" style={{ ...anim, borderColor: YELLOW, fontSize: size - 1 }}>
            {it.question && <div className="mb-0.5" style={{ color: YELLOW, fontSize: size - 3 }}>You asked: {chalkify(it.question)}</div>}
            <div style={{ color: CHALK }}>{chalkify(it.text)}</div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'radial-gradient(120% 90% at 30% 20%, #2F4238 0%, #23332B 55%, #1A2621 100%)' }}>
      <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 0.6px, transparent 0.8px)', backgroundSize: '5px 5px' }} />
      <div className="absolute inset-x-0 bottom-0 h-3 bg-gradient-to-b from-[#5B4632] to-[#3E2F21]" />

      <div className="relative h-full flex flex-col sm:flex-row font-chalk" style={{ color: CHALK }}>
        <div ref={scroller} className={`${visual ? 'h-[46%] sm:h-full sm:w-[44%]' : 'h-full'} w-full min-h-0 overflow-y-auto px-4 sm:px-8 pt-4 sm:pt-7 pb-5 sm:pb-8 space-y-2 sm:space-y-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
             style={{ maskImage: 'linear-gradient(to bottom, transparent 0, #000 14px, #000 100%)' }}>
          {blocks.length === 0 && (
            <p className="text-white/35 text-[24px]">{conceptLabel ? `${conceptLabel} - ` : ''}{tutorName} will write here as you learn.</p>
          )}
          {blocks.map((b, i) => {
            if (b.kind === 'item') {
              const it = b.placed.item;
              return <React.Fragment key={b.placed.key}>{renderItem(it, b.delay)}</React.Fragment>;
            }
            const key = (b.left?.key ?? '') + '|' + (b.right?.key ?? '') + i;
            const cell = (p: PlacedItem | null) => (p && p.item.type === 'compare' ? (
              <div className="chalk-write" style={{ animationDelay: `${b.delay}s`, animationDuration: '0.8s' }}>
                {p.item.title && <div className="font-semibold mb-0.5" style={{ color: YELLOW, fontSize: size - 1 }}>{chalkify(p.item.title)}</div>}
                <div style={{ fontSize: size - 1, color: CHALK }} className="leading-snug">{chalkify(p.item.text)}</div>
              </div>
            ) : <div />);
            return (
              <div key={key} className="grid grid-cols-2 gap-0 rounded-lg">
                <div className="pr-4 border-r-2" style={{ borderColor: 'rgba(244,241,230,.35)' }}>{cell(b.left)}</div>
                <div className="pl-4">{cell(b.right)}</div>
              </div>
            );
          })}
        </div>

        {visual && (
          <div className="w-full h-[54%] sm:h-full sm:w-[56%] min-h-0 p-2 sm:p-3 pb-4 sm:pb-6 flex items-center">
            <div className="w-full rounded-2xl overflow-hidden border border-white/10 bg-[#0F1420] shadow-lg">
              <BoardVisualView key={pic!.ref} visual={visual} step={step} showControls={false} idPrefix={`guided-${pic!.ref}`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
