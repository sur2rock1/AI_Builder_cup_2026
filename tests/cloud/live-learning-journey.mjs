// End-to-end check of the learning journey a judge sees, without Gemini or Firestore:
//   live voice lesson (observer judging each exchange) → evidence saved (Firestore-valid) → lesson end
//   (count, transcript, profiler) → parent report → next lesson's teaching plan.
// The glue mirrors server.ts persistObservation(); the mapping itself is src/adaptive/observerEvidence.ts.
//   npx tsx tests/cloud/live-learning-journey.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-journey-'));
process.env.LEARNER_DATA_DIR = tmp;
process.env.USE_FIRESTORE_LEARNERS = 'false';

const { installValidatingRepo } = await import('./validating-repo.mjs');
const repoCheck = await installValidatingRepo();
const store = await import('../../src/adaptive/learnerStore.ts');
const { getRepo } = await import('../../src/adaptive/repo/index.ts');
const { LiveObserver } = await import('../../src/adaptive/liveObserver.ts');
const { evidenceFromSnapshot, newObserverMemory, rememberRecorded } = await import('../../src/adaptive/observerEvidence.ts');
const { runProfiler } = await import('../../src/adaptive/profiler.ts');
const { getParentReport } = await import('../../src/parent/report.ts');
const { compileTeachingPlan } = await import('../../src/plan/compile.ts');

