// Ingest: the L3 parallel pair (form A picture / form B quiz) and coverage gaps. Run: npx tsx tests/smoke/ladder-pair.mjs
import assert from 'node:assert/strict';
import { applyVerification } from '../../src/curriculum/structure.ts';
import { reviewPrompt } from '../../src/curriculum/pdfIngest.ts';
let passed = 0;
const ok = (n, f) => { try { f(); passed++; console.log(`ok ${n}`); } catch (e) { console.error(`FAIL ${n}\n  ${e.message}`); process.exitCode = 1; } };
const tally = () => ({ checked: 0, rejected: 0, corrected: 0, examplesDropped: 0, examplesCorrected: 0, issues: [] });
const draft = { label: 'Horizontal and vertical lines', keyFacts: ['x = a is vertical'], workedExamples: [], misconceptions: [] };
const review = (ladder, extra = {}) => ({ conceptId: 'c', verdict: 'ok', keyFacts: ['x = a is vertical'], workedExamples: [], misconceptions: [], ladder, representations: [], ...extra });
const L = (level, id, prompt = `p${level}${id || ''}`) => ({ level, id, prompt, lookFor: 'x' });

ok('two L3 items are kept as L3-A / L3-B; ids are assigned when the model omits them', () => {
  const t = tally();
  const r = applyVerification(draft, review([L(1), L(2), L(3, undefined, 'a'), L(3, undefined, 'b'), L(4)]), t);
  const l3 = r.ladderItems.filter((l) => l.level === 3);
  assert.deepEqual(l3.map((l) => l.id), ['L3-A', 'L3-B']); assert.equal(r.ladderItems.find((l) => l.level === 1).id, 'L1');
  assert.ok(!t.issues.some((i) => /only one L3/.test(i)));
});
ok('a third L3 item is dropped (a pair, no more)', () => {
  const r = applyVerification(draft, review([L(3, 'L3-A'), L(3, 'L3-B'), L(3, 'L3-B', 'extra')]), tally());
  assert.equal(r.ladderItems.filter((l) => l.level === 3).length, 2);
});
ok('a single L3 is reported so the parallel quiz item is known to be model-authored', () => {
  const t = tally(); applyVerification(draft, review([L(1), L(2), L(3, 'L3-A'), L(4)]), t);
  assert.ok(t.issues.some((i) => /only one L3/.test(i)));
});
ok('coverage gaps from the reviewer are reported, never silently filled', () => {
  const t = tally(); const r = applyVerification(draft, review([L(3, 'L3-A')], { coverageGaps: [{ level: 4, missing: 'the gradient formula is never taught' }] }), t);
  assert.ok(t.issues.some((i) => /L4 cannot be answered from the material — the gradient formula/.test(i)));
  assert.deepEqual(r.keyFacts, ['x = a is vertical'], 'key facts unchanged');
});
ok('the review prompt asks for a parallel pair and teach-before-test', () => {
  const p = reviewPrompt({ ctx: { gradeLevel: 8, label: 'x', subject: 'Mathematics' }, mode: 'well_structured', chapterLabel: 'Ch', concepts: [] });
  for (const s of ['PARALLEL PAIR', 'L3-A', 'L3-B', 'TEACH BEFORE TEST', 'coverageGaps']) assert.ok(p.includes(s), s);
});
console.log(`\n${passed} ladder-pair checks passed`);
