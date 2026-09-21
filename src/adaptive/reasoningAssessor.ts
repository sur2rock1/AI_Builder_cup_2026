// ─────────────────────────────────────────────────────────────────
// Reasoning Assessor — the live-voice diagnostic path.
//
// assessmentEngine.ts scores a CLICKED QUIZ OPTION.
// This scores what the child actually SAID, which is the only place a
// misconception is visible.
//
// Architecture follows the published Detect → Verify → Escalate pipeline
// for hidden-misconception detection, with four outcome categories:
//   clear_reasoning              — right answer, sound method
//   needs_clarification          — right answer, method not articulated
//   misconception_behind_correct — right answer, BROKEN method  ← the trap
//   wrong_answer                 — wrong answer
//
// Two deliberate constraints, both there to control false positives
// (published false-alarm rates run ~4:1 to 8:1 against true detections
// at realistic prevalence):
//   1. Misconceptions are drawn from a CLOSED, per-concept vocabulary.
//      The model selects an id; it cannot invent free-text labels that
//      drift and cannot be evaluated.
//   2. A single observation only ever yields SUSPECTED. Promotion to
//      CONFIRMED requires a discriminating probe plus a second
//      independent observation (enforced in learnerStore).
// ─────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import {
  CurriculumConcept, ConceptState, TeachingStrategy, UnderstandingDepth,
} from './learnerModel';
import { STRATEGY_DESCRIPTIONS } from './assessmentEngine';

