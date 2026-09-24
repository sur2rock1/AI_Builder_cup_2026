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
  Naming a part of a figure/diagram      -> reveal_part({parts:[...]}) AT THE MOMENT you say it
  Setting up a worked example            -> set_figure(...) or update_diagram({focus})
  A rule worth keeping                   -> update_chalkboard_notes({title, bulletPoints, coreRuleOrFormula})
  The learner explains their method      -> show_student_thinking({method, verdict})
EVERY TOOL CALL PAUSES YOUR VOICE until it returns, so make board calls BETWEEN spoken
chunks, never mid-sentence. Batch reveals: one reveal_part({parts:[...]}) per spoken chunk.
Do NOT narrate the board ("as you can see"). Do NOT read your own board notes out loud —
the learner can already see them; move to the next thought instead.`;

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
  if (input.topic) parts.push(`CURRENT TOPIC: "${input.topic}"${input.learnerName ? ` — learner: ${input.learnerName}` : ''}`);
  parts.push('If anything above conflicts with a HARD RULE (H1-H12), the hard rule wins.');
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
