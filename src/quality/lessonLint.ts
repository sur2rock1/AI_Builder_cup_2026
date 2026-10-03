// ─────────────────────────────────────────────────────────────────
// Deterministic lints for the lesson text a child reads next to the board:
// tagline, overview, chalk notes, quiz, suggested questions.
// (review findings A1, A2, A6, A9, A11; docs/TUTOR_PERSONA.md §10, §12)
// ─────────────────────────────────────────────────────────────────
import { QualityIssue, qerr, qwarn } from './types';
import { languageIssues, hasLabelPrefix } from './language';
import { lintQuiz, QuizLike } from './quizTools';
import { lintLessonLeaks, contentWords, norm, ChalkLike } from './leakLint';

export interface LessonDraft {
  topic?: string;
  grade?: string;
  subject?: string;
  tagline?: string;
  overview?: string;
  chalkNotes?: ChalkLike;
  quiz?: QuizLike & { lookFor?: string; parallelOf?: string };
  suggestedQuestions?: string[];
  /** Tutor-only probes (prerequisite / misconception). Never shown to the child. */
  diagnostics?: Array<{ purpose: 'prerequisite' | 'misconception'; question: string; listenFor?: string }>;
  // legacy fields that must not be generated any more (D7)
  scene3d?: unknown; photoVisual?: unknown; diagram?: unknown;
}

export interface LessonLintContext {
  keyFacts: string[];
  workedExamples: string[];
  /** The apply picture's ladder item (form A). The quiz must be a different problem (form B). */
  applyItem?: { prompt: string } | null;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => (s.match(/[^.!?]+[.!?]+/g) || [s]).filter((x) => x.trim()).length;
const ABSOLUTE_RE = /\b(never|always|every single|no exceptions|all living things|only ever|nothing else)\b/i;
const numerals = (s: string) => (norm(s).match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) || []);

