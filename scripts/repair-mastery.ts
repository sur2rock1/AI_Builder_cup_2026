// Repair: mastery stuck at 0% after a confirmed mix-up (D-2026-10-18-1).
// Replays each affected concept's STORED answers through the current rules and rewrites only the derived fields
// (mix-up ledger statuses, mastery %, level, status). Answers, transcripts, summaries, lessons, minutes, ladder and
// strategies are never changed. Demo / simulated learners are skipped. Dry run unless --apply; --apply writes a backup
// of every profile it changes to ~/ananta-mastery-backup-<time>.json first.
//   npx tsx scripts/repair-mastery.ts            # dry run: prints before -> after
//   npx tsx scripts/repair-mastery.ts --apply
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (process.env.GOOGLE_CLOUD_PROJECT && !process.env.USE_FIRESTORE_LEARNERS) process.env.USE_FIRESTORE_LEARNERS = 'true';
const APPLY = process.argv.includes('--apply');
const { initFirebaseAdmin } = await import('../src/firebase/admin.ts');
if (process.env.USE_FIRESTORE_LEARNERS === 'true') initFirebaseAdmin();
const { getRepo } = await import('../src/adaptive/repo/index.ts');
const { getCurriculumAsync } = await import('../src/curriculum/ingest.ts');
const { replayConceptMastery } = await import('../src/adaptive/replayMastery.ts');

const repo = getRepo();
console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} - learner store: ${process.env.USE_FIRESTORE_LEARNERS === 'true' ? `Firestore (${process.env.GOOGLE_CLOUD_PROJECT})` : 'local files'}`);
const backup: Record<string, unknown> = {};
const toSave: any[] = [];
for (const p of await repo.listProfiles()) {
  if (p.studentId.startsWith('demo_') || /simulated/i.test(p.name || '')) continue;
  let changed = false;
  const events = (await repo.listEvents(p.studentId)) as any[];
  for (const [sid, sub] of Object.entries(p.subjects || {})) {
    const cur = await getCurriculumAsync(sid).catch(() => null);
    for (const cs of Object.values(sub.conceptStates || {}) as any[]) {
      if (!cs.attemptCount) continue;
      const stuck = (cs.misconceptionLedger || []).some((m: any) => m.status === 'confirmed') || cs.masteryLevel === 'not_started';
      if (!stuck) continue;
      const ev = events.filter((e) => e.conceptId === cs.conceptId && (!e.subjectId || e.subjectId === sid));
      if (!ev.length) continue;
      const diff = cur?.concepts.find((c: any) => c.id === cs.conceptId)?.difficultyLevel || 2;
      const r = replayConceptMastery(cs, ev, diff);
      if (!r.changed) continue;
      console.log(`${p.name} (${p.studentId}) / ${cs.label}: ${ev.length} answers | mastery ${r.before.masteryScore}% -> ${r.after.masteryScore}% | status ${r.before.status} -> ${r.after.status} | mix-ups ${r.before.ledger.join(',') || '-'} -> ${r.after.ledger.join(',') || '-'}`);
      if (!backup[p.studentId]) backup[p.studentId] = JSON.parse(JSON.stringify(p));
      Object.assign(cs, r.patch);
      changed = true;
    }
  }
  if (changed) toSave.push(p);
}
if (!toSave.length) { console.log('Nothing to repair.'); process.exit(0); }
if (!APPLY) { console.log(`\n${toSave.length} profile(s) would change. Re-run with --apply.`); process.exit(0); }
const file = path.join(os.homedir(), `ananta-mastery-backup-${Date.now()}.json`);
fs.writeFileSync(file, JSON.stringify(backup));
console.log(`Backup: ${file}`);
for (const p of toSave) { p.updatedAt = Date.now(); await repo.saveProfile(p); console.log(`saved ${p.studentId}`); }
process.exit(0);