const REASONING_MODEL_CANDIDATES = ['gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

// Resolved once per server process. A wrong model ID used to cost a failed
// round-trip on EVERY answer the child gave; now it costs one, once.
let resolvedModel: string | null = null;
const failedModels = new Set<string>();
const noThinkingConfig = new Set<string>();

export type ReasoningClassification =
  | 'clear_reasoning'
  | 'needs_clarification'
  | 'misconception_behind_correct'
  | 'wrong_answer'
  | 'no_reasoning_given';

export interface MisconceptionEntry {
  id: string;
  text: string;
}

/**
 * Closed vocabulary for a concept. Ids are stable and derived from position,
 * so they survive rewording of the description text.
 */
export function misconceptionCatalog(concept: CurriculumConcept): MisconceptionEntry[] {
  return concept.commonMisconceptions.map((text, i) => ({
    id: `${concept.id}::m${i + 1}`,
    text,
  }));
}

export function misconceptionText(concept: CurriculumConcept, id: string): string | undefined {
  return misconceptionCatalog(concept).find(m => m.id === id)?.text;
}

export interface ReasoningAssessment {
  classification: ReasoningClassification;
  understandingDepth: UnderstandingDepth;
  /** Ids from the closed catalogue. Empty when nothing is suspected. */
  candidateMisconceptionIds: string[];
  confidence: 'high' | 'medium' | 'low';
  /** The child's method, restated in their own terms, for the board. */
  reasoningSummary: string;
  /** Which specific step went wrong, if any — drawn on the figure. */
  faultyStep?: string;
  /** True when the next tutor turn must be a probe, not an explanation. */
  shouldProbe: boolean;
  /** A question whose answer SEPARATES the candidate misconceptions. */
  probeQuestion?: string;
  probeRationale?: string;
  nextStrategy: TeachingStrategy;
  /** One imperative line handed straight back to the voice model. */
  tutorGuidance: string;
}

export interface ReasoningInput {
  concept: CurriculumConcept;
  conceptState: ConceptState | null;
  questionAsked: string;
  childAnswer: string;
  childReasoning: string;
  expectedAnswer?: string;
  currentStrategy: TeachingStrategy;
  apiKey: string;
}

function buildPrompt(input: ReasoningInput): string {
  const { concept, conceptState, questionAsked, childAnswer, childReasoning, expectedAnswer, currentStrategy } = input;
  const catalog = misconceptionCatalog(concept);
  const catalogText = catalog.map(m => `  ${m.id} — ${m.text}`).join('\n');
  const alreadySuspected = conceptState?.suspectedMisconceptions.join('; ') || 'none';
  const alreadyConfirmed = conceptState?.confirmedMisconceptions.join('; ') || 'none';
  const ineffective = conceptState?.ineffectiveStrategies.join(', ') || 'none';

  return `You are a diagnostic assessor for a 13-year-old's mathematics tutor. You are NOT the tutor. You do not talk to the child. You analyse one exchange and return JSON.

CONCEPT: ${concept.label} (difficulty ${concept.difficultyLevel}/5)
KEY FACTS:
${concept.keyFacts.map(f => `  - ${f}`).join('\n')}

THE EXCHANGE
  Tutor asked:        "${questionAsked}"
  Expected answer:    "${expectedAnswer || '(open-ended — judge on the reasoning)'}"
  Child answered:     "${childAnswer}"
  Child's reasoning:  "${childReasoning || '(the child gave no reasoning)'}"

CLOSED MISCONCEPTION CATALOGUE for this concept — you may ONLY select ids from this list:
${catalogText}

LEARNER HISTORY
  Already suspected: ${alreadySuspected}
  Already confirmed: ${alreadyConfirmed}
  Strategies that did NOT help: ${ineffective}
  Strategy currently in use: ${currentStrategy}

CLASSIFY into exactly one of:
  "clear_reasoning"              answer correct AND the method is sound and articulated
  "needs_clarification"          answer correct but the method is too thin to judge
  "misconception_behind_correct" answer correct but the method is WRONG or would fail on a variant
  "wrong_answer"                 answer is incorrect
  "no_reasoning_given"           the child gave an answer with no method at all

CRITICAL INSTRUCTION — THE CORRECT ANSWER TRAP:
A correct final answer is NOT evidence of understanding. Ask yourself explicitly:
"Would this exact method still produce the right answer if the numbers or the
orientation of the triangle changed?" If no, it is misconception_behind_correct,
even though the child was right. This is the single most important judgement you make.

FALSE-POSITIVE DISCIPLINE:
Do not select a misconception id from one ambiguous utterance. If the reasoning is
merely brief or vague, that is "needs_clarification" with shouldProbe=true and NO
misconception ids. Only select ids when the child's own words positively indicate
that specific error. Prefer an empty list over a guess.

PROBE DESIGN:
When shouldProbe is true, write ONE short spoken question that DISCRIMINATES between
the candidate misconceptions — a question the child answers differently depending on
which error they hold. Never a question that reveals the answer. Never more than one
sentence. Age 13 vocabulary.

Return ONLY valid JSON, no markdown fences:
{
  "classification": "clear_reasoning|needs_clarification|misconception_behind_correct|wrong_answer|no_reasoning_given",
  "understandingDepth": "memorised|recognised|understood|applied|transferred|incorrect|guessed|confused",
  "candidateMisconceptionIds": ["exact ids from the catalogue, or empty"],
  "confidence": "high|medium|low",
  "reasoningSummary": "the child's method in one plain sentence, written so it can be shown back to them on the board",
  "faultyStep": "the single step that is wrong, or null",
  "shouldProbe": true|false,
  "probeQuestion": "one discriminating question, or null",
  "probeRationale": "what each possible reply would tell you, or null",
  "nextStrategy": "${Object.keys(STRATEGY_DESCRIPTIONS).join('|')}",
  "tutorGuidance": "ONE imperative sentence telling the tutor what to do on its very next turn"
}

RULES FOR tutorGuidance:
- If shouldProbe: it must instruct the tutor to ASK the probe and NOT to reveal the answer.
- Never instruct the tutor to say the child is wrong. Instruct it to test the METHOD.
- If classification is clear_reasoning: instruct specific process praise naming the exact
  correct move the child made, then advance.
- Never suggest a strategy listed as ineffective above.`;
}

const VALID_DEPTHS: UnderstandingDepth[] = [
  'memorised','recognised','understood','applied','transferred','incorrect','guessed','confused',
];

export async function assessReasoning(input: ReasoningInput): Promise<ReasoningAssessment> {
  const catalogIds = new Set(misconceptionCatalog(input.concept).map(m => m.id));

  try {
    const ai = new GoogleGenAI({
      apiKey: input.apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    let text = '';
    // Try the model that worked last time first; skip any that have failed.
    const order = [
      ...(resolvedModel ? [resolvedModel] : []),
      ...REASONING_MODEL_CANDIDATES.filter(m => m !== resolvedModel && !failedModels.has(m)),
    ];
    for (const model of order) {
      // At most two attempts per model: with low thinking, then — only if the
      // model rejected that setting — the same model again without it.
      for (let attempt = 0; attempt < 2 && !text; attempt++) {
        const useThinking = !noThinkingConfig.has(model);
        const t0 = Date.now();
        try {
          const response = await ai.models.generateContent({
            model,
            contents: buildPrompt(input),
            config: {
              responseMimeType: 'application/json',
              // Diagnosis is a classification task, not a hard reasoning one.
              // Low thinking keeps it inside the conversational latency budget.
              ...(useThinking ? { thinkingConfig: { thinkingLevel: 'low' } as any } : {}),
            },
          });
          text = response.text || '';
          if (text) {
            if (resolvedModel !== model) console.log(`[ReasoningAssessor] using ${model}`);
            resolvedModel = model;
            console.log(`[ReasoningAssessor] ${model} answered in ${Date.now() - t0}ms`);
          }
        } catch (modelErr: any) {
          const msg = String(modelErr?.message || modelErr);
          if (useThinking && /thinking/i.test(msg)) {
            noThinkingConfig.add(model);
            console.warn(`[ReasoningAssessor] ${model} rejected thinkingConfig; retrying without`);
            continue; // same model, next attempt
          }
          failedModels.add(model);
          console.warn(`[ReasoningAssessor] ${model} failed and will be skipped: ${msg.slice(0, 160)}`);
          break;
        }
      }
      if (text) break;
    }
    if (!text) throw new Error('no model returned a response');

    const parsed = JSON.parse(text.replace(/```json\s*|\s*```/g, '').trim());

    // ── Validate and sanitise. The model is not trusted to stay in vocabulary.
    const ids: string[] = Array.isArray(parsed.candidateMisconceptionIds)
      ? parsed.candidateMisconceptionIds.filter((id: any) => typeof id === 'string' && catalogIds.has(id))
      : [];

    const depth: UnderstandingDepth = VALID_DEPTHS.includes(parsed.understandingDepth)
      ? parsed.understandingDepth
      : 'confused';

    const classification: ReasoningClassification = [
      'clear_reasoning','needs_clarification','misconception_behind_correct','wrong_answer','no_reasoning_given',
    ].includes(parsed.classification) ? parsed.classification : 'needs_clarification';

    // Hard guarantee: any classification other than clear_reasoning probes.
    // This is the behaviour fix — the tutor may not state the answer and move on.
    const shouldProbe = classification === 'clear_reasoning'
      ? false
      : (parsed.shouldProbe !== false);

    const nextStrategy: TeachingStrategy =
      (parsed.nextStrategy in STRATEGY_DESCRIPTIONS ? parsed.nextStrategy : 'socratic_questioning');

    return {
      classification,
      understandingDepth: depth,
      candidateMisconceptionIds: ids,
      confidence: ['high','medium','low'].includes(parsed.confidence) ? parsed.confidence : 'low',
      reasoningSummary: String(parsed.reasoningSummary || input.childReasoning || input.childAnswer || ''),
      faultyStep: parsed.faultyStep || undefined,
      shouldProbe,
      probeQuestion: parsed.probeQuestion || undefined,
      probeRationale: parsed.probeRationale || undefined,
      nextStrategy,
      tutorGuidance: String(parsed.tutorGuidance || fallbackGuidance(classification)),
    };
  } catch (err) {
    console.error('[ReasoningAssessor] failed, using safe fallback:', err);
    return safeFallback(input);
  }
}

function fallbackGuidance(c: ReasoningClassification): string {
  if (c === 'clear_reasoning') return 'Name the specific correct move the child made, then move to the next idea.';
  return 'Do NOT give the answer. Ask the child to walk you through how they worked it out, one step at a time.';
}

/**
 * Fallback is deliberately conservative: when we cannot assess, we ASK rather
 * than assert. Never invents a misconception, never tells the child they are wrong.
 */
function safeFallback(input: ReasoningInput): ReasoningAssessment {
  const hasReasoning = Boolean(input.childReasoning && input.childReasoning.trim().length > 12);
  return {
    classification: hasReasoning ? 'needs_clarification' : 'no_reasoning_given',
    understandingDepth: 'confused',
    candidateMisconceptionIds: [],
    confidence: 'low',
    reasoningSummary: input.childReasoning || input.childAnswer || '',
    shouldProbe: true,
    probeQuestion: 'Talk me through how you got that — what did you work out first?',
    probeRationale: 'Assessment unavailable; eliciting the method directly.',
    nextStrategy: 'socratic_questioning',
    tutorGuidance: 'Do NOT give the answer. Ask the child to talk you through their working, starting with the first step.',
  };
}


// ─────────────────────────────────────────────────────────────────
// Deadline wrapper — the conversational latency budget.
//
// Live function calls block the voice model until the tool responds, and the
// child's microphone keeps streaming meanwhile. An unbounded assessment made the
// tutor go silent, the child repeat themselves, and every repeat get its own
// reply once the model unblocked.
//
// So: whatever happens, the voice model gets an answer within `budgetMs`.
//   - Full diagnosis back in time → use it.
//   - Not back in time → answer with a TRANSFER move, which is pedagogically
//     sound without any diagnosis: ask the child to run their own method on a
//     different example. A broken method exposes itself; a sound one confirms.
//     The full diagnosis keeps running and is delivered on the next turn.
// ─────────────────────────────────────────────────────────────────
export interface DeadlineResult {
  assessment: ReasoningAssessment;
  timedOut: boolean;
  /** Always resolves to the full diagnosis (or the safe fallback). */
  full: Promise<ReasoningAssessment>;
  elapsedMs: number;
}

export async function assessReasoningWithDeadline(
  input: ReasoningInput, budgetMs = 2500,
): Promise<DeadlineResult> {
  const t0 = Date.now();
  const full = assessReasoning(input);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), budgetMs); });
  const winner = await Promise.race([full, deadline]);
  if (timer) clearTimeout(timer);
  const elapsedMs = Date.now() - t0;
  if (winner) return { assessment: winner, timedOut: false, full, elapsedMs };
  return { assessment: transferMove(input), timedOut: true, full, elapsedMs };
}

function transferMove(input: ReasoningInput): ReasoningAssessment {
  return {
    classification: 'needs_clarification',
    understandingDepth: 'recognised',
    candidateMisconceptionIds: [],
    confidence: 'low',
    reasoningSummary: input.childReasoning || input.childAnswer || '',
    shouldProbe: true,
    probeQuestion: undefined,
    probeRationale: 'Assessment still running; a transfer item discriminates a sound method from a broken one on its own.',
    nextStrategy: input.currentStrategy,
    tutorGuidance:
      'Thank them in a few words for explaining. Then ask them to use exactly the same method on a slightly ' +
      'different example you pick (different numbers, or the triangle turned around) and tell you what it gives. ' +
      'Do NOT say whether their first answer was right. When they answer, call assess_child_reasoning with promptType "transfer".',
  };
}
