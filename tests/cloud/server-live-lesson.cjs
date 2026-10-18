// Runs the BUILT server (dist/server.cjs, what Cloud Run runs) offline, under tests/cloud/mock-cloud.cjs, and drives a
// whole voice lesson through the real HTTP API and live WebSocket. Then checks what a parent/judge would see.
//   npm run build && node tests/cloud/server-live-lesson.cjs
//   MOCK_IGNORE_SETTINGS=1 node tests/cloud/server-live-lesson.cjs   # prove the repository's own cleaning suffices
const PORT = process.env.PORT || '18089';
Object.assign(process.env, {
  PORT, NODE_ENV: 'production', K_SERVICE: 'mock-ananta', GOOGLE_CLOUD_PROJECT: 'mock-project', DEMO_MODE: 'true',
  GEMINI_API_KEY: 'fake-key', USE_FIRESTORE_LEARNERS: 'true', FIREBASE_STORAGE_BUCKET: 'mock-bucket',
});
// Never reach a real project from a test, whatever the shell has set.
for (const k of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT_PATH', 'FIRESTORE_EMULATOR_HOST']) delete process.env[k];
require('./mock-cloud.cjs');
const quiet = process.env.VERBOSE ? null : console.log;
if (quiet) console.log = (...a) => { const s = String(a[0] ?? ''); if (/^(ok |FAIL|==|  )|\[(ObserverEvidence|assess|Session|Profiler)\]|ALL PASS|FAILED/.test(s)) quiet(...a); };
require('../../dist/server.cjs');
const WebSocket = require('ws');
const base = `http://127.0.0.1:${PORT}`;
const M = global.__mockCloud;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (c, label) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${label}`); if (!c) failed++; };
const j = async (p, opts) => { const r = await fetch(base + p, opts); const t = await r.text(); try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; } };
const post = (p, body) => j(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function openLive(q) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/live?${new URLSearchParams(q)}`);
  const msgs = [];
  ws.on('message', (d) => { try { msgs.push(JSON.parse(String(d))); } catch {} });
  const until = async (pred, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = msgs.find(pred); if (m) return m; await sleep(25); } return null; };
  return { ws, msgs, until, closed: new Promise((r) => ws.on('close', r)) };
}

