// ─────────────────────────────────────────────────────────────────
// ONE independent review per concept (decision D-2026-09-30-6).
//
// The first real run showed the cost of reviewing inside repair loops: ~43 paid
// calls per concept. The pipeline is now single-shot — every artefact is generated
// once from a complete contract, checked by the deterministic lints (free), and then
// this ONE call reviews the whole concept: it solves the quiz blind (the marked
// answer is deliberately left out of the prompt), attacks the chalk notes, attacks
// every picture, and says which ladder items the material never teaches.
//
// Nothing is retried on its findings. An error withholds that artefact
// (src/curriculum/reviewApply.ts); warnings are recorded. A call that fails is
// reported as "not reviewed" and never counted as a pass.
// ─────────────────────────────────────────────────────────────────
import type { AnyBoardVisual } from '../visual/types';
import { conceptBlock, VisualConceptContext } from '../visual/prompt';
import { coerceIssues, pictureForReview } from './critic';
import type { JsonModel } from './model';
import { QualityIssue, qerr } from './types';
import type { LessonDraft } from './lessonLint';

export interface ConceptReview {
  ran: boolean;
  model?: string;
  error?: string;
  /** Issues about the quiz (wrong key, ambiguous, no correct option). */
  quiz: QualityIssue[];
  /** Issues about the rest of the lesson text, `where` = chalk.bullet[i] | chalk.takeaway[i] | chalk.core | overview | tagline | suggested[i]. */
  lesson: QualityIssue[];
  /** Issues per picture key. */
  pictures: Record<string, QualityIssue[]>;
  untaught: Array<{ level: number; prompt: string; missing: string }>;
}

const CODES = 'fact | drawing-label | leak | scope | contrast-asserted | misleading | omission | persona | other';

function purposeNote(key: string, ctx: VisualConceptContext): string {
  if (key === 'apply') {
    const it = ctx.ladderItems.find((l) => l.level === 3) || ctx.ladderItems.find((l) => l.level === 4);
    return `APPLICATION picture for "${it?.prompt ?? ''}" (a sound answer contains: "${it?.lookFor ?? ''}"). It must show ONLY the situation: an error (code "leak") if it states or draws the answer, an intermediate result, or names the method.`;
  }
  if (key.startsWith('contrast:')) {
    const id = key.slice('contrast:'.length);
    const m = ctx.misconceptions.find((x) => (x.id || '') === id) || ctx.misconceptions.find((x) => key.includes(String(x.id || '~')));
    return `CONTRAST picture for the belief "${m?.belief ?? id}": it must apply that belief's rule with real working, visibly clash, then show the rule that works. Error (code "contrast-asserted") if the clash is only stated in words or the belief's working is computed wrongly.`;
  }
  return 'TEACHING picture: one idea, true labels, drawing consistent with its labels.';
}

