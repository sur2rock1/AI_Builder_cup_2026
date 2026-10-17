// ─────────────────────────────────────────────────────────────────
// Guided session — the server's record of where one lesson has got to.
// One per voice connection, and the ONLY copy of the board that matters:
// after every guided tool call the server sends the browser a snapshot
// (`guided_state`), and the browser just decides when to show it.
//
// It also remembers exactly where the lesson stopped, so after a side
// question the tutor can be sent back to that line (resume_lesson).
// ─────────────────────────────────────────────────────────────────

import type { GuidedScript, GuidedBoardState, Beat } from './types';
import { EMPTY_GUIDED_BOARD } from './types';
import { startBeat, fillSlot, nextLine, addAside, linesRemaining } from './board';
import {
  beatInstruction, finishedInstruction, lineInstruction, askInstruction, asideInstruction, resumeInstruction,
} from './prompt';
import { DEFAULT_PACE, type Pace } from './pace';

export const GUIDED_CALLS = ['advance_beat', 'fill_slot', 'next_line', 'write_aside', 'resume_lesson', 'show_picture', 'skip_to_practice', 'teach_skipped'] as const;
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

/** A stored board picture: its key, a plain title and its step ids. */
export interface PictureInfo { ref: string; title: string; steps: string[] }

export class GuidedSession {
  private board: GuidedBoardState = { ...EMPTY_GUIDED_BOARD, items: [], filled: {} };
  private pictures: PictureInfo[] = [];
  /** beat id -> picture put up with that beat (only for lessons that name no picture themselves). */
  private plan: Record<string, string> = {};
  private planStep: Record<string, number> = {};
  private shownByRequest = 0;
  /** Beats passed over when the learner asked to be tested ("quiz me"): beat id -> first unwritten line. */
  private skipped = new Map<string, number>();
  /** Where the practice question was when the tutor went back to teach a skipped part. */
  private returnTo: { beatIndex: number; lineIndex: number; pendingAsk: string | null } | null = null;
  pace: Pace;
  constructor(readonly script: GuidedScript, pace: Pace = DEFAULT_PACE) { this.pace = pace; }

  get state(): GuidedBoardState { return this.board; }
  get beatIndex(): number { return this.board.beatIndex; }
  get done(): boolean { return this.board.beatIndex >= this.script.beats.length - 1; }

  /**
   * The concept's stored pictures. A lesson that names none of them gets them by teaching stage: the overview with the definition,
   * a focus picture with each show / analogy / method beat, the "friend's idea" picture with the contrast beat. Apply and check beats
   * get none. Lessons that name their own pictures are left as written.
   */
  setPictures(list: PictureInfo[]): void {
    this.pictures = list.filter((p) => p && p.ref && p.steps.length && !p.ref.startsWith('alt:'));
    this.plan = {}; this.planStep = {};
    const scripted = this.script.beats.some((b) => b.board.some((i) => i.type === 'picture') || (b.lines ?? []).some((l) => l.picture));
    if (scripted || !this.pictures.length) return;
    const focus = this.pictures.filter((p) => p.ref.startsWith('focus:'));
    const contrast = this.pictures.filter((p) => p.ref.startsWith('contrast:'));
    const main = this.pictures.find((p) => p.ref === 'main');
    let f = 0, c = 0, usedMain = false;
    for (const b of this.script.beats) {
      if (b.kind === 'define' && main && !usedMain) { this.plan[b.id] = main.ref; usedMain = true; }
      else if ((b.kind === 'show' || b.kind === 'analogy' || b.kind === 'method') && focus[f]) this.plan[b.id] = focus[f++].ref;
      else if (b.kind === 'contrast' && contrast[c]) this.plan[b.id] = contrast[c++].ref;
    }
    if (main && !usedMain) {
      const b = this.script.beats.find((x) => x.kind === 'orient') ?? this.script.beats.find((x) => x.kind === 'show');
      if (b && !this.plan[b.id]) this.plan[b.id] = main.ref;
    }
  }

  /** The pictures the tutor can name with show_picture. */
  pictureList(): PictureInfo[] { return this.pictures; }

  private putPicture(beatId: string, ref: string, step: string | 'all', key: string): void {
    // A beat taught again (after skip_to_practice) puts its picture up a second time: keep keys unique.
    let k = key, n = 1;
    while (this.board.items.some((p) => p.key === k)) k = `${key}:r${n++}`;
    this.board = { ...this.board, items: [...this.board.items, { key: k, beatId, item: { type: 'picture', ref, step } }] };
  }

  /** The beat's planned picture goes up with its first step when the beat starts. */
  private startBeatPicture(beat: Beat): PictureInfo | null {
    const pic = this.pictures.find((p) => p.ref === this.plan[beat.id]);
    if (!pic) return null;
    this.planStep[beat.id] = 0;
    this.putPicture(beat.id, pic.ref, pic.steps[0], `${beat.id}:PP:0`);
    return pic;
  }

