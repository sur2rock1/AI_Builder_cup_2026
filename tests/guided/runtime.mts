// Upload-time guided lessons: the runtime store round-trips a lesson and the registry serves it.
//   npx tsx tests/guided/runtime.mts
import fs from 'fs'; import os from 'os'; import path from 'path';
process.env.GUIDED_RUNTIME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'guided-rt-'));
const { saveGuidedScript, loadRuntimeGuidedScripts, guidedScriptExists } = await import('../../src/guided/store');
const { getGuidedScript, hasGuidedScript, setRuntimeGuidedScripts, ALL_GUIDED_SCRIPTS } = await import('../../src/guided/registry');
let bad = 0; const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) bad++; };

const id = 'test--uploaded-concept';
const base = ALL_GUIDED_SCRIPTS.length;
ok(!hasGuidedScript(id) && !(await guidedScriptExists(id)), 'a freshly uploaded concept has no guided lesson');
const script: any = { conceptId: id, title: 'Uploaded', beats: [{ id: 'b1', kind: 'orient', lines: [] }] };
ok((await saveGuidedScript(script)) === 'local', 'save works with no Firebase (local fallback)');
ok(await guidedScriptExists(id), 'exists after save');
const loaded = await loadRuntimeGuidedScripts();
ok(loaded.length === 1 && loaded[0].conceptId === id, 'load returns the saved lesson');
setRuntimeGuidedScripts(loaded);
ok(hasGuidedScript(id) && getGuidedScript(id)?.title === 'Uploaded', 'registry serves it without a rebuild');
ok(ALL_GUIDED_SCRIPTS.length === base + 1, 'the exported list is updated in place');
setRuntimeGuidedScripts([]);
ok(!hasGuidedScript(id) && ALL_GUIDED_SCRIPTS.length === base, 'clearing runtime lessons restores the bundled set');
fs.writeFileSync(path.join(process.env.GUIDED_RUNTIME_DIR!, 'broken.json'), '{nope');
ok((await loadRuntimeGuidedScripts()).length === 1, 'a corrupt file is skipped, not fatal');
console.log(bad ? `\n${bad} FAILED` : '\nall runtime-store checks passed'); process.exit(bad ? 1 : 0);
