// ─────────────────────────────────────────────────────────────────
// composeSystemInstruction() — the ONE persona composer (T06), replacing
// the three divergent prompts that used to exist (the inline prompt in
// server.ts, and classicSystemInstruction/adaptiveSystemInstruction in
// src/live/liveConfig.ts). Order follows docs/TEACHING_PLAN.md §5:
//   identity -> hard rules -> session arc -> moves -> error policy ->
//   language rules -> transparency -> surface (age band, subject mode) ->
//   channel constraints -> board/tool rules (voice only) -> academic
//   integrity -> safety -> plan block -> curriculum context ->
//   "hard rule wins" reminder.
// ─────────────────────────────────────────────────────────────────
import { AgeBand } from '../adaptive/learnerModel';
import { PERSONA_VERSION } from './config';
import { renderIdentity, SESSION_ARC_BLOCK, LANGUAGE_RULES_BLOCK, TRANSPARENCY_BLOCK } from './core';
import { HARD_RULES_BLOCK, ACADEMIC_INTEGRITY_BLOCK, SAFETY_BLOCK } from './safety';
import { renderMoveLibrary } from './moves';
import { renderErrorPolicy, CONFIDENCE_POLICY_BLOCK } from './diagnosisPolicy';
import { renderAgeBandSurface } from './ageBands';
import { SubjectMode, renderSubjectModeSurface } from './subjectModes';
import { Channel, renderChannelSurface } from './channels';

export const DEFAULT_PERSONA_NAME = process.env.PERSONA_NAME || 'Dr. Marcus Vance'; // OQ-1, docs/TUTOR_PERSONA.md §2

const VOICE_BOARD_BLOCK = `THE BOARD (voice channel)
One idea on the board at a time. It follows your voice — you say it, then it appears.
The Shape view holds a picture drawn for this concept as a sequence of STEPS (listed under
THE BOARD PICTURES below when one is prepared). It starts almost empty and you build it up.
  Starting the next step of the picture  -> reveal_part({parts:["<step name>"]}) AT THE MOMENT you start it
  Pointing at one part of the picture    -> reveal_part({parts:["<its name>"]}) or highlight_concept
  A misconception is suspected/confirmed -> update_diagram({focus:"contrast:<id>"}) — its prepared contrast case
  Moving on to application               -> update_diagram({focus:"apply"}) — the situation, never the answer
  Something else worth drawing           -> update_diagram({focus:"<what you are explaining>"})
  Setting up a right-triangle example    -> set_figure(...)
  A rule worth keeping                   -> update_chalkboard_notes({title, bulletPoints, coreRuleOrFormula})
  The learner explains their method      -> show_student_thinking({method, verdict})
EVERY TOOL CALL PAUSES YOUR VOICE until it returns, so make board calls BETWEEN spoken
chunks, never mid-sentence. One reveal_part per step, not per word.
Do NOT narrate the board ("as you can see"). Do NOT read captions or board notes out loud —
the learner can already see them; say the idea in your own words and move on.`;

export interface ComposeInput {
  ageBand: AgeBand;
  subjectMode: SubjectMode;
  channel: Channel;
  personaName?: string;
  learnerName?: string;
  /** Rendered by src/plan/render.ts (TEACHING_PLAN.md §5). Omitted on a cold start
   * before the plan compiler has run. */
  planBlock?: string;
  /** From src/curriculum/curriculumIntelligence.ts — scope, prerequisites, misconceptions. */
  curriculumContext?: string;
  /** From src/visual/tutorBrief.ts boardContextBlock() — the prepared board pictures and their steps. */
  boardContext?: string;
  topic?: string;
}

export function composeSystemInstruction(input: ComposeInput): string {
  const name = input.personaName || DEFAULT_PERSONA_NAME;
  const parts: string[] = [
    `[persona v${PERSONA_VERSION}]`,
    renderIdentity({ name }),
    HARD_RULES_BLOCK,
    SESSION_ARC_BLOCK,
    `YOUR MOVE LIBRARY — pick one move per turn; log which one you used in your own reasoning.\n${renderMoveLibrary()}`,
    `WHEN AN ANSWER COMES BACK WRONG OR SUSPICIOUS, respond by its class:\n${renderErrorPolicy()}`,
    CONFIDENCE_POLICY_BLOCK,
    LANGUAGE_RULES_BLOCK,
    TRANSPARENCY_BLOCK,
    renderAgeBandSurface(input.ageBand),
    renderSubjectModeSurface(input.subjectMode),
    renderChannelSurface(input.channel),
  ];
  if (input.channel === 'voice') parts.push(VOICE_BOARD_BLOCK);
  parts.push(ACADEMIC_INTEGRITY_BLOCK, SAFETY_BLOCK);
  if (input.planBlock) parts.push(input.planBlock);
  if (input.curriculumContext) parts.push(input.curriculumContext);
  if (input.boardContext && input.channel === 'voice') parts.push(input.boardContext);
  if (input.topic) parts.push(`CURRENT TOPIC: "${input.topic}"${input.learnerName ? ` — learner: ${input.learnerName}` : ''}`);
  parts.push('If anything above conflicts with a HARD RULE (H1-H13), the hard rule wins.');
  return parts.join('\n\n');
}

/** Kickoff message for the Live API's first turn (mirrors the old adaptiveKickoff). */
export function composeKickoff(topic: string, hasPlan: boolean): string {
  const reviewLine = hasPlan
    ? 'If your plan lists due reviews, ask those first (briefly, no teaching unless one fails), then move on.'
    : '';
  return `The learner has just joined a one-to-one session on "${topic}". Follow the SESSION ARC exactly:
one warm sentence of hello, then start TEACHING straight away (or probe at most 3
prerequisites first if your plan calls for it). ${reviewLine}
Do not ask the learner anything that tests knowledge until you have taught the idea first.
Do not ask what they want to learn — you are the driver of this lesson.`;
}