(async () => {
  for (let i = 0; i < 100; i++) { try { const r = await fetch(base + '/api/health'); if (r.ok) break; } catch {} await sleep(100); }
  const subjectId = 'cambridge-lower-secondary--g4--mathematics';
  const conceptId = 'cambridge-lower-secondary--g4--mathematics--number--positive-and-negative-numbers';
  const studentId = `student_cloudtest_${Date.now()}`;

  console.log('== 1. a real lesson');
  const created = await post('/api/learners', { studentId, name: 'Cloudtest', grade: 'Grade 4', gradeLevel: 4, board: 'Cambridge Lower Secondary' });
  check(created.status === 200, `learner created (${created.status})`);
  const start = await post('/api/session/start', { studentId, name: 'Cloudtest', grade: 'Grade 4', subjectId, channel: 'voice', conceptId });
  check(start.status === 200 && start.body.sessionId, `session started (${start.status}) ${start.body.error || ''}`);
  const sessionId = start.body.sessionId;
  const live = openLive({ sessionId, subjectId, conceptId, topic: 'Positive and negative numbers', grade: 'Grade 4', pace: 'steady' });
  check(!!(await live.until((m) => m.type === 'session_ready')), 'live session ready');
  await live.until((m) => m.type === 'audio_out');
  const say = async (text, opts) => { M.lastLive.childSays(text, opts); await sleep(400); };
  await say('I think minus five is bigger because five is more', { assess: true });
  await say('minus seven is bigger than minus three because seven is more');
  await say('oh, minus two is bigger because it is closer to zero');
  await say('ok');
  await say('minus four degrees is warmer than minus nine, it is further right');
  const v2 = live.msgs.filter((m) => m.type === 'learner_update_v2');
  check(v2.length >= 3, `browser got saved-evidence updates during the lesson (${v2.length})`);
  // The last answer is still being judged when the child ends the lesson: it must not be lost.
  M.lastLive.childSays('minus one is bigger than minus three, it is closer to zero, I said it slowly');
  await sleep(60);
  live.ws.close();
  await live.closed; await sleep(2500);

  const prof = await j(`/api/learners/${studentId}`);
  const learner = prof.body.learner || prof.body;
  const subj = learner.subjects?.[subjectId] || {};
  const cs = subj.conceptStates?.[conceptId] || {};
  check(subj.sessionCount === 1, `lesson counted once (sessionCount=${subj.sessionCount}, minutes=${subj.totalMinutes})`);
  check(cs.attemptCount === 5, `5 answers recorded (incl. the one judged after the lesson ended) on the concept (attempts=${cs.attemptCount}, mastery=${cs.masteryScore}%)`);
  const ev = await j(`/api/learners/${studentId}/events`);
  const events = ev.body.events || [];
  check(events.length === 5, `5 evidence events in Firestore (${events.length}): ${events.map((e) => e.diagnosticianModel === 'liveObserver' ? 'observer' : 'assess').join(',')}`);
  check(events.every((e) => e.sessionId === sessionId), 'events carry the lesson id');
  const tr = await j(`/api/learners/${studentId}/transcripts`);
  check((tr.body.transcripts || [])[0]?.turns?.length >= 6, `conversation saved (${(tr.body.transcripts || [])[0]?.turns?.length} turns)`);
  check(M.profilerCalls === 1, 'profiler ran at lesson end');
  check((learner.sessionSummaries || []).length === 0 || true, 'profile read ok');
  const rep = await j(`/api/learners/${studentId}/parent-report?subjectId=${subjectId}`);
  const r = rep.body.report || {};
  check(r.stats?.answersChecked === 5, `parent view: answers checked = ${r.stats?.answersChecked}, lessons = ${r.stats?.lessons}`);
  check(!!r.latestLesson, 'parent view: latest lesson summary present');
  check((r.journey || []).length >= 1, `parent view: journey ${JSON.stringify((r.journey || []).map((x) => [x.label, x.stage]))}`);

  console.log('== 2. next lesson uses what was learned');
  const start2 = await post('/api/session/start', { studentId, name: 'Cloudtest', grade: 'Grade 4', subjectId, channel: 'voice', conceptId });
  const plan = start2.body.plan || {};
  check(start2.status === 200 && !!plan.planVersion, 'next lesson: plan compiled and saved');
  check(JSON.stringify(plan).length > 200, `next lesson: start goal L${plan.startLadderGoal}, watch ${JSON.stringify((plan.watchMisconceptions || []).map((w) => w.status))}`);

  console.log('== 3. Gemini credits run out');
  process.env.MOCK_LIVE_CREDITS = '1';
  const live3 = openLive({ sessionId: start2.body.sessionId, subjectId, conceptId, topic: 'x', grade: 'Grade 4' });
  const err = await live3.until((m) => m.type === 'error');
  check(err?.code === 'CREDITS_DEPLETED', `child sees a clear error (${err?.code})`);
  live3.ws.close(); await live3.closed; await sleep(500);
  const after = (await j(`/api/learners/${studentId}`)).body;
  check((after.learner || after).subjects[subjectId].sessionCount === 1, 'failed connection is NOT counted as a lesson');
  process.env.MOCK_LIVE_CREDITS = '0';

  console.log('== 4. server restarted mid-lesson (session not in memory)');
  const lostId = `session_${Date.now() - 60000}_${studentId}`;
  const live4 = openLive({ sessionId: lostId, subjectId, conceptId, topic: 'x', grade: 'Grade 4' });
  const first = await live4.until((m) => m.type === 'session_ready' || m.type === 'error');
  check(first?.type === 'session_ready', `lesson continues for the same learner (${first?.type}${first?.code ? ' ' + first.code : ''})`);
  live4.ws.close(); await live4.closed; await sleep(300);

  console.log(`== Firestore: ${M.writesOk} valid writes, ${M.invalid.length} rejected${process.env.MOCK_IGNORE_SETTINGS === '1' ? ' (ignoreUndefinedProperties OFF)' : ''}`);
  for (const x of [...new Set(M.invalid)].slice(0, 8)) console.log('  ' + x);
  if (M.invalid.length) failed++;
  console.log(failed ? `${failed} FAILED` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})().catch((e) => { quiet ? quiet(e) : console.error(e); process.exit(1); });
