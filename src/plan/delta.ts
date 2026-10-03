// compilePlanDelta() — docs/TEACHING_PLAN.md §6. In-session, deterministic
// updates after each evidence event: which representation to switch to,
// when to park a concept, when to reset for frustration. Pure function
// over an explicit PlanDeltaState so the caller (session orchestrator)
// owns persistence of that small piece of in-memory state.
import { TeachingStrategy } from '../adaptive/learnerModel';
// type-only: deriveOutcome() only needs the enum's shape, never a runtime
// value from reasoningAssessor.ts — keeping this `import type` means a
// bundler never needs to pull that module (and its @google/genai import)
// in just to build this one.
import type { ReasoningClassification } from '../adaptive/reasoningAssessor';
import { TeachingPlan, PlanDeltaState, PlanDeltaResult } from './types';

export function initialDeltaState(): PlanDeltaState {
  return { retryCountByConcept: {}, consecutiveFailures: 0, consecutiveChecksWithoutTeach: 0, probesUsedByQuestion: {} };
}

export interface DeltaEventInput {
  conceptId: string;
  outcome: 'sound' | 'failed_check' | 'misconception_suspected' | 'misconception_confirmed'
    | 'mastered' | 'frustration_signal' | 'language_error';
  representationUsed: TeachingStrategy;
  questionKey?: string; // groups repeated probes on the same question
  /** Did the learner give any reasoning with this answer? (H1: ask "why" once before re-teaching.) */
  hasReasoning?: boolean;
}

// deriveOutcome() — single source of truth for turning one
// assess_child_reasoning result into a DeltaEventInput['outcome'], used by
// BOTH channels (server.ts's voice WS handler and
// server/routes/tutor.ts's text handler). Previously each channel had its
// own copy of this branching, and the copies silently drifted: neither
// branched on classification === 'misconception_behind_correct' directly,
// only on candidateMisconceptions.length, so a real "answer looks right,
// reasoning isn't" diagnosis with no catalogued misconception id (a normal
// case — reasoningAssessor.ts's candidateMisconceptionIds are filtered to
// only ids already in that concept's catalogue) silently fell through to
// 'sound' — see docs/DECISIONS.md D-2026-09-28-4 for the bug this fixed,
// and D-2026-09-28-5 for this extraction. tests/plan-delta-outcome.test.mjs
// asserts every classification x candidateMisconceptions x newlyConfirmed
// combination this function can be called with, specifically so a future
// gap like that one is caught by a fast, offline, pure-function test
// instead of found again by hand.
export function deriveOutcome(input: {
  classification: ReasoningClassification;
  candidateMisconceptionsCount: number;
  newlyConfirmedCount: number;
}): 'sound' | 'failed_check' | 'misconception_suspected' | 'misconception_confirmed' {
  if (input.candidateMisconceptionsCount > 0) {
    return input.newlyConfirmedCount > 0 ? 'misconception_confirmed' : 'misconception_suspected';
  }
  // No catalogued misconception id was matched. The diagnostician's own
  // classification is still authoritative here — do not silently treat an
  // uncatalogued misconception as "no misconception at all".
  if (input.classification === 'misconception_behind_correct') return 'misconception_suspected';
  if (input.classification === 'wrong_answer' || input.classification === 'needs_clarification') return 'failed_check';
  // clear_reasoning and no_reasoning_given both fall through to 'sound'
  // here — this is PRE-EXISTING behaviour, carried over unchanged from
  // both channels' original (duplicated) logic. no_reasoning_given as
  // 'sound' specifically was not verified as correct in this pass (it was
  // out of scope for the bug that was actually found and fixed) — flagged
  // as an open question in docs/PROJECT_STATE.md rather than changed on
  // assumption.
  return 'sound';
}

