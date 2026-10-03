// ─────────────────────────────────────────────────────────────────
// Persona language rules as code (docs/TUTOR_PERSONA.md §10).
//
//   • never "wrong" / "incorrect" / "mistake" / "silly" — the error belongs
//     to the rule, never the learner;
//   • no emoji or tick/cross marks as verdicts on the board;
//   • misconceptions are diagnosed, not pre-announced (H5), so the word
//     "misconception" and alert-style headings never reach the child;
//   • probes and ladder levels are the tutor's machinery, not the child's
//     vocabulary ("Prerequisite Diagnostic:", "L3"…);
//   • taglines say what the lesson is, not how amazing it is.
// ─────────────────────────────────────────────────────────────────
import { QualityIssue, qerr, qwarn } from './types';

const BANNED_ERROR: Array<[RegExp, string]> = [
  [/\bwrong\b/i, '"wrong"'],
  [/\bincorrect(ly)?\b/i, '"incorrect"'],
  [/\bmistake[ns]?\b/i, '"mistake"'],
  [/\bmistaken\b/i, '"mistaken"'],
  [/\bsilly\b/i, '"silly"'],
  [/\bstupid\b/i, '"stupid"'],
  [/\bdumb\b/i, '"dumb"'],
  [/\bcareless\b/i, '"careless"'],
];

/** Words that are sometimes legitimate science/maths but usually read as a verdict on a child. */
const BANNED_WARN: Array<[RegExp, string]> = [
  [/\bimpossible\b/i, '"impossible" (say what actually happens instead)'],
  [/\bbad\b/i, '"bad"'],
  [/\bnever works\b/i, '"never works"'],
];

const EMOJI_RE = /[\p{Extended_Pictographic}✓✔✕✖✗✘❌❎]/u;

/** Learner-facing text must not pre-announce misconceptions or use tutor machinery words. */
const ANNOUNCE_RE = /\b(misconception|misconceptions|alert|watch out|beware|don'?t be fooled|common trap|pitfall)\b/i;
const JARGON_RE = /\b(prerequisite|diagnostic|probe|ladder|scaffold|bkt|evidence level|L[1-5])\b/i;

const MARKETING_RE = /\b(unlock|embark|journey|secrets?|magic(al)?|mastery|master the|dive (in|into)|fascinating|amazing|awesome|supercharge|game-?changer|discover the power)\b/i;

/** "Misconception Probe: …", "Prerequisite Check: …" — a label ahead of a colon. */
const LABEL_PREFIX_RE = /^\s*[A-Za-z][A-Za-z /-]{2,32}:\s+\S/;

export interface LanguageOptions {
  /** 'child' = anything the learner reads; 'tagline' = marketing-speak check too. */
  kind?: 'child' | 'tagline';
  /** Set when the text is about a tutor-visible field (why, checkQuestion is child-facing). */
  allowMisconceptionWord?: boolean;
}

export function languageIssues(text: string | undefined, where: string, opts: LanguageOptions = {}): QualityIssue[] {
  if (!text) return [];
  const out: QualityIssue[] = [];
  for (const [re, name] of BANNED_ERROR) {
    if (re.test(text)) out.push(qerr('persona.banned-word', where, `uses ${name} — the error belongs to the rule, never the learner ("${clip(text)}")`));
  }
  for (const [re, name] of BANNED_WARN) {
    if (re.test(text)) out.push(qwarn('persona.soft-verdict', where, `uses ${name} ("${clip(text)}")`));
  }
  if (EMOJI_RE.test(text)) out.push(qerr('persona.emoji-verdict', where, `contains an emoji or tick/cross mark — no verdict symbols on the board ("${clip(text)}")`));
  if (!opts.allowMisconceptionWord && ANNOUNCE_RE.test(text)) {
    out.push(qerr('persona.pre-announced-misconception', where, `pre-announces a misconception ("${clip(text)}") — diagnose first, contrast second (H5)`));
  }
  if (JARGON_RE.test(text)) out.push(qerr('persona.tutor-jargon', where, `shows the child tutor machinery ("${clip(text)}")`));
  if (opts.kind === 'tagline' && MARKETING_RE.test(text)) out.push(qwarn('persona.marketing', where, `marketing-speak ("${clip(text)}") — say what the lesson is about`));
  return out;
}

/** A suggested question must read like a child asked it: no label before a colon. */
export function hasLabelPrefix(text: string): boolean {
  return LABEL_PREFIX_RE.test(text);
}

function clip(s: string, n = 70): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}
