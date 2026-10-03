/**
 * Scorecard for every pregenerated record — the same lints the generators gate on, run over what is STORED.
 * No model calls. Exit code 1 when any served artefact has an error (use it as a release gate).
 *
 *   npm run review:pregen                    table + top issue codes
 *   npm run review:pregen -- --details       every issue, per record
 *   npm run review:pregen -- --write         also write reports/pregen-scorecard.md
 *   npm run review:pregen -- --chapter "^Chapter 1:"   only matching chapters
 *
 * A record that has never been through the critic shows "critic: no" — its lint score alone is NOT a quality claim.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initFirebaseAdmin } from '../src/firebase/admin';
import { getPregenAsync } from '../src/curriculum/pregenStore';
import { conceptContext } from '../src/visual/prompt';
import { lintRecord } from '../src/quality/recordLint';

dotenv.config({ path: '.env' });
initFirebaseAdmin();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const argVal = (f: string) => { const i = process.argv.indexOf(f); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null; };
const DETAILS = process.argv.includes('--details');
const WRITE = process.argv.includes('--write');
const CHAPTER = argVal('--chapter');
const SRC = argVal('--curricula-file') ? path.resolve(argVal('--curricula-file')!) : path.join(ROOT, 'data', 'curricula.json');

async function main() {
  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const curricula: any[] = Array.isArray(raw) ? raw : Object.values(raw);
  const lines: string[] = [];
  const codeTally = new Map<string, number>();
  let records = 0, withErrors = 0, missing = 0, served = 0, quarantined = 0, photos = 0, criticRecords = 0;
  const md: string[] = ['| Concept | Errors | Warnings | Pictures served | Quarantined | Quiz | Photo | Critic |', '|---|---|---|---|---|---|---|---|'];

  for (const course of curricula) for (const concept of course.concepts || []) {
    if (CHAPTER && !new RegExp(CHAPTER, 'i').test(String(concept.chapter || ''))) continue;
    const slug = /^[a-z0-9-]+$/.test(String(concept.id || '')) ? String(concept.id) : String(concept.label).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const rec = await getPregenAsync([slug]);
    if (!rec) { missing++; lines.push(`${concept.label.slice(0, 46).padEnd(46)} — no record`); continue; }
    records++;
    const issues = lintRecord(rec, conceptContext(concept, course, course.grade));
    const errs = issues.filter((i) => i.severity === 'error'), warns = issues.filter((i) => i.severity === 'warn');
    if (errs.length) withErrors++;
    issues.forEach((i) => codeTally.set(i.code, (codeTally.get(i.code) || 0) + 1));
    const nServed = Object.keys(rec.visuals || {}).length, nQuar = Object.keys(rec.visualsQuarantine || {}).length;
    served += nServed; quarantined += nQuar;
    const photo = rec.photoMeta?.verified && rec.photoUrl ? 'verified' : rec.photoUrl ? 'unverified (hidden)' : 'none';
    if (photo === 'verified') photos++;
    const critic = rec.quality?.criticRan ? 'yes' : 'no';
    if (rec.quality?.criticRan) criticRecords++;
    const quiz = rec.lessonData?.quiz ? 'yes' : rec.lessonQuarantine ? 'quarantined' : 'none';
    lines.push(`${concept.label.slice(0, 46).padEnd(46)} err ${String(errs.length).padStart(2)}  warn ${String(warns.length).padStart(2)}  pictures ${nServed} (+${nQuar} held)  quiz ${quiz.padEnd(11)}  photo ${photo.padEnd(19)}  critic: ${critic}`);
    md.push(`| ${concept.label} | ${errs.length} | ${warns.length} | ${nServed} | ${nQuar} | ${quiz} | ${photo} | ${critic} |`);
    if (DETAILS) for (const i of issues) lines.push(`    ${i.severity === 'error' ? 'ERROR' : 'warn '} ${i.artifact.padEnd(22)} ${i.code}: ${i.message.slice(0, 150)}`);
    if (rec.quality?.coverageGaps?.length) lines.push(`    coverage gap: key fact(s) ${rec.quality.coverageGaps.join(', ')} taught by no shipped picture`);
    for (const u of rec.quality?.untaughtLadderItems || []) lines.push(`    ladder item tests something never taught: L${u.level} "${u.prompt.slice(0, 80)}"`);
  }
  const top = [...codeTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c, n]) => `${c} ×${n}`).join('   ');
  const summary = `${records} record(s), ${withErrors} with errors, ${missing} without a record · pictures served ${served}, held back ${quarantined} · verified photos ${photos} · critic-reviewed ${criticRecords}/${records}`;
  console.log(lines.join('\n') + `\n\n${summary}\nMost frequent: ${top || '—'}`);
  if (WRITE) {
    fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'reports', 'pregen-scorecard.md'), `# Pregen scorecard\n\nGenerated ${new Date().toISOString()} by \`npm run review:pregen\`.\n\n${summary}\n\n${md.join('\n')}\n\nMost frequent issue codes: ${top || '—'}\n`);
    console.log('Wrote reports/pregen-scorecard.md');
  }
  process.exitCode = withErrors ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exit(1); });
