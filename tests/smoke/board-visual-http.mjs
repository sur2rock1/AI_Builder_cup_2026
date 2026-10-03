// Real-HTTP check of the board-picture endpoints (docs/BOARD_VISUALS.md).
// Run: npx tsx tests/smoke/board-visual-http.mjs
//
// Starts the actual server (no Gemini key, pregen store in a temp folder so the
// project's data/ is never touched), seeds one lesson with prepared pictures,
// and checks what the browser and the tutor's update_diagram would get back.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_VISUALS } from '../../src/visual/samples.ts';
import { sanitizeBoardVisual } from '../../src/visual/sanitize.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3977;
const base = `http://127.0.0.1:${PORT}`;
const pregenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bv-http-'));

let passed = 0;
const ok = async (name, fn) => {
  try { await fn(); passed++; console.log(`ok http: ${name}`); }
  catch (err) { console.error(`FAIL http: ${name}\n  ${err.message}`); process.exitCode = 1; }
};

// A lesson generated before board pictures would have lessonData only; this one has pictures too.
const clean = (raw) => sanitizeBoardVisual(raw).visual;
const topic = 'Board picture smoke topic';
const slug = 'board-picture-smoke-topic';
const visuals = {
  main: clean(SAMPLE_VISUALS.main),
  'contrast:horizontal-line-named-x': clean(SAMPLE_VISUALS['contrast:horizontal-line-named-x']),
  apply: clean(SAMPLE_VISUALS.apply),
};
fs.writeFileSync(path.join(pregenDir, `${slug}.json`), JSON.stringify({
  topic, slug, grade: 'Grade 8', generatedAt: new Date().toISOString(),
  lessonData: {
    topic, grade: 'Grade 8', subject: 'Mathematics', tagline: 't', overview: 'o',
    chalkNotes: { title: 'c', subtitle: '', bulletPoints: [], keyTakeaways: [] },
    quiz: { question: 'q', options: ['a', 'b'], correctIndex: 0, explanation: 'e' },
    suggestedQuestions: [],
  },
  visuals,
  photoUrl: null,
}));
// An older lesson with no pictures, to check nothing generic is invented for it.
fs.writeFileSync(path.join(pregenDir, 'older-lesson-without-pictures.json'), JSON.stringify({
  topic: 'Older lesson without pictures', slug: 'older-lesson-without-pictures', generatedAt: 'x',
  lessonData: { topic: 'Older lesson without pictures', grade: 'Grade 8', subject: 'Maths', tagline: '', overview: '',
    chalkNotes: { title: '', subtitle: '', bulletPoints: [], keyTakeaways: [] }, quiz: { question: '', options: [], correctIndex: 0, explanation: '' }, suggestedQuestions: [] },
  photoUrl: null,
}));

const srv = spawn(process.execPath, ['--import', 'tsx', path.join(root, 'server.ts')], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production', GEMINI_API_KEY: '', PREGEN_DATA_DIR: pregenDir,
    FIREBASE_SERVICE_ACCOUNT_PATH: '', GOOGLE_APPLICATION_CREDENTIALS: '', GCLOUD_PROJECT: '', DISABLE_PREGEN: 'true' },
});
let log = '';
srv.stdout.on('data', (d) => { log += d; });
srv.stderr.on('data', (d) => { log += d; });

const post = async (url, body) => (await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();

try {
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    try { up = (await fetch(`${base}/api/health`)).ok; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  assert.ok(up, `server did not start:\n${log.slice(-1500)}`);

  await ok('lesson arrives with its board picture attached', async () => {
    const r = await post('/api/generate-lesson', { topic, grade: 'Grade 8' });
    assert.equal(r.source, 'pregenerated-cache');
    assert.equal(r.data.visual?.title, visuals.main.title);
    assert.equal(r.data.visual3d, null, 'no 3D picture → no 3D view');
    assert.equal(r.data.scene3d, undefined, 'the static generator\'s template 3D scene is never substituted');
    assert.deepEqual(r.data.diagram?.nodes, [], 'no generic template diagram either');
  });

  await ok('older lesson without pictures: nothing generic is invented', async () => {
    const r = await post('/api/generate-lesson', { topic: 'Older lesson without pictures', grade: 'Grade 8' });
    assert.equal(r.data.visual, undefined);
    assert.equal(r.data.scene3d, undefined);
    assert.deepEqual(r.data.diagram?.nodes, []);
  });

  await ok('update_diagram: exact contrast key → the prepared contrast case', async () => {
    const r = await post('/api/update-diagram', { topic, focus: 'contrast:horizontal-line-named-x' });
    assert.equal(r.success, true); assert.equal(r.key, 'contrast:horizontal-line-named-x'); assert.equal(r.source, 'pregenerated-cache');
  });

  await ok('update_diagram: the tutor\'s own words find the contrast case', async () => {
    const r = await post('/api/update-diagram', { topic, focus: 'the rule that a flat line is x = 3' });
    assert.equal(r.key, 'contrast:horizontal-line-named-x');
  });

  await ok('update_diagram: "apply" → the application picture (situation only)', async () => {
    const r = await post('/api/update-diagram', { topic, focus: 'apply' });
    assert.equal(r.key, 'apply');
    assert.equal(r.visual.purpose, 'apply');
  });

  await ok('update_diagram: nothing prepared and no model → the board keeps its picture', async () => {
    const r = await post('/api/update-diagram', { topic, focus: 'photosynthesis in leaves' });
    assert.equal(r.success, false);
    assert.equal(r.visual, undefined);
    assert.equal(r.diagram, undefined, 'no static fallback diagram');
  });

  await ok('stored pictures survive a round trip through the store unchanged', async () => {
    const r = await post('/api/generate-lesson', { topic, grade: 'Grade 8' });
    assert.deepEqual(r.data.visual, visuals.main);
  });
} finally {
  srv.kill();
  fs.rmSync(pregenDir, { recursive: true, force: true });
}
console.log(`${process.exitCode ? 'SOME HTTP CHECKS FAILED' : `ALL ${passed} http checks passed`}`);
