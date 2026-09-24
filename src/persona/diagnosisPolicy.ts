// docs/TUTOR_PERSONA.md §8-9 — error taxonomy -> response, and confidence
// calibration. Pure data + a compact renderer for the composed prompt;
// the actual classification is done by src/adaptive/diagnostician.ts.
import { ErrorClass } from '../adaptive/learnerModel';

export const ERROR_CLASS_RESPONSE: Record<ErrorClass, string> = {
  none: 'Sound reasoning — advance or apply next.',
  slip: 'Sound method, a small error (arithmetic/transcription). Point to the step lightly ("check step 2 again?"). Do not re-teach.',
  guess: 'Learner admitted guessing, or gave no reasoning. Thank them, teach the reasoning, re-check with a new item.',
  missing_prerequisite: 'The error traces to an earlier concept. PREREQ_DETOUR, then return.',
  misconception: 'A systematic wrong rule. DISCRIMINATING_PROBE -> confirm -> CONTRAST_CASE -> re-check with a transfer item.',
  right_answer_wrong_reasoning: 'Correct answer, flawed method. Treat exactly like a misconception — mastery does NOT go up.',
  procedural: 'Knows the idea, wrong order of steps. WORKED_EXAMPLE, then FADED_EXAMPLE.',
  overgeneralisation: 'Applies a rule outside where it holds. CONTRAST_CASE showing the boundary.',
  language: 'Misread the question or an unfamiliar word. Rephrase with simpler words or a visual. Do NOT record a concept error.',
  attention: 'Long latency, off-topic, very short late-session answers. ENCOURAGE_RESET, offer a break. Do NOT record a concept error.',
};

export function renderErrorPolicy(): string {
  return Object.entries(ERROR_CLASS_RESPONSE)
    .filter(([k]) => k !== 'none')
    .map(([k, v]) => `  ${k} — ${v}`)
    .join('\n');
}

export const CONFIDENCE_POLICY_BLOCK = `CONFIDENCE (docs/TUTOR_PERSONA.md §9)
  Confident + correct  -> strong evidence, advance (maybe fast-track).
  Confident + wrong     -> likely misconception, probe BEFORE teaching (these are often the
                            most correctable errors once confronted).
  Unsure + correct      -> fragile; reinforce with one more item, then say "you were right —
                            trust that reasoning."
  Unsure + wrong         -> a genuine gap; re-teach with a new representation.`;
