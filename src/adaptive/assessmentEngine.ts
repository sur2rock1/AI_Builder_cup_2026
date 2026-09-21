// ─────────────────────────────────────────────────────────────────
// Assessment Engine — Gemini evaluates DEPTH of understanding,
// detects misconceptions, and decides next teaching action.
// ─────────────────────────────────────────────────────────────────
import { GoogleGenAI } from '@google/genai';
import { AssessmentResult, ConceptState, TeachingStrategy, CurriculumConcept } from './learnerModel';

const ASSESSMENT_MODEL = 'gemini-3.6-flash';

export interface AssessmentInput {
  concept: CurriculumConcept;
  questionAsked: string;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  selectedOptionIndex: number;
  conceptState: ConceptState;
  apiKey: string;
}

const STRATEGY_DESCRIPTIONS: Record<TeachingStrategy, string> = {
  direct_explanation:    'Explain the concept clearly and directly with definitions and rules',
  worked_example:        'Walk through a complete solved example step by step',
  visual_diagram:        'Use a visual diagram or spatial representation on the blackboard',
  real_world_analogy:    'Connect the concept to something familiar in everyday life',
  socratic_questioning:  'Ask guiding questions to lead the student to discover the answer',
  step_by_step:          'Break the problem into very small numbered steps',
  story_context:         'Embed the concept inside a short story or narrative',
  interactive_simulation:'Let the student manipulate variables and observe outcomes',
  peer_comparison:       'Compare with a concept the student already understands well',
  prerequisite_review:   'Step back and revisit the foundational concept this depends on',
};

export async function assessUnderstanding(input: AssessmentInput): Promise<AssessmentResult> {
  const {
    concept, questionAsked, studentAnswer, correctAnswer,
    isCorrect, conceptState, apiKey,
  } = input;

  const usedStrategies = conceptState.strategiesUsed.join(', ');
  const ineffective = conceptState.ineffectiveStrategies.join(', ') || 'none yet';
  const knownMisconceptions = concept.commonMisconceptions.join('\n- ');
  const confirmedMisconceptions = conceptState.confirmedMisconceptions.join(', ') || 'none confirmed yet';

  const prompt = `You are an expert pedagogical assessor. Analyse this student's quiz response and provide a JSON assessment.

CONCEPT BEING TAUGHT: ${concept.label}
GRADE LEVEL: ${conceptState.conceptId} (curriculum difficulty: ${concept.difficultyLevel}/5)

QUESTION ASKED: "${questionAsked}"
CORRECT ANSWER: "${correctAnswer}"
STUDENT'S ANSWER: "${studentAnswer}"
IS ANSWER CORRECT: ${isCorrect}

STUDENT'S LEARNING HISTORY FOR THIS CONCEPT:
- Mastery score so far: ${conceptState.masteryScore}/100 (${conceptState.masteryLevel})
- Total attempts: ${conceptState.attemptCount}
- Teaching strategies already used: ${usedStrategies}
- Strategies that did NOT help: ${ineffective}
- Previously confirmed misconceptions: ${confirmedMisconceptions}

KNOWN COMMON MISCONCEPTIONS FOR THIS CONCEPT:
- ${knownMisconceptions}

YOUR TASK:
1. Determine the DEPTH of understanding (not just right/wrong)
2. Detect whether the student has a misconception — even if the answer was correct
3. Decide what the tutor should do NEXT
4. Recommend the best NEXT teaching strategy (must be different from ineffective ones)

Return ONLY a valid JSON object with exactly this structure:
{
  "understandingDepth": "memorised|recognised|understood|applied|transferred|incorrect|guessed|confused",
  "misconceptionDetected": true|false,
  "misconceptionDescription": "short description or null",
  "misconceptionType": "conceptual|procedural|factual|prerequisite_gap|null",
  "confidence": "high|medium|low",
  "recommendedAction": "advance|reinforce|switch_strategy|revisit_prerequisite|praise_and_continue",
  "suggestedNextStrategy": "${Object.keys(STRATEGY_DESCRIPTIONS).join('|')}",
  "teachingNote": "One sentence note about this child's learning pattern for the teacher",
  "masteryDelta": <integer from -20 to +15>
}

Rules:
- masteryDelta should be +10 to +15 for genuine understanding, +5 for correct but rote, -10 to -20 for wrong with misconception, -5 for simple error
- If the student was correct but likely memorised, understandingDepth = "memorised" and recommendedAction = "reinforce" (test with a novel variant)
- Never suggest a strategy that is already in the ineffective list
- Be specific about the misconceptionDescription if detected`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: ASSESSMENT_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    const text = response.text?.replace(/```json\s*|\s*```/g, '').trim() || '';
    const parsed = JSON.parse(text) as AssessmentResult;
    return parsed;
  } catch (err) {
    console.error('[Assessment] Gemini assessment failed, using fallback:', err);
    return fallbackAssessment(isCorrect, conceptState);
  }
}

function fallbackAssessment(isCorrect: boolean, state: ConceptState): AssessmentResult {
  const unused = (['direct_explanation','visual_diagram','worked_example','real_world_analogy','step_by_step'] as TeachingStrategy[])
    .filter(s => !state.strategiesUsed.includes(s));
  const next: TeachingStrategy = unused[0] || 'socratic_questioning';

  return {
    understandingDepth:        isCorrect ? 'recognised'   : 'incorrect',
    misconceptionDetected:     !isCorrect,
    misconceptionDescription:  isCorrect ? undefined       : 'Unable to assess specific misconception — try a different explanation',
    misconceptionType:         isCorrect ? undefined       : 'conceptual',
    confidence:                'low',
    recommendedAction:         isCorrect ? 'praise_and_continue' : 'switch_strategy',
    suggestedNextStrategy:     next,
    teachingNote:              isCorrect ? 'Student answered correctly.' : 'Student got this wrong — switch teaching strategy.',
    masteryDelta:              isCorrect ? 5 : -10,
  };
}

// ─── Select next strategy ───────────────────────────────────────
export function selectNextStrategy(
  state: ConceptState,
  assessment: AssessmentResult
): TeachingStrategy {
  // If Gemini suggested one and it hasn't been used or confirmed as ineffective, use it
  if (
    assessment.suggestedNextStrategy &&
    !state.ineffectiveStrategies.includes(assessment.suggestedNextStrategy)
  ) {
    return assessment.suggestedNextStrategy;
  }
  // Otherwise pick first untried strategy
  const allStrategies: TeachingStrategy[] = [
    'direct_explanation','worked_example','visual_diagram',
    'real_world_analogy','step_by_step','socratic_questioning',
    'story_context','interactive_simulation','peer_comparison','prerequisite_review',
  ];
  const untried = allStrategies.filter(
    s => !state.strategiesUsed.includes(s) && !state.ineffectiveStrategies.includes(s)
  );
  return untried[0] || 'worked_example';
}

export { STRATEGY_DESCRIPTIONS };
