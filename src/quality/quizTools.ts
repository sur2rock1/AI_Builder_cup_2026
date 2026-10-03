// ─────────────────────────────────────────────────────────────────
// Quiz integrity (review finding A1, docs/TUTOR_PERSONA.md H1/H6):
//   • the correct option must not sit in the same place every time,
//   • must not be the longest / most detailed option,
//   • distractors must be plausible and distinct,
//   • a legacy record must never reach a child un-shuffled.
// Deterministic (seeded) so a regenerated lesson is stable and testable.
// ─────────────────────────────────────────────────────────────────
import { QualityIssue, qerr, qwarn } from './types';
import { languageIssues } from './language';

export interface QuizLike {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  hint?: string;
  /** What each option's choice suggests about the child's thinking (tutor-only), aligned with `options`. */
  optionNotes?: string[];
  /** Which parallel L3 item this is (docs/CURRICULUM.md §Parallel L3 pair). */
  itemId?: string;
  /** Marker: options were put in seeded order by shuffleQuiz. */
  order?: 'shuffled';
}

/** FNV-1a 32-bit. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** mulberry32 — tiny seeded PRNG. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Is this a usable quiz? (shape only — quality is lintQuiz). */
export function isQuizShape(q: any): q is QuizLike {
  return !!q && typeof q.question === 'string' && q.question.trim() !== ''
    && Array.isArray(q.options) && q.options.length >= 2 && q.options.every((o: any) => typeof o === 'string' && o.trim() !== '')
    && Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length;
}

/**
 * Put the options in a seeded order and make the correct answer land on a
 * seed-chosen slot, so a set of lessons spreads it evenly across A–D instead
 * of "always A". `optionNotes` travels with its option. Idempotent: a quiz
 * already marked shuffled is returned unchanged.
 */
export function shuffleQuiz<T extends QuizLike>(quiz: T, seed: string | number): T {
  if (quiz.order === 'shuffled' || !isQuizShape(quiz)) return quiz;
  const s = typeof seed === 'number' ? seed : hashSeed(seed);
  const n = quiz.options.length;
  const rand = prng(s);
  const correct = quiz.options[quiz.correctIndex];
  const correctNote = quiz.optionNotes?.[quiz.correctIndex];
  const others = quiz.options.map((o, i) => ({ o, note: quiz.optionNotes?.[i], i })).filter((x) => x.i !== quiz.correctIndex);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const slot = s % n;
  const options: string[] = [];
  const notes: Array<string | undefined> = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (i === slot) { options.push(correct); notes.push(correctNote); }
    else { options.push(others[k].o); notes.push(others[k].note); k++; }
  }
  const out: T = { ...quiz, options, correctIndex: slot, order: 'shuffled' };
  if (quiz.optionNotes) out.optionNotes = notes.map((n2) => n2 ?? '');
  return out;
}

/**
 * Runtime guard for anything that reaches the browser: a legacy record, or a
 * quiz the live tutor just posed. Returns null when the quiz is unusable.
 */
export function normalizeQuiz<T extends QuizLike>(quiz: T | null | undefined, seedHint?: string): T | null {
  if (!isQuizShape(quiz)) return null;
  return shuffleQuiz(quiz, `${seedHint ?? ''}|${quiz.question}`);
}

const normOpt = (s: string) => s.toLowerCase().replace(/[^a-z0-9%=./+\-() ]/g, '').replace(/\s+/g, ' ').trim();
const NONE_OF_ABOVE = /\b(all|none) of the above\b|\bboth [a-d] and [a-d]\b|\ball of these\b|\bnone of these\b/i;

export function lintQuiz(quiz: QuizLike | null | undefined, where = 'quiz'): QualityIssue[] {
  const out: QualityIssue[] = [];
  if (!isQuizShape(quiz)) return [qerr('quiz.shape', where, 'quiz is missing a question, 2+ options or a valid correctIndex')];

  const n = quiz.options.length;
  if (n < 3 || n > 5) out.push(qwarn('quiz.option-count', where, `${n} options — use 4`));
  const seen = new Set<string>();
  quiz.options.forEach((o, i) => {
    const k = normOpt(o);
    if (seen.has(k)) out.push(qerr('quiz.duplicate-option', `${where}.option[${i}]`, `option "${o}" duplicates another option`));
    seen.add(k);
    if (NONE_OF_ABOVE.test(o)) out.push(qerr('quiz.none-of-above', `${where}.option[${i}]`, `"${o}" — "all/none of the above" tests test-taking, not understanding`));
    languageIssues(o, `${where}.option[${i}]`).forEach((x) => out.push(x));
  });

  // Length bias: the correct option must not stand out by being longer.
  const lens = quiz.options.map((o) => o.length);
  const correctLen = lens[quiz.correctIndex];
  const otherLens = lens.filter((_, i) => i !== quiz.correctIndex);
  const meanOthers = otherLens.reduce((a, b) => a + b, 0) / Math.max(1, otherLens.length);
  const longest = correctLen > Math.max(...otherLens);
  if (longest && correctLen > meanOthers * 1.6 && correctLen - meanOthers > 12) {
    out.push(qerr('quiz.length-bias', `${where}.option[${quiz.correctIndex}]`, `the correct option is ${Math.round(correctLen / Math.max(1, meanOthers) * 100)}% as long as the average distractor — length gives it away`));
  } else if (longest && correctLen > meanOthers * 1.3 && correctLen - meanOthers > 10) {
    out.push(qwarn('quiz.length-bias', `${where}.option[${quiz.correctIndex}]`, 'the correct option is the longest — balance the option lengths'));
  }

  if (!quiz.explanation || quiz.explanation.trim().length < 15) out.push(qwarn('quiz.explanation', where, 'explanation is missing or too short to teach from'));
  languageIssues(quiz.question, `${where}.question`).forEach((x) => out.push(x));
  languageIssues(quiz.explanation, `${where}.explanation`).forEach((x) => out.push(x));
  if (/^\s*(incorrect|wrong|no[,.!])/i.test(quiz.explanation || '')) out.push(qerr('quiz.verdict-first', `${where}.explanation`, 'explanation opens with a verdict — open with the reasoning'));
  if (quiz.order !== 'shuffled') out.push(qerr('quiz.not-shuffled', where, 'options were never put in seeded order — the correct answer would be in a predictable slot'));
  return out;
}

/** Across a set of quizzes: is the correct slot spread out? Returns the distribution and any issue. */
export function correctSlotSpread(quizzes: QuizLike[]): { counts: number[]; issue: QualityIssue | null } {
  const counts = [0, 0, 0, 0, 0];
  quizzes.forEach((q) => { if (isQuizShape(q)) counts[Math.min(4, q.correctIndex)]++; });
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts);
  const issue = total >= 6 && max / total > 0.5
    ? qerr('quiz.slot-bias', 'quiz set', `${max} of ${total} quizzes put the correct answer in the same slot`)
    : null;
  return { counts, issue };
}
