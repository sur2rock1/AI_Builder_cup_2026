// ─────────────────────────────────────────────────────────────────
// The independent critic (docs/BOARD_VISUALS.md §Quality gates, decision D1).
//
// Deterministic lints cannot know that a chromosome count doubles at the wrong
// step, or that a "spider" is drawn with six legs. A second model call that has
// NOT seen the drafting prompt, is handed the curriculum's own key facts, and is
// told to attack the work, catches those. Its findings join the lints' in the
// repair loop; an `error` that survives repair withholds the artefact.
//
// Every call is a `JsonModel` (src/quality/model.ts), so the whole thing runs
// offline in tests with a scripted fake. A critic call that fails does NOT pass
// the artefact silently: the result says `ran: false` and the caller records
// that the record was never independently reviewed.
// ─────────────────────────────────────────────────────────────────
import type { AnyBoardVisual } from '../visual/types';
import { conceptBlock, VisualConceptContext, VisualRequest } from '../visual/prompt';
import type { JsonModel } from './model';
import { QualityIssue, qerr, qwarn } from './types';
import type { LessonDraft } from './lessonLint';

export interface CriticResult {
  ran: boolean;
  model?: string;
  issues: QualityIssue[];
  /** 1-based key-fact numbers this artefact teaches (pictures). */
  keyFactsCovered: number[];
  error?: string;
}

const NOT_RUN = (error: string): CriticResult => ({ ran: false, issues: [], keyFactsCovered: [], error });

const ISSUE_CODES = 'fact | drawing-label | leak | scope | contrast-asserted | misleading | omission | persona | other';

export function coerceIssues(raw: any, prefix: string, where: string): QualityIssue[] {
  const list = Array.isArray(raw?.issues) ? raw.issues : [];
  return list.slice(0, 12).flatMap((i: any): QualityIssue[] => {
    const message = typeof i?.message === 'string' ? i.message.trim() : '';
    if (!message) return [];
    const code = `critic.${String(i?.code || 'other').toLowerCase().replace(/[^a-z-]/g, '').slice(0, 24) || 'other'}`;
    const w = typeof i?.where === 'string' && i.where.trim() ? `${where}: ${i.where.trim().slice(0, 60)}` : where;
    const fix = typeof i?.fix === 'string' && i.fix.trim() ? ` — fix: ${i.fix.trim().slice(0, 160)}` : '';
    // Something the material leaves out is a coverage gap, not a false statement: it is recorded, never blocking.
    return [i?.severity === 'error' && code !== 'critic.omission' ? qerr(code, w, message + fix) : qwarn(code, w, message + fix)];
  });
}

function nums(v: any, max: number): number[] {
  return (Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= max);
}

/** A compact, model-readable form of a picture (drops nothing that carries meaning). */
export function pictureForReview(v: AnyBoardVisual): string {
  return JSON.stringify({
    title: v.title, purpose: v.purpose, frame: v.frame, checkQuestion: v.checkQuestion,
    elements: v.elements, steps: v.steps.map((s) => ({ id: s.id, name: s.name, caption: s.caption, show: s.show, focus: s.focus, phase: s.phase })),
  });
}

// ─── pictures ───────────────────────────────────────────────────────

