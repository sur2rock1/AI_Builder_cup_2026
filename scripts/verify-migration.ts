/**
 * Compares local data/ with what is actually in Firestore + Cloud Storage after
 * `npm run migrate:cloud`. Read-only. Exit code 1 if anything differs.
 *   export GOOGLE_CLOUD_PROJECT=<id> FIREBASE_STORAGE_BUCKET=<bucket>
 *   npm run verify:migration
 */
import fs from 'fs';
import dotenv from 'dotenv';
import { initFirebaseAdmin, admin } from '../src/firebase/admin';

dotenv.config();
const J = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
let bad = 0;
const chk = (ok: boolean, msg: string) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) bad++; };

async function main() {
  if (!initFirebaseAdmin()) { console.error('No Firebase Admin credentials (set GOOGLE_CLOUD_PROJECT + run gcloud auth application-default login).'); process.exit(1); }
  const db = admin.firestore();
  console.log(`Project: ${admin.app().options.projectId}\n`);

  const raw = J('data/curricula.json');
  for (const c of (Array.isArray(raw) ? raw : Object.values(raw)) as any[]) {
    const d = await db.collection('curricula').doc(c.id).get();
    chk(d.exists && ((d.data() as any).concepts?.length === c.concepts.length), `course ${c.id} (${c.concepts.length} concepts)`);
  }

  for (const f of fs.readdirSync('data/pregenerated').filter((x) => x.endsWith('.json'))) {
    const key = f.slice(0, -5);
    const local = J(`data/pregenerated/${f}`);
    const d = await db.collection('pregen').doc(key).get();
    const r: any = d.data();
    let ok = d.exists;
    let note = '';
    if (ok && local.photoUrl) {
      ok = typeof r.photoUrl === 'string' && r.photoUrl.startsWith('https://');
      if (ok) { const res = await fetch(r.photoUrl); ok = res.ok; note = ` photo ${res.status}`; } else note = ' photo MISSING';
    }
    if (ok) ok = Object.keys(JSON.parse(r.visualsJson || '{}')).length === Object.keys(local.visuals || {}).length;
    chk(ok, `pregen …${key.slice(-48)}${note}`);
  }

  const profiles = J('data/learner-profiles.json');
  for (const id of Object.keys(profiles)) {
    const ref = db.collection('learners').doc(id);
    chk((await ref.get()).exists, `learner ${id}`);
    const n = (sub: string, file: string, count: (x: any) => number) => {
      const p = `data/${file}/${id}.json`;
      return fs.existsSync(p) ? count(J(p)) : 0;
    };
    const want = { events: n('events', 'events', (x) => x.length), plans: n('plans', 'plans', (x) => Object.keys(x).length), sessions: n('sessions', 'sessions', (x) => Object.keys(x).length) };
    for (const sub of ['events', 'plans', 'sessions'] as const) {
      const got = (await ref.collection(sub).count().get()).data().count;
      chk(got === want[sub], `  ${sub}: local ${want[sub]} / cloud ${got}`);
    }
  }

  console.log(bad ? `\n${bad} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
