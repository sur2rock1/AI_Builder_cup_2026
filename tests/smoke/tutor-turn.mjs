// End-to-end smoke test for T08 (POST /api/tutor/turn) — docs/BUILD_PLAN.md
// T08, docs/TRACEABILITY.md FR-25.
//
// Unlike tests/run.mjs (which stubs @google/genai to test the assessor's
// deadline/retry logic offline, cheaply and deterministically), this test
// runs the REAL server against the REAL Gemini API. T08's entire purpose is
// to prove the text channel reaches the SAME diagnosis pipeline the voice
// channel does — a stubbed model would prove nothing about that, and the
// evals this unblocks (EV-01/EV-02) need exactly this real path working.
//
// Needs GEMINI_API_KEY in .env; SKIPS (exit 0) rather than failing if it is
// not set, so this does not break a machine without a key configured.
//
//     npx --yes tsx tests/smoke/tutor-turn.mjs
//
import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const PORT = Number(process.env.TEST_PORT) || 3911;
const BASE = `http://localhost:${PORT}`;
const STUDENT_ID = `smoke_${Date.now()}`;
const SUBJECT_ID = 'igcse--g8--mathematics';

const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };

if (!process.env.GEMINI_API_KEY) {
  console.log('SKIP  tests/smoke/tutor-turn.mjs — GEMINI_API_KEY not set, cannot exercise the real diagnosis pipeline');
  process.exit(0);
}

async function waitForHealth(timeoutMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function postJson(pathName, body) {
  const res = await fetch(`${BASE}${pathName}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON error body */ }
  return { res, json };
}

async function main() {
  const tsxBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.CMD' : 'tsx');
  const server = spawn(tsxBin, ['server.ts'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      // NODE_ENV=production serves the prebuilt dist/ instead of starting
      // Vite's dev middleware -- this test only needs the API routes, and
      // avoids a Vite dep-reoptimization/EPERM issue seen against a
      // network-mounted working directory that has nothing to do with T08.
      // DEMO_MODE (not NODE_ENV=development) is what requireAuth's dev
      // bypass checks for outside of dev mode -- see server/middleware/requireAuth.ts.
      NODE_ENV: 'production',
      DEMO_MODE: 'true',
      ALLOW_DEV_AUTH_BYPASS: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d.toString(); });
  server.stderr.on('data', (d) => { serverLog += d.toString(); });

  try {
    const up = await waitForHealth();
    ok(up, 'server started and answered /api/health');
    if (!up) { console.log(serverLog.slice(-2000)); process.exitCode = 1; return; }

    // 1. Start a real session (T04's route) so tutor/turn has one to attach to.
    const { res: startRes, json: startBody } = await postJson('/api/session/start', {
      studentId: STUDENT_ID, name: 'Smoke Test', grade: 'Grade 8', subjectId: SUBJECT_ID,
    });
    ok(startRes.ok, `POST /api/session/start -> 200 (got ${startRes.status}: ${JSON.stringify(startBody).slice(0, 200)})`);
    const sessionId = startBody?.sessionId;
    ok(Boolean(sessionId), 'session/start returned a sessionId');
    if (!sessionId) return;

    // 2. Opening turn: no learnerText -> the tutor's kickoff line, same
    // opening move composeKickoff() drives on the voice channel.
    const { res: openRes, json: openBody } = await postJson('/api/tutor/turn', { sessionId, studentId: STUDENT_ID });
    ok(openRes.ok, `opening turn -> 200 (got ${openRes.status}: ${JSON.stringify(openBody).slice(0, 200)})`);
    ok(typeof openBody?.tutorText === 'string' && openBody.tutorText.length > 0, 'opening turn returned non-empty tutorText');
    ok(openBody?.turn === 1, `opening turn is turn 1 (got ${openBody?.turn})`);
    if (openBody?.tutorText) console.log(`  tutor opened: "${String(openBody.tutorText).slice(0, 160)}"`);

    // 3. A plausible but under-explained answer — a real chance (not a
    // forced one) for the model to call assess_child_reasoning. This checks
    // the shape when it fires; it does not hard-fail the run when the model
    // chooses to teach one more chunk before asking, since that choice is
    // the model's own and not this endpoint's to force.
    const { res: turnRes, json: turnBody } = await postJson('/api/tutor/turn', {
      sessionId, studentId: STUDENT_ID, learnerText: "I think it's 7. I just added the two numbers together.",
    });
    ok(turnRes.ok, `second turn -> 200 (got ${turnRes.status}: ${JSON.stringify(turnBody).slice(0, 200)})`);
    ok(typeof turnBody?.tutorText === 'string' && turnBody.tutorText.length > 0, 'second turn returned non-empty tutorText');
    ok(turnBody?.turn === 2, `second turn is turn 2 (got ${turnBody?.turn})`);
    if (turnBody?.tutorText) console.log(`  tutor replied: "${String(turnBody.tutorText).slice(0, 160)}"`);
    if (turnBody?.diagnosis) {
      const d = turnBody.diagnosis;
      console.log(`  diagnosis fired: classification=${d.classification} understandingDepth=${d.understandingDepth} confidence=${d.confidence} latencyMs=${d.diagnosisLatencyMs}`);
      ok(
        ['clear_reasoning', 'needs_clarification', 'misconception_behind_correct', 'wrong_answer', 'no_reasoning_given'].includes(d.classification),
        'diagnosis.classification is a real ReasoningClassification value',
      );
      ok(typeof d.diagnosisLatencyMs === 'number', 'diagnosis carries a latency number (feeds T19 p50/p95)');
    } else {
      console.log('  (model did not call assess_child_reasoning on this turn — not a failure, see comment above)');
    }

    // 4. Ownership: a caller who is not this session's student is refused.
    const { res: denyRes } = await postJson('/api/tutor/turn', { sessionId, studentId: 'someone-else', learnerText: 'hi' });
    ok(denyRes.status === 403, `a different studentId is refused with 403 (got ${denyRes.status})`);

    // 5. An unknown session is refused, not silently started.
    const { res: missingRes } = await postJson('/api/tutor/turn', { sessionId: 'does-not-exist', studentId: STUDENT_ID, learnerText: 'hi' });
    ok(missingRes.status === 404, `an unknown sessionId is refused with 404 (got ${missingRes.status})`);

    // 6. Ending the session clears T08's in-memory history for it too.
    const { res: endRes } = await postJson(`/api/session/${sessionId}/end`, { studentId: STUDENT_ID });
    ok(endRes.ok, `POST /api/session/${sessionId}/end -> 200 (got ${endRes.status})`);
    const { res: afterEndRes } = await postJson('/api/tutor/turn', { sessionId, studentId: STUDENT_ID, learnerText: 'hi' });
    ok(afterEndRes.status === 404, `tutor/turn on an ended session is refused with 404 (got ${afterEndRes.status})`);
  } finally {
    server.kill('SIGTERM');
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => {
    console.log(process.exitCode ? '\nFAILED' : '\nall checks passed');
    process.exit(process.exitCode || 0);
  });
