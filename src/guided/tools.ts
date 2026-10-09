// ─────────────────────────────────────────────────────────────────
// Guided mode — the tools the voice tutor gets.
//
// Guided mode swaps the standard board tools (notes, diagrams, figures,
// photos, quizzes) for its own: advance_beat, next_line, fill_slot,
// write_aside and resume_lesson. It keeps the two diagnostic tools so the
// existing assessment loop still runs.
// The standard tool list in liveConfig.ts is not touched.
// ─────────────────────────────────────────────────────────────────

import { Type } from '@google/genai';
import { ALL_TOOLS } from '../live/liveConfig';

export const GUIDED_ONLY_TOOLS: any[] = [
  {
    name: 'advance_beat',
    description:
      'Starts the next beat of the prepared lesson. Returns what the beat adds to the board and what to do. Call it BEFORE you speak about the beat, never mid-sentence, never while a question is unanswered or lines are still unwritten.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        beat_id: { type: Type.STRING, description: 'Optional. Leave empty to start the next beat in order.' },
      },
    },
  },
  {
    name: 'next_line',
    description:
      'Writes the NEXT line of a line-by-line beat on the board and tells you what to say for it. Call once, say the line aloud and explain it, then call again. '
      + 'If it returns "ask", nothing is written: ask the question and wait; after the learner answers, call next_line to write the answer.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'fill_slot',
    description:
      'Writes the learner\'s own answer into a blank on the board, in their words, once the idea is settled. Keep it short.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        slot_id: { type: Type.STRING, description: 'The blank to fill, as given in the beat instruction.' },
        text:    { type: Type.STRING, description: "The learner's answer, short, in their own words." },
      },
      required: ['slot_id', 'text'],
    },
  },
  {
    name: 'write_aside',
    description:
      'When the learner asks something outside the current line, writes ONE line of your answer on the board as a side note. '
      + 'Pass their question (short) with the first line only. Call once per line and say each line as it appears. When done, call resume_lesson.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text:     { type: Type.STRING, description: 'One short board line (max 90 characters): a step, a formula, a worked line or a key fact.' },
        question: { type: Type.STRING, description: "First line only: the learner's question, in a few words." },
      },
      required: ['text'],
    },
  },
  {
    name: 'resume_lesson',
    description:
      'After answering a side question, returns exactly where the lesson stopped (beat, last line written, any question still waiting) so you can carry on from there.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

/** Standard tools guided mode keeps. */
const KEPT = ['assess_child_reasoning', 'record_confusion_signal'];

export function guidedToolDeclarations(): any[] {
  return [...ALL_TOOLS.filter((t) => KEPT.includes(t.name)), ...GUIDED_ONLY_TOOLS];
}

export const GUIDED_TOOL_NAMES = GUIDED_ONLY_TOOLS.map((t) => t.name);
