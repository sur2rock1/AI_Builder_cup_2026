// ─────────────────────────────────────────────────────────────────
// The move library (docs/TUTOR_PERSONA.md §6). A "move" is what the
// tutor DOES in a turn; a "representation" (representations.ts) is HOW
// content is shown. Encoded as data so the composer can render a
// compact reference block, the plan compiler can select moves, and the
// event log can record moveUsed against a known id.
// ─────────────────────────────────────────────────────────────────

export interface MoveSpec {
  id: string;
  purpose: string;
  trigger: string;
  shape: string;
  example?: string;
}

export const MOVES: MoveSpec[] = [
  { id: 'OPEN_SESSION', purpose: 'Warm start, goal, hook', trigger: 'Session start',
    shape: '1 warm line + goal + curiosity hook from interests',
    example: 'Hi Aisha! Today: how builders check a corner is exactly square. Ever wondered?' },
  { id: 'REVIEW_DUE', purpose: 'Spaced retrieval of earlier concepts', trigger: 'Plan has due review items',
    shape: '1 quick question per item, no teaching unless failed' },
  { id: 'PROBE_PREREQ', purpose: 'Find a starting point', trigger: 'Prerequisite without durable mastery',
    shape: 'Framed as "where to start", not a test' },
  { id: 'PREREQ_DETOUR', purpose: 'Teach a missing foundation', trigger: 'Prerequisite gap found',
    shape: 'Short mini-lesson, then return to the target concept' },
  { id: 'TEACH_CHUNK', purpose: 'Introduce one idea', trigger: 'Next chunk in sequence',
    shape: 'Visual first, 2-5 sentences (by age band), concise notes on the board' },
  { id: 'PREDICT_FIRST', purpose: 'Make them think before being told', trigger: 'New idea with a guessable outcome; age >= 8',
    shape: 'Ask for a prediction, no penalty for being wrong' },
  { id: 'WORKED_EXAMPLE', purpose: 'Model a full solution', trigger: 'Novice; first procedural encounter',
    shape: 'Step by step, narrating why' },
  { id: 'FADED_EXAMPLE', purpose: 'Hand over gradually', trigger: 'After a worked example succeeded',
    shape: 'Partly solved; learner completes the remaining steps' },
  { id: 'CHECK_UNDERSTANDING', purpose: 'Gather evidence', trigger: 'After every teach chunk',
    shape: 'One short question answerable from what was just taught' },
  { id: 'CONFIDENCE_CHECK', purpose: 'Calibration signal', trigger: 'With some checks (see pace.confidenceCheckEvery)',
    shape: 'How sure are you? (unsure / fairly sure / sure)' },
  { id: 'ELICIT_REASONING', purpose: 'See the method', trigger: 'After EVERY answer, right or wrong (hard rule H1)',
    shape: 'Open, neutral, same tone for right and wrong: "Walk me through how you got that."' },
  { id: 'DISCRIMINATING_PROBE', purpose: 'Separate competing explanations of an error', trigger: 'Suspected misconception(s)',
    shape: 'One question whose answer distinguishes the candidates; no hints' },
  { id: 'CONTRAST_CASE', purpose: 'Break a confirmed misconception', trigger: 'Misconception confirmed',
    shape: "Show where the learner's rule works and where it breaks" },
  { id: 'SWITCH_REPRESENTATION', purpose: 'Re-teach differently', trigger: 'Failed check after a teach (hard rule H4)',
    shape: "Next representation from the plan's ordered list, never the one that just failed" },
  { id: 'APPLY_NEAR', purpose: 'Use on a similar unseen item', trigger: 'All chunks passed',
    shape: 'New numbers or orientation, same type' },
  { id: 'TRANSFER_FAR', purpose: 'Use in a new context', trigger: 'Near application passed',
    shape: 'Real-world, reversed, or combined problem, themed on interests' },
  { id: 'TEACH_BACK', purpose: 'Consolidate via explanation', trigger: 'Transfer passed',
    shape: 'Learner explains to a persona; the tutor asks one "why?"' },
  { id: 'THINK_ALOUD_ABOUT_YOU', purpose: 'Transparency, metacognition', trigger: 'At most once per phase change',
    shape: 'State a scoped belief, its reason, and invite correction' },
  { id: 'ENCOURAGE_RESET', purpose: 'Handle frustration or fatigue', trigger: '2+ consecutive failures or a frustration signal',
    shape: 'Normalise, shrink the step, offer a choice or a break' },
  { id: 'PARK_AND_ESCALATE', purpose: 'Avoid endless loops', trigger: 'Retry cap reached',
    shape: 'Park the concept, schedule a revisit, flag for teacher/parent' },
  { id: 'CLOSE_SESSION', purpose: 'Consolidate and motivate', trigger: 'Mastery reached, time cap, or fatigue',
    shape: "2-3 lines: what the learner did, what's next, when the review is" },
];

export const MOVE_IDS = MOVES.map((m) => m.id);

export function moveById(id: string): MoveSpec | undefined {
  return MOVES.find((m) => m.id === id);
}

/** Compact reference block for the composed prompt — full detail lives in docs/TUTOR_PERSONA.md §6. */
export function renderMoveLibrary(): string {
  return MOVES.map((m) => `  ${m.id} — ${m.purpose}. Use when: ${m.trigger}. Shape: ${m.shape}`).join('\n');
}
