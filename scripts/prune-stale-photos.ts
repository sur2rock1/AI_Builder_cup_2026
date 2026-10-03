// Free, offline: removes stored photos from records whose content spec says "no photo", so the record matches the plan.
//   npm run prune:photos -- --chapter "^Chapter 1:"          (dry run)
//   npm run prune:photos -- --chapter "^Chapter 1:" --apply  (backs up each record first)
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { buildConceptSpec } from '../src/curriculum/contentSpec';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n: string) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
const CH = new RegExp(arg('--chapter') || '^Chapter 1:', 'i'); const APPLY = process.argv.includes('--apply');
const dir = path.join(ROOT, 'data', 'pregenerated'); const bak = path.join(ROOT, 'backups', `pre-prune-${Date.now()}`);
const courses = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'curricula.json'), 'utf8'));
let n = 0;
for (const course of courses) for (const c of course.concepts) {
  if (!CH.test(String(c.chapter || ''))) continue;
  const f = path.join(dir, `${c.id}.json`); if (!fs.existsSync(f)) continue;
  const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!rec.photoUrl || buildConceptSpec(c, course, course.grade || 'Grade 8').photo.yes) continue;
  n++; console.log(`${APPLY ? 'pruned' : 'would prune'}: ${c.label}`);
  if (APPLY) { fs.mkdirSync(bak, { recursive: true }); fs.copyFileSync(f, path.join(bak, path.basename(f))); delete rec.photoUrl; delete rec.photoMeta; fs.writeFileSync(f, JSON.stringify(rec, null, 2)); }
}
console.log(`${n} record(s) ${APPLY ? 'pruned' : 'to prune (add --apply)'}`);
