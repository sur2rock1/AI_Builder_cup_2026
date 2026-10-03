// ─────────────────────────────────────────────────────────────────
// Answer-leak lints (review findings A2, A3; docs/TUTOR_PERSONA.md §15).
//
// The child must work the answer out. Anything they can read before they
// answer — chalk notes, teaching pictures, the apply picture, its captions —
// must not contain it. Two kinds of check:
//   • fingerprints: equations, coordinate pairs and multi-digit numbers that
//     are in the answer but not in the question;
//   • wording: for prose answers, how many of the answer's content-word
//     pairs appear in the text.
// ─────────────────────────────────────────────────────────────────
import type { AnyBoardVisual, BoardVisual, PlaneFrame } from '../visual/types';
import { coordinatePairs, isOnBoard } from '../visual/sanitize';
import { pictureTexts } from './visualText';
import { QualityIssue, qerr, qwarn } from './types';
import type { QuizLike } from './quizTools';

const STOP = new Set(('a an and are as at be by can do does for from has have how in is it its of on or so that the their then there these this to was were what when which who why will with you your not no if than into each every one two three').split(' '));

export const norm = (s: string) => s.toLowerCase().replace(/[−–—]/g, '-').replace(/[×·]/g, '*').replace(/\s+/g, ' ').trim();

export function contentWords(s: string): string[] {
  return norm(s).split(/[^a-z0-9./%]+/).filter((w) => w && !STOP.has(w) && (w.length >= 3 || /\d/.test(w)));
}
const bigrams = (w: string[]) => w.slice(1).map((x, i) => `${w[i]} ${x}`);

export interface Fingerprints { pairs: string[]; equations: string[]; numbers: string[] }

const EQ_RE = /\b([a-z])\s*=\s*([^,;\n]+?)(?=$|[,;\n]|\.\s|\s+(?:and|or|when|where)\b)/gi;
const NUM_RE = /-?\d+(?:\.\d+)?(?:\/\d+)?/g;

