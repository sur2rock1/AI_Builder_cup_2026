// compilePlanDelta() — docs/TEACHING_PLAN.md §6. In-session, deterministic
// updates after each evidence event: which representation to switch to,
// when to park a concept, when to reset for frustration. Pure function
// over an explicit PlanDeltaState so the caller (session orchestrator)
// owns persistence of that small piece of in-memory state.
import { TeachingStrategy } from '../adaptive/learnerModel';
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
      return { instruction: event.outcome === 'mastered'
        ? 'Method is sound and mastery evidence is strong — move to transfer or the next concept.'
        : 'Method is sound — continue teaching or check the next chunk.', state: next };
    }
    case 'failed_check': {
      const retries = (next.retryCountByConcept[event.conceptId] || 0) + 1;
      next.retryCountByConcept[event.conceptId] = retries;
      next.consecutiveFailures += 1;

      if (retries >= plan.limits.retryCap) {
        return {
          instruction: `Retry cap (${plan.limits.retryCap}) reached on this concept — park it, tell the learner you'll come back tomorrow, and note it for their teacher/parent.`,
          parkConcept: true, escalate: true, state: next,
        };
      }
      if (next.consecutiveFailures >= 2) {
        return {
          instruction: 'Two failures in a row — pause, normalise ("this one is tricky for everyone at first"), offer a smaller step or a short break, then try an easier item.',
          encourageReset: true, state: next,
        };
      }
      const order = plan.representationOrder.map((r) => r.strategy);
      const avoided = new Set(plan.avoidRepresentations.map((a) => a.strategy));
      const idx = order.indexOf(event.representationUsed);
      const nextRep = order.slice(idx + 1).find((r) => !avoided.has(r)) || order.find((r) => r !== event.representationUsed && !avoided.has(r));
      return {
        instruction: nextRep
          ? `Do NOT repeat that explanation. Re-teach with a different representation: ${nextRep.replace(/_/g, ' ')}.`
          : 'Do NOT repeat that explanation — try a different representation than the last one used.',
        nextRepresentation: nextRep, state: next,
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
      return { instruction: 'Frustration or fatigue signal — pause, normalise it, offer a smaller step or a short break.', encourageReset: true, state: next };
    }
    case 'language_error': {
      return { instruction: 'This looks like a language/reading issue, not a concept gap — rephrase with simpler words or a visual. Do not record this as a concept error.', state: next };
    }
    default:
      return { instruction: 'Continue.', state: next };
  }
}