  /** As lines are written the picture builds up a step at a time, reaching its last step with the last line. */
  private growBeatPicture(beat: Beat): void {
    const pic = this.pictures.find((p) => p.ref === this.plan[beat.id]);
    const total = beat.lines?.length ?? 0;
    if (!pic || !total) return;
    const idx = Math.min(pic.steps.length - 1, Math.floor((this.board.lineIndex * pic.steps.length) / total));
    if (idx > (this.planStep[beat.id] ?? 0)) { this.planStep[beat.id] = idx; this.putPicture(beat.id, pic.ref, pic.steps[idx], `${beat.id}:PP:${idx}`); }
  }

  /** The learner asks to see something: the best-matching stored picture goes on the board, whole. */
  showPicture(which: string): PictureInfo | null {
    if (!this.pictures.length) return null;
    const q = String(which || '').toLowerCase().replace(/[^a-z0-9: ]/g, ' ').replace(/\s+/g, ' ').trim();
    const stop = new Set(['the', 'show', 'picture', 'diagram', 'please', 'image', 'can', 'you', 'see', 'one', 'and', 'for', 'with', 'this', 'that', 'what']);
    const words = q.split(' ').filter((w) => w.length > 2 && !stop.has(w));
    const score = (p: PictureInfo) => {
      const hay = `${p.ref} ${p.title}`.toLowerCase().replace(/[^a-z0-9: ]/g, ' ');
      if (q && (p.ref.toLowerCase() === q || p.title.toLowerCase() === q)) return 100;
      return words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
    };
    const current = this.board.beatIndex >= 0 ? this.plan[this.script.beats[this.board.beatIndex].id] : undefined;
    const ranked = [...this.pictures].sort((a, b) => score(b) - score(a));
    const pick = score(ranked[0]) > 0 ? ranked[0] : (this.pictures.find((p) => p.ref === current) ?? this.pictures.find((p) => p.ref === 'main') ?? this.pictures[0]);
    const beatId = this.board.beatIndex >= 0 ? this.script.beats[this.board.beatIndex].id : 'show';
    this.putPicture(beatId, pick.ref, 'all', `show:${this.shownByRequest++}`);
    return pick;
  }

  /**
   * The learner asked to be tested ("quiz me", "I already know this"). Jump to the next practice beat (apply / check) without
   * writing the beats in between; remember them, so a missed practice question can send the tutor back to teach one of them.
   */
  skipToPractice(): { ok: boolean; instruction: string; beatId?: string; skippedIds?: string[] } {
    const beats = this.script.beats;
    const cur = this.board.beatIndex;
    const isPractice = (k: string) => k === 'apply' || k === 'check';
    if (cur >= 0 && isPractice(beats[cur].kind)) {
      return { ok: false, instruction: 'You are already on the practice questions. Tell the learner so, warmly, and carry on: call next_line for the next question.' };
    }
    const target = beats.findIndex((b, i) => i > cur && isPractice(b.kind));
    if (target < 0) {
      return { ok: false, instruction: 'This lesson has no practice questions left. Ask the learner one fresh question of your own on what you have taught, wait, use assess_child_reasoning on the answer, then carry on.' };
    }
    if (this.board.pendingAsk) this.board = { ...this.board, pendingAsk: null };
    if (cur >= 0 && linesRemaining(this.board, this.script) > 0) this.skipped.set(beats[cur].id, this.board.lineIndex);
    for (let i = Math.max(cur + 1, 0); i < target; i++) this.skipped.set(beats[i].id, 0);
    const beat = beats[target];
    const placed = beat.board.map((item, n) => ({ key: `${beat.id}:${n}`, beatId: beat.id, item }));
    this.board = { ...this.board, beatIndex: target, items: [...this.board.items, ...placed], lineIndex: 0, pendingAsk: null };
    this.startBeatPicture(beat);
    const skippedIds = [...this.skipped.keys()];
    return {
      ok: true, beatId: beat.id, skippedIds,
      instruction: 'The learner wants to be tested - good, take them at their word. Practice starts now.\n'
        + `Say ONE short, warm sentence (e.g. "Great, let's see what you know!"), then call next_line: it puts up the first practice question.\n`
        + `BACKGROUND (for you only): ${beat.say}\n`
        + 'If they answer well and can say why, praise the reasoning in a sentence and carry on with the next question.\n'
        + 'If they MISS a question (wrong, or right but cannot say why): do not just give the answer and do not scold. Say kindly that this is exactly what the bit we skipped explains, '
        + 'then call teach_skipped with the part that fits best. Teach it briefly and in a friendly way; the lesson then brings you back to the same question.\n'
        + `PARTS SKIPPED FOR NOW: ${this.skippedList()}`,
    };
  }

  private skippedList(): string {
    return [...this.skipped.keys()].map((id) => {
      const b = this.script.beats.find((x) => x.id === id)!;
      const heading = b.board.find((i) => i.type === 'heading') as { text?: string } | undefined;
      return `${id} (${b.kind}${heading?.text ? `: "${heading.text}"` : ''})`;
    }).join(', ') || 'none';
  }

