/**
 * One-time migration: copy everything generated locally (courses, pre-generated
 * lessons/diagrams/photos, learner profiles + history) up into Firestore + Cloud
 * Storage, once you have real Firebase credentials configured.
 *
 * Why this exists: the app already prefers Firestore/Storage over local files
 * whenever credentials are present, but that only applies to NEW saves going
 * forward. Anything already sitting in data/*.json from testing locally is
 * never picked up automatically — this script is the one-time bridge.
 *
 * Usage:
 *   npx tsx scripts/migrate-local-to-cloud.ts               → migrate everything
 *   npx tsx scripts/migrate-local-to-cloud.ts --dry-run      → show what would move, change nothing
 *   npx tsx scripts/migrate-local-to-cloud.ts --only curricula,pregen,learners
 *   npx tsx scripts/migrate-local-to-cloud.ts --force        → overwrite docs that already exist in Firestore
 *
 * Safe by default: anything that already exists in Firestore is SKIPPED, not
 * overwritten, unless --force is passed. Local files are only ever read, never
 * deleted or changed by this script.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initFirebaseAdmin, admin } from '../src/firebase/admin';
import { FirestoreLearnerRepository } from '../src/adaptive/repo/firestore';
import { LearnerProfile, LearningEvidence } from '../src/adaptive/learnerModel';
import { pregenExists, savePregenAsync, PregenRecord } from '../src/curriculum/pregenStore';
import type { CurriculumSubject } from '../src/adaptive/learnerModel';

dotenv.config({ path: '.env' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const ONLY_ARG = process.argv.indexOf('--only');
const ONLY = ONLY_ARG >= 0 && process.argv[ONLY_ARG + 1]
  ? new Set(process.argv[ONLY_ARG + 1].split(',').map((s) => s.trim()))
  : null;
const should = (name: string) => !ONLY || ONLY.has(name);

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return fallback; }
}

async function main() {
  console.log(DRY_RUN ? '🔎 DRY RUN — nothing will be written\n' : '🚚 Migrating local data to Firestore + Cloud Storage\n');

  initFirebaseAdmin();
  const app = admin.apps?.[0];
  if (!app) {
    console.error(
      '❌ No Firebase Admin credentials found (FIREBASE_SERVICE_ACCOUNT_PATH / GOOGLE_APPLICATION_CREDENTIALS\n' +
      '   / GCLOUD_PROJECT are all unset). Set these in .env first — this script has nothing to migrate TO\n' +
      '   without them. See .env.example.'
    );
    process.exit(1);
  }
  const db = admin.firestore(app);
  console.log(`✓ Connected to Firebase project: ${app.options.projectId}\n`);

  let totals = { migrated: 0, skipped: 0, failed: 0 };

  // ─── 1. Curricula (courses) ────────────────────────────────────────────
  if (should('curricula')) {
    console.log('── Courses (data/curricula.json) ──');
    const raw = readJson<any>(path.join(DATA_DIR, 'curricula.json'), []);
    const courses: CurriculumSubject[] = Array.isArray(raw) ? raw : Object.values(raw);
    if (courses.length === 0) {
      console.log('  (nothing to migrate — file is empty or missing)\n');
    } else {
      for (const course of courses) {
        try {
          const ref = db.collection('curricula').doc(course.id);
          const exists = (await ref.get()).exists;
          if (exists && !FORCE) {
            console.log(`  ⏭  "${course.label || course.id}" — already in Firestore, skipping (use --force to overwrite)`);
            totals.skipped++;
            continue;
          }
          const bytes = Buffer.byteLength(JSON.stringify(course), 'utf8');
          if (bytes > 900 * 1024) {
            console.warn(`  ⚠ "${course.label || course.id}" is ${(bytes / 1024).toFixed(0)} KB — close to Firestore's 1 MiB document limit`);
          }
          if (!DRY_RUN) await ref.set(JSON.parse(JSON.stringify(course)));
          console.log(`  ✓ "${course.label || course.id}" (${course.concepts?.length ?? 0} concepts)${DRY_RUN ? ' [dry run]' : ''}`);
          totals.migrated++;
        } catch (err: any) {
          console.error(`  ❌ "${course.id}": ${err.message}`);
          totals.failed++;
        }
      }
      console.log('');
    }
  }

  // ─── 2. Pre-generated lesson/diagram/photo assets ─────────────────────
  if (should('pregen')) {
    console.log('── Pre-generated assets (data/pregenerated/*.json) ──');
    const pregenDir = path.join(DATA_DIR, 'pregenerated');
    const files = fs.existsSync(pregenDir) ? fs.readdirSync(pregenDir).filter((f) => f.endsWith('.json')) : [];
    if (files.length === 0) {
      console.log('  (nothing to migrate — no local pregen files)\n');
    } else {
      for (const file of files) {
        const key = file.replace(/\.json$/, '');
        try {
          if (!FORCE && await pregenExists([key])) {
            console.log(`  ⏭  "${key}" — already cached in Firestore, skipping (use --force to overwrite)`);
            totals.skipped++;
            continue;
          }
          const record: PregenRecord = readJson(path.join(pregenDir, file), null as any);
          if (!record) { totals.failed++; continue; }
          const hasPhoto = !!record.photoUrl;
          if (!DRY_RUN) {
            const saved = await savePregenAsync(key, record);
            console.log(`  ✓ "${key}"${hasPhoto ? (saved.photoUrl?.startsWith('http') ? ' (photo uploaded to Cloud Storage)' : ' (photo could not upload — kept as-is)') : ''}`);
          } else {
            console.log(`  ✓ "${key}"${hasPhoto ? ' (has photo — would upload to Cloud Storage)' : ''} [dry run]`);
          }
          totals.migrated++;
        } catch (err: any) {
          console.error(`  ❌ "${key}": ${err.message}`);
          totals.failed++;
        }
      }
      console.log('');
    }
  }

  // ─── 3. Learner profiles + events + plans + sessions ──────────────────
  if (should('learners')) {
    console.log('── Learner data (data/learner-profiles.json + events/plans/sessions) ──');
    const profiles = readJson<Record<string, LearnerProfile>>(path.join(DATA_DIR, 'learner-profiles.json'), {});
    const studentIds = Array.isArray(profiles) ? [] : Object.keys(profiles);
    if (studentIds.length === 0) {
      console.log('  (nothing to migrate — no local learner profiles)\n');
    } else {
      const repo = new FirestoreLearnerRepository();
      for (const studentId of studentIds) {
        const profile = profiles[studentId];
        try {
          const existing = FORCE ? null : await repo.getProfile(studentId);
          if (existing && !FORCE) {
            console.log(`  ⏭  "${profile.name || studentId}" — already in Firestore, skipping (use --force to overwrite)`);
            totals.skipped++;
            continue;
          }
          if (!DRY_RUN) {
            await repo.saveProfile(profile);
            const events = readJson<(LearningEvidence & { eventId: string })[]>(path.join(DATA_DIR, 'events', `${studentId}.json`), []);
            for (const event of events) await repo.appendEvent(studentId, event);
            const plans = readJson<Record<string, unknown>>(path.join(DATA_DIR, 'plans', `${studentId}.json`), {});
            for (const [planVersion, plan] of Object.entries(plans)) await repo.savePlan(studentId, planVersion, plan);
            const sessions = readJson<Record<string, unknown>>(path.join(DATA_DIR, 'sessions', `${studentId}.json`), {});
            for (const [sessionId, summary] of Object.entries(sessions)) await repo.saveSessionSummary(studentId, sessionId, summary);
            console.log(`  ✓ "${profile.name || studentId}" (${events.length} events, ${Object.keys(plans).length} plan versions, ${Object.keys(sessions).length} sessions)`);
          } else {
            console.log(`  ✓ "${profile.name || studentId}" [dry run]`);
          }
          totals.migrated++;
        } catch (err: any) {
          console.error(`  ❌ "${studentId}": ${err.message}`);
          totals.failed++;
        }
      }
      console.log('');
    }
  }

  console.log('─'.repeat(50));
  console.log(`${DRY_RUN ? 'Would migrate' : 'Migrated'}: ${totals.migrated}   Skipped (already there): ${totals.skipped}   Failed: ${totals.failed}`);
  if (DRY_RUN) console.log('Run again without --dry-run to actually write.');
  if (totals.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