export function lintLesson(lesson: LessonDraft, ctx: LessonLintContext): QualityIssue[] {
  const out: QualityIssue[] = [];

  // headline text
  if (!lesson.tagline?.trim()) out.push(qerr('lesson.tagline', 'tagline', 'missing'));
  else {
    languageIssues(lesson.tagline, 'tagline', { kind: 'tagline' }).forEach((i) => out.push(i));
    if (words(lesson.tagline) > 16) out.push(qwarn('lesson.tagline', 'tagline', 'longer than 16 words — one plain sentence'));
  }
  if (!lesson.overview?.trim()) out.push(qerr('lesson.overview', 'overview', 'missing'));
  else {
    languageIssues(lesson.overview, 'overview', { kind: 'tagline' }).forEach((i) => out.push(i));
    if (sentences(lesson.overview) > 2 || words(lesson.overview) > 60) out.push(qwarn('lesson.overview', 'overview', 'more than 2 sentences / 60 words'));
  }

  // chalk notes: what the learner keeps
  const chalk = lesson.chalkNotes;
  if (!chalk) out.push(qerr('chalk.missing', 'chalkNotes', 'missing'));
  else {
    const bullets = chalk.bulletPoints || [];
    if (bullets.length < 3 || bullets.length > 6) out.push(qwarn('chalk.bullet-count', 'chalk.bullets', `${bullets.length} bullets — keep 3 to 6, one idea each`));
    if (!chalk.coreRuleOrFormula?.trim()) out.push(qerr('chalk.core', 'chalk.core', 'no core rule'));
    if (!chalk.title?.trim()) out.push(qwarn('chalk.title', 'chalk.title', 'missing'));
    const seen = new Set<string>();
    const rare = new Set(ctx.keyFacts.concat(ctx.workedExamples).flatMap((t) => contentWords(t)).filter((w) => w.length >= 5 || /\d/.test(w)));
    const spots: Array<[string, string]> = [
      ['chalk.title', chalk.title || ''], ['chalk.subtitle', chalk.subtitle || ''], ['chalk.core', chalk.coreRuleOrFormula || ''],
      ...bullets.map((b, i): [string, string] => [`chalk.bullet[${i}]`, b]),
      ...(chalk.keyTakeaways || []).map((b, i): [string, string] => [`chalk.takeaway[${i}]`, b]),
    ];
    for (const [where, text] of spots) {
      languageIssues(text, where).forEach((i) => out.push(i));
      if (where.startsWith('chalk.bullet') || where.startsWith('chalk.takeaway')) {
        if (words(text) > 30) out.push(qwarn('chalk.long', where, `${words(text)} words — one short idea`));
        const k = norm(text);
        if (seen.has(k)) out.push(qwarn('chalk.duplicate', where, 'repeats another line'));
        seen.add(k);
        if (ABSOLUTE_RE.test(text) && !ctx.keyFacts.some((f) => ABSOLUTE_RE.test(f))) out.push(qwarn('chalk.absolute', where, `absolute claim ("${text.slice(0, 60)}") that no key fact makes — check it is exactly true`));
      }
      if ((where.startsWith('chalk.bullet') || where === 'chalk.core') && rare.size) {
        const cw = contentWords(text);
        if (cw.length >= 3 && !cw.some((w) => rare.has(w))) out.push(qwarn('chalk.untraceable', where, `shares no key term with the curriculum's key facts or examples ("${text.slice(0, 60)}")`));
      }
    }
  }

  // quiz
  out.push(...lintQuiz(lesson.quiz));
  if (lesson.quiz && ctx.applyItem) {
    const qn = numerals(lesson.quiz.question), an = numerals(ctx.applyItem.prompt);
    const A = new Set(qn), B = new Set(an);
    let inter = 0; A.forEach((x) => { if (B.has(x)) inter++; });
    const jac = A.size + B.size ? inter / (A.size + B.size - inter) : 0;
    const qw = new Set(contentWords(lesson.quiz.question)), aw = contentWords(ctx.applyItem.prompt);
    const wordOverlap = aw.length ? aw.filter((w) => qw.has(w)).length / aw.length : 0;
    if ((qn.length >= 3 && jac >= 0.8) || wordOverlap >= 0.8) {
      out.push(qerr('quiz.same-as-apply', 'quiz', 'the quiz repeats the application picture\'s problem — it must be a parallel problem (new context, new numbers)'));
    }
  }
  if (lesson.quiz && !lesson.quiz.lookFor?.trim()) out.push(qwarn('quiz.no-lookfor', 'quiz', 'no lookFor: the tutor cannot tell a reasoned answer from a lucky one'));
  if (lesson.quiz && (!lesson.quiz.optionNotes || lesson.quiz.optionNotes.length !== lesson.quiz.options?.length)) {
    out.push(qwarn('quiz.no-option-notes', 'quiz', 'each option needs a note on what choosing it suggests (tutor-only)'));
  }

  // suggested questions — a child's voice, no tutor machinery
  const sq = lesson.suggestedQuestions || [];
  if (sq.length !== 3) out.push(qwarn('suggested.count', 'suggestedQuestions', `${sq.length} questions — give 3`));
  const sqSeen = new Set<string>();
  sq.forEach((q, i) => {
    const where = `suggestedQuestions[${i}]`;
    if (hasLabelPrefix(q)) out.push(qerr('suggested.label-prefix', where, `starts with a label ("${q.slice(0, 40)}") — write it as the child would ask it`));
    if (!/\?\s*$/.test(q.trim())) out.push(qwarn('suggested.not-question', where, 'is not a question'));
    if (q.length > 140) out.push(qwarn('suggested.long', where, 'longer than 140 characters'));
    if (sqSeen.has(norm(q))) out.push(qwarn('suggested.duplicate', where, 'duplicate'));
    sqSeen.add(norm(q));
    languageIssues(q, where).forEach((x) => out.push(x));
  });

  // leaks
  out.push(...lintLessonLeaks({ chalkNotes: lesson.chalkNotes, quiz: lesson.quiz, suggestedQuestions: lesson.suggestedQuestions }, ctx.workedExamples));

  // legacy fields (D7)
  for (const f of ['scene3d', 'photoVisual', 'diagram'] as const) {
    if (lesson[f]) out.push(qwarn('lesson.legacy-field', f, `${f} is no longer generated — the board pictures and verified photo replace it`));
  }
  return out;
}