  /** After a missed practice question: teach one skipped part, then advance_beat returns to the question. */
  teachSkipped(beatId?: string): { ok: boolean; instruction: string; beatId?: string } {
    if (!this.skipped.size) {
      return { ok: false, instruction: 'Nothing was skipped. Explain the idea again in a different way (write_aside, or show_picture), then ask the question again.' };
    }
    const id = beatId && this.skipped.has(beatId) ? beatId : [...this.skipped.keys()][0];
    const idx = this.script.beats.findIndex((b) => b.id === id);
    const from = this.skipped.get(id) ?? 0;
    this.skipped.delete(id);
    if (!this.returnTo) this.returnTo = { beatIndex: this.board.beatIndex, lineIndex: this.board.lineIndex, pendingAsk: this.board.pendingAsk };
    const beat = this.script.beats[idx];
    const placed = beat.board.map((item, n) => ({ key: `${beat.id}:${n}`, beatId: beat.id, item })).filter((p) => !this.board.items.some((x) => x.key === p.key));
    this.board = { ...this.board, beatIndex: idx, items: [...this.board.items, ...placed], lineIndex: from, pendingAsk: null };
    this.startBeatPicture(beat);
    return {
      ok: true, beatId: id,
      instruction: 'Going back to teach the part the learner needs. Keep it friendly and short: no "you got it wrong", just "let\'s look at this bit together".\n'
        + beatInstruction(this.script, idx, this.pace)
        + '\nWhen the lines of this part are written and explained, call advance_beat: it takes you back to the practice question they missed.',
    };
  }

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
    // A skipped part has just been taught again: go back to the practice question that was missed.
    if (this.returnTo) {
      const r = this.returnTo;
      this.returnTo = null;
      this.board = { ...this.board, beatIndex: r.beatIndex, lineIndex: r.lineIndex, pendingAsk: r.pendingAsk };
      const beat = this.script.beats[r.beatIndex];
      const pending = r.pendingAsk ? beat.lines?.find((l) => l.id === r.pendingAsk) : null;
      return {
        finished: false, beatId: beat.id,
        instruction: pending?.ask
          ? `Back to practice. Say in one sentence that now we can try that question again, then ask it again in your own words: "${pending.ask.prompt}" - and wait. `
            + 'When they answer: assess_child_reasoning, then next_line writes the answer.'
          : `Back to practice. ${resumeInstruction(this.script, this.board)}`,
      };
    }
    const before = this.board.beatIndex;
    this.board = startBeat(this.board, this.script, requestedId);
    if (this.board.beatIndex === before) {
      return { instruction: finishedInstruction(this.script), finished: true };
    }
    const beat = this.script.beats[this.board.beatIndex];
    const pic = this.startBeatPicture(beat);
    const note = pic ? `\nA PICTURE ("${pic.title}") is on the board beside the chalk and builds up as you write. Point to it while you explain, and ask the learner about it when it asks something.` : '';
    return { instruction: beatInstruction(this.script, this.board.beatIndex, this.pace) + note, finished: false, beatId: beat.id };
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
        const itemsBefore = this.board.items.length;
        this.board = r.state;
        if (r.action === 'ask') {
          return { response: { result: 'ask', instruction: askInstruction(r.line) }, log: `next_line -> ask ${r.line.id}`, changed: this.board.items.length !== itemsBefore };
        }
        budget.lineWritten = true;
        const curBeat = this.script.beats[this.board.beatIndex];
        if (curBeat && !r.line.annotates) this.growBeatPicture(curBeat);
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
      case 'show_picture': {
        const pic = this.showPicture(String(args?.which ?? ''));
        if (!pic) return { response: { result: 'none', instruction: 'There is no prepared picture for this. Explain it in words, or write it line by line with write_aside, then resume_lesson.' }, log: 'show_picture -> none available', changed: false };
        return {
          response: { result: 'shown', instruction: `The picture "${pic.title}" is now on the board beside the chalk. Tell the learner what to look at in it, answer what they asked, check it helped, then call resume_lesson.` },
          log: `show_picture "${args?.which}" -> ${pic.ref}`, changed: true,
        };
      }
      case 'skip_to_practice': {
        const r = this.skipToPractice();
        return { response: { result: r.ok ? 'ok' : 'not_available', instruction: r.instruction }, log: `skip_to_practice -> ${r.ok ? `${r.beatId} (skipped ${r.skippedIds!.join(', ')})` : 'not available'}`, changed: r.ok };
      }
      case 'teach_skipped': {
        const r = this.teachSkipped(typeof args?.beat_id === 'string' ? args.beat_id : undefined);
        return { response: { result: r.ok ? 'ok' : 'not_available', instruction: r.instruction }, log: `teach_skipped -> ${r.ok ? r.beatId : 'nothing skipped'}`, changed: r.ok };
      }
      case 'resume_lesson':
        return { response: { result: 'ok', instruction: resumeInstruction(this.script, this.board) }, log: `resume_lesson -> beat ${this.board.beatIndex + 1}, line ${this.board.lineIndex}${this.board.pendingAsk ? ' (question pending)' : ''}`, changed: false };
      default:
        return { response: { result: 'ignored' }, log: `${name} -> not a guided call`, changed: false };
    }
  }
}
