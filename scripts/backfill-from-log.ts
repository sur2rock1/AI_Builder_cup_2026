// Re-applies a SAVED backfill reply (logs/backfill-*.json) without calling the model. Costs nothing.
//   npm run backfill:apply -- logs/backfill-<course>-<ts>.json <courseId>
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { applyBackfill } from '../src/curriculum/designBackfill';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [logFile, courseId] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!logFile || !courseId) { console.error('usage: backfill:apply <log.json> <courseId>'); process.exit(1); }
const FILE = path.join(ROOT, 'data', 'curricula.json');
const courses = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const course = courses.find((c: any) => c.id === courseId); if (!course) { console.error('no such course'); process.exit(1); }
fs.copyFileSync(FILE, path.join(ROOT, 'backups', `curricula.pre-apply-${Date.now()}.json`));
const r = applyBackfill(course, JSON.parse(fs.readFileSync(path.resolve(logFile), 'utf8')));
fs.writeFileSync(FILE, JSON.stringify(courses, null, 2));
console.log(courseId + ':', JSON.stringify(r));
