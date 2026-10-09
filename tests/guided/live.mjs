// Guided mode through the REAL server, against a fake Gemini Live.
//   node tests/guided/live.mjs
// Checks the per-session switch end to end: which tools and prompt Gemini is
// given, what the browser is told, and that standard mode is untouched.
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const bundle = path.join(root, 'tests', '.build', 'guided-server.mjs');
await build({
  entryPoints: [path.join(root, 'server.ts')], bundle: true, platform: 'node', format: 'esm',
  packages: 'external', logLevel: 'warning', outfile: bundle,
  alias: { '@google/genai': path.join(here, 'genai-guided-stub.mjs') },
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});

const CONCEPT = 'igcse--g8--mathematics--ch1-linear-graphs-and-simultaneous-l--equations-of-horizontal-and-vertical-lines';
const NO_SCRIPT = 'igcse--g8--mathematics--ch2-linear-inequalities--inequality-notation-and-properties-of-inequalities';
const PORT = 3998, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };

async function run({ query, env = {}, play = false }) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-guided-'));
  fs.mkdirSync(path.join(cwd, 'data')); fs.writeFileSync(path.join(cwd, 'data', 'curricula.json'), '{}');
  const rec = path.join(cwd, 'rec.jsonl');
  const srv = spawn(process.execPath, [bundle], { cwd, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production', GEMINI_API_KEY: 'test', GUIDED_RECORD: rec, GUIDED_PLAY: play ? '1' : '0', ...env } });
  try {
    for (let i = 0; i < 400; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/health`); break; } catch { await sleep(150); } }
    const api = {};
    try { api.mode = await (await fetch(`http://127.0.0.1:${PORT}/api/tutor-mode`)).json(); } catch {}
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/guided-script?conceptId=${CONCEPT}`); api.script = { status: r.status, body: await r.json() }; } catch {}
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/guided-script?conceptId=${NO_SCRIPT}`); api.noScript = r.status; } catch {}
    const got = [];
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/live?topic=Lines&grade=Grade%208&guest=1${query}`);
    ws.on('message', (d) => got.push(JSON.parse(d.toString())));
    await sleep(play ? 4200 : 1800);
    ws.close(); await sleep(200);
    const R = fs.existsSync(rec) ? fs.readFileSync(rec, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    return { R, got, api };
  } finally { srv.kill(); await sleep(200); fs.rmSync(cwd, { recursive: true, force: true }); }
}

const STANDARD_TOOLS = ['update_chalkboard_notes', 'write_live_note', 'switch_board_view', 'generate_photo_visual', 'set_topic', 'highlight_concept', 'pose_quiz', 'update_diagram', 'assess_child_reasoning', 'show_student_thinking', 'record_confusion_signal', 'set_figure', 'reveal_part'];

{
  console.log('\n── nothing asked for, no server default → standard, exactly as before');
  const { R, got, api } = await run({ query: `&conceptId=${CONCEPT}` });
  const c = R.find((x) => x.kind === 'connect');
  check(JSON.stringify(c?.tools) === JSON.stringify(STANDARD_TOOLS), 'Gemini is given the standard tool list, unchanged');
  check(c?.prompt.includes('THE BOARD (voice channel)') && !c.prompt.includes('THE BOARD (guided lesson)'), 'prompt has the standard board block');
  check(got.find((m) => m.type === 'tutor_mode')?.mode === 'standard', 'the browser is told: standard');
  check(!R.find((x) => x.kind === 'client_content')?.text.includes('advance_beat'), 'opening turn is the standard one');
  check(api.mode?.default === 'standard' && api.mode.guidedConcepts.length === 4, 'server reports default standard and 4 guided lessons');
  check(api.script?.status === 200 && api.script.body.script?.beats?.length === 11, 'the lesson script is served for a guided concept');
  check(api.noScript === 404, 'a concept without a script gets a 404 (browser stays standard)');
}
{
  console.log('\n── session asks for guided');
  const { R, got } = await run({ query: `&conceptId=${CONCEPT}&mode=guided`, play: true });
  const c = R.find((x) => x.kind === 'connect');
  check(JSON.stringify(c?.tools) === JSON.stringify(['assess_child_reasoning', 'record_confusion_signal', 'advance_beat', 'next_line', 'fill_slot', 'write_aside', 'resume_lesson']), `guided tool list: ${c?.tools?.join(', ')}`);
  check(c?.prompt.includes('THE BOARD (guided lesson)') && !c.prompt.includes('THE BOARD (voice channel)'), 'prompt has the guided board block instead of the standard one');
  check(c?.prompt.includes('HARD RULES') || /H13/.test(c?.prompt || ''), 'the persona and hard rules are still in the prompt');
  check(!c?.prompt.includes('THE BOARD PICTURES'), 'the standard picture block is not added');
  check(got.find((m) => m.type === 'tutor_mode')?.mode === 'guided', 'the browser is told: guided');
  check(/call advance_beat/.test(R.find((x) => x.kind === 'client_content')?.text || ''), 'opening turn starts the first beat');
  const forwarded = got.filter((m) => m.type === 'tool_call').map((m) => m.name);
  check(forwarded.join(',') === 'advance_beat,advance_beat,fill_slot,fill_slot,update_chalkboard_notes,advance_beat,next_line,next_line,write_aside,resume_lesson', `every tool call is forwarded to the browser (${forwarded.join(',')})`);
  const resp = Object.fromEntries(R.filter((x) => x.kind === 'tool_response').map((x) => [x.id, x.response]));
  check(/BEAT 1 of 11/.test(resp.a1?.instruction || ''), 'first advance_beat → beat 1 instruction');
  check(/BEAT 2 of 11/.test(resp.a2?.instruction || '') && /THEN ASK/.test(resp.a2.instruction), 'second advance_beat → beat 2 with its question');
  check(resp.f1?.result === 'ok', 'fill_slot on a blank that is on the board → ok');
  check(resp.f2?.result === 'ignored', 'fill_slot on a blank that is not on the board → ignored, nothing breaks');
  check(resp.n1?.result === 'ok', 'a standard board call in guided mode is still answered (no hang)');
  // the server holds the board and sends snapshots
  const states = got.filter((m) => m.type === 'guided_state').map((m) => m.state);
  check(states.length >= 4 && states[0].beatIndex === 0, `the browser gets board snapshots from the server (${states.length})`);
  check(states.some((s) => s.filled?.in_common === 'the same x'), 'a filled blank arrives in a snapshot');
  check(/LINE BY LINE/.test(resp.a3?.instruction || ''), 'a line-by-line beat tells the tutor to write line by line');
  check(resp.l1?.result === 'written' && /SAY IT/.test(resp.l1.instruction), 'next_line writes one line and says what to say');
  check(resp.l2?.result === 'not_yet', 'a second next_line in the same message is refused (one line at a time)');
  const lastState = states[states.length - 1];
  check(lastState?.items?.some((p) => p.item.type === 'line') && lastState.items.filter((p) => p.item.type === 'line').length === 1, 'exactly one line is on the board');
  check(resp.w1?.result === 'written' && lastState.items.some((p) => p.item.type === 'aside' && p.item.question === 'what is rise?'), "write_aside puts the side answer on the board, with the learner's question");
  check(/last line written was "Two points/.test(resp.r1?.instruction || ''), 'resume_lesson sends the tutor back to the line where it stopped');
}
{
  console.log('\n── guided asked for, but this concept has no lesson');
  const { R, got } = await run({ query: `&conceptId=${NO_SCRIPT}&mode=guided` });
  const c = R.find((x) => x.kind === 'connect');
  check(JSON.stringify(c?.tools) === JSON.stringify(STANDARD_TOOLS), 'falls back to the standard tools');
  check(got.find((m) => m.type === 'tutor_mode')?.mode === 'standard', 'the browser is told: standard (so it keeps the standard board)');
}
{
  console.log('\n── server default TUTOR_MODE=guided, and a session that overrides it');
  const a = await run({ query: `&conceptId=${CONCEPT}`, env: { TUTOR_MODE: 'guided' } });
  check(a.got.find((m) => m.type === 'tutor_mode')?.mode === 'guided', 'no request + TUTOR_MODE=guided → guided');
  check(a.api.mode?.default === 'guided', 'the server reports its default as guided');
  const b = await run({ query: `&conceptId=${CONCEPT}&mode=standard`, env: { TUTOR_MODE: 'guided' } });
  check(b.got.find((m) => m.type === 'tutor_mode')?.mode === 'standard', "the session's own request (standard) beats the server default");
  check(JSON.stringify(b.R.find((x) => x.kind === 'connect')?.tools) === JSON.stringify(STANDARD_TOOLS), 'and Gemini gets the standard tools');
}
{
  console.log('\n── legacy persona escape hatch still wins');
  const { R } = await run({ query: `&conceptId=${CONCEPT}&mode=guided`, env: { PERSONA: 'legacy' } });
  const c = R.find((x) => x.kind === 'connect');
  check(!(c?.tools || []).includes('advance_beat'), 'PERSONA=legacy ignores guided mode');
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall guided server checks passed');
process.exit(failures ? 1 : 0);