export async function reviewPicture(
  model: JsonModel, ctx: VisualConceptContext, req: VisualRequest, visual: AnyBoardVisual, key: string,
): Promise<CriticResult> {
  const purposeNote = req.purpose === 'apply'
    ? `This is the APPLICATION picture for the item: "${req.item.prompt}". A sound answer contains: "${req.item.lookFor}". It must show ONLY the situation. Report as an error (code "leak") anything that states or draws the answer, an intermediate result, or names the method to use.`
    : req.purpose === 'contrast'
      ? `This is a CONTRAST picture for the belief: "${req.misconception.belief}". It must APPLY that belief's rule with its own working (real numbers or a real drawn case), let the picture visibly clash, then show the rule that works. Report as an error (code "contrast-asserted") if the clash is merely stated in words instead of shown, or if the belief's working is itself computed wrongly.`
      : req.purpose === 'space'
        ? 'This is a 3D model. Report as an error (code "misleading") if the arrangement misrepresents the science or geometry, and as an error (code "scope") if a flat picture would show the same thing (the model adds no value).'
        : `This is a TEACHING picture${req.focus ? ` for: "${req.focus}"` : ''}${req.keyFacts?.length ? ` that should cover key fact(s) ${req.keyFacts.join(', ')} and no others` : ''}.`;

  const prompt = `You are a strict subject-matter reviewer for school ${ctx.subjectLabel || 'lessons'} at ${ctx.grade}. You did NOT draw this picture and you are not here to be kind: find what is wrong before a child sees it.

${conceptBlock(ctx)}

THE PICTURE (JSON: bricks with coordinates, and the steps that reveal them):
${pictureForReview(visual)}

${purposeNote}

Check, in this order:
1. FACT — is every label, caption and number true for ${ctx.grade}? Also what the drawing IMPLIES or OMITS (a plant cell drawn without a nucleus implies plants have none).
2. DRAWING vs LABEL — do counts, positions, order, relative sizes and directions match what the labels say (a label "8 legs" needs eight drawn; "the largest" must be largest; arrows must point the way the text says)?
3. COVERAGE — which key facts (by number) does this picture actually teach?
4. SCOPE — does it stay on its one idea?
5. PERSONA — captions must ask before they tell in step 1, must never judge the learner ("wrong", "mistake"), must not use tick/cross symbols.
6. The purpose-specific rules above.

Return ONLY this JSON:
{"verdict":"pass|fix|reject",
 "issues":[{"severity":"error|warn","code":"${ISSUE_CODES}","where":"<step id or element id>","message":"<what is wrong, precisely>","fix":"<how to fix it>"}],
 "keyFactsCovered":[<key fact numbers>]}
Use "error" only for something false, leaking, misleading or drawn contrary to its label. Use an empty issues list if the picture is sound.`;

  try {
    const r = await model({ call: `critic.picture.${key}`, role: 'review', prompt, timeoutMs: 60_000 });
    return {
      ran: true, model: r.model,
      issues: coerceIssues(r.data, 'critic', key),
      keyFactsCovered: nums(r.data?.keyFactsCovered, ctx.keyFacts.length),
    };
  } catch (e: any) {
    return NOT_RUN(String(e?.message || e));
  }
}

// ─── lesson text ────────────────────────────────────────────────────

export interface LessonCriticResult extends CriticResult {
  /** The option the reviewer chose when it solved the question blind (0-based), or null. */
  solvedIndex: number | null;
  /** Other options the reviewer could defend as correct. */
  alsoDefensible: number[];
}

