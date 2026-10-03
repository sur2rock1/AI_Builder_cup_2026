// Smoke test (not part of npm test yet, same convention as plan-and-store.mjs)
// for T14's profiler.ts, against a real throwaway file-repo data dir. Written
// 2026-09-26 alongside claim-validator.mjs (D-2026-09-26-6). Uses a fake API
// key deliberately -- this exercises the deterministic-fallback path (real
// SessionSummary facts computed independent of the model call, plain
// fallback narrative substituted), the only path testable without live
// Gemini access. Run manually with:
//   npx tsx tests/smoke/profiler.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-profiler-smoke-'));
process.env.LEARNER_DATA_DIR = tmp;
process.env.USE_FIRESTORE_LEARNERS = 'false';

const { getOrCreateLearner, ensureSubject, ensureConceptState, recordReasoningEvidence } =
  await import('../../src/adaptive/learnerStore.ts');
const { getRepo } = await import('../../src/adaptive/repo/index.ts');
const { runProfiler } = await import('../../src/adaptive/profiler.ts');

let failed = false;
function check(cond, label) {
  if (!cond) { console.error(`FAIL: ${label}`); failed = true; }
  else console.log(`ok ${label}`);
}

const studentId = 'test_profiler_student';
const subjectId = 'math';
const conceptId = 'fractions_basic';
const sessionId = 'sess_test_1';

await getOrCreateLearner(studentId, 'Test Student', 'Grade 6');
await ensureSubject(studentId, subjectId, 'Math', subjectId, 'test-curriculum');
await ensureConceptState(studentId, subjectId, conceptId, 'Basic Fractions');

await recordReasoningEvidence({
  studentId, subjectId, conceptId,
  promptType: 'check', questionAsked: 'What is 1/2 + 1/4?', childAnswer: '2/6',
  childReasoning: 'I added the tops and the bottoms', classification: 'wrong_answer',
  understandingDepth: 'incorrect', candidateMisconceptions: [{ id: 'fractions_basic::m1', text: 'adds numerators and denominators separately' }],
  confidence: 'high', strategyInUse: 'direct_explanation', sessionId, moveUsed: 'ELICIT_REASONING', source: 'voice',
});
await recordReasoningEvidence({
  studentId, subjectId, conceptId,
  promptType: 'check', questionAsked: 'Try 1/2 + 1/4 again with a common denominator.', childAnswer: '3/4',
  childReasoning: 'I converted 1/2 to 2/4 then added the tops', classification: 'clear_reasoning',
  understandingDepth: 'applied', candidateMisconceptions: [],
  confidence: 'high', strategyInUse: 'worked_example', sessionId, moveUsed: 'ELICIT_REASONING', source: 'voice',
});

const result = await runProfiler({
  studentId, subjectId, sessionId, sessionStartedAt: Date.now() - 60000, apiKey: 'fake-key-for-test',
});

check(result !== null, 'runProfiler returned a result for a session with real events');
check(result?.summary.conceptsTouched.join(',') === conceptId, 'conceptsTouched correct');
check((result?.summary.ladderMoves.length || 0) >= 1, 'expected a ladder move (incorrect -> applied)');
check(!!result?.summary.narrative?.includes('fractions_basic'), 'fallback narrative names the concept');

const fresh = await getRepo().getProfile(studentId);
check(fresh?.sessionSummaries?.length === 1, 'sessionSummaries persisted on profile');
check(fresh?.sessionSummaries?.[0]?.sessionId === sessionId, 'correct session summary persisted');

const emptyStudentId = 'empty_session_student';
await getOrCreateLearner(emptyStudentId, 'Empty', 'Grade 5');
const emptyResult = await runProfiler({ studentId: emptyStudentId, subjectId, sessionId: 'sess_empty', sessionStartedAt: Date.now(), apiKey: 'fake' });
check(emptyResult === null, 'a session with zero events is skipped (returns null), not fabricated');

fs.rmSync(tmp, { recursive: true, force: true });

if (failed) { console.error('\nSOME TESTS FAILED'); process.exit(1); }
console.log('\nALL profiler.mjs SMOKE CHECKS PASSED');
