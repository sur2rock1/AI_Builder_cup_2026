// ─────────────────────────────────────────────────────────────────
// Guided session — the server's record of where one lesson has got to.
// One per voice connection, and the ONLY copy of the board that matters:
// after every guided tool call the server sends the browser a snapshot
// (`guided_state`), and the browser just decides when to show it.
//
// It also remembers exactly where the lesson stopped, so after a side
// question the tutor can be sent back to that line (resume_lesson).
// ─────────────────────────────────────────────────────────────────

import type { GuidedScript, GuidedBoardState } from './types';
import { EMPTY_GUIDED_BOARD } from './types';
import { startBeat, fillSlot, nextLine, addAside, linesRemaining } from './board';
import {
  beatInstruction, finishedInstruction, lineInstruction, askInstruction, asideInstruction, resumeInstruction,
} from './prompt';
import { DEFAULT_PACE, type Pace } from './pace';

export const GUIDED_CALLS = ['advance_beat', 'fill_slot', 'next_line', 'write_aside', 'resume_lesson'] as const;
export const isGuidedCall = (name: string): boolean => (GUIDED_CALLS as readonly string[]).includes(name);

/** Per Live message: only one board line may be written per message, so lines never arrive in a heap. */
export interface CallBudget { lineWritten: boolean }

export interface GuidedReply {
  /** Sent back to the voice model as the tool response. */
  response: Record<string, unknown>;
  /** One-line summary for the server log. */
  log: string;
  /** Whether the board changed (send the browser a snapshot). */
  changed: boolean;
}

export class GuidedSession {
  private board: GuidedBoardState = { ...EMPTY_GUIDED_BOARD, items: [], filled: {} };
  pace: Pace;
  constructor(readonly script: GuidedScript, pace: Pace = DEFAULT_PACE) { this.pace = pace; }

  get state(): GuidedBoardState { return this.board; }
  get beatIndex(): number { return this.board.beatIndex; }
  get done(): boolean { return this.board.beatIndex >= this.script.beats.length - 1; }

  /** The learner changed the pace: applies from the next beat or line. */
  setPace(p: Pace): void { this.pace = p; }

  /** Handle advance_beat: what to tell the tutor. */
  advance(requestedId?: string | null): { instruction: string; finished: boolean; beatId?: string; refused?: boolean } {
    const left = linesRemaining(this.board, this.script);
    if (left > 0 || this.board.pendingAsk) {
      return {
        refused: true,
        finished: false,
        instruction: this.board.pendingAsk
          ? 'Not yet: your question is still waiting for the learner. Ask it again if needed and wait; then next_line writes the answer.'
          : `Not yet: ${left} line${left === 1 ? '' : 's'} of this beat ${left === 1 ? 'is' : 'are'} still unwritten. Call next_line.`,
      };
    }
    const before = this.board.beatIndex;
    this.board = startBeat(this.board, this.script, requestedId);
    if (this.board.beatIndex === before) {
      return { instruction: finishedInstruction(this.script), finished: true };
    }
    const beat = this.script.beats[this.board.beatIndex];
    return { instruction: beatInstruction(this.script, this.board.beatIndex, this.pace), finished: false, beatId: beat.id };
  }

  /** Handle fill_slot. */
  fill(slotId: string, text: string): { ok: boolean } {
    const next = fillSlot(this.board, slotId, text);
    const ok = next !== this.board;
    this.board = next;
    return { ok };
  }

  /** Dispatch any guided tool call. */
  handle(name: string, args: Record<string, any>, budget: CallBudget = { lineWritten: false }): GuidedReply {
    switch (name) {
      case 'advance_beat': {
        const step = this.advance(typeof args?.beat_id === 'string' ? args.beat_id : undefined);
        return {
          response: { result: step.refused ? 'not_yet' : 'ok', instruction: step.instruction },
          log: `advance_beat -> ${step.refused ? 'refused (lines or question pending)' : step.finished ? 'finished' : step.beatId}`,
          changed: !step.refused && !step.finished,
        };
      }
      case 'fill_slot': {
        const filled = this.fill(String(args?.slot_id || ''), String(args?.text || ''));
        return {
          response: filled.ok ? { result: 'ok' } : { result: 'ignored', instruction: 'That blank is not on the board yet. Carry on with the lesson.' },
          log: `fill_slot ${args?.slot_id} -> ${filled.ok ? 'ok' : 'ignored'}`,
          changed: filled.ok,
        };
      }
      case 'next_line': {
        if (budget.lineWritten) {
          return { response: { result: 'not_yet', instruction: 'One line at a time: say the line just written first, then call next_line.' }, log: 'next_line -> refused (second in one turn)', changed: false };
        }
        const r = nextLine(this.board, this.script);
        if (r.action === 'done') {
          const beat = this.script.beats[this.board.beatIndex];
          return {
            response: { result: 'done', instruction: beat?.lines ? 'All lines of this beat are written. Call advance_beat.' : 'This beat is not written line by line. Talk it through, then call advance_beat.' },
            log: 'next_line -> done', changed: false,
          };
        }
        this.board = r.state;
        if (r.action === 'ask') {
          return { response: { result: 'ask', instruction: askInstruction(r.line) }, log: `next_line -> ask ${r.line.id}`, changed: false };
        }
        budget.lineWritten = true;
        const left = linesRemaining(this.board, this.script);
        return {
          response: { result: 'written', instruction: lineInstruction(r.line, r.answered, left, this.pace) },
          log: `next_line -> wrote ${r.line.id}${r.answered ? ' (answer)' : ''}`, changed: true,
        };
      }
      case 'write_aside': {
        if (budget.lineWritten) {
          return { response: { result: 'not_yet', instruction: 'One line at a time: say the line just written first, then call write_aside again.' }, log: 'write_aside -> refused (second in one turn)', changed: false };
        }
        const next = addAside(this.board, String(args?.text ?? ''), typeof args?.question === 'string' ? args.question : undefined);
        if (next === this.board) return { response: { result: 'ignored', instruction: 'Nothing to write. Answer in words, then resume_lesson.' }, log: 'write_aside -> empty', changed: false };
        this.board = next;
        budget.lineWritten = true;
        return { response: { result: 'written', instruction: asideInstruction() }, log: `write_aside -> "${String(args?.text ?? '').slice(0, 60)}"`, changed: true };
      }
      case 'resume_lesson':
        return { response: { result: 'ok', instruction: resumeInstruction(this.script, this.board) }, log: `resume_lesson -> beat ${this.board.beatIndex + 1}, line ${this.board.lineIndex}${this.board.pendingAsk ? ' (question pending)' : ''}`, changed: false };
      default:
        return { response: { result: 'ignored' }, log: `${name} -> not a guided call`, changed: false };
    }
  }
}