export async function reviewLessonText(
  model: JsonModel, ctx: VisualConceptContext, lesson: LessonDraft,
): Promise<LessonCriticResult> {
  const out: LessonCriticResult = { ran: false, issues: [], keyFactsCovered: [], solvedIndex: null, alsoDefensible: [] };
  const q = lesson.quiz;
  if (q?.question && Array.isArray(q.options)) {
    // Call 1 — solve blind: question and options only, so the marked answer cannot bias it.
    const solve = `Solve this ${ctx.grade} ${ctx.subjectLabel || ''} question yourself, from scratch, showing working.

QUESTION: ${q.question}
${q.options.map((o, i) => `${i}. ${o}`).join('\n')}

Return ONLY JSON: {"working":"<your derivation>","solvedIndex":<0-based index of the single best option, or -1 if none is correct>,"alsoDefensible":[<other option indices that could be argued correct>],"ambiguity":"<what makes the question ambiguous, or empty>"}`;
    try {
      const r = await model({ call: 'critic.quiz.solve', role: 'review', prompt: solve, timeoutMs: 60_000 });
      out.ran = true; out.model = r.model;
      const idx = Number(r.data?.solvedIndex);
      out.solvedIndex = Number.isInteger(idx) && idx >= 0 && idx < q.options.length ? idx : null;
      out.alsoDefensible = nums((r.data?.alsoDefensible || []).map((n: number) => n + 1), q.options.length).map((n) => n - 1).filter((n) => n !== out.solvedIndex);
      if (out.solvedIndex === null) out.issues.push(qerr('critic.quiz-no-answer', 'quiz', 'the reviewer found NO correct option when solving the question independently'));
      else if (out.solvedIndex !== q.correctIndex) out.issues.push(qerr('critic.quiz-wrong-key', 'quiz', `the reviewer solved it independently and chose option ${out.solvedIndex} but the key says option ${q.correctIndex}`));
      if (out.alsoDefensible.includes(q.correctIndex) && out.solvedIndex !== q.correctIndex) { /* covered above */ }
      else if (out.alsoDefensible.length) out.issues.push(qerr('critic.quiz-ambiguous', 'quiz', `option(s) ${out.alsoDefensible.join(', ')} can also be defended as correct${r.data?.ambiguity ? ` (${String(r.data.ambiguity).slice(0, 120)})` : ''}`));
    } catch (e: any) {
      return { ...out, ran: false, error: String(e?.message || e) };
    }
  }

  // Call 2 — the rest of the lesson text.
  const review = `You are a strict subject-matter reviewer for school ${ctx.subjectLabel || 'lessons'} at ${ctx.grade}. You did not write this lesson text. Find what is wrong before a child reads it.

${conceptBlock(ctx)}

LESSON TEXT:
tagline: ${lesson.tagline}
overview: ${lesson.overview}
chalk notes (what the learner keeps): ${JSON.stringify(lesson.chalkNotes)}
quiz: ${JSON.stringify({ question: q?.question, options: q?.options, explanation: q?.explanation })}
suggested questions: ${JSON.stringify(lesson.suggestedQuestions)}

Check:
1. FACT — every chalk bullet, the core rule, the overview and the quiz explanation must be exactly true for ${ctx.grade}. Over-absolute claims ("never", "always", "all") that have exceptions are errors. A "core formula" must be the concept's central rule, not an unrelated formula.
2. TEACH BEFORE TEST — the quiz must be answerable from the key facts and the chalk notes. If it needs something never taught, say what.
3. QUIZ QUALITY — one idea (not double-barrelled), distractors that a learner with a real misconception would choose (no joke options), no giveaway in length or wording.
4. LEAKS — the chalk notes must not state the quiz answer.
5. TONE — no "wrong"/"mistake"/"alert"; a known mix-up is described plainly, never announced before the learner has met the idea.
6. SUGGESTED QUESTIONS — should sound like a 13-year-old, with no labels or tutor jargon.

Return ONLY JSON: {"issues":[{"severity":"error|warn","code":"${ISSUE_CODES}","where":"<chalk.bullet[2] | quiz | overview | …>","message":"…","fix":"…"}]}`;
  try {
    const r = await model({ call: 'critic.lesson', role: 'review', prompt: review, timeoutMs: 60_000 });
    out.ran = true; out.model = r.model;
    out.issues.push(...coerceIssues(r.data, 'critic', 'lesson'));
  } catch (e: any) {
    return { ...out, ran: false, error: String(e?.message || e) };
  }
  return out;
}

// ─── does the curriculum teach what it tests? (H12, decision D9) ─────

export interface CoverageResult { ran: boolean; untaught: Array<{ level: number; prompt: string; missing: string }>; error?: string }

