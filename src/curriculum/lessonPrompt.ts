// ─────────────────────────────────────────────────────────────────
// The lesson-text prompt — ONE definition used by the pregen script and the
// live /api/generate-lesson fallback (they used to carry two divergent copies).
//
// Written to the tutor persona (docs/TUTOR_PERSONA.md) and the Chapter 1 review
// (docs/CH1_MATERIAL_REVIEW.md): teach before you test; the quiz is a PARALLEL
// problem (form B), never the application picture's problem (form A) and never
// a worked example; distractors are real misconceptions; nothing pre-announces
// a mix-up or judges the learner; suggested questions sound like a child;
// tutor-only probes live in `diagnostics`, not in anything the child reads.
// ─────────────────────────────────────────────────────────────────
import { conceptBlock, VisualConceptContext } from '../visual/prompt';
import { QualityIssue } from '../quality/types';

export interface PrerequisiteInput { label: string; reason?: string; checkQuestion?: string }

export interface LessonPromptInput {
  ctx: VisualConceptContext;
  prerequisiteDetails?: PrerequisiteInput[];
}

/** Ladder items for the pair: form A feeds the application picture, form B the quiz. */
export function ladderPair(ctx: VisualConceptContext) {
  const l3 = ctx.ladderItems.filter((l) => l.level === 3);
  const formA = l3[0] || ctx.ladderItems.find((l) => l.level === 4) || null;
  const formB = l3.length > 1 ? l3[1] : null;
  return { formA, formB };
}

const list = (items: string[], empty: string) => (items.length ? items.map((s, i) => `  ${i + 1}. ${s}`).join('\n') : `  ${empty}`);

const SCHEMA = `{
  "tagline": "ONE plain sentence, max 14 words, saying what the child will understand by the end",
  "overview": "1-2 plain sentences, max 45 words: what this idea is and why it is worth knowing",
  "chalkNotes": {
    "title": "short board title",
    "subtitle": "short board subtitle",
    "coreRuleOrFormula": "the concept's central rule, stated exactly as the key facts state it",
    "bulletPoints": ["3 to 5 bullets, ONE idea each, max 20 words each, each traceable to a key fact"],
    "keyTakeaways": ["2 short takeaways"]
  },
  "quiz": {
    "question": "ONE multiple-choice question testing the idea in a NEW situation (see QUIZ RULES)",
    "options": ["exactly 4 options, similar length, no letters or numbering"],
    "correctIndex": 0,
    "explanation": "starts with the reasoning (\\"Because …\\" / \\"Look at …\\"), never with a verdict word",
    "hint": "a nudge that does not give the answer away",
    "lookFor": "what a child's own explanation must contain to show real understanding",
    "optionNotes": ["one note per option, same order: what choosing it suggests the child is thinking (tutor-only)"]
  },
  "suggestedQuestions": ["exactly 3 things a curious 13-year-old would actually ask, each ending in ?"],
  "diagnostics": [
    {"purpose": "prerequisite", "question": "a quick tutor question that checks a prerequisite", "listenFor": "what a sound answer contains"},
    {"purpose": "misconception", "question": "a neutral tutor question whose answer reveals a known mix-up", "listenFor": "the wording that would reveal it"}
  ]
}`;

export function buildLessonPrompt(input: LessonPromptInput): string {
  const { ctx } = input;
  const { formA, formB } = ladderPair(ctx);
  const pre = input.prerequisiteDetails || [];
  const quizSource = formB
    ? `The authored parallel item for the quiz (form B) is: "${formB.prompt}" (a sound answer: ${formB.lookFor}). Turn THIS item into the multiple-choice question; keep its situation and numbers.`
    : formA
      ? `The application picture uses this problem (form A): "${formA.prompt}". The quiz must be a DIFFERENT problem of the same structure — a new everyday context and new numbers — so a child who saw the picture gains nothing by remembering it. Author it yourself and make sure you can solve it exactly.`
      : 'Author an application question in a new everyday situation — not a recall question.';
  return `You are writing the text of one lesson for a school child. You are not the tutor who will speak it; you write what the child will READ and what the tutor will KEEP for itself.

${conceptBlock(ctx)}

PREREQUISITES (for the tutor's private diagnostics):
${list(pre.map((p) => `${p.label}${p.reason ? ' — ' + p.reason : ''}${p.checkQuestion ? ' (check: ' + p.checkQuestion + ')' : ''}`), '(none recorded)')}

THE QUIZ:
${quizSource}

Return ONLY this JSON:
${SCHEMA}

QUIZ RULES
- TEACH BEFORE TEST: a child who studied only the key facts and your chalk notes can answer it. Never test something the material does not teach.
- It is a NEW situation (application), not a worked example and not the application picture's problem. Do not reuse a worked example's numbers or wording.
- One idea. Options are real answers: each wrong option is a slip or a known misconception a real child would make (use the KNOWN MISCONCEPTIONS above), never a joke, never "all/none of the above", never a giveaway by length or wording.
- Exactly one option is correct — check it by solving the question yourself. Two options that could both be defended is an error.
- optionNotes names what each choice suggests, plainly and kindly ("might be swapping x and y"), never "wrong".

CHALK NOTES RULES
- What the child keeps: short, exact, positive statements of what IS true. Every bullet traces to a key fact or worked example above.
- Do not state the quiz's answer, its numbers or its situation. Do not use words like never / always / all / every unless a key fact does.
- Do NOT announce or name a mix-up ("common mistake", "misconception alert", "watch out"). The tutor handles those in conversation.

LANGUAGE (everything the child reads)
- Never "wrong", "incorrect", "mistake", "silly", "careless"; no emoji, ticks or crosses; no tutor jargon (prerequisite, diagnostic, probe, ladder, L1-L5, misconception).
- Plain and warm; no marketing words ("unlock", "master", "amazing", "journey").
- Suggested questions are the child's own voice ("Why does …?", "How do I know when …?"), never labels such as "Probe:" or "Prerequisite check:".

DIAGNOSTICS are tutor-only: neutral, one or two of each purpose, never shown to the child.
Do NOT output scene3d, photoVisual or diagram — pictures and photos are made elsewhere.
Every number and claim must be exactly true for ${ctx.grade}; if unsure, say less.`;
}

export interface LessonRepairProblem { where?: string; message: string }

export function buildLessonRepairPrompt(input: LessonPromptInput, previousJson: string, problems: LessonRepairProblem[]): string {
  return `${buildLessonPrompt(input)}

────────
YOUR PREVIOUS ANSWER (JSON):
${previousJson}

It was checked by an independent reviewer and by automatic checks. Fix EVERY problem below and change nothing else that was fine. Return the complete corrected JSON in the same schema.
PROBLEMS:
${problems.map((p, i) => `${i + 1}. ${p.where ? `[${p.where}] ` : ''}${p.message}`).join('\n')}`;
}

export const toProblems = (issues: QualityIssue[]): LessonRepairProblem[] => issues.map((i) => ({ where: i.where, message: i.message }));
