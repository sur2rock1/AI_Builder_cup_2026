// ─────────────────────────────────────────────────────────────────
// Guided mode — data shapes.
//
// A GuidedScript is the prepared lesson for ONE concept: an ordered list of
// BEATS. Each beat says what the tutor is getting across and what is written
// on the shared board while it speaks. The board only ever grows: items are
// appended beat by beat and are never replaced.
//
// Interaction is part of the script: a beat may ask the child something, and
// a `slot` item on the board is filled in with the child's own answer.
//
// Isomorphic: no Node or DOM imports.
// ─────────────────────────────────────────────────────────────────

/** The teaching moves, in the order a good explanation usually takes them. */
export const BEAT_KINDS = [
  'orient',    // where this sits, what we are about to do
  'define',    // what it is (and what it is not)
  'show',      // build the picture / working step by step
  'analogy',   // something familiar
  'contrast',  // a non-example, or a common mix-up, side by side
  'rule',      // the rule, in one line
  'exception', // where the rule needs care
  'method',    // the procedure, worked
  'apply',     // the child tries a fresh one
  'check',     // closing question
] as const;
export type BeatKind = typeof BEAT_KINDS[number];

export type BoardItem =
  | { type: 'heading'; text: string }
  | { type: 'point'; text: string }
  | { type: 'rule'; text: string }
  | { type: 'exception'; text: string }
  /** Two-column comparison. Consecutive items alternate left / right. */
  | { type: 'compare'; side: 'left' | 'right'; title?: string; text: string }
  /** Worked lines, written one under another. */
  | { type: 'work'; lines: string[] }
  /** A prepared board picture (key as stored in the pregen record), shown up to `step`. */
  | { type: 'picture'; ref: string; step?: string | 'all' }
  /** A blank the child fills in; `id` is what the tutor passes to fill_slot. */
  | { type: 'slot'; id: string; label: string }
  /** One line of a line-by-line beat, written as the tutor says it. */
  | { type: 'line'; style: LineStyle; text: string }
  /** The tutor's own line answering a side question; `question` heads the first line of an aside. */
  | { type: 'aside'; question?: string; text: string };

export type LineStyle = 'point' | 'work' | 'rule';

/** A question asked BEFORE a line is written: the line is the answer, so it is held back until the learner replies. */
export interface LineAsk {
  prompt: string;
  lookFor: string;
  onMiss: string;
}

/**
 * One board line and what the tutor says for it. Line-by-line beats are the method of a
 * chalkboard teacher: say it, write it, explain it, next line. Nothing is skipped.
 */
export interface BoardLine {
  id: string;
  /** Exactly what is written. */
  text: string;
  /** What the tutor says as it appears (it reads the line out in words, then explains it). */
  say: string;
  style?: LineStyle;
  /** Ask first; write `text` only once the learner has answered. */
  ask?: LineAsk;
  /** Move the board picture on when this line is written (so the picture never shows an answer early). */
  picture?: { ref: string; step?: string | 'all' };
}

export interface BeatAsk {
  /** What the tutor asks, in plain words. */
  prompt: string;
  /** Board slot the answer is written into, if any. */
  slot?: string;
  /** What a good answer contains (the tutor judges the reasoning, not only the result). */
  lookFor: string;
  /** If the answer misses: what to do before moving on. */
  onMiss: string;
}

export interface Beat {
  id: string;
  kind: BeatKind;
  /** What to get across, as guidance to the tutor — never read out word for word. */
  say: string;
  /** Appended to the board when the beat starts. */
  board: BoardItem[];
  ask?: BeatAsk;
  /** Line-by-line beat: written one line per next_line call, after `board`. Questions live on the lines. */
  lines?: BoardLine[];
}

export interface GuidedScript {
  version: 1;
  conceptId: string;
  title: string;
  beats: Beat[];
  /** Where it came from (generated lessons): model, time, open warnings. Not used for teaching. */
  meta?: { source?: string; model?: string; generatedAt?: string; attempts?: number; warnings?: string[] };
}

// ─── What the browser holds ───────────────────────────────────────

/** A board item as shown: the beat that wrote it, plus anything the child filled in. */
export interface PlacedItem {
  key: string;      // `${beatId}:${index}` — stable, unique
  beatId: string;
  item: BoardItem;
}

export interface GuidedBoardState {
  /** Index of the last beat started; -1 before the first. */
  beatIndex: number;
  items: PlacedItem[];
  /** slot id → the child's answer */
  filled: Record<string, string>;
  /** Line-by-line beats: how many of the current beat's lines are written. */
  lineIndex: number;
  /** Id of the line whose question has been asked and whose answer is held back. */
  pendingAsk: string | null;
  /** Number of aside lines written so far (keys). */
  asideCount: number;
}

export const EMPTY_GUIDED_BOARD: GuidedBoardState = { beatIndex: -1, items: [], filled: {}, lineIndex: 0, pendingAsk: null, asideCount: 0 };

/** What the browser needs to draw a script: the script and the pictures it points at. */
export interface GuidedPayload {
  script: GuidedScript;
  /** pregen picture key → BoardVisual (JSON as stored). Typed loosely so this file stays dependency-free. */
  visuals: Record<string, unknown>;
}
