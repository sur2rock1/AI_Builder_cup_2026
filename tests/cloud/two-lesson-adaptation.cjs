// The USP, end to end, on the BUILT server (dist/server.cjs) with Gemini + Firestore mocked (Firestore validation kept):
//   lesson 1: guided lesson; pictures do not land (same mix-up twice, then two unsure answers), a worked example does.
//     -> in-lesson re-teaching reaches the voice model (contrast case for the confirmed mix-up; "two misses: teach with
//        another approach"), and the approach that was actually used is what gets credited.
//   lesson 2: the plan compiled from lesson 1 changes HOW the tutor teaches, and that plan is in the tutor's system prompt.
//   npm run build && node tests/cloud/two-lesson-adaptation.cjs
const PORT = process.env.PORT || '18093';
for (const k of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT_PATH', 'FIRESTORE_EMULATOR_HOST']) delete process.env[k];
Object.assign(process.env, { PORT, NODE_ENV: 'production', K_SERVICE: 'mock-ananta', GOOGLE_CLOUD_PROJECT: 'mock-project', DEMO_MODE: 'true',
  GEMINI_API_KEY: 'fake-key', USE_FIRESTORE_LEARNERS: 'true', FIREBASE_STORAGE_BUCKET: 'mock-bucket' });
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
const j = async (p, o) => { const r = await fetch(base + p, o); const t = await r.text(); try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; } };
const post = (p, b) => j(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
function openLive(q) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/live?${new URLSearchParams(q)}`);
  const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(String(d))); } catch {} });
  const until = async (pred, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = msgs.find(pred); if (m) return m; await sleep(25); } return null; };
  return { ws, msgs, until, closed: new Promise((r) => ws.on('close', r)) };
}
const planLine = (sys, prefix) => (sys.split('\n').find((l) => l.startsWith(prefix)) || '(none)').slice(0, 160);
const guidance = () => M.toolResponses.flatMap((r) => (r.functionResponses || []).map((f) => String(f.response?.instruction || ''))).filter((t) => t.includes('From watching'));

(async () => {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} await sleep(100); }
  const subjectId = 'cambridge-lower-secondary--g4--mathematics';
  const conceptId = 'cambridge-lower-secondary--g4--mathematics--number--positive-and-negative-numbers';
  const studentId = `student_adapt_${Date.now()}`;
  await post('/api/learners', { studentId, name: 'Adapt', grade: 'Grade 4', gradeLevel: 4, board: 'Cambridge Lower Secondary' });

  console.log('== lesson 1');
  const s1 = await post('/api/session/start', { studentId, name: 'Adapt', grade: 'Grade 4', subjectId, channel: 'voice', conceptId });
  const plan1 = s1.body.plan || {};
  const live = openLive({ sessionId: s1.body.sessionId, subjectId, conceptId, topic: 'Positive and negative numbers', grade: 'Grade 4', pace: 'steady' });
  check(!!(await live.until((m) => m.type === 'session_ready')), 'lesson 1 ready');
  check((await live.until((m) => m.type === 'tutor_mode'))?.mode === 'guided', 'guided lesson (the default)');
  await live.until((m) => m.type === 'audio_out');
  const L = M.lastLive;
  const say = async (t, o) => { L.childSays(t, o); await sleep(450); };
  await L.modelCalls([{ name: 'advance_beat' }, { name: 'show_picture', args: { which: 'number line' } }], 'Look at the number line.'); await sleep(100);
  await say('I think minus five is bigger because five is more');
  await say('minus seven is bigger than minus three because seven is more');
  await L.modelCalls([{ name: 'show_picture', args: { which: 'thermometer' } }], 'Here is a thermometer.'); await sleep(100);
  check(guidance().some((g) => /contrast case/i.test(g)), `in-lesson: confirmed mix-up -> "contrast case" reached the tutor (${guidance().length} observer instruction(s) so far)`);
  await say("I don't know, maybe minus nine");
  await say("I don't know, is it minus eight");
  // the tutor now explains with a worked example and checks
  await say('oh, minus two is bigger because it is closer to zero', { assess: true, representationUsed: 'worked_example' });
  check(guidance().some((g) => /Two misses in a row/.test(g)), 'in-lesson: two unsure answers -> "teach it another way" reached the tutor');
  await say('minus four degrees is warmer than minus nine, it is further right');
  const planUpdates = live.msgs.filter((m) => m.type === 'plan_update');
  check(planUpdates.length >= 2, `browser reasoning panel got ${planUpdates.length} re-teaching update(s)`);
  live.ws.close(); await live.closed; await sleep(2500);

  const lr = (await j(`/api/learners/${studentId}`)).body; const learner = lr.learner || lr;
  const cs = learner.subjects[subjectId].conceptStates[conceptId];
  const ev = ((await j(`/api/learners/${studentId}/events`)).body.events || []);
  console.log(`  events: ${ev.map((e) => `${e.diagnosticianModel === 'liveObserver' ? 'obs' : 'assess'}:${e.understandingDepth}@${e.representationUsed}`).join('  ')}`);
  const sp = learner.strategyProfile?.[cs.conceptType] || {};
  console.log(`  strategy profile (${cs.conceptType}): ${Object.entries(sp).map(([k, v]) => `${k} ${(v.alpha / (v.alpha + v.beta)).toFixed(2)} (${Math.round(v.alpha + v.beta - 2)} uses)`).join(', ')}`);
  check(ev.length === 6, `6 answers recorded (${ev.length})`);
  check(ev.filter((e) => e.representationUsed === 'visual_diagram').length === 4, 'the 4 answers after pictures are credited to visual diagram, not "direct explanation"');
  check((sp.visual_diagram?.beta || 0) > (sp.visual_diagram?.alpha || 0), 'pictures recorded as NOT working for this child');
  check((sp.worked_example?.alpha || 0) > (sp.worked_example?.beta || 0), 'worked example recorded as working');
  check((cs.misconceptionLedger || []).some((m) => m.status === 'confirmed' || m.status === 'resolved'), `mix-up confirmed in the ledger (${JSON.stringify((cs.misconceptionLedger || []).map((m) => m.status + '/' + m.observations))})`);

  console.log('== lesson 2 (next run)');
  const s2 = await post('/api/session/start', { studentId, name: 'Adapt', grade: 'Grade 4', subjectId, channel: 'voice', conceptId });
  const plan2 = s2.body.plan || {};
  const order1 = (plan1.representationOrder || []).map((r) => r.strategy), order2 = (plan2.representationOrder || []).map((r) => r.strategy);
  console.log(`  lesson 1 order: ${order1.slice(0, 4).join(' > ')} | avoid: ${(plan1.avoidRepresentations || []).map((a) => a.strategy).join(',') || '-'}`);
  console.log(`  lesson 2 order: ${order2.slice(0, 4).join(' > ')} | avoid: ${(plan2.avoidRepresentations || []).map((a) => a.strategy).join(',') || '-'}`);
  check(order2[0] === 'worked_example', 'next lesson leads with the approach that worked (worked example)');
  check((plan2.avoidRepresentations || []).some((a) => a.strategy === 'visual_diagram'), 'next lesson avoids the approach that did not (pictures)');
  const live2 = openLive({ sessionId: s2.body.sessionId, subjectId, conceptId, topic: 'Positive and negative numbers', grade: 'Grade 4', pace: 'steady' });
  check(!!(await live2.until((m) => m.type === 'session_ready')), 'lesson 2 ready');
  const sys1 = M.connects[0].systemInstruction, sys2 = M.connects[M.connects.length - 1].systemInstruction;
  console.log(`  prompt 1: ${planLine(sys1, 'Teach in this order')}`);
  console.log(`  prompt 2: ${planLine(sys2, 'Teach in this order')}`);
  console.log(`  prompt 2: ${planLine(sys2, 'Avoid:')}`);
  console.log(`  prompt 2: ${planLine(sys2, 'Watch for:')}`);
  check(/Teach in this order of representations: worked example/.test(sys2), "lesson 2's tutor prompt says: lead with worked example");
  check(/Avoid: visual diagram/.test(sys2), "lesson 2's tutor prompt says: avoid pictures");
  check(planLine(sys1, 'Teach in this order') !== planLine(sys2, 'Teach in this order'), 'the teaching instruction differs between lesson 1 and lesson 2');
  live2.ws.close(); await live2.closed; await sleep(500);

  console.log(`== Firestore: ${M.writesOk} valid writes, ${M.invalid.length} rejected`);
  for (const x of [...new Set(M.invalid)].slice(0, 6)) console.log('  ' + x);
  if (M.invalid.length) failed++;
  console.log(failed ? `${failed} FAILED` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})().catch((e) => { (quiet || console.log)(e); process.exit(1); });
