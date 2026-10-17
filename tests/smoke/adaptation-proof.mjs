// ─────────────────────────────────────────────────────────────────
// Adaptation proof: the tutor's plan for a child changes with what the child's own answers showed.
//
//   npx tsx tests/smoke/adaptation-proof.mjs
//
// Runs on a throwaway data folder (LEARNER_DATA_DIR), never on data/. Uses the real pipeline:
// recordReasoningEvidence (BKT, ladder, misconception ledger, strategy profile) -> compileTeachingPlan
// -> renderPlanForPrompt (what the voice tutor is told) -> compilePlanDelta (what changes mid-lesson).
// See docs/ADAPTIVE_TEACHING.md.
// ─────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ananta-adapt-'));
process.env.LEARNER_DATA_DIR = tmp;

const { getOrCreateLearner, ensureSubject, ensureConceptState, recordReasoningEvidence, getLearner } = await import('../../src/adaptive/learnerStore.ts');
const { listCurriculaAsync } = await import('../../src/curriculum/ingest.ts');
const { conceptTypeFor } = await import('../../src/curriculum/catalog.ts');
const { compileTeachingPlan, renderPlanForPrompt } = await import('../../src/plan/index.ts');
const { compilePlanDelta, initialDeltaState } = await import('../../src/plan/delta.ts');

let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failed++; };

const courses = await listCurriculaAsync();
const course = courses.find((c) => c.id === 'cambridge-lower-secondary--g4--mathematics') || courses.find((c) => c.concepts.length >= 3);
if (!course) { console.log('SKIP  no course with 3+ concepts in data/curricula.json'); process.exit(0); }
const sorted = [...course.concepts].sort((a, b) => a.typicalTeachingOrder - b.typicalTeachingOrder);
const learned = sorted.slice(0, Math.min(3, sorted.length - 1));
const target = sorted[sorted.length - 1];
const type = conceptTypeFor(learned[0]);

async function child(id, history) {
  await getOrCreateLearner(id, id, course.grade, { board: course.board, gradeLevel: course.gradeLevel });
  await ensureSubject(id, course.id, course.label, course.grade, course.source);
  for (const c of [...learned, target]) await ensureConceptState(id, course.id, c.id, c.label, 'direct_explanation', conceptTypeFor(c));
  let n = 0;
  for (const [concept, strategy, good] of history) {
    await recordReasoningEvidence({
      studentId: id, subjectId: course.id, conceptId: concept.id, conceptType: conceptTypeFor(concept),
      difficultyLevel: concept.difficultyLevel || 2, promptType: 'check',
      questionAsked: `(test) question ${++n}`, childAnswer: good ? '(test) right, with a sound method' : '(test) wrong',
      childReasoning: good ? '(test) I worked it out step by step' : '(test) I am not sure',
      classification: good ? 'clear_reasoning' : 'wrong_answer', understandingDepth: good ? 'applied' : 'incorrect',
      candidateMisconceptions: [], confidence: good ? 'high' : 'low',
      strategyInUse: strategy, sessionId: `s${Math.ceil(n / 3)}`, source: 'voice', moveUsed: 'CHECK_UNDERSTANDING',
    });
  }
  const learner = await getLearner(id);
  const plan = compileTeachingPlan(learner, course, { studentId: id, subjectId: course.id, channel: 'voice', requestedConceptId: target.id });
  return { learner, plan, order: plan.representationOrder.map((r) => r.strategy), avoid: plan.avoidRepresentations.map((a) => a.strategy) };
}

const fail = (c, s) => [c, s, false];
const pass = (c, s) => [c, s, true];
const [A, B, C] = [learned[0], learned[1] || learned[0], learned[2] || learned[0]];

// 1. A new child: no history, so the default order.
const fresh = await child('test_new', []);
// 2. Pictures did not help this child; worked examples did.
const examples = await child('test_examples', [
  fail(A, 'visual_diagram'), fail(B, 'visual_diagram'), fail(C, 'visual_diagram'), fail(A, 'visual_diagram'),
  pass(A, 'worked_example'), pass(B, 'worked_example'), pass(C, 'worked_example'),
]);
// 3. The mirror image: worked examples did not help; pictures did.
const pictures = await child('test_pictures', [
  fail(A, 'worked_example'), fail(B, 'worked_example'), fail(C, 'worked_example'), fail(A, 'worked_example'),
  pass(A, 'visual_diagram'), pass(B, 'visual_diagram'), pass(C, 'visual_diagram'),
]);

console.log(`course: ${course.label} (${course.grade}); target: "${target.label}"; concept type: ${type}`);
console.log(`  new child:          ${fresh.order.join(' -> ')}`);
console.log(`  examples child:     ${examples.order.join(' -> ')}   avoid: ${examples.avoid.join(', ') || '-'}`);
console.log(`  pictures child:     ${pictures.order.join(' -> ')}   avoid: ${pictures.avoid.join(', ') || '-'}`);

ok(examples.order[0] === 'worked_example', 'a child for whom worked examples worked is taught with a worked example first');
ok(examples.avoid.includes('visual_diagram') && examples.order.indexOf('visual_diagram') === examples.order.length - 1, '...and pictures, which failed 4 times, are marked "avoid" and moved to the end of the order');
ok(pictures.order[0] === 'visual_diagram', 'the mirror-image child is taught with a picture first');
ok(pictures.avoid.includes('worked_example'), '...and worked examples are avoided for that child');
ok(examples.order.join() !== pictures.order.join() && examples.order.join() !== fresh.order.join(), 'three children, three different plans for the same lesson');

// What the voice tutor is actually told.
const told = renderPlanForPrompt(examples.plan, 'Test');
ok(/worked example really helped you/i.test(told), 'the tutor is told to open with what worked ("Last time, worked example really helped you...")');
ok(/Avoid: visual diagram/i.test(told), 'the tutor is told what to avoid');

// The gain fix: a wrong answer must not count in favour of the approach that was used.
const sp = examples.learner.strategyProfile?.[type] || {};
ok((sp.visual_diagram?.alpha ?? 1) <= 1.01 && (sp.visual_diagram?.beta ?? 1) >= 4.9, `4 wrong answers taught with pictures score 0 gains, 4 misses (alpha ${sp.visual_diagram?.alpha?.toFixed(2)}, beta ${sp.visual_diagram?.beta?.toFixed(2)})`);

// Mid-lesson: a missed check moves to the next approach in THIS child's order (never an avoided one).
const delta = compilePlanDelta(examples.plan, initialDeltaState(), {
  conceptId: target.id, outcome: 'failed_check', representationUsed: examples.order[0], questionKey: 'q1', hasReasoning: true,
});
ok(delta.nextRepresentation === examples.order[1] && !examples.avoid.includes(delta.nextRepresentation), `after a miss mid-lesson the tutor switches to "${delta.nextRepresentation}", the next approach in this child's order`);
const two = compilePlanDelta(examples.plan, delta.state, {
  conceptId: target.id, outcome: 'failed_check', representationUsed: delta.nextRepresentation, questionKey: 'q2', hasReasoning: true,
});
ok(two.teachDirectly === true, 'after two misses in a row the tutor stops questioning and teaches directly');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) failed` : '\nall adaptation checks passed');
process.exit(failed ? 1 : 0);
