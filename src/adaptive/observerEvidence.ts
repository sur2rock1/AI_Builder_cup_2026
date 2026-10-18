// ─────────────────────────────────────────────────────────────────
// Live observer → learner model.
//
// The live observer (liveObserver.ts) judges every exchange of a voice lesson from the transcript, but its picture
// used to reach the browser only. The learner model was updated only when the voice model chose to call
// assess_child_reasoning, which in guided lessons happened for roughly 1 in 9 child answers (logs, 2026-10-17).
// So a whole lesson could leave no trace in the profile, the parent view or the next lesson's plan.
//
// This turns a fresh observer snapshot into ONE evidence record for recordReasoningEvidence, with the same
// conservative rules as the rest of the learner model:
//   - only when the child said something substantive that is new (an evidence quote, or a newly shown mix-up);
//   - never twice for the same quote; skipped when assess_child_reasoning already recorded this exchange;
//   - a mix-up starts "suspected" in the ledger; it is counted as an independent second observation (promptType
//     "probe") only when the observer saw it again in a later exchange, so one ambiguous answer never confirms it;
//   - "transfer" (which can clear standing mix-ups) only when the observer judged the child used the idea in a new
//     situation.
// Pure and synchronous: tested in tests/cloud/live-learning-journey.mjs.
// ─────────────────────────────────────────────────────────────────
import type { LearnerSnapshot, Level } from './liveObserver';
import type { UnderstandingDepth } from './learnerModel';

export interface ObserverMemory {
  lastEvidence: string;
  /** misconception id → the evidence quote last recorded for it in this session */
  misconceptionEvidence: Record<string, string>;
  recorded: number;
}

export function newObserverMemory(): ObserverMemory {
  return { lastEvidence: '', misconceptionEvidence: {}, recorded: 0 };
}

export interface ObserverEvidence {
  promptType: 'check' | 'probe' | 'transfer';
  classification: string;
  understandingDepth: UnderstandingDepth;
  confidence: 'high' | 'medium' | 'low';
  candidateMisconceptions: { id: string; text: string }[];
  questionAsked: string;
  childAnswer: string;
  childReasoning: string;
  /** what the observer noticed, for logs */
  noticed: string;
}

const LEVEL_TO_DEPTH: Record<Level, UnderstandingDepth | null> = {
  not_yet_seen: null,
  recognises: 'recognised',
  explains: 'understood',
  applies: 'applied',
  transfers: 'transferred',
};

const GUESS = /\b(i (just )?guess(ed)?|just guessing|random(ly)? (picked|chose))\b/i;
const CONFUSED = /\b(i (don'?t|do not) (really )?(understand|get|know)|confus(ed|ing)|no idea|makes? no sense|lost me)\b/i;

const norm = (s: string) => String(s || '').replace(/\s+/g, ' ').trim();

/** Returns the evidence to record for this snapshot, or null when it adds nothing new. Does not mutate memory. */
export function evidenceFromSnapshot(
  snap: LearnerSnapshot,
  memory: ObserverMemory,
  exchange: { tutor: string; child: string },
): ObserverEvidence | null {
  const quote = norm(snap.evidence);
  const childSaid = norm(exchange.child);
  const newMis = (snap.misconceptions || []).filter(
    (m) => m.status !== 'resolved' && norm(m.evidence) && memory.misconceptionEvidence[m.id] !== norm(m.evidence),
  );
  if (!quote && !newMis.length) return null;
  if (quote && quote === memory.lastEvidence && !newMis.length) return null;

  const words = `${quote} ${childSaid}`;
  let depth: UnderstandingDepth | null;
  if (GUESS.test(words)) depth = 'guessed';
  else if (CONFUSED.test(words)) depth = 'confused';
  else if (newMis.length && snap.understanding < 50) depth = 'incorrect';
  else depth = LEVEL_TO_DEPTH[snap.level] ?? (newMis.length ? 'incorrect' : null);
  if (!depth) return null;

  const sound = depth === 'understood' || depth === 'applied' || depth === 'transferred';
  const classification = newMis.length
    ? (sound || depth === 'recognised' ? 'misconception_behind_correct' : 'wrong_answer')
    : sound ? 'clear_reasoning'
      : depth === 'recognised' ? 'no_reasoning_given'
        : depth === 'incorrect' ? 'wrong_answer'
          : 'needs_clarification';

  // A mix-up the observer saw again (its own rule: "confirmed" needs an earlier suspicion) that we already recorded
  // once this session counts as an independent second observation.
  const seenAgain = newMis.some((m) => m.status === 'confirmed' && memory.misconceptionEvidence[m.id] !== undefined);
  const promptType: ObserverEvidence['promptType'] = seenAgain ? 'probe' : depth === 'transferred' && !newMis.length ? 'transfer' : 'check';

  return {
    promptType,
    classification,
    understandingDepth: depth,
    confidence: quote ? 'medium' : 'low',
    candidateMisconceptions: newMis.map((m) => ({ id: `live::${m.id}`, text: m.text })),
    questionAsked: norm(exchange.tutor).slice(-300),
    childAnswer: (quote || childSaid).slice(0, 300),
    childReasoning: quote.slice(0, 300),
    noticed: norm(snap.noticed).slice(0, 200),
  };
}

/** Call after the evidence was recorded. */
export function rememberRecorded(memory: ObserverMemory, snap: LearnerSnapshot): ObserverMemory {
  const misconceptionEvidence = { ...memory.misconceptionEvidence };
  for (const m of snap.misconceptions || []) if (m.status !== 'resolved' && norm(m.evidence)) misconceptionEvidence[m.id] = norm(m.evidence);
  return { lastEvidence: norm(snap.evidence) || memory.lastEvidence, misconceptionEvidence, recorded: memory.recorded + 1 };
}
