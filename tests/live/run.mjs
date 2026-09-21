// Voice regression test — the voice code must match the original build.
//   npm run test:live
// Runs the REAL server against a fake Gemini Live that records everything the
// server sends, with a WebSocket client playing the browser. Offline, free.
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const bundle = path.join(here, '.build', 'server.mjs');
await build({
  entryPoints: [path.join(root, 'server.ts')], bundle: true, platform: 'node', format: 'esm',
  packages: 'external', logLevel: 'warning', outfile: bundle,
  alias: { '@google/genai': path.join(here, 'genai-live-stub.mjs') },
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});

const PORT = 3999, sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };

async function runScenario(scenario, drive) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-live-'));
  fs.mkdirSync(path.join(cwd, 'data')); fs.writeFileSync(path.join(cwd, 'data', 'curricula.json'), '{}');
  const rec = path.join(cwd, 'rec.jsonl');
  const srv = spawn(process.execPath, [bundle], { cwd, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), LIVE_SCENARIO: scenario, LIVE_RECORD: rec, NODE_ENV: 'production', GEMINI_API_KEY: 'test' } });
  try {
    for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/api/health`); break; } catch { await sleep(150); } }
    const got = [];
    const ws = new WebSocket(`ws://localhost:${PORT}/ws/live?topic=Pythagoras&grade=Sec%202`);
    ws.on('message', d => { const m = JSON.parse(d.toString()); m._t = Date.now(); got.push(m); });
    await drive(ws);
    ws.close(); await sleep(300);
    const R = fs.existsSync(rec) ? fs.readFileSync(rec, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
    return { R, got };
  } finally {
    srv.kill(); await sleep(200); fs.rmSync(cwd, { recursive: true, force: true });
  }
}

{
  const { R, got } = await runScenario('classic', async (ws) => {
    await sleep(1500);
    ws.send(JSON.stringify({ type: 'audio_in', data: Buffer.alloc(3200).toString('base64') }));
    await sleep(800);
  });
  const conn = R.find(x => x.kind === 'connect');
  const kick = R.find(x => x.kind === 'client_content');
  const resp = R.find(x => x.kind === 'tool_response');
  const sent = R.find(x => x.kind === 'toolcall_sent');
  console.log('\n── voice session matches the original build');
  check(JSON.stringify(conn?.configKeys) === JSON.stringify(['inputAudioTranscription','outputAudioTranscription','responseModalities','speechConfig','systemInstruction','tools']),
        'connection settings are the original six, nothing added');
  check(JSON.stringify(conn?.tools) === JSON.stringify(['update_chalkboard_notes','write_live_note','switch_board_view','generate_photo_visual','set_topic','highlight_concept','pose_quiz']),
        'the original seven tools');
  check(/^You are "Dr\. Marcus Vance", an inspiring, warm, and brilliant Senior Educator/.test(conn?.promptStart || ''), 'the original system prompt');
  check(/^The student has just entered the classroom to learn about/.test(kick?.text || ''), 'the original opening turn');
  check(resp?.response?.result === 'ok' && resp.t - sent.t < 50, `tool calls answered "ok" immediately (${resp ? resp.t - sent.t : '?'} ms)`);
  check(R.some(x => x.kind === 'mic'), 'microphone audio is relayed to Gemini');
  check(got.some(m => m.type === 'session_ready') && got.some(m => m.type === 'audio_out'), 'tutor audio reaches the browser');
}

{
  const { R, got } = await runScenario('observe', async () => { await sleep(4500); });
  const outs = got.filter(m => m.type === 'output_transcript').map(m => m.text);
  const ins = got.filter(m => m.type === 'input_transcript').map(m => m.text);
  const upd = got.find(m => m.type === 'learner_update');
  const s = upd?.snapshot;
  const replyAudio = got.find(m => m.type === 'audio_out' && m.data === 'BBBB');
  const resp = R.find(x => x.kind === 'tool_response' && x.id === 'o1');
  const sent = R.find(x => x.kind === 'toolcall_sent');
  const prompt = R.find(x => x.kind === 'observer_prompt')?.prompt || '';
  console.log('\n── live learner panel (observer side-channel)');
  check(outs.includes("Let's find the hypotenuse. What is it for sides 3 and 4?"), 'tutor subtitle is the whole sentence, not a fragment');
  check(ins.at(-1) === "I added them, it's 7", `child's words reach the browser ("${ins.at(-1)}")`);
  check(!!upd, 'a learner update reaches the browser after the exchange');
  check(prompt.includes("CHILD: I added them, it's 7") && prompt.includes('BOARD: update_chalkboard_notes'), 'observer sees the child, the tutor and the board');
  check(replyAudio && upd && replyAudio._t < upd._t - 1500, 'tutor reply is NOT held back by the observer (voice never waits)');
  check(resp?.response?.result === 'ok' && resp.t - sent.t < 50, 'tool calls still answered "ok" immediately');
  check(s?.understanding === 20, `understanding moves at most 20 per exchange (model said 90, shown ${s?.understanding})`);
  check(s?.misconceptions?.[0]?.status === 'suspected', 'one answer can only make a misconception "suspected", never "confirmed"');
  check(s?.concept?.label === 'Finding the hypotenuse' && s?.nextStep && s?.noticed, 'concept, what was noticed and next step are filled in');
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
