// Cloud regression test: every learner write must be a valid Firestore document.
//
// Why: the local file repository writes JSON, which silently drops `undefined`; Firestore REJECTS a document that
// contains `undefined` anywhere. That difference meant every live-lesson assessment failed to save on Cloud Run
// while working locally (2026-10-17). This test runs the real learner-store code and checks each payload with
// Google's own Firestore client validator (WriteBatch.set validates synchronously, no network needed).
//
//   npx tsx tests/cloud/firestore-payloads.mjs          # payloads as the Firestore repository will send them
//   npx tsx tests/cloud/firestore-payloads.mjs --raw    # payloads before cleaning (shows the original bug)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Firestore } from '@google-cloud/firestore';

const RAW = process.argv.includes('--raw');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-fs-payloads-'));
process.env.LEARNER_DATA_DIR = tmp;
process.env.USE_FIRESTORE_LEARNERS = 'false';

const store = await import('../../src/adaptive/learnerStore.ts');
const { FileLearnerRepository } = await import('../../src/adaptive/repo/file.ts');
const { setRepoForTests } = await import('../../src/adaptive/repo/index.ts');
const fsRepo = await import('../../src/adaptive/repo/firestore.ts');
const toFirestoreData = fsRepo.toFirestoreData || ((x) => x);

const validator = new Firestore({ projectId: 'validate-only' });
const failures = [];
let checked = 0;
function validate(kind, data) {
  checked++;
  const payload = RAW ? data : toFirestoreData(data);
  try { validator.batch().set(validator.collection('v').doc('v'), payload); }
  catch (e) { failures.push(`${kind}: ${String(e.message).split('\n')[0].slice(0, 220)}`); }
}

const inner = new FileLearnerRepository();
setRepoForTests({
  getProfile: (id) => inner.getProfile(id),
  listProfiles: () => inner.listProfiles(),
  deleteProfile: (id) => inner.deleteProfile(id),
  listEvents: (id, f) => inner.listEvents(id, f),
  getLatestPlan: (id, s) => inner.getLatestPlan(id, s),
  listTranscripts: (id, l) => inner.listTranscripts(id, l),
  saveProfile: (p) => { validate('saveProfile', p); return inner.saveProfile(p); },
  appendEvent: (id, e) => { validate('appendEvent', e); return inner.appendEvent(id, e); },
  savePlan: (id, v, p) => { validate('savePlan', p); return inner.savePlan(id, v, p); },
  saveSessionSummary: (id, s, x) => { validate('saveSessionSummary', x); return inner.saveSessionSummary(id, s, x); },
  saveTranscript: (id, s, x) => { validate('saveTranscript', x); return inner.saveTranscript(id, s, x); },
});

const studentId = 'cloud_payload_student', subjectId = 'math', conceptId = 'neg_numbers', sessionId = 'sess_cloud_1';
await store.getOrCreateLearner(studentId, 'Cloud Test', 'Grade 4');
await store.ensureSubject(studentId, subjectId, 'Mathematics', 'Grade 4', 'test');
await store.ensureConceptState(studentId, subjectId, conceptId, 'Positive and negative numbers');

// Exactly the shape server.ts handleAssessChildReasoning sends (planVersion may be undefined when no plan resolved).
const base = {
  studentId, subjectId, conceptId, conceptType: 'number', difficultyLevel: 2,
  questionAsked: 'Which is bigger, -2 or -5?', strategyInUse: 'direct_explanation',
  sessionId, planVersion: undefined, diagnosticianModel: 'gemini (reasoningAssessor)', source: 'voice',
};
await store.recordReasoningEvidence({ ...base, promptType: 'check', childAnswer: '-5', childReasoning: '5 is bigger than 2',
  classification: 'wrong_answer', understandingDepth: 'incorrect', confidence: 'medium',
  candidateMisconceptions: [{ id: 'neg::m1', text: 'Compares negatives by their size without the sign' }], moveUsed: 'ELICIT_REASONING' });
await store.recordReasoningEvidence({ ...base, promptType: 'probe', childAnswer: '-5', childReasoning: 'because five is more',
  classification: 'wrong_answer', understandingDepth: 'incorrect', confidence: 'high',
  candidateMisconceptions: [{ id: 'neg::m1', text: 'Compares negatives by their size without the sign' }], moveUsed: 'DISCRIMINATING_PROBE' });
await store.recordReasoningEvidence({ ...base, promptType: 'transfer', childAnswer: '-1', childReasoning: '-1 is closer to zero on the number line',
  classification: 'clear_reasoning', understandingDepth: 'transferred', confidence: 'high', candidateMisconceptions: [], moveUsed: 'ELICIT_REASONING' });
await store.recordConfusionSignal?.({ studentId, subjectId, conceptId, signal: 'dont_understand', aboutWhat: 'minus numbers' });
await store.incrementSessionCount(studentId, subjectId, 4);

let profilerOk = true;
try {
  const { runProfiler } = await import('../../src/adaptive/profiler.ts');
  await runProfiler({ studentId, subjectId, sessionId, sessionStartedAt: Date.now() - 240000, apiKey: 'fake-key-for-test',
    liveNotes: [{ at: Date.now(), concept: 'Comparing negatives', understanding: 40, level: 'explains', noticed: 'Used the number line', evidence: 'closer to zero', extra: undefined }] });
} catch (e) { profilerOk = false; failures.push('runProfiler threw: ' + e.message); }

console.log(`${RAW ? 'RAW' : 'CLEANED'} payloads checked: ${checked}; invalid for Firestore: ${failures.length}`);
for (const f of [...new Set(failures)]) console.log('  - ' + f);
const p = await inner.getProfile(studentId);
const cs = p.subjects[subjectId].conceptStates[conceptId];
console.log(`profile: attempts=${cs.attemptCount} mastery=${cs.masteryScore} ledger=${JSON.stringify(cs.misconceptionLedger.map(m => m.status))} events=${(await inner.listEvents(studentId)).length} profiler=${profilerOk}`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failures.length && !RAW ? 1 : 0);
