/**
 * Deterministic upgrade of pre-quality-gate pregen records — NO model calls, works offline.
 *
 *   npm run upgrade:pregen -- --dry-run     → show what would change per record
 *   npm run upgrade:pregen                  → back up, then write the upgraded records
 *   npm run upgrade:pregen -- --curricula-file <path>
 *
 * What it does (src/quality/upgrade.ts): drops legacy generated fields, puts each quiz in seeded order,
 * quarantines quizzes/pictures that fail the lints, moves label-prefixed "suggested questions" to tutor-only
 * diagnostics, marks never-reviewed photos unverified. It does NOT make the material 10/10 — it makes it safe
 * to serve. The real fix is a regeneration with the gated generators: `npm run pregen:ch1` (needs GEMINI_API_KEY).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initFirebaseAdmin } from '../src/firebase/admin';
import { getPregenAsync, savePregenAsync } from '../src/curriculum/pregenStore';
import { conceptContext } from '../src/visual/prompt';
import { upgradeRecord } from '../src/quality/upgrade';

dotenv.config({ path: '.env' });
initFirebaseAdmin();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const argVal = (f: string) => { const i = process.argv.indexOf(f); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null; };
const DRY = process.argv.includes('--dry-run');
const SRC = argVal('--curricula-file') ? path.resolve(argVal('--curricula-file')!) : path.join(ROOT, 'data', 'curricula.json');

async function main() {
  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const curricula: any[] = Array.isArray(raw) ? raw : Object.values(raw);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(ROOT, 'backups', `upgrade-${stamp}`);
  let n = 0, changed = 0;
  const rows: string[] = [];
  for (const course of curricula) for (const concept of course.concepts || []) {
    const slug = /^[a-z0-9-]+$/.test(String(concept.id || '')) ? String(concept.id) : String(concept.label).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const rec = await getPregenAsync([slug]);
    if (!rec) continue;
    n++;
    const ctx = conceptContext(concept, course, course.grade);
    const { record, report } = upgradeRecord(rec, ctx);
    const did = [
      report.droppedLegacy.length && `legacy:${report.droppedLegacy.join('+')}`,
      report.quizShuffled && 'quiz shuffled', report.quizQuarantined && 'QUIZ QUARANTINED',
      report.movedToDiagnostics && `${report.movedToDiagnostics} question(s)→diagnostics`,
      report.picturesQuarantined.length && `pictures quarantined: ${report.picturesQuarantined.join(',')}`,
      report.photoMarkedUnverified && 'photo unverified',
    ].filter(Boolean).join(' · ') || 'no change';
    rows.push(`${slug.slice(0, 44).padEnd(44)} errors ${String(report.remainingErrors).padStart(2)}  warnings ${String(report.remainingWarnings).padStart(2)}  ${did}`);
    if (did !== 'no change') changed++;
    if (!DRY) {
      fs.mkdirSync(backupDir, { recursive: true });
      fs.writeFileSync(path.join(backupDir, `${slug}.json`), JSON.stringify(rec, null, 2));
      await savePregenAsync(slug, record);
    }
  }
  console.log(rows.join('\n'));
  console.log(`\n${DRY ? '(dry run) would upgrade' : 'Upgraded'} ${changed}/${n} record(s).${DRY ? '' : ` Originals: ${path.relative(ROOT, backupDir)}/`}`);
  console.log('Records with errors > 0 need a real regeneration: npm run pregen:ch1');
}
main().catch((e) => { console.error(e); process.exit(1); });
