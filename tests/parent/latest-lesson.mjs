// Parent View: the latest lesson is shown first, with its answers and the live notes; counts fall back to the stored summaries.
//   npx tsx tests/parent/latest-lesson.mjs
const { buildBaseReport } = await import('../../src/parent/facts.ts');
let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failed++; };
const SUB = 'g4--maths';
const cs = (id, label, t) => ({ conceptId: `${SUB}--${id}`, label, lastVisited: t, attemptCount: 1, misconceptionLedger: [], masteryStatus: 'none' });
const ev = (n, cid, sid, t, depth) => ({
  eventId: `ev${n}`, studentId: 's', subjectId: SUB, conceptId: `${SUB}--${cid}`, sessionId: sid, timestamp: t,
  questionAsked: `q${n}`, childAnswer: `a${n}`, childReasoning: '', classification: 'clear_reasoning', understandingDepth: depth,
});
const learner = {
  studentId: 's', name: 'Kid', grade: 'Grade 4', subjects: { [SUB]: { subjectId: SUB, subjectLabel: 'Maths', conceptStates: {
    [`${SUB}--a`]: cs('a', 'Four-digit numbers', 1000), [`${SUB}--b`]: cs('b', 'Negative numbers', 5000) },
    sessionCount: 0, totalMinutes: 0, lastSession: 0 } },
  sessionSummaries: [
    { sessionId: 'S1', startedAt: 0, endedAt: 1100, conceptsTouched: [`${SUB}--a`], narrative: '', minutes: 6 },
    { sessionId: 'S2', startedAt: 4000, endedAt: 6000, conceptsTouched: [`${SUB}--b`], narrative: '', minutes: 7,
      liveNotes: [{ at: 4500, concept: 'Negative numbers', understanding: 20, level: 'recognises', noticed: 'Asked to skip to the quiz', evidence: 'Can we quiz now?' }] },
  ],
  affect: { confusionSignals: {} },
};
const events = [ev(1, 'a', 'S1', 1000, 'recognised'), ev(2, 'b', 'S2', 4800, 'understood'), ev(3, 'b', 'S2', 5000, 'recognised')];
const r = buildBaseReport(learner, SUB, events, null, 7000);
ok(r.latestLesson?.sessionId === 'S2', 'the latest lesson is the newest one');
ok(r.latestLesson?.topics.join() === 'Negative numbers', 'it names the topic of that lesson');
ok(r.latestLesson?.answersChecked === 2 && r.latestLesson?.explained === 1, 'it counts the answers checked in it and the ones explained');
ok(r.latestLesson?.notes[0]?.childSaid === 'Can we quiz now?', "live notes are shown with the child's own words");
ok(r.latestLesson?.evidenceIds.every((id) => r.evidence[id]), 'every answer from the lesson can be opened');
ok(r.stats.lessons === 2 && r.stats.minutes === 13, `lessons and minutes fall back to the stored lessons when never counted (${r.stats.lessons}, ${r.stats.minutes})`);
console.log(failed ? `\n${failed} check(s) failed` : '\nall latest-lesson checks passed');
process.exit(failed ? 1 : 0);