export async function reviewLadderCoverage(model: JsonModel, ctx: VisualConceptContext): Promise<CoverageResult> {
  if (!ctx.ladderItems.length) return { ran: true, untaught: [] };
  const prompt = `A learner studies ONLY the key facts and worked examples below. Then the tutor asks the evidence-ladder items. For each item say whether a learner who learned exactly this material (plus ordinary prior knowledge for ${ctx.grade}) can answer it. Do not assume anything the material does not contain.

CONCEPT: ${ctx.topic} (${ctx.grade}${ctx.subjectLabel ? ', ' + ctx.subjectLabel : ''})
KEY FACTS:
${ctx.keyFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}
WORKED EXAMPLES:
${ctx.workedExamples.map((f, i) => `${i + 1}. ${f}`).join('\n') || '(none)'}
LADDER ITEMS:
${ctx.ladderItems.map((l, i) => `${i}. L${l.level}: ${l.prompt}  (sound answer: ${l.lookFor})`).join('\n')}

Return ONLY JSON: {"items":[{"index":<ladder item index>,"answerable":true|false,"missing":"<what the material never teaches, if not answerable>"}]}`;
  try {
    const r = await model({ call: 'critic.coverage', role: 'review', prompt, timeoutMs: 60_000 });
    const untaught = (Array.isArray(r.data?.items) ? r.data.items : [])
      .filter((x: any) => x && x.answerable === false && Number.isInteger(Number(x.index)) && ctx.ladderItems[Number(x.index)])
      .map((x: any) => ({ level: ctx.ladderItems[Number(x.index)].level, prompt: ctx.ladderItems[Number(x.index)].prompt, missing: String(x.missing || '').slice(0, 200) }));
    return { ran: true, untaught };
  } catch (e: any) {
    return { ran: false, untaught: [], error: String(e?.message || e) };
  }
}

// ─── photos (vision) ────────────────────────────────────────────────

export interface PhotoReview {
  ran: boolean;
  /** Fit to ship: shows the concept, nothing false, no garbled text/numbers. */
  ok: boolean;
  /** One neutral sentence describing what the image actually shows — the caption we display. */
  caption: string;
  issues: QualityIssue[];
  error?: string;
}

export async function reviewPhoto(
  model: JsonModel, ctx: VisualConceptContext, intent: string, image: { mimeType: string; data: string },
): Promise<PhotoReview> {
  const prompt = `You are checking an AI-generated illustration before it is shown to a ${ctx.grade} learner studying "${ctx.topic}" (${ctx.subjectLabel || 'school'}).
The illustration was meant to show: "${intent}".
Key facts of the lesson:
${ctx.keyFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Look at the image itself. Report:
- does it actually show what it was meant to, in a way that helps this lesson?
- anything scientifically or mathematically false or misleading (wrong anatomy, wrong counts, impossible physics, wrong numbers or equations)?
- any text, numbers, equations or handwriting in the image that is garbled, misspelled or wrong (AI image models often garble these)?
- anything irrelevant or distracting from the concept?

Return ONLY JSON: {"showsConcept":true|false,"caption":"<ONE neutral sentence describing what the image really shows, no claims beyond it>","issues":[{"severity":"error|warn","code":"${ISSUE_CODES}","where":"<region>","message":"…"}]}`;
  try {
    const r = await model({
      call: 'critic.photo', role: 'review', prompt, timeoutMs: 90_000,
      parts: [{ inlineData: { mimeType: image.mimeType, data: image.data } }],
    });
    const issues = coerceIssues(r.data, 'critic', 'photo');
    const caption = typeof r.data?.caption === 'string' ? r.data.caption.trim().slice(0, 220) : '';
    const showsConcept = r.data?.showsConcept === true;
    if (!showsConcept) issues.push(qerr('critic.scope', 'photo', 'the image does not show the concept it was generated for'));
    if (!caption) issues.push(qerr('critic.other', 'photo', 'no caption could be written for the image'));
    return { ran: true, ok: !issues.some((i) => i.severity === 'error'), caption, issues };
  } catch (e: any) {
    return { ran: false, ok: false, caption: '', issues: [], error: String(e?.message || e) };
  }
}