export async function reviewConceptOnce(
  model: JsonModel,
  ctx: VisualConceptContext,
  lesson: LessonDraft | null,
  pictures: Record<string, AnyBoardVisual>,
): Promise<ConceptReview> {
  const out: ConceptReview = { ran: false, quiz: [], lesson: [], pictures: {}, untaught: [] };
  const q = lesson?.quiz;
  const keys = Object.keys(pictures);
  if (!lesson && !keys.length) return { ...out, ran: true };

  const prompt = `You are a strict subject-matter reviewer for school ${ctx.subjectLabel || 'lessons'} at ${ctx.grade}. You did NOT write any of this material and you are not here to be kind: find what is wrong before a child sees it. Report only real problems; an empty list is a fine answer.

${conceptBlock(ctx)}

${lesson ? `=== 1. THE QUIZ (the marked answer is deliberately NOT shown) ===
${q?.question ? `QUESTION: ${q.question}\n${(q.options || []).map((o: string, i: number) => `  ${i}. ${o}`).join('\n')}\nSolve it yourself FIRST, from scratch. Give "solvedIndex" (0-based, or null if no option is correct) and "alsoDefensible" (other option indexes that could be defended as correct).` : '(no quiz)'}

=== 2. THE LESSON TEXT ===
tagline: ${lesson.tagline}
overview: ${lesson.overview}
chalk core rule: ${lesson.chalkNotes?.coreRuleOrFormula ?? ''}
chalk bullets: ${JSON.stringify(lesson.chalkNotes?.bulletPoints ?? [])}
chalk takeaways: ${JSON.stringify(lesson.chalkNotes?.keyTakeaways ?? [])}
suggested questions: ${JSON.stringify(lesson.suggestedQuestions)}
Check FACT (exactly true for ${ctx.grade}; over-absolute claims with exceptions are errors), TEACH-BEFORE-TEST (the quiz answerable from the key facts and notes), QUIZ QUALITY (one idea, real-misconception distractors), LEAKS (notes must not state the quiz answer), TONE. Use "where" = chalk.core | chalk.bullet[i] | chalk.takeaway[i] | overview | tagline | suggested[i].` : ''}

=== 3. THE PICTURES (JSON: bricks with coordinates, and the steps that reveal them) ===
${keys.map((k) => `--- picture "${k}" — ${purposeNote(k, ctx)}\n${pictureForReview(pictures[k])}`).join('\n\n') || '(none)'}
For each picture check FACT (every label, caption and number true; what the drawing IMPLIES or OMITS), DRAWING vs LABEL (counts, positions, order, sizes, arrows match the words), SCOPE, and PERSONA (no judging words, no tick/cross symbols).

=== 4. COVERAGE ===
A learner studies ONLY the key facts and worked examples above. Which of these ladder items could they NOT answer from that material?
${ctx.ladderItems.map((l, i) => `${i}. L${l.level}: ${l.prompt}  (sound answer: ${l.lookFor})`).join('\n') || '(none)'}

Return ONLY this JSON:
{"quiz":{"solvedIndex":<n|null>,"alsoDefensible":[<n>]},
 "lesson":[{"severity":"error|warn","code":"${CODES}","where":"…","message":"what is wrong, precisely","fix":"how to fix it"}],
 "pictures":{"<picture key>":[{"severity":"error|warn","code":"${CODES}","where":"<step id or element id>","message":"…","fix":"…"}]},
 "untaught":[{"index":<ladder item index>,"missing":"what the material never teaches"}]}
Use "error" only for something false, leaking, misleading or drawn contrary to its label.`;

  try {
    const r = await model({ call: 'review.concept', role: 'review', prompt, timeoutMs: 120_000 });
    const d = r.data || {};
    out.ran = true; out.model = r.model;
    if (q?.question && Array.isArray(q.options)) {
      const solved = d.quiz?.solvedIndex;
      const also = (Array.isArray(d.quiz?.alsoDefensible) ? d.quiz.alsoDefensible : []).map(Number).filter((n: number) => Number.isInteger(n) && n !== q.correctIndex && n >= 0 && n < q.options.length);
      if (solved === null || solved === undefined) out.quiz.push(qerr('critic.quiz-no-answer', 'quiz', 'the reviewer found NO correct option when solving the question independently'));
      else if (Number(solved) !== q.correctIndex) out.quiz.push(qerr('critic.quiz-wrong-key', 'quiz', `the reviewer solved it independently and chose option ${solved} but the key says option ${q.correctIndex}`));
      else if (also.length) out.quiz.push(qerr('critic.quiz-ambiguous', 'quiz', `option(s) ${also.join(', ')} can also be defended as correct`));
    }
    out.lesson = coerceIssues({ issues: d.lesson }, 'critic', 'lesson');
    for (const k of keys) out.pictures[k] = coerceIssues({ issues: d.pictures?.[k] }, 'critic', k);
    out.untaught = (Array.isArray(d.untaught) ? d.untaught : [])
      .filter((x: any) => x && Number.isInteger(Number(x.index)) && ctx.ladderItems[Number(x.index)])
      .map((x: any) => ({ level: ctx.ladderItems[Number(x.index)].level, prompt: ctx.ladderItems[Number(x.index)].prompt, missing: String(x.missing || '').slice(0, 200) }));
  } catch (e: any) {
    return { ...out, ran: false, error: String(e?.message || e) };
  }
  return out;
}
