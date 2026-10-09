// ─────────────────────────────────────────────────────────────────
// Guided board — the pure rules for how the shared board grows.
//
// The server holds the one true board (GuidedSession) and sends the browser a
// snapshot after every change; the browser only decides WHEN to show it (in step
// with the voice). The same functions also run in the dev preview and tests.
//
// Isomorphic: no Node or DOM imports.
// ─────────────────────────────────────────────────────────────────

import type { BoardLine, GuidedScript, GuidedBoardState, PlacedItem } from './types';
import { EMPTY_GUIDED_BOARD } from './types';

export const MAX_SLOT_ANSWER_CHARS = 80;

/**
 * Which beat starts next. With no request it is the one after the current beat.
 * A request for a beat that is later than the next one is honoured (the tutor
 * skipped ahead); one that is already past is ignored.
 * Returns -1 when the script is finished or the request is unknown.
 */
export function nextBeatIndex(script: GuidedScript, current: number, requestedId?: string | null): number {
  const next = current + 1;
  if (next >= script.beats.length) return -1;
  if (!requestedId) return next;
  const asked = script.beats.findIndex((b) => b.id === requestedId);
  if (asked < 0) return next;     // unknown id: just carry on in order
  return asked >= next ? asked : next;
}

/** Start a beat: append its items. Items from skipped beats are appended too, so the board never has holes. */
export function startBeat(state: GuidedBoardState, script: GuidedScript, requestedId?: string | null): GuidedBoardState {
  const target = nextBeatIndex(script, state.beatIndex, requestedId);
  if (target < 0) return state;
  const placed: PlacedItem[] = [];
  for (let i = state.beatIndex + 1; i <= target; i++) {
    const beat = script.beats[i];
    beat.board.forEach((item, n) => placed.push({ key: `${beat.id}:${n}`, beatId: beat.id, item }));
    // A skipped line-by-line beat still leaves its lines on the board.
    if (i < target) (beat.lines ?? []).forEach((l) => placed.push(...lineItems(beat.id, l)));
  }
  return { ...state, beatIndex: target, items: [...state.items, ...placed], lineIndex: 0, pendingAsk: null };
}

/** A written line, plus the picture step it moves on to (if any). */
function lineItems(beatId: string, l: BoardLine): PlacedItem[] {
  const out: PlacedItem[] = [{ key: `${beatId}:L:${l.id}`, beatId, item: { type: 'line', style: l.style ?? 'work', text: l.text } }];
  if (l.picture) out.push({ key: `${beatId}:P:${l.id}`, beatId, item: { type: 'picture', ref: l.picture.ref, step: l.picture.step } });
  return out;
}

/** Lines of the current beat not yet written (0 for a beat without lines). */
export function linesRemaining(state: GuidedBoardState, script: GuidedScript): number {
  const beat = script.beats[state.beatIndex];
  return beat?.lines ? beat.lines.length - state.lineIndex : 0;
}

export type NextLineResult =
  | { action: 'write'; state: GuidedBoardState; line: BoardLine; answered: boolean }
  | { action: 'ask'; state: GuidedBoardState; line: BoardLine }
  | { action: 'done'; state: GuidedBoardState };

/**
 * The next line of a line-by-line beat. A line with a question is asked first (nothing written);
 * the following call writes it, as the answer. Returns 'done' when the beat has no more lines.
 */
export function nextLine(state: GuidedBoardState, script: GuidedScript): NextLineResult {
  const beat = script.beats[state.beatIndex];
  const line = beat?.lines?.[state.lineIndex];
  if (!beat || !line) return { action: 'done', state };
  if (line.ask && state.pendingAsk !== line.id) {
    return { action: 'ask', state: { ...state, pendingAsk: line.id }, line };
  }
  return {
    action: 'write',
    line,
    answered: !!line.ask,
    state: { ...state, items: [...state.items, ...lineItems(beat.id, line)], lineIndex: state.lineIndex + 1, pendingAsk: null },
  };
}

export const MAX_ASIDE_CHARS = 90;

/** The tutor writes one line of its own answer to a side question. */
export function addAside(state: GuidedBoardState, text: string, question?: string): GuidedBoardState {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ASIDE_CHARS);
  if (!clean) return state;
  const q = String(question ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ASIDE_CHARS);
  const beatId = state.beatIndex >= 0 ? (state.items[state.items.length - 1]?.beatId ?? 'aside') : 'aside';
  const item: PlacedItem = { key: `aside:${state.asideCount}`, beatId, item: { type: 'aside', text: clean, ...(q ? { question: q } : {}) } };
  return { ...state, items: [...state.items, item], asideCount: state.asideCount + 1 };
}

/** Write the child's answer into a slot that is on the board. Unknown slots are ignored. */
export function fillSlot(state: GuidedBoardState, slotId: string, text: string): GuidedBoardState {
  const exists = state.items.some((p) => p.item.type === 'slot' && p.item.id === slotId);
  if (!exists) return state;
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_SLOT_ANSWER_CHARS);
  if (!clean) return state;
  return { ...state, filled: { ...state.filled, [slotId]: clean } };
}

export const resetBoard = (): GuidedBoardState => ({ ...EMPTY_GUIDED_BOARD, items: [], filled: {} });

/** The picture the learner should be looking at: the last picture item written so far. */
export function currentPicture(state: GuidedBoardState): { ref: string; step: string | 'all' | undefined } | null {
  for (let i = state.items.length - 1; i >= 0; i--) {
    const it = state.items[i].item;
    if (it.type === 'picture') return { ref: it.ref, step: it.step };
  }
  return null;
}

/**
 * Which newly added items should wait to be revealed one by one: the block items of a beat that
 * has just started (its first item is shown at once). Lines and asides are written one per call
 * already, so they are never held.
 */
export function itemsToStagger(prev: GuidedBoardState, next: GuidedBoardState): string[] {
  if (next.beatIndex === prev.beatIndex) return [];
  const known = new Set(prev.items.map((p) => p.key));
  const fresh = next.items.filter((p) => !known.has(p.key) && p.item.type !== 'line' && p.item.type !== 'aside');
  return fresh.slice(1).map((p) => p.key);
}