let failed = 0;
const check = (cond, label) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`); if (!cond) failed++; };

// A real course from data/curricula.json when present, else a minimal one.
let curriculum;
try {
  curriculum = JSON.parse(fs.readFileSync(new URL('./fixtures/curricula.json', import.meta.url), 'utf8')).find((c) => c.id === 'cambridge-lower-secondary--g4--mathematics');
} catch { /* fall through */ }
const subjectId = curriculum?.id || 'g4-maths';
const concept = curriculum?.concepts.find((c) => /negative/.test(c.id)) || { id: `${subjectId}--neg`, label: 'Positive and negative numbers', difficultyLevel: 2 };
const studentId = 'student_journey_test_1', sessionId = `session_${Date.now()}_${studentId}`;

await store.getOrCreateLearner(studentId, 'Journey Test', 'Grade 4');
await store.ensureSubject(studentId, subjectId, 'Mathematics', 'Grade 4', 'test');
await store.ensureConceptState(studentId, subjectId, concept.id, concept.label, 'direct_explanation', 'number');

// Scripted observer replies, one per exchange (what the observer model would return).
const MIS = { id: 'bigger-digit-bigger-number', text: 'Thinks -5 is bigger than -2 because 5 is more than 2' };
const replies = [
  { concept: 'Comparing negatives', level: 'recognises', understanding: 10, evidence: 'minus five is bigger because five is more', noticed: 'Compared the digits, not the positions',
    misconceptions: [{ ...MIS, status: 'suspected', evidence: 'minus five is bigger because five is more' }], nextStep: 'Use the number line' },
  { concept: 'Comparing negatives', level: 'recognises', understanding: 15, evidence: 'minus seven is bigger than minus three, seven is more', noticed: 'Same idea again',
    misconceptions: [{ ...MIS, status: 'confirmed', evidence: 'minus seven is bigger than minus three, seven is more' }], nextStep: 'Show a thermometer' },
  { concept: 'Comparing negatives', level: 'explains', understanding: 35, evidence: 'minus two is bigger because it is closer to zero', noticed: 'Used distance from zero',
    misconceptions: [{ ...MIS, status: 'resolved', evidence: 'closer to zero' }], nextStep: 'Try a new situation' },
  { concept: 'Comparing negatives', level: 'explains', understanding: 35, evidence: 'minus two is bigger because it is closer to zero', noticed: 'Used distance from zero', misconceptions: [] }, // nothing new
  { concept: 'Comparing negatives', level: 'transfers', understanding: 55, evidence: 'minus four degrees is warmer than minus nine, it is further right', noticed: 'Used it with temperatures',
    misconceptions: [{ ...MIS, status: 'resolved', evidence: 'further right is warmer' }], nextStep: 'Move to adding' },
  { concept: 'Adding on a number line', level: 'explains', understanding: 30, evidence: "I don't get the adding part", noticed: 'Unsure about adding', misconceptions: [] },
];
const childLines = ['I think minus five is bigger because five is more', 'minus seven is bigger than minus three, seven is more',
  'oh, minus two is bigger because it is closer to zero', 'yes closer to zero', 'minus four degrees is warmer than minus nine, it is further right', "I don't get the adding part"];

async function runLesson(sid, sessId, lines, scripted) {
  let i = 0, updates = 0, memory = newObserverMemory();
  const saved = [], pending = [];
  const observer = new LiveObserver(concept.label, 'Grade 4', 'fake', (snap) => {
    updates++;
    // == server.ts persistObservation ==
    const ev = evidenceFromSnapshot(snap, memory, observer.lastExchange());
    if (!ev) return;
    memory = rememberRecorded(memory, snap);
    pending.push(store.recordReasoningEvidence({
      studentId: sid, subjectId, conceptId: concept.id, conceptType: 'number', difficultyLevel: concept.difficultyLevel || 2,
      promptType: ev.promptType, questionAsked: ev.questionAsked, childAnswer: ev.childAnswer, childReasoning: ev.childReasoning,
      classification: ev.classification, understandingDepth: ev.understandingDepth, candidateMisconceptions: ev.candidateMisconceptions,
      confidence: ev.confidence, strategyInUse: 'direct_explanation', moveUsed: 'OBSERVED_EXCHANGE', sessionId: sessId,
      planVersion: undefined, diagnosticianModel: 'liveObserver', source: 'voice',
    }).then((r) => { saved.push({ ev, r }); }));
  }, async () => JSON.stringify(scripted[i++]));
  for (const line of lines) {
    observer.add('tutor', 'Which number is bigger, and how do you know?');
    observer.boundary();
    observer.add('child', line);
    observer.boundary();
    const before = updates;
    observer.exchangeDone();
    for (let t = 0; t < 100 && updates === before; t++) await new Promise((r) => setTimeout(r, 10));
  }
  await Promise.all(pending);
  saved.sort((a, b) => a.r.eventId.localeCompare(b.r.eventId));
  return { updates, saved, observer };
}
const { updates, saved, observer } = await runLesson(studentId, sessionId, childLines, replies);

check(updates === childLines.length, `observer judged every exchange (${updates}/${childLines.length})`);
check(saved.length === 5, `evidence saved for each NEW observation, duplicate skipped (${saved.length}/5)`);
check(saved.every((s) => s.r), 'every evidence write succeeded');
check(saved[1]?.ev.promptType === 'probe', 'a mix-up seen again counts as an independent observation');
check(saved[3]?.ev.promptType === 'transfer', 'using it in a new situation is a transfer check');
check(saved[4]?.ev.understandingDepth === 'confused', '"I don\'t get it" is recorded as confusion, not understanding');

// Lesson end (server.ts clientWs.on('close'))
await store.incrementSessionCount(studentId, subjectId, 6, true);
await store.incrementSessionCount(studentId, subjectId, 2, false); // a reconnect within the same lesson
await getRepo().saveTranscript(studentId, sessionId, { sessionId, studentId, subjectId, startedAt: Date.now() - 360000, endedAt: Date.now(),
  turns: childLines.map((t, k) => ({ role: 'child', text: t, at: Date.now() - (6 - k) * 1000 })) });
const prof = await store.withLearnerLock(studentId, () => runProfiler({ studentId, subjectId, sessionId, sessionStartedAt: Date.now() - 360000,
  apiKey: 'fake-key-for-test', liveNotes: observer.notes() }));
check(!!prof?.summary, 'profiler wrote a lesson summary');

const learner = await getRepo().getProfile(studentId);
const subj = learner.subjects[subjectId];
const cs = subj.conceptStates[concept.id];
check(subj.sessionCount === 1 && subj.totalMinutes === 8, `1 lesson, 8 minutes (reconnect not double-counted) - got ${subj.sessionCount}/${subj.totalMinutes}`);
check(cs.attemptCount === 5 && cs.masteryScore > 0, `concept attempts=${cs.attemptCount}, mastery=${cs.masteryScore}%`);
const rec = (cs.misconceptionLedger || []).find((m) => m.id === `live::${MIS.id}`);
check(rec && rec.observations >= 2, `mix-up confirmed only after two observations (observations=${rec?.observations}, status=${rec?.status})`);
check(rec?.status === 'resolved', 'mix-up marked fixed after the transfer answer');
check((learner.sessionSummaries || []).length >= 1, 'summary on the profile');

const report = await getParentReport(studentId, subjectId);
check(report?.stats.answersChecked === 5, `parent view: answers checked = ${report?.stats.answersChecked}`);
check(report?.stats.lessons === 1 && report?.stats.minutes === 8, `parent view: ${report?.stats.lessons} lesson, ${report?.stats.minutes} min`);
check((report?.journey || []).length >= 1, `parent view: journey has ${report?.journey.length} topic(s)`);
check((report?.story || []).some((s) => s.state === 'fixed'), `parent view: mix-up story ${JSON.stringify((report?.story || []).map((s) => s.state))}`);
check(!!report?.latestLesson, 'parent view: latest lesson present');

if (curriculum) {
  const plan = compileTeachingPlan(learner, curriculum, { studentId, subjectId, channel: 'voice', requestedConceptId: concept.id });
  check(plan?.targetConcept?.conceptId === concept.id, 'next lesson: teaching plan compiles from the saved profile');
  // A second child whose mix-up is still open: the next lesson must watch for it.
  const sid2 = 'student_journey_test_2';
  await store.getOrCreateLearner(sid2, 'Open Mixup', 'Grade 4');
  await store.ensureSubject(sid2, subjectId, 'Mathematics', 'Grade 4', 'test');
  await store.ensureConceptState(sid2, subjectId, concept.id, concept.label, 'direct_explanation', 'number');
  await runLesson(sid2, `session_${Date.now()}_${sid2}`, childLines.slice(0, 2), replies.slice(0, 2));
  const l2 = await getRepo().getProfile(sid2);
  const plan2 = compileTeachingPlan(l2, curriculum, { studentId: sid2, subjectId, channel: 'voice', requestedConceptId: concept.id });
  const watched = (plan2.watchMisconceptions || []).find((w) => w.id === `live::${MIS.id}`);
  check(watched?.status === 'confirmed', `next lesson: plan watches the open mix-up (${watched ? watched.status + ': ' + watched.text : 'none'})`);
}

console.log(`Firestore validation: ${repoCheck.checked} writes checked, ${repoCheck.failures.length} invalid`);
for (const f of repoCheck.failures) console.log('  - ' + f);
if (repoCheck.failures.length) failed++;
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