export function fingerprints(text: string): Fingerprints {
  const t = norm(text);
  const pairs = coordinatePairs(t).map(([x, y]) => `(${x},${y})`);
  const equations: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(EQ_RE.source, 'gi');
  while ((m = re.exec(t))) equations.push(`${m[1]}=${m[2].replace(/\s+/g, '').replace(/\.$/, '')}`);
  const numbers = (t.match(NUM_RE) || []).filter((n) => /\./.test(n) || /\//.test(n) || n.replace('-', '').length >= 2);
  return { pairs, equations, numbers };
}

/** Fingerprints present in the answer and absent from the question/prompt. */
export function answerFingerprints(answer: string, prompt: string): Fingerprints {
  const a = fingerprints(answer);
  const p = fingerprints(prompt);
  const not = (list: string[], other: string[]) => list.filter((x) => !other.includes(x));
  return { pairs: not(a.pairs, p.pairs), equations: not(a.equations, p.equations), numbers: not(a.numbers, p.numbers) };
}

export interface Leak { how: 'equation' | 'pair' | 'number' | 'wording' | 'phrase'; detail: string }

/** Does `text` state the answer? `prompt` is the question the answer belongs to. */
export function leaksAnswer(text: string, answer: string, prompt: string): Leak | null {
  if (!text || !answer) return null;
  const t = norm(text);
  const fp = answerFingerprints(answer, prompt);
  const tf = fingerprints(text);
  // An answer made of several parts ("x = 4, y = 2") is only given away when the text states ALL of them:
  // a lone "y = 2" is an ordinary line on a graph, not the answer (it made 5 contrast pictures un-shippable).
  const stated = (e: string) => tf.equations.includes(e) || t.replace(/\s+/g, '').includes(e);
  if (fp.equations.length && fp.equations.every(stated)) return { how: 'equation', detail: fp.equations.join(', ') };
  if (fp.pairs.length && fp.pairs.every((p) => tf.pairs.includes(p))) return { how: 'pair', detail: fp.pairs.join(' ') };
  // A bare number only counts when the answer IS essentially that number (short answer).
  const bare = norm(answer).replace(/[^0-9a-z./\-\s$%]/g, '').trim();
  if (fp.numbers.length && bare.split(/\s+/).length <= 4) {
    for (const n of fp.numbers) if (tf.numbers.includes(n)) return { how: 'number', detail: n };
  }
  const na = norm(answer);
  if (na.length >= 14 && t.includes(na)) return { how: 'phrase', detail: answer };
  const aw = contentWords(answer);
  const ab = bigrams(aw);
  if (ab.length >= 3) {
    const tb = new Set(bigrams(contentWords(text)));
    const hit = ab.filter((b) => tb.has(b)).length;
    if (hit / ab.length >= 0.6) return { how: 'wording', detail: `${hit}/${ab.length} word pairs` };
  }
  return null;
}

// ─── lesson: chalk notes and suggested questions vs the quiz answer ─────────

export interface ChalkLike { title?: string; subtitle?: string; coreRuleOrFormula?: string; bulletPoints?: string[]; keyTakeaways?: string[] }

export function lintLessonLeaks(
  lesson: { chalkNotes?: ChalkLike; quiz?: QuizLike; suggestedQuestions?: string[] },
  workedExamples: string[] = [],
): QualityIssue[] {
  const out: QualityIssue[] = [];
  const q = lesson.quiz;
  if (!q || !Array.isArray(q.options) || !q.options[q.correctIndex]) return out;
  const answer = q.options[q.correctIndex];
  const chalk = lesson.chalkNotes || {};
  const spots: Array<[string, string | undefined]> = [
    ['chalk.title', chalk.title], ['chalk.subtitle', chalk.subtitle], ['chalk.core', chalk.coreRuleOrFormula],
    ...(chalk.bulletPoints || []).map((b, i): [string, string] => [`chalk.bullet[${i}]`, b]),
    ...(chalk.keyTakeaways || []).map((b, i): [string, string] => [`chalk.takeaway[${i}]`, b]),
    ...(lesson.suggestedQuestions || []).map((b, i): [string, string] => [`suggestedQuestions[${i}]`, b]),
  ];
  for (const [where, text] of spots) {
    const leak = leaksAnswer(text || '', answer, q.question);
    if (leak) out.push(qerr('leak.chalk-quiz-answer', where, `states the quiz answer (${leak.how}: ${leak.detail}) — the learner would read it before answering`));
  }
  // The quiz must not be a source worked example (the tutor teaches those).
  const qNums = numeralsOf(q.question);
  for (const [i, ex] of workedExamples.entries()) {
    const problem = ex.split('→')[0];
    const eNums = numeralsOf(problem);
    if (qNums.length >= 3 && jaccard(qNums, eNums) >= 0.8) {
      out.push(qerr('leak.quiz-is-worked-example', 'quiz', `the quiz uses the same numbers as worked example ${i + 1} — use a parallel problem with new numbers`));
    } else {
      const qw = new Set(bigrams(contentWords(q.question)));
      const ew = bigrams(contentWords(problem));
      if (ew.length >= 4 && qw.size >= 4 && ew.filter((b) => qw.has(b)).length / ew.length >= 0.75) {
        out.push(qerr('leak.quiz-is-worked-example', 'quiz', `the quiz repeats worked example ${i + 1} almost word for word`));
      }
    }
  }
  return out;
}

function numeralsOf(s: string): string[] { return (norm(s).match(NUM_RE) || []); }
function jaccard(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 0;
  let inter = 0; A.forEach((x) => { if (B.has(x)) inter++; });
  return inter / (A.size + B.size - inter);
}

// ─── pictures ───────────────────────────────────────────────────────

/** Teaching and contrast pictures must not state the quiz answer either. */
export function lintPictureVsQuiz(visual: AnyBoardVisual, quiz: QuizLike | null | undefined, key: string): QualityIssue[] {
  if (!quiz || !quiz.options?.[quiz.correctIndex]) return [];
  const answer = quiz.options[quiz.correctIndex];
  const out: QualityIssue[] = [];
  for (const t of pictureTexts(visual)) {
    const leak = leaksAnswer(t.text, answer, quiz.question);
    if (leak) out.push(qerr('leak.picture-quiz-answer', `${key}: ${t.where}`, `states the quiz answer (${leak.how}: ${leak.detail})`));
  }
  return out;
}

const HINT_RE = /\b(make|match|multiply|divide|substitute|replace|swap|add the (two )?equations|subtract|eliminate|rearrange|isolate|use the (formula|rule|method)|try (adding|subtracting|multiplying)|first (step|thing) is)\b/i;

export interface ApplyItem { level: number; prompt: string; lookFor: string }

/**
 * The application picture shows the SITUATION only. It fails when it states the
 * answer, draws it (a point at the answer, a crossing of two drawn curves at the
 * answer), or captions a hint about which method to use.
 */
export function lintApplyPicture(visual: AnyBoardVisual, item: ApplyItem, key = 'apply'): QualityIssue[] {
  const out: QualityIssue[] = [];
  for (const t of pictureTexts(visual)) {
    if (t.kind === 'title') continue;
    const leak = leaksAnswer(t.text, item.lookFor, item.prompt);
    if (leak) out.push(qerr('leak.apply-answer', `${key}: ${t.where}`, `states part of the answer (${leak.how}: ${leak.detail}) — draw the situation, not the solution`));
    if ((t.kind === 'caption' || t.kind === 'label' || t.kind === 'text') && HINT_RE.test(t.text)) {
      out.push(qwarn('leak.apply-hint', `${key}: ${t.where}`, `hints at the method ("${t.text.slice(0, 70)}") — the learner chooses the method`));
    }
  }
  if (visual.dim === '2d' && visual.frame.kind === 'plane') {
    const v = visual as BoardVisual;
    const frame = v.frame as PlaneFrame;
    const span = Math.max(frame.x[1] - frame.x[0], frame.y[1] - frame.y[0]);
    const tol = Math.max(1e-6, span * 0.004);
    const inPrompt = fingerprints(item.prompt).pairs;
    for (const pair of fingerprints(item.lookFor).pairs) {
      if (inPrompt.includes(pair)) continue;
      const m = /\((-?[\d.]+),(-?[\d.]+)\)/.exec(pair)!;
      const x = Number(m[1]), y = Number(m[2]);
      const pointsAt = v.elements.filter((e) => e.kind === 'point' && Math.abs(e.at[0] - x) <= tol && Math.abs(e.at[1] - y) <= tol);
      const curvesThrough = v.elements.filter((e) => ['line', 'segment', 'ray', 'function'].includes(e.kind) && isOnBoard([e], x, y, tol));
      if (pointsAt.length) out.push(qerr('leak.apply-geometry', `${key}: element ${pointsAt[0].id}`, `a point is drawn at the answer ${pair}`));
      else if (curvesThrough.length >= 2) out.push(qerr('leak.apply-geometry', `${key}: element ${curvesThrough[0].id}`, `${curvesThrough.length} drawn curves cross at the answer ${pair}`));
    }
  }
  return out;
}
