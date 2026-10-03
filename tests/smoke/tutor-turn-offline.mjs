// Offline logic test for T08 (POST /api/tutor/turn) — docs/BUILD_PLAN.md T08,
// docs/TRACEABILITY.md FR-25.
//
// Complements tests/smoke/tutor-turn.mjs (which needs a real GEMINI_API_KEY
// and network access, so it can only be run on the user's own machine). This
// one runs the REAL server/routes/tutor.ts, the REAL learnerStore/repo/
// curriculum/persona/plan code, and the REAL diagnostician's parsing and
// validation logic — against a SCRIPTED fake model (tests/genai-tool-stub.mjs)
// — so the tool-calling loop itself (function-call -> functionResponse
// threading, diagnosis/planUpdate merging, the MAX_TOOL_HOPS safety net,
// record_confusion_signal) can be verified deterministically, offline, in
// any environment, including one with no route to Gemini's API.
//
// This does NOT verify prompt quality or real model behaviour (the WHAT the
// model decides to call) — only that the ENDPOINT correctly handles whatever
// the model does call. Both are needed; this covers the half that does not
// need a live model.
//
//     npx --yes tsx tests/smoke/tutor-turn-offline.mjs
// or  node tests/smoke/tutor-turn-offline.mjs   (after `npm run test:tutor-turn-offline`, which builds first)
//
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const buildDir = path.join(root, 'tests', '.build');

const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };

