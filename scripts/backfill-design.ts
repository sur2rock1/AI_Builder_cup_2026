// Adds L3 hints + per-concept presentation decisions to already-ingested curricula. ONE call per course.
//   npm run backfill:design -- --dry-run     (no model; shows what is missing)
//   npm run backfill:design -- --chapter "^Chapter 1:"   (only concepts whose chapter matches; other chapters are untouched)
//   npm run backfill:design                  (needs GEMINI_API_KEY; backs up data/curricula.json first)
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import dotenv from 'dotenv';
import { generateJSON } from '../src/ai/gateway';
import { needsDesign, backfillPrompt, applyBackfill, type BackfillResponse } from '../src/curriculum/designBackfill';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });
const FILE = path.join(ROOT, 'data', 'curricula.json');
const DRY = process.argv.includes('--dry-run');
const CH = process.argv.includes('--chapter') ? new RegExp(process.argv[process.argv.indexOf('--chapter') + 1], 'i') : null;
const courses = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const todo = courses.map((c: any) => ({ c, need: c.concepts.filter((k: any) => needsDesign(k) && (!CH || CH.test(String(k.chapter || '')))) })).filter((x: any) => x.need.length);
console.log(`${todo.length} course(s) need design fields; model calls: ${todo.length}`);
for (const { c, need } of todo) console.log(` - ${c.id || c.subject}: ${need.length}/${c.concepts.length} concepts`);
if (DRY || !todo.length) process.exit(0);
const apiKey = process.env.GEMINI_API_KEY; if (!apiKey) { console.error('GEMINI_API_KEY missing'); process.exit(1); }
fs.mkdirSync(path.join(ROOT, 'backups'), { recursive: true });
fs.copyFileSync(FILE, path.join(ROOT, 'backups', `curricula.pre-backfill-${Date.now()}.json`));
for (const { c, need } of todo) {
  const { data } = await generateJSON<BackfillResponse>({ role: 'strong', call: 'ingest.backfill-design', apiKey, prompt: backfillPrompt(c, need), timeoutMs: 170000, transientRetries: 1 });
  fs.mkdirSync(path.join(ROOT, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'logs', `backfill-${c.id || 'course'}-${Date.now()}.json`), JSON.stringify(data, null, 2));
  const r = applyBackfill(c, data);
  console.log(`${c.id || c.subject}: +${r.hints} hint sets, +${r.presentation} presentation decisions | hint candidates ${r.hintCandidates}, dropped: not-3 ${r.notThree}, leaked ${r.leaked}, unmatched ids ${r.unmatchedIds.length}${r.unmatchedIds.length ? ' (' + r.unmatchedIds.slice(0, 4).join(', ') + ')' : ''}`);
  fs.writeFileSync(FILE, JSON.stringify(courses, null, 2));
}
console.log('done. Re-upload/seed to Firestore if production reads curricula from there.');
