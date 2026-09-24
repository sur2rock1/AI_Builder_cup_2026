// Smoke test (not part of npm test yet) for T03/T09/T10/T17/T20 — exercises
// the file-backed repo, recordReasoningEvidence, compileTeachingPlan and
// compilePlanDelta together against a throwaway data dir.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-smoke-'));

const script = `
import { getOrCreateLearner, ensureSubject, ensureConceptState, recordReasoningEvidence, getLearner } from '${root}/src/adaptive/learnerStore.ts';
import { compileTeachingPlan } from '${root}/src/plan/compile.ts';
import { compilePlanDelta, initialDeltaState } from '${root}/src/plan/delta.ts';

const curriculum = {
  id: 'demo', label: 'Demo Subject', grade: 'Secondary 2', source: 'test',
  concepts: [
    { id: 'c1', label: 'Concept One', subjectId: 'demo', prerequisites: [], commonMisconceptions: ['adds the sides instead of squaring'], keyFacts: ['fact'], workedExamples: [], difficultyLevel: 3, typicalTeachingOrder: 1, chapter: 'geo' },
  ],
  prerequisiteMap: {},
};

async function main() {
  await getOrCreateLearner('stu1', 'Test Student', 'Secondary 2');
  await ensureSubject('stu1', 'demo', curriculum.label, curriculum.grade, curriculum.source);
  await ensureConceptState('stu1', 'demo', 'c1', 'Concept One', 'direct_explanation', 'geo');

  let learner = await getLearner('stu1');
  let plan = compileTeachingPlan(learner, curriculum, { studentId: 'stu1', subjectId: 'demo', channel: 'voice', requestedConceptId: 'c1' });
  console.log('PLAN target:', plan.targetConcept.label, '| reps:', plan.representationOrder.slice(0,3).map(r=>r.strategy));
  if (plan.targetConcept.conceptId !== 'c1') throw new Error('FAIL: wrong target concept');

  // First observation: suspected misconception, wrong-ish answer.
  const r1 = await recordReasoningEvidence({
    studentId: 'stu1', subjectId: 'demo', conceptId: 'c1', conceptType: 'geo',
    difficultyLevel: 3, promptType: 'check',
    questionAsked: 'q1', childAnswer: 'a1', childReasoning: 'I added the two sides',
    classification: 'misconception_behind_correct', understandingDepth: 'incorrect',
    candidateMisconceptions: [{ id: 'c1::m1', text: 'adds the sides instead of squaring' }],
    confidence: 'medium', strategyInUse: 'direct_explanation', moveUsed: 'CHECK_UNDERSTANDING',
    sessionId: 'sess1',
  });
  if (!r1) throw new Error('FAIL: r1 null');
  console.log('r1 ledger status:', r1.ledger.map(l => l.status), 'mastery', r1.masteryBefore, '->', r1.masteryAfter);
  if (r1.ledger[0].status !== 'suspected') throw new Error('FAIL: expected suspected after 1 observation, got ' + r1.ledger[0].status);

  // Second, independent observation (a probe) -> should CONFIRM.
  const r2 = await recordReasoningEvidence({
    studentId: 'stu1', subjectId: 'demo', conceptId: 'c1', conceptType: 'geo',
    difficultyLevel: 3, promptType: 'probe',
    questionAsked: 'q2', childAnswer: 'a2', childReasoning: 'still added them',
    classification: 'misconception_behind_correct', understandingDepth: 'incorrect',
    candidateMisconceptions: [{ id: 'c1::m1', text: 'adds the sides instead of squaring' }],
    confidence: 'high', strategyInUse: 'direct_explanation', moveUsed: 'DISCRIMINATING_PROBE',
    sessionId: 'sess1',
  });
  console.log('r2 ledger status:', r2.ledger.map(l => l.status), 'newlyConfirmed:', r2.newlyConfirmed.length);
  if (r2.ledger[0].status !== 'confirmed') throw new Error('FAIL: expected confirmed after 2nd independent observation');
  if (r2.newlyConfirmed.length !== 1) throw new Error('FAIL: expected exactly one newlyConfirmed');

  // Plan delta on a failed check with direct_explanation -> should switch representation.
  const delta = compilePlanDelta(plan, initialDeltaState(), {
    conceptId: 'c1', outcome: 'misconception_confirmed', representationUsed: 'direct_explanation',
  });
  console.log('delta instruction:', delta.instruction);
  if (!/CONFIRMED/.test(delta.instruction)) throw new Error('FAIL: delta did not recognise confirmed misconception');

  // Re-fetch learner, re-compile plan: representation order / watch list should reflect the ledger.
  learner = await getLearner('stu1');
  const plan2 = compileTeachingPlan(learner, curriculum, { studentId: 'stu1', subjectId: 'demo', channel: 'voice', requestedConceptId: 'c1' });
  console.log('plan2 watchMisconceptions:', plan2.watchMisconceptions.map(w => w.status + ':' + w.text));
  if (plan2.watchMisconceptions.length !== 1 || plan2.watchMisconceptions[0].status !== 'confirmed') {
    throw new Error('FAIL: plan2 should watch the confirmed misconception');
  }
  const cs = learner.subjects.demo.conceptStates.c1;
  console.log('final ladder:', cs.ladder, 'masteryStatus:', cs.masteryStatus, 'pKnown:', cs.pKnown);
  if (cs.masteryStatus !== 'none') throw new Error('FAIL: masteryStatus should be none while a misconception stands (confirmed misconception blocks mastery)');

  console.log('ALL SMOKE CHECKS PASSED');
}
main().catch((e) => { console.error('SMOKE TEST FAILED:', e); process.exit(1); });
`;

fs.writeFileSync(path.join(tmp, 'run.mts'), script);
try {
  const out = execFileSync(process.execPath, ['--import', 'tsx', path.join(tmp, 'run.mts')], {
    cwd: root,
    env: { ...process.env, LEARNER_DATA_DIR: path.join(tmp, 'data'), USE_FIRESTORE_LEARNERS: 'false' },
    encoding: 'utf8',
  });
  console.log(out);
} catch (e) {
  console.error(e.stdout || '', e.stderr || '', e.message);
  process.exit(1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