export function compilePlanDelta(
  plan: TeachingPlan,
  state: PlanDeltaState,
  event: DeltaEventInput,
): PlanDeltaResult {
  const next: PlanDeltaState = {
    retryCountByConcept: { ...state.retryCountByConcept },
    consecutiveFailures: state.consecutiveFailures,
    consecutiveChecksWithoutTeach: state.consecutiveChecksWithoutTeach,
    probesUsedByQuestion: { ...state.probesUsedByQuestion },
  };

  switch (event.outcome) {
    case 'sound':
    case 'mastered': {
      next.consecutiveFailures = 0;
      // A success clears the concept's miss streak. Retries used to be a
      // per-session running total that never reset, so three scattered misses
      // (with correct answers in between) hit the cap — see DECISIONS.md
      // D-2026-09-30-9.
      next.retryCountByConcept[event.conceptId] = 0;
      return { instruction: event.outcome === 'mastered'
        ? 'Method is sound and mastery evidence is strong — move to transfer or the next concept.'
        : 'Method is sound — continue teaching or check the next chunk.', state: next };
    }
    case 'failed_check': {
      const retries = (next.retryCountByConcept[event.conceptId] || 0) + 1;
      next.retryCountByConcept[event.conceptId] = retries;
      next.consecutiveFailures += 1;

      const order = plan.representationOrder.map((r) => r.strategy);
      const avoided = new Set(plan.avoidRepresentations.map((a) => a.strategy));
      const idx = order.indexOf(event.representationUsed);
      const nextRep = order.slice(idx + 1).find((r) => !avoided.has(r)) || order.find((r) => r !== event.representationUsed && !avoided.has(r));
      const repText = nextRep ? nextRep.replace(/_/g, ' ') : 'a different representation than the last one used';

      // The tutor NEVER stops, parks, defers or hands off. Every branch below
      // ends with the tutor teaching. (Previously the retry cap told the tutor
      // to "park it, tell the learner you'll come back tomorrow, and note it
      // for their teacher/parent" — D-2026-09-30-9.)
      if (retries >= plan.limits.retryCap) {
        return {
          instruction: `Several misses in a row on this idea, so questioning is not working — TEACH it directly now. Do not ask another question until you have explained. Use ${repText}: a fully worked example of a PARALLEL problem, one small step at a time, using the board, saying the reasoning aloud. Then ask ONE much smaller question that covers only the first step. Stay warm and matter-of-fact. Do NOT end or pause the session, do NOT say you will come back later, and do NOT mention teachers or parents.`,
          nextRepresentation: nextRep, teachDirectly: true, state: next,
        };
      }
      if (next.consecutiveFailures >= 2) {
        return {
          instruction: `Two misses in a row — the last approach is not landing. Normalise it briefly ("this one is tricky at first"), then STOP asking questions and TEACH: explain the idea again using ${repText}, with a worked example on the board. Only after that ask one smaller question. Do NOT repeat the earlier explanation, do NOT just re-ask with new numbers, and do NOT pause or defer.`,
          nextRepresentation: nextRep, teachDirectly: true, encourageReset: true, state: next,
        };
      }
      if (!event.hasReasoning) {
        // TUTOR_PERSONA H1 / ELICIT_REASONING: find out WHY before re-teaching.
        return {
          instruction: `That answer is not right, but do not tell them so yet and do NOT ask a new question. Ask, warmly and neutrally, how they got it — e.g. "Walk me through how you got that." Then wait for their answer. After they explain (or say they are not sure), you will explain the idea a different way.`,
          nextRepresentation: nextRep, state: next,
        };
      }
      return {
        instruction: `They have now told you their thinking. Name, kindly, the one step in THEIR reasoning that goes off track (evaluate the method, never the person), then EXPLAIN the idea using ${repText} with a short worked example — do NOT repeat the earlier explanation and do NOT just ask another question with new numbers. Only after explaining, ask one fresh check question and wait.`,
        nextRepresentation: nextRep, teachDirectly: true, state: next,
      };
    }
    case 'misconception_suspected': {
      const key = event.questionKey || event.conceptId;
      const used = (next.probesUsedByQuestion[key] || 0) + 1;
      next.probesUsedByQuestion[key] = used;
      if (used > plan.limits.probeBudget) {
        return { instruction: 'Probe budget used up for this question — stop probing and teach with a new representation instead.', state: next };
      }
      return { instruction: 'A misconception is suspected but not yet confirmed — ask ONE discriminating probe. No hints, no answer, then silence.', state: next };
    }
    case 'misconception_confirmed': {
      return { instruction: 'Misconception CONFIRMED. Use a contrast case: show where their rule works and where it breaks. Then re-test with a transfer item, never the same question again.', state: next };
    }
    case 'frustration_signal': {
      next.consecutiveFailures = 0;
      return { instruction: 'Frustration or fatigue signal — normalise it and shrink the step, then keep teaching with a simpler example. Offer a short break only if the learner asks for one.', encourageReset: true, state: next };
    }
    case 'language_error': {
      return { instruction: 'This looks like a language/reading issue, not a concept gap — rephrase with simpler words or a visual. Do not record this as a concept error.', state: next };
    }
    default:
      return { instruction: 'Continue.', state: next };
  }
}
