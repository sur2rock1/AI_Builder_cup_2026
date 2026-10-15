// Scoring for the diagnosis-accuracy evaluation. Pure functions: no network, no model.
// See docs/EVALUATION.md for the definitions and the limits of what this shows.

export type Cls =
  | 'clear_reasoning'
  | 'needs_clarification'
  | 'misconception_behind_correct'
  | 'wrong_answer'
  | 'no_reasoning_given';

export const CLASSES: Cls[] = [
  'clear_reasoning', 'needs_clarification', 'misconception_behind_correct', 'wrong_answer', 'no_reasoning_given',
];

export interface AnantaOut {
  classification: Cls;
  ids: string[];
  confidence: string;
  shouldProbe: boolean;
  probeQuestion?: string;
  tutorGuidance: string;
  reasoningSummary: string;
  faultyStep?: string;
}

export interface NaiveOut { understands: boolean | null; reason: string; error?: string }

export interface CaseRecord {
  id: string;
  concept: string;
  conceptLabel: string;
  tags: string[];
  answerCorrect: boolean;
  question: string;
  expectedAnswer: string;
  childAnswer: string;
  childReasoning: string;
  gold: { classification: Cls; misconceptionId: string | null };
  ananta: AnantaOut | null;
  /** True when every model failed and the assessor returned its conservative fallback. */
  anantaFellBack: boolean;
  attempts: number;
  model: string;
  latencyMs: number | null;
  leak: 'leak' | 'no_leak' | 'not_checkable';
  naive: NaiveOut | null;
}

export interface Rate { k: number; n: number; p: number | null; lo: number | null; hi: number | null }

/** Wilson score interval, 95%. Honest about small n: n=10 gives very wide intervals. */
export function rate(k: number, n: number, z = 1.96): Rate {
  if (n === 0) return { k, n, p: null, lo: null, hi: null };
  const p = k / n, z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { k, n, p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

export function pct(r: Rate | null | undefined, digits = 0): string {
  if (!r || r.p === null) return 'n/a';
  return `${(r.p * 100).toFixed(digits)}%`;
}
export function ci(r: Rate): string {
  if (r.p === null || r.lo === null || r.hi === null) return '';
  return `${(r.lo * 100).toFixed(0)}–${(r.hi * 100).toFixed(0)}%`;
}

export function percentile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}

export type System = 'answer_only' | 'naive_llm' | 'ananta';
export const SYSTEM_LABEL: Record<System, string> = {
  answer_only: 'Answer-checking only (what most quiz apps do)',
  naive_llm: 'Plain Gemini prompt: "does the child understand?"',
  ananta: 'Ananta reasoning assessor',
};

/** Did this system flag "right answer, but the reasoning is broken"? null = system produced no usable output. */
export function flagged(r: CaseRecord, sys: System): boolean | null {
  if (sys === 'answer_only') return false; // checks the final answer only, so a correct answer is never questioned
  if (sys === 'naive_llm') {
    if (!r.naive || r.naive.understands === null) return null;
    return r.answerCorrect && r.naive.understands === false;
  }
  if (!r.ananta || r.anantaFellBack) return null;
  return r.ananta.classification === 'misconception_behind_correct';
}

const isUnclear = (c: Cls) => c === 'needs_clarification' || c === 'no_reasoning_given';

export function systemSummary(records: CaseRecord[], sys: System) {
  let hiddenK = 0, hiddenN = 0, clearK = 0, clearN = 0, unclearK = 0, unclearN = 0, flaggedAll = 0, flaggedTrue = 0;
  for (const r of records) {
    const f = flagged(r, sys);
    if (f === null) continue;
    const g = r.gold.classification;
    if (f) { flaggedAll++; if (g === 'misconception_behind_correct') flaggedTrue++; }
    if (g === 'misconception_behind_correct') { hiddenN++; if (f) hiddenK++; }
    else if (g === 'clear_reasoning') { clearN++; if (f) clearK++; }
    else if (isUnclear(g)) { unclearN++; if (f) unclearK++; }
  }
  return {
    system: sys,
    label: SYSTEM_LABEL[sys],
    hiddenRecall: rate(hiddenK, hiddenN),
    falseAlarmOnSound: rate(clearK, clearN),
    flagRateOnUnclear: rate(unclearK, unclearN),
    precision: rate(flaggedTrue, flaggedAll),
  };
}

const flat = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[.!?,;:]+$/g, '').trim();

/** Does the probe or guidance contain the expected answer? Only checkable for answers of 5+ characters ("x = 4" yes, "No" or "600" no). */
export function leakCheck(expected: string, probe?: string, guidance?: string): CaseRecord['leak'] {
  const e = flat(expected);
  if (e.length < 5) return 'not_checkable';
  return flat(`${probe || ''} ${guidance || ''}`).includes(e) ? 'leak' : 'no_leak';
}

