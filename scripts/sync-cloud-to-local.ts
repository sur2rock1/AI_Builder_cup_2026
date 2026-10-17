/**
 * Makes Firestore + Cloud Storage an EXACT mirror of local data/ (local wins).
 *
 *   npm run sync:cloud                 -> DRY RUN: prints every difference, changes nothing
 *   npm run sync:cloud -- --apply      -> backs the cloud up to ~/cloud-backup-<time>/ first, then mirrors
 *
 * Covers: curricula, pregen (+ photos), learners (profile, events, plans, sessions).
 * Cloud-only items are DELETED on --apply (that is what "exact mirror" means); the backup lets you undo.
 * guidedScripts (lessons created by PDF upload on the cloud app) are REPORTED but never deleted
 * unless you pass --include-guided.
 * A set whose local side is empty is skipped with a warning (never wipes the cloud by accident).
 *
 *   export GOOGLE_CLOUD_PROJECT=<id> FIREBASE_STORAGE_BUCKET=<bucket>
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import dotenv from 'dotenv';
import { initFirebaseAdmin, admin } from '../src/firebase/admin';
import { savePregenAsync, fromFirestore } from '../src/curriculum/pregenStore';

dotenv.config();
const APPLY = process.argv.includes('--apply');
const INCLUDE_GUIDED = process.argv.includes('--include-guided');
const DATA = path.resolve('data');
const SUBS = ['events', 'plans', 'sessions'] as const;

const J = <T = any>(p: string, fb: T): T => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };
const clean = (x: any) => JSON.parse(JSON.stringify(x ?? null));
const stable = (x: any): string => JSON.stringify(x, (_k, v) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v);
const same = (a: any, b: any) => stable(clean(a)) === stable(clean(b));

let diffs = 0;
const note = (s: string) => { diffs++; console.log('  ≠ ' + s); };

async function main() {
  if (!initFirebaseAdmin()) { console.error('No Firebase credentials. Set GOOGLE_CLOUD_PROJECT and run: gcloud auth application-default login'); process.exit(1); }
  const db = admin.firestore();
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — project ${admin.app().options.projectId}\n`);

  // ---------- read local ----------
  const rawC = J<any>(path.join(DATA, 'curricula.json'), []);
  const localCourses: any[] = Array.isArray(rawC) ? rawC : Object.values(rawC);
  const pregenFiles = fs.existsSync(path.join(DATA, 'pregenerated')) ? fs.readdirSync(path.join(DATA, 'pregenerated')).filter((f) => f.endsWith('.json')) : [];
  const profiles = J<Record<string, any>>(path.join(DATA, 'learner-profiles.json'), {});
  const localSub = (sub: typeof SUBS[number], id: string): Record<string, any> => {
    const raw = J<any>(path.join(DATA, sub, `${id}.json`), sub === 'events' ? [] : {});
    return sub === 'events' ? Object.fromEntries((raw as any[]).map((e) => [e.eventId, e])) : raw;
  };

  // ---------- 1. cloud backup (apply only) ----------
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(os.homedir(), `cloud-backup-${stamp}`);
  if (APPLY) {
    fs.mkdirSync(backupDir, { recursive: true });
    for (const col of ['curricula', 'pregen', 'guidedScripts']) {
      const s = await db.collection(col).get();
      fs.writeFileSync(path.join(backupDir, `${col}.json`), JSON.stringify(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))));
    }
    const ls = await db.collection('learners').get();
    const all: any = {};
    for (const d of ls.docs) {
      all[d.id] = { profile: d.data() };
      for (const sub of SUBS) all[d.id][sub] = Object.fromEntries((await d.ref.collection(sub).get()).docs.map((x) => [x.id, x.data()]));
    }
    fs.writeFileSync(path.join(backupDir, 'learners.json'), JSON.stringify(all));
    console.log(`Backup of the current cloud data saved in ${backupDir}\n`);
  }

  // ---------- 2. curricula ----------
  console.log('── Courses ──');
  if (localCourses.length === 0) console.log('  local has none: skipped');
  else {
    const cloud = await db.collection('curricula').get();
    const localIds = new Set(localCourses.map((c) => c.id));
    for (const c of localCourses) {
      const d = cloud.docs.find((x) => x.id === c.id);
      if (!d) { note(`course ${c.id}: missing in cloud`); }
      else if (!same(d.data(), c)) { note(`course ${c.id}: content differs`); }
      if (APPLY && (!d || !same(d.data(), c))) await db.collection('curricula').doc(c.id).set(clean(c));
    }
    for (const d of cloud.docs) if (!localIds.has(d.id)) { note(`course ${d.id}: only in cloud -> ${APPLY ? 'deleted' : 'would delete'}`); if (APPLY) await d.ref.delete(); }
  }

  // ---------- 3. pregen ----------
  console.log('\n── Lessons / pictures / photos (pregen) ──');
  if (pregenFiles.length === 0) console.log('  local has none: skipped');
  else {
    const cloud = await db.collection('pregen').get();
    const localKeys = new Set(pregenFiles.map((f) => f.slice(0, -5)));
    for (const f of pregenFiles) {
      const key = f.slice(0, -5);
      const rec = J<any>(path.join(DATA, 'pregenerated', f), null);
      if (!rec) continue;
      const d = cloud.docs.find((x) => x.id === key);
      let differs = !d;
      if (d) {
        const c: any = fromFirestore(d.data() as any);
        const strip = (r: any) => {   // photo URL differs by design (data URI vs bucket URL); {} and absent are the same to Firestore
          const o: any = { ...r, photoUrl: r.photoUrl ? 'photo' : null };
          for (const k of ['visuals', 'visualsQuarantine']) if (o[k] && Object.keys(o[k]).length === 0) delete o[k];
          return o;
        };
        differs = !same(strip(c), strip(rec)) || (!!rec.photoUrl !== !!c.photoUrl);
      }
      if (differs) note(`pregen …${key.slice(-50)}: ${d ? 'content differs' : 'missing in cloud'}`);
      if (APPLY && differs) await savePregenAsync(key, rec);
    }
    for (const d of cloud.docs) if (!localKeys.has(d.id)) {
      note(`pregen …${d.id.slice(-50)}: only in cloud -> ${APPLY ? 'deleted' : 'would delete'}`);
      if (APPLY) {
        await d.ref.delete();
        try { await admin.storage().bucket().deleteFiles({ prefix: `pregen-images/${d.id}.` }); } catch { /* photo may not exist */ }
      }
    }
  }

  // ---------- 4. learners ----------
  console.log('\n── Students ──');
  const ids = Object.keys(profiles);
  if (ids.length === 0) console.log('  local has none: skipped');
  else {
    const cloud = await db.collection('learners').get();
    for (const id of ids) {
      const ref = db.collection('learners').doc(id);
      const d = cloud.docs.find((x) => x.id === id);
      if (!d) note(`student ${id}: missing in cloud`);
      else if (!same(d.data(), profiles[id])) note(`student ${id}: profile differs`);
      if (APPLY && (!d || !same(d.data(), profiles[id]))) await ref.set(clean(profiles[id]));   // full replace, not merge
      for (const sub of SUBS) {
        const want = localSub(sub, id);
        const have = d ? Object.fromEntries((await ref.collection(sub).get()).docs.map((x) => [x.id, x.data()])) : {};
        for (const k of Object.keys(want)) if (!(k in have) || !same(have[k], want[k])) {
          note(`student ${id} ${sub}/${k.slice(0, 30)}: ${k in have ? 'differs' : 'missing in cloud'}`);
          if (APPLY) await ref.collection(sub).doc(k).set(clean(want[k]));
        }
        for (const k of Object.keys(have)) if (!(k in want)) {
          note(`student ${id} ${sub}/${k.slice(0, 30)}: only in cloud -> ${APPLY ? 'deleted' : 'would delete'}`);
          if (APPLY) await ref.collection(sub).doc(k).delete();
        }
      }
    }
    for (const d of cloud.docs) if (!ids.includes(d.id)) {
      note(`student ${d.id} (${(d.data() as any).name || '?'}): only in cloud -> ${APPLY ? 'deleted' : 'would delete'}`);
      if (APPLY) {
        for (const sub of SUBS) for (const x of (await d.ref.collection(sub).get()).docs) await x.ref.delete();
        await d.ref.delete();
      }
    }
  }

  // ---------- 5. guided runtime lessons (report only) ----------
  console.log('\n── Guided lessons made on the cloud app (guidedScripts) ──');
  const g = await db.collection('guidedScripts').get();
  const localG = fs.existsSync(path.join(DATA, 'guided', 'runtime')) ? fs.readdirSync(path.join(DATA, 'guided', 'runtime')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)) : [];
  const extraG = g.docs.filter((d) => !localG.includes(d.id));
  console.log(`  cloud ${g.size}, local ${localG.length}${extraG.length ? `; ${extraG.length} only in cloud` : ''}`);
  if (extraG.length && !INCLUDE_GUIDED) console.log('  (left alone: pass --include-guided to delete cloud-only ones)');
  if (extraG.length && INCLUDE_GUIDED) for (const d of extraG) { note(`guided ${d.id}: only in cloud -> ${APPLY ? 'deleted' : 'would delete'}`); if (APPLY) await d.ref.delete(); }

  console.log('\n' + '─'.repeat(50));
  if (diffs === 0) console.log('IN SYNC: the cloud matches your local data exactly.');
  else console.log(APPLY ? `Fixed ${diffs} difference(s). Run again WITHOUT --apply: it must say IN SYNC.` : `${diffs} difference(s) found. Nothing was changed. Re-run with --apply to make the cloud match local.`);
}
main().catch((e) => { console.error('Sync failed:', e); process.exit(1); });
