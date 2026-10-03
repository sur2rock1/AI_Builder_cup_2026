// Smoke test for src/curriculum/pregenStore.ts.
//
// No Firebase credentials in this environment, so this exercises the local-
// file fallback branch — the same branch every other repo/store smoke test
// here exercises (see curriculum-ingest.mjs's "[Curriculum] Saved ... to
// local file" lines). That's also exactly what runs today in local dev/CI
// without FIREBASE_SERVICE_ACCOUNT_PATH set. The Firestore/Storage branches
// (uploadImageToStorage, Firestore get/set) are guarded by `if (db)` /
// `if (bucket)` checks that return null/false when admin.apps is empty —
// this run proves that guard actually routes to the fallback rather than
// throwing, which is the part most likely to break integration with a real
// Firebase project silently.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-pregen-store-smoke-'));

const script = `
import { pregenExists, getPregenAsync, savePregenAsync } from '${root}/src/curriculum/pregenStore.ts';

function ok(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
  console.log('ok', msg);
}

async function main() {
  // 1. Nothing cached yet.
  ok((await pregenExists(['concept-a'])) === false, 'not cached before first save');
  ok((await getPregenAsync(['concept-a'])) === null, 'getPregenAsync returns null before first save');

  // 2. Save a record with an inline base64 "image" (no Storage configured —
  //    must stay inline rather than being silently dropped).
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const record = {
    topic: 'Pythagoras theorem',
    grade: 'Grade 8',
    conceptId: 'concept-a',
    slug: 'concept-a',
    generatedAt: new Date().toISOString(),
    lessonData: { tagline: 'test' },
    diagrams: { __main__: { title: 'main diagram' } },
    photoUrl: tinyPng,
  };
  const saved = await savePregenAsync('concept-a', record);
  ok(saved.photoUrl === tinyPng, 'base64 photo kept inline when Storage is not configured (not dropped)');

  // 3. Round-trip via lookup — proves the actual persisted shape, not just
  //    the in-memory return value of savePregenAsync.
  ok((await pregenExists(['concept-a'])) === true, 'cached after save');
  const loaded = await getPregenAsync(['concept-a']);
  ok(loaded !== null, 'getPregenAsync finds it after save');
  ok(loaded.lessonData.tagline === 'test', 'lessonData round-trips');
  ok(loaded.diagrams.__main__.title === 'main diagram', 'diagrams round-trip');
  ok(loaded.photoUrl === tinyPng, 'photoUrl round-trips inline');

  // 4. Topic-slug fallback lookup (no conceptId candidate matches, second
  //    candidate does) — mirrors server.ts's [conceptId, slugifyTopic(topic)]
  //    candidate list for ad-hoc topics with no curriculum concept id.
  const loadedBySlug = await getPregenAsync(['no-such-concept-id', 'concept-a']);
  ok(loadedBySlug !== null && loadedBySlug.slug === 'concept-a', 'falls through candidate list to the slug key');

  // 5. Merge semantics used by /api/update-diagram: save adds a new diagram
  //    focus key onto the existing record without clobbering lessonData/photo.
  const merged = await savePregenAsync('concept-a', {
    ...loaded,
    diagrams: { ...loaded.diagrams, 'key-properties': { title: 'focus diagram' } },
  });
  ok(merged.lessonData.tagline === 'test', 'merge preserves existing lessonData');
  ok(merged.diagrams.__main__.title === 'main diagram', 'merge preserves existing __main__ diagram');
  ok(merged.diagrams['key-properties'].title === 'focus diagram', 'merge adds the new focus diagram');

  console.log('ALL pregen-store SMOKE CHECKS PASSED');
}

main().catch((e) => { console.error(e); process.exit(1); });
`;

fs.writeFileSync(path.join(tmp, 'run.mjs'), script);

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-pregen-store-data-'));
try {
  execFileSync('npx', ['tsx', path.join(tmp, 'run.mjs')], {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env, PREGEN_DATA_DIR: dataDir },
  });
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(dataDir, { recursive: true, force: true });
}
