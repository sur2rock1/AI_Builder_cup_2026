// The "no reasoning → recognition at most" guard on quiz evidence. Run: npx tsx tests/smoke/quiz-evidence.mjs
import assert from 'node:assert/strict';
import { capForEvidence, hasReasoning } from '../../src/adaptive/assessmentEngine.ts';
let passed = 0;
const ok = (n, f) => { try { f(); passed++; console.log(`ok ${n}`); } catch (e) { console.error(`FAIL ${n}\n  ${e.message}`); process.exitCode = 1; } };
const strong = () => ({ understandingDepth: 'applied', misconceptionDetected: false, confidence: 'high', recommendedAction: 'advance', teachingNote: 'Solid.', masteryDelta: 15 });

ok('reasoning needs the child\'s own words (3+), not just a chip', () => {
  assert.equal(hasReasoning({ how: 'worked_out' }), false);
  assert.equal(hasReasoning({ text: 'same x' }), false);
  assert.equal(hasReasoning({ text: 'both points have x equal to 7' }), true);
  assert.equal(hasReasoning(null), false);
});
ok('a correct pick with no reasoning is capped at recognition and cannot advance', () => {
  const r = capForEvidence(strong(), null, true);
  assert.equal(r.understandingDepth, 'recognised'); assert.ok(r.masteryDelta <= 5);
  assert.equal(r.recommendedAction, 'reinforce'); assert.equal(r.confidence, 'medium');
  assert.match(r.teachingNote, /no reasoning was given/);
});
ok('"I guessed" is never scored as understanding, even with words', () => {
  const r = capForEvidence(strong(), { how: 'guessed', text: 'I just picked the first one really' }, true);
  assert.equal(r.understandingDepth, 'guessed'); assert.ok(r.masteryDelta <= 0);
});
ok('a reasoned answer keeps the model\'s assessment untouched', () => {
  const r = capForEvidence(strong(), { how: 'worked_out', text: 'both points have x equal to 7 so x = 7' }, true);
  assert.deepEqual(r, strong());
});
ok('a wrong pick is never made to look better', () => {
  const w = { ...strong(), understandingDepth: 'incorrect', masteryDelta: -10, recommendedAction: 'switch_strategy' };
  assert.deepEqual(capForEvidence(w, null, false), w);
});
console.log(`\n${passed} quiz-evidence checks passed`);