export function computeMetrics(all: CaseRecord[]) {
  const valid = all.filter(r => r.ananta && !r.anantaFellBack);
  const fallbacks = all.filter(r => r.anantaFellBack || !r.ananta);

  const strict = rate(valid.filter(r => r.ananta!.classification === r.gold.classification).length, valid.length);
  const coarseOf = (c: Cls) => (isUnclear(c) ? 'needs_probe' : c);
  const coarse = rate(valid.filter(r => coarseOf(r.ananta!.classification) === coarseOf(r.gold.classification)).length, valid.length);

  const withId = valid.filter(r => r.gold.misconceptionId);
  const idHitOverall = rate(withId.filter(r => r.ananta!.ids.includes(r.gold.misconceptionId!)).length, withId.length);
  const hiddenWithId = withId.filter(r => r.gold.classification === 'misconception_behind_correct');
  const wrongWithId = withId.filter(r => r.gold.classification === 'wrong_answer');
  const idHitHidden = rate(hiddenWithId.filter(r => r.ananta!.ids.includes(r.gold.misconceptionId!)).length, hiddenWithId.length);
  const idHitWrong = rate(wrongWithId.filter(r => r.ananta!.ids.includes(r.gold.misconceptionId!)).length, wrongWithId.length);

  const noMis = valid.filter(r => !r.gold.misconceptionId);
  const spuriousIds = rate(noMis.filter(r => r.ananta!.ids.length > 0).length, noMis.length);

  const clearItems = valid.filter(r => r.gold.classification === 'clear_reasoning');
  const clearAnyId = rate(clearItems.filter(r => r.ananta!.ids.length > 0).length, clearItems.length);

  const notClear = valid.filter(r => r.ananta!.classification !== 'clear_reasoning');
  const probeDiscipline = rate(notClear.filter(r => r.ananta!.shouldProbe).length, notClear.length);

  const adv = valid.filter(r => r.tags.includes('adversarial'));
  const advResisted = rate(adv.filter(r => r.ananta!.classification !== 'clear_reasoning').length, adv.length);

  const checkable = valid.filter(r => r.leak !== 'not_checkable');
  const leaks = rate(checkable.filter(r => r.leak === 'leak').length, checkable.length);

  const lat = valid.map(r => r.latencyMs).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
  const latency = {
    n: lat.length,
    p50: percentile(lat, 0.5), p95: percentile(lat, 0.95), max: lat.length ? lat[lat.length - 1] : null,
    mean: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null,
  };

  const confusion: Record<string, Record<string, number>> = {};
  for (const g of CLASSES) { confusion[g] = {}; for (const p of CLASSES) confusion[g][p] = 0; }
  for (const r of valid) confusion[r.gold.classification][r.ananta!.classification]++;

  const concepts = Array.from(new Set(all.map(r => r.concept))).sort();
  const byConcept = concepts.map(c => {
    const rs = valid.filter(r => r.concept === c);
    return {
      concept: c, label: all.find(r => r.concept === c)?.conceptLabel || c,
      acc: rate(rs.filter(r => r.ananta!.classification === r.gold.classification).length, rs.length),
    };
  });

  const byConfidence = ['high', 'medium', 'low'].map(c => {
    const rs = valid.filter(r => r.ananta!.confidence === c);
    return { confidence: c, acc: rate(rs.filter(r => r.ananta!.classification === r.gold.classification).length, rs.length) };
  });

  const goldCounts: Record<string, number> = {};
  for (const r of all) goldCounts[r.gold.classification] = (goldCounts[r.gold.classification] || 0) + 1;

  return {
    n: all.length, nValid: valid.length, nFallback: fallbacks.length, goldCounts,
    strict, coarse, idHitOverall, idHitHidden, idHitWrong, spuriousIds, clearAnyId,
    probeDiscipline, advResisted, leaks, latency, confusion, byConcept, byConfidence,
    systems: (['answer_only', 'naive_llm', 'ananta'] as System[]).map(s => systemSummary(all, s)),
  };
}

export type Metrics = ReturnType<typeof computeMetrics>;

/** Did the case come out as the gold label? Used to highlight misses in the report. */
export function isMiss(r: CaseRecord): boolean {
  if (!r.ananta || r.anantaFellBack) return true;
  if (r.ananta.classification !== r.gold.classification) return true;
  if (r.gold.misconceptionId && !r.ananta.ids.includes(r.gold.misconceptionId)) return true;
  return false;
}
