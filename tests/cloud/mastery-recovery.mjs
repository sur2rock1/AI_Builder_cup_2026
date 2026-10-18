// A confirmed mix-up must not freeze mastery at 0% forever: two sound applications clear it (D-2026-10-18-1),
// and the repair replay gives an already-stuck profile the same result as recording live.
//   npx tsx tests/cloud/mastery-recovery.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-recover-'));
process.env.LEARNER_DATA_DIR = tmp; process.env.USE_FIRESTORE_LEARNERS = 'false';
const { installValidatingRepo } = await import('./validating-repo.mjs');
const rc = await installValidatingRepo();
const store = await import('../../src/adaptive/learnerStore.ts');
const { getRepo } = await import('../../src/adaptive/repo/index.ts');
const { replayConceptMastery } = await import('../../src/adaptive/replayMastery.ts');
let failed = 0; const check = (c, l) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${l}`); if (!c) failed++; };
const sid = 'stu_recover', sub = 'g4', cid = 'neg';
await store.getOrCreateLearner(sid, 'R', 'Grade 4'); await store.ensureSubject(sid, sub, 'Maths', 'Grade 4', 't');
await store.ensureConceptState(sid, sub, cid, 'Positive and negative numbers', 'direct_explanation', 'number');
const rec = (depth, promptType, mis) => store.recordReasoningEvidence({ studentId: sid, subjectId: sub, conceptId: cid, conceptType: 'number', difficultyLevel: 2,
  promptType, questionAsked: 'q', childAnswer: 'a', childReasoning: 'r', classification: mis ? 'wrong_answer' : 'clear_reasoning', understandingDepth: depth,
  candidateMisconceptions: mis ? [{ id: 'm1', text: 'bigger digit is bigger' }] : [], confidence: 'high', strategyInUse: 'worked_example', moveUsed: 'X', sessionId: 's', source: 'voice' });
const cs = async () => (await getRepo().getProfile(sid)).subjects[sub].conceptStates[cid];
await rec('incorrect', 'check', true);
check((await cs()).masteryLevel !== 'not_started', `answered once -> level "${(await cs()).masteryLevel}", not "not_started"`);
await rec('incorrect', 'probe', true);
check((await cs()).misconceptionLedger[0].status === 'confirmed', 'mix-up confirmed after two observations');
await rec('understood', 'check', false);
check((await cs()).misconceptionLedger[0].status === 'confirmed', 'one explanation alone does not clear it');
await rec('applied', 'check', false);
check((await cs()).misconceptionLedger[0].status === 'confirmed', 'one application alone does not clear it');
await rec('applied', 'check', false);
const after = await cs();
check(after.misconceptionLedger[0].status === 'resolved', 'two clean applications clear it');
check(after.masteryScore > 0, `mastery recovers after it clears (${after.masteryScore}%)`);
await rec('applied', 'check', false);
check((await cs()).masteryScore > after.masteryScore || (await cs()).masteryScore >= 74, `and keeps rising (${(await cs()).masteryScore}%)`);
await rec('incorrect', 'probe', true);
check(['confirmed', 'suspected'].includes((await cs()).misconceptionLedger[0].status), `seen again -> back on the watch-list (${(await cs()).misconceptionLedger[0].status})`);
// Replay gives the same answer as live recording
const live = await cs();
const events = await getRepo().listEvents(sid);
const r = replayConceptMastery({ ...live, misconceptionLedger: live.misconceptionLedger }, events, 2);
check(r.after.masteryScore === live.masteryScore && r.after.status === live.masteryStatus && JSON.stringify(r.after.ledger) === JSON.stringify(live.misconceptionLedger.map((m) => `${m.status}/${m.observations}`)), `replay == live (${r.after.masteryScore}% ${r.after.ledger})`);
// A profile stuck under the OLD rule (confirmed, 0%) is repaired by the replay
const stuck = { ...live, masteryScore: 0, masteryLevel: 'not_started', misconceptionLedger: [{ id: 'm1', text: 'bigger digit is bigger', status: 'confirmed', observations: 2, firstSeen: 0, lastSeen: 0 }] };
const old = [...events].sort((a, b) => a.timestamp - b.timestamp).slice(0, 6); // up to and incl. the third clean application
const rr = replayConceptMastery(stuck, old, 2);
check(rr.changed && rr.after.masteryScore > 0 && rr.after.ledger[0].startsWith('resolved'), `stuck profile repaired: 0% -> ${rr.after.masteryScore}%, mix-up ${rr.after.ledger}`);
check(rc.failures.length === 0, `Firestore-valid writes (${rc.checked} checked)`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `${failed} FAILED` : 'ALL PASS'); process.exit(failed ? 1 : 0);