async function postJson(base, pathName, body) {
  const res = await fetch(`${base}${pathName}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON error body */ }
  return { res, json };
}

async function main() {
  // Isolate every write this run makes (learner profile, plan, session/event
  // files) from the user's real data/ — this test creates and mutates real
  // records via the real learnerStore, so it must not touch the real files.
  const dataDir = path.join(buildDir, `offline-data-${Date.now()}`);
  fs.mkdirSync(dataDir, { recursive: true });
  process.env.LEARNER_DATA_DIR = dataDir;
  process.env.DEMO_MODE = 'true';
  // tutor.ts refuses to run (500, before ever touching the SDK) unless this
  // is set — correct behaviour in production, but this test never makes a
  // real API call (@google/genai is aliased to the stub below), so any
  // non-empty value satisfies the guard.
  if (!process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = 'offline-test-stub-key';

  await build({
    entryPoints: [path.join(root, 'tests', 'offline-tutor-setup.ts')],
    bundle: true, platform: 'node', format: 'esm', logLevel: 'warning',
    packages: 'external', // leave express/firebase-admin/ws etc. as real node_modules imports
    alias: { '@google/genai': path.join(root, 'tests', 'genai-tool-stub.mjs') },
    outfile: path.join(buildDir, 'offline-tutor-setup.bundle.mjs'),
  });

  const { setup } = await import(`${path.join(buildDir, 'offline-tutor-setup.bundle.mjs')}?t=${Date.now()}`);
  const { port, sessionId, studentId, conceptLabel, planVersion, server } = await setup('igcse--g8--mathematics', `offline_${Date.now()}`);
  const BASE = `http://127.0.0.1:${port}`;
  console.log(`  session ${sessionId} on concept "${conceptLabel}" (plan ${planVersion}), server on ${BASE}`);

  globalThis.STUB = { conversationQueue: [], diagnosisQueue: [], calls: [] };

  try {
    // ── 1. Opening turn: no learnerText -> composeKickoff() drives the
    // model's first call; no tool call scripted, so this exercises the
    // "no function calls -> return the text as-is, turn=1, diagnosis=null" path.
    globalThis.STUB.conversationQueue.push({ text: `Hi! Today we're exploring ${conceptLabel}. Ready to start?` });
    const { res: r1, json: j1 } = await postJson(BASE, '/api/tutor/turn', { sessionId, studentId });
    ok(r1.ok, `opening turn -> 200 (got ${r1.status}: ${JSON.stringify(j1).slice(0, 200)})`);
    ok(j1?.tutorText === `Hi! Today we're exploring ${conceptLabel}. Ready to start?`, 'opening turn returns the stubbed text verbatim');
    ok(j1?.turn === 1, `opening turn is turn 1 (got ${j1?.turn})`);
    ok(j1?.diagnosis === null, 'opening turn has no diagnosis (no tool called)');
    ok(j1?.move === null, 'opening turn has no move (no tool called)');

    // ── 2. A turn where the model calls assess_child_reasoning once, then
    // (after seeing the diagnostician's guidance merged into the tool's
    // functionResponse) replies with real text. Exercises: the function-call
    // -> functionResponse round trip, handleAssessChildReasoning's full
    // pipeline (assessor -> recordReasoningEvidence -> compilePlanDelta),
    // and that the SECOND generateContent call's text (not the first call's
    // lead-in) is what's returned as tutorText.
    globalThis.STUB.conversationQueue.push({
      leadText: 'Let me check your thinking on that.',
      functionCalls: [{
        name: 'assess_child_reasoning',
        args: { questionAsked: 'What is the hypotenuse?', childAnswer: '7', childReasoning: 'I added 3 and 4', promptType: 'check' },
      }],
    });
    globalThis.STUB.diagnosisQueue.push({ json: {
      classification: 'misconception_behind_correct', understandingDepth: 'memorised',
      candidateMisconceptionIds: [], confidence: 'high', reasoningSummary: 'added the sides',
      shouldProbe: true, probeQuestion: 'What does your method give for 6 and 8?',
      nextStrategy: 'worked_example', tutorGuidance: 'Ask the probe. Do not reveal the answer.',
    } });
    globalThis.STUB.conversationQueue.push({ text: "Good try — let's test that method on a different example. What does 6 and 8 give you?" });

    const { res: r2, json: j2 } = await postJson(BASE, '/api/tutor/turn', { sessionId, studentId, learnerText: "It's 7. I added 3 and 4." });
    ok(r2.ok, `tool-call turn -> 200 (got ${r2.status}: ${JSON.stringify(j2).slice(0, 200)})`);
    ok(j2?.turn === 2, `tool-call turn is turn 2 (got ${j2?.turn})`);
    ok(j2?.tutorText === "Good try — let's test that method on a different example. What does 6 and 8 give you?", 'final reply (after the tool round-trip) is returned, not the lead-in text');
    ok(j2?.diagnosis?.classification === 'misconception_behind_correct', `diagnosis.classification threaded through (got ${j2?.diagnosis?.classification})`);
    ok(j2?.diagnosis?.shouldProbe === true, 'diagnosis.shouldProbe threaded through');
    ok(j2?.diagnosis?.diagnosisTimedOut === false, 'diagnosis.diagnosisTimedOut correctly false (the stub answered well within budget)');
    ok(j2?.move === 'DISCRIMINATING_PROBE', `move derived correctly from shouldProbe (got ${j2?.move})`);
    ok(j2?.planUpdate !== null, 'planUpdate populated (a compiled plan exists for this session)');
    ok(typeof j2?.planUpdate?.instruction === 'string' && j2.planUpdate.instruction.length > 0, 'planUpdate.instruction non-empty');
    // misconception_behind_correct with no catalogued candidateMisconceptionIds
    // must be treated as misconception_suspected, not 'sound' — this is the
    // exact bug fixed in server/routes/tutor.ts and server.ts on 2026-09-28
    // (docs/DECISIONS.md D-2026-09-28-4), which this scenario was written to
    // catch (it originally caught it: this assertion failed before the fix).
    ok(j2?.planUpdate?.outcome === 'misconception_suspected', `planUpdate.outcome treats misconception_behind_correct as suspected even with no catalogued id (got ${j2?.planUpdate?.outcome})`);

    // ── 3. record_confusion_signal instead of assess_child_reasoning —
    // confirms the OTHER tool path also round-trips and, correctly, produces
    // no diagnosis (only assess_child_reasoning populates it).
    globalThis.STUB.conversationQueue.push({
      functionCalls: [{ name: 'record_confusion_signal', args: { signal: 'dont_understand', aboutWhat: 'the hypotenuse' } }],
    });
    globalThis.STUB.conversationQueue.push({ text: "No worries — let's slow down and look at it a different way." });
    const { res: r3, json: j3 } = await postJson(BASE, '/api/tutor/turn', { sessionId, studentId, learnerText: "I don't get it." });
    ok(r3.ok, `confusion-signal turn -> 200 (got ${r3.status})`);
    ok(j3?.diagnosis === null, 'confusion-signal turn has no diagnosis (assess_child_reasoning was not called)');
    ok(j3?.tutorText === "No worries — let's slow down and look at it a different way.", 'final reply after confusion-signal round-trip correct');

    // ── 4. MAX_TOOL_HOPS safety net: script more tool-call hops than the
    // cap (4) so the loop must bail out with a fallback instead of hanging
    // or crashing.
    for (let i = 0; i < 6; i++) {
      globalThis.STUB.conversationQueue.push({ functionCalls: [{ name: 'record_confusion_signal', args: { signal: 'too_fast' } }] });
    }
    const { res: r4, json: j4 } = await postJson(BASE, '/api/tutor/turn', { sessionId, studentId, learnerText: 'still confused' });
    ok(r4.ok, `runaway tool-call loop -> 200, not a hang/crash (got ${r4.status})`);
    ok(typeof j4?.tutorText === 'string' && j4.tutorText.length > 0, `MAX_TOOL_HOPS safety net returned a non-empty fallback tutorText (got ${JSON.stringify(j4?.tutorText)})`);

    // ── 5. Empty-string final text from the model — this run originally
    // found it passed straight through as tutorText: "" (a silent turn the
    // child would see as the tutor going blank). Fixed in
    // server/routes/tutor.ts on 2026-09-28 (docs/DECISIONS.md
    // D-2026-09-28-4) to substitute a neutral fallback instead.
    globalThis.STUB.conversationQueue.push({ text: '' });
    const { res: r5, json: j5 } = await postJson(BASE, '/api/tutor/turn', { sessionId, studentId, learnerText: 'ok' });
    ok(r5.ok, `empty-model-text turn -> 200 (got ${r5.status})`);
    ok(typeof j5?.tutorText === 'string' && j5.tutorText.trim().length > 0, `empty model text is replaced with a non-empty fallback, not sent blank (got ${JSON.stringify(j5?.tutorText)})`);

    console.log(`\n  ${globalThis.STUB.calls.length} generateContent calls total (${globalThis.STUB.calls.filter(c => c.isDiagnostician).length} diagnostician, ${globalThis.STUB.calls.filter(c => !c.isDiagnostician).length} conversational)`);
  } finally {
    server.close();
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => {
    console.log(process.exitCode ? '\nFAILED' : '\nall offline logic checks passed');
    process.exit(process.exitCode || 0);
  });
