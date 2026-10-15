// Offline checks for the evaluation scoring code. npm run test:eval
import { CaseRecord, computeMetrics, leakCheck, rate, flagged } from '../../evals/diagnosis/metrics';

let bad = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) bad++; };
const near = (a: number | null, b: number, t = 0.002) => a !== null && Math.abs(a - b) < t;

// Wilson interval reference values (n=10)
const r0 = rate(0, 10), r10 = rate(10, 10), r5 = rate(5, 10);
ok(near(r0.lo, 0) && near(r0.hi, 0.2775), `Wilson 0/10 -> 0-27.7% (got ${r0.lo}-${r0.hi})`);
ok(near(r10.lo, 0.7225) && near(r10.hi, 1), `Wilson 10/10 -> 72.3-100%`);
ok(near(r5.lo, 0.2366) && near(r5.hi, 0.7634), `Wilson 5/10 -> 23.7-76.3%`);
ok(rate(0, 0).p === null, 'n=0 gives no rate, not NaN');

const mk = (id: string, gold: any, pred: any, o: Partial<CaseRecord> = {}): CaseRecord => ({
  id, concept: 'A', conceptLabel: 'A', tags: [], answerCorrect: gold !== 'wrong_answer', question: 'q', expectedAnswer: 'x = 4', childAnswer: 'a', childReasoning: 'r',
  ananta: pred && { classification: pred, ids: [], confidence: 'high', shouldProbe: pred !== 'clear_reasoning', tutorGuidance: 'g', reasoningSummary: 's' },
  anantaFellBack: false, attempts: 1, model: 'm', latencyMs: 1000, leak: 'not_checkable', naive: null, ...o,
  gold: { classification: gold, misconceptionId: null },
});

const recs: CaseRecord[] = [
  mk('h1', 'misconception_behind_correct', 'misconception_behind_correct'),   // caught
  mk('h2', 'misconception_behind_correct', 'clear_reasoning'),                // missed
  mk('c1', 'clear_reasoning', 'clear_reasoning'),                              // fine
  mk('c2', 'clear_reasoning', 'misconception_behind_correct'),                 // false alarm
  mk('n1', 'needs_clarification', 'no_reasoning_given'),                       // coarse match, strict miss
  mk('f1', 'misconception_behind_correct', 'clear_reasoning', { anantaFellBack: true }), // fallback: excluded
];
const m = computeMetrics(recs);
ok(m.n === 6 && m.nValid === 5 && m.nFallback === 1, 'fallback items are excluded from scoring and counted separately');
const a = m.systems.find(s => s.system === 'ananta')!;
ok(a.hiddenRecall.k === 1 && a.hiddenRecall.n === 2, `hidden recall counts 1 of 2 scored (got ${a.hiddenRecall.k}/${a.hiddenRecall.n})`);
ok(a.falseAlarmOnSound.k === 1 && a.falseAlarmOnSound.n === 2, 'false alarm 1 of 2 sound cases');
ok(a.precision.k === 1 && a.precision.n === 2, 'precision = 1 of 2 flags was a real hidden case');
ok(m.strict.k === 2 && m.strict.n === 5, `strict accuracy 2/5 (got ${m.strict.k}/${m.strict.n})`);
ok(m.coarse.k === 3 && m.coarse.n === 5, 'merging thin + no-reasoning gives 3/5');
const o = m.systems.find(s => s.system === 'answer_only')!;
ok(o.hiddenRecall.k === 0 && o.hiddenRecall.n === 3, 'answer-only baseline catches 0 hidden cases (includes the fallback item: baseline does not depend on the model)');
ok(m.confusion.clear_reasoning.misconception_behind_correct === 1, 'confusion matrix counts the false alarm');

// naive baseline: only counts when the answer was right AND it says the child does not understand
const nv = mk('x', 'misconception_behind_correct', 'clear_reasoning', { naive: { understands: false, reason: '' } });
ok(flagged(nv, 'naive_llm') === true, 'naive flags a correct answer it judges not understood');
const nv2 = mk('y', 'wrong_answer', 'wrong_answer', { naive: { understands: false, reason: '' }, answerCorrect: false });
ok(flagged(nv2, 'naive_llm') === false, 'naive does not count a wrong answer as a hidden-misconception flag');
ok(flagged(mk('z', 'clear_reasoning', 'clear_reasoning', { naive: { understands: null, reason: '', error: 'x' } }), 'naive_llm') === null, 'naive with no usable output is excluded, not counted as a pass');

// answer leak check
ok(leakCheck('x = 4', 'Is x = 4 here?', '') === 'leak', 'detects the expected answer inside a probe');
ok(leakCheck('x = 4', 'What do you get for 6 and 8?', 'Ask the probe') === 'no_leak', 'no leak when the answer is absent');
ok(leakCheck('No', 'No way', '') === 'not_checkable', 'short answers are not checkable');

// adversarial: an injected case that comes back "clear_reasoning" must count as not resisted
const adv = computeMetrics([mk('a1', 'wrong_answer', 'clear_reasoning', { tags: ['adversarial'] }), mk('a2', 'wrong_answer', 'wrong_answer', { tags: ['adversarial'] })]);
ok(adv.advResisted.k === 1 && adv.advResisted.n === 2, 'injection resistance = 1 of 2');

console.log(bad ? `\n${bad} check(s) failed` : '\nall eval-metric checks passed');
process.exit(bad ? 1 : 0);
