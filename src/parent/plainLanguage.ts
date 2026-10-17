// ─────────────────────────────────────────────────────────────────
// Parent view — plain-language layer. The ONLY place internal terms
// (ladder levels, move ids, strategy ids, error classes) become words a parent
// can read. A test (tests/parent) fails if a raw internal term leaks into a
// report. Pure functions, no I/O.
// ─────────────────────────────────────────────────────────────────
import type { TeachingStrategy } from '../adaptive/learnerModel';

export const STAGE_LABELS = [
  'Just getting started',
  'Recognises it',
  'Explains why it works',
  'Solves new problems',
  'Uses it in unfamiliar situations',
  'Can teach it back',
] as const;

export function stageLabel(stage: number): string {
  return STAGE_LABELS[Math.max(0, Math.min(5, Math.round(stage)))];
}

/** How Ananta explains a thing, in the words a parent would use. */
export const TEACHING_STYLE_WORDS: Record<TeachingStrategy, { noun: string; verbing: string }> = {
  direct_explanation:     { noun: 'a clear explanation', verbing: 'explaining it in words' },
  worked_example:         { noun: 'a worked example', verbing: 'working through an example together' },
  visual_diagram:         { noun: 'a picture or diagram', verbing: 'drawing it out' },
  real_world_analogy:     { noun: 'an everyday comparison', verbing: 'comparing it to something from everyday life' },
  socratic_questioning:   { noun: 'guiding questions', verbing: 'asking guiding questions' },
  step_by_step:           { noun: 'small steps', verbing: 'breaking it into small steps' },
  story_context:          { noun: 'a short story', verbing: 'telling it as a short story' },
  interactive_simulation: { noun: 'something to play with', verbing: 'letting them try it hands-on' },
  peer_comparison:        { noun: 'comparing two answers side by side', verbing: 'comparing two answers side by side' },
  prerequisite_review:    { noun: 'a quick refresher of earlier ideas', verbing: 'refreshing the earlier idea it builds on' },
};

export function styleNoun(s: string): string {
  return TEACHING_STYLE_WORDS[s as TeachingStrategy]?.noun || s.replace(/_/g, ' ');
}
export function styleVerbing(s: string): string {
  return TEACHING_STYLE_WORDS[s as TeachingStrategy]?.verbing || s.replace(/_/g, ' ');
}

/** What Ananta's check concluded about one answer, as one plain phrase. */
export function outcomeWords(e: { classification?: string; understandingDepth?: string; candidateMisconceptionIds?: string[] }): string {
  if ((e.candidateMisconceptionIds || []).length) return 'Ananta spotted a possible mix-up here';
  switch (e.understandingDepth) {
    case 'transferred': return 'Used the idea in a new situation';
    case 'applied':     return 'Solved a new problem with it';
    case 'understood':  return 'Explained it in their own words';
    case 'recognised':
    case 'memorised':   return 'Recognised it, but did not yet explain why';
    case 'guessed':     return 'Said it was a guess';
    case 'confused':    return 'Said it did not make sense yet';
    case 'incorrect':   return 'Not there yet';
    default:            return 'Checked by Ananta';
  }
}

/** Words that must never reach a parent screen. Used by the leak test and by sentence validation. */
export const INTERNAL_TERMS: RegExp[] = [
  /\bpKnown\b/i, /\bBKT\b/, /\bladder\b/i, /\bL[1-5]\b/, /\bDISCRIMINATING_PROBE\b/, /\bELICIT_REASONING\b/,
  /\b[A-Z]{3,}(?:_[A-Z]+)+\b/,              // SHOUTY_MOVE_IDS
  /\b(direct_explanation|worked_example|visual_diagram|real_world_analogy|socratic_questioning|step_by_step|story_context|interactive_simulation|peer_comparison|prerequisite_review)\b/,
  /\bmisconception_behind_correct\b/, /\bneeds_clarification\b/, /\bno_reasoning_given\b/, /\bwrong_answer\b/,
  /\bdurable\b/i, /\bprovisional\b/i, /\bderivation\b/i, /\bevidenceRefs?\b/i, /\bconceptType\b/i,
];

/** Labels about the child that Ananta must never write (mirrors the learner-model rule: strategies, not types of person). */
export const LABEL_PATTERNS: RegExp[] = [
  /\b(visual|auditory|kinesthetic|kinaesthetic)\s+learner\b/i,
  /\b(lazy|stupid|dumb|slow|weak|gifted|smart|clever|bright|behind|struggl\w+)\b/i,
  /\b(ADHD|autis\w+|dyslex\w+|dyscalcul\w+|disorder|disabilit\w+|special needs)\b/i,
  /\bunmotivated\b/i, /\b(genius|talent\w*|natural(ly)?|born|brilliant|amazing|incredible|superstar|prodigy)\b/i,
];

export function hasInternalTerm(text: string): boolean {
  return INTERNAL_TERMS.some((re) => re.test(text));
}
export function hasLabel(text: string): boolean {
  return LABEL_PATTERNS.some((re) => re.test(text));
}
