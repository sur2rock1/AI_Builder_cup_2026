// ─────────────────────────────────────────────────────────────────
// Curriculum store — Firestore-backed, create once / use anywhere.
//
// Architecture:
//   Primary store : Firestore collection "curricula"
//                   → persists across Cloud Run restarts, redeployments,
//                     any region, any device — one upload is enough.
//   Local fallback : data/curricula.json
//                   → used automatically in local dev when Firestore
//                     is not configured (no FIREBASE_SERVICE_ACCOUNT_PATH
//                     / GOOGLE_APPLICATION_CREDENTIALS / GCLOUD_PROJECT).
//   In-memory cache: loaded once at first read, kept hot for the session.
//
// Public API (unchanged):
//   getCurriculum(subjectId)  → CurriculumSubject | null
//   listCurricula()           → CurriculumSubject[]
//   saveCurriculum(subject)   → void  (async internally, returns immediately)
//   nextUnmasteredConcept(...)→ CurriculumConcept | undefined
// ─────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import { CurriculumSubject, CurriculumConcept } from '../adaptive/learnerModel';

// Firestore collection name
const FS_COLLECTION = 'curricula';

// Local file fallback (dev / offline)
const LOCAL_FILE = path.join(process.cwd(), 'data', 'curricula.json');

// ─── In-memory cache ────────────────────────────────────────────
let cache: Record<string, CurriculumSubject> | null = null;
let cacheSource: 'firestore' | 'local' | 'empty' = 'empty';

// ─── Firestore helper ───────────────────────────────────────────
function getFirestore() {
  try {
    // admin is already initialised by the time any route runs (see server.ts)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { admin } = require('../firebase/admin') as typeof import('../firebase/admin');
    const app = admin.apps?.[0];
    if (!app) return null;
    return admin.firestore(app);
  } catch {
    return null;
  }
}

// ─── Load all curricula (once per process) ──────────────────────
async function loadAll(): Promise<Record<string, CurriculumSubject>> {
  const db = getFirestore();
  if (db) {
    try {
      const snap = await db.collection(FS_COLLECTION).get();
      const result: Record<string, CurriculumSubject> = {};
      snap.forEach((doc: any) => { result[doc.id] = doc.data() as CurriculumSubject; });
      cacheSource = 'firestore';
      console.log(`[Curriculum] Loaded ${Object.keys(result).length} curricula from Firestore`);
      return result;
    } catch (err: any) {
      console.warn('[Curriculum] Firestore read failed, falling back to local file:', err?.message);
    }
  }
  return loadLocalFile();
}

function loadLocalFile(): Record<string, CurriculumSubject> {
  if (!fs.existsSync(LOCAL_FILE)) { cacheSource = 'empty'; return {}; }
  try {
    const raw = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf-8'));
    // Support both array format (old) and object format (new)
    const result: Record<string, CurriculumSubject> = Array.isArray(raw)
      ? Object.fromEntries(raw.map((c: CurriculumSubject) => [c.id, c]))
      : raw;
    cacheSource = 'local';
    console.log(`[Curriculum] Loaded ${Object.keys(result).length} curricula from local file`);
    return result;
  } catch {
    cacheSource = 'empty';
    return {};
  }
}

// Lazy-load: blocks the first caller, returns immediately for all subsequent.
let loadPromise: Promise<Record<string, CurriculumSubject>> | null = null;
function ensureLoaded(): Promise<Record<string, CurriculumSubject>> {
  if (cache !== null) return Promise.resolve(cache);
  if (!loadPromise) {
    loadPromise = loadAll().then(data => {
      cache = data;
      loadPromise = null;
      return data;
    });
  }
  return loadPromise;
}

// ─── Write to Firestore (and update local fallback) ─────────────
async function persist(subject: CurriculumSubject): Promise<void> {
  const db = getFirestore();
  if (db) {
    try {
      await db.collection(FS_COLLECTION).doc(subject.id).set(subject);
      console.log(`[Curriculum] Saved "${subject.label}" to Firestore`);
      return;
    } catch (err: any) {
      console.warn('[Curriculum] Firestore write failed, saving to local file:', err?.message);
    }
  }
  // Fallback: local file
  const dir = path.dirname(LOCAL_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const all = cache || {};
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(Object.values(all), null, 2), 'utf-8');
  console.log(`[Curriculum] Saved "${subject.label}" to local file`);
}

// ─── Public API ─────────────────────────────────────────────────

export function getCurriculum(subjectId: string): CurriculumSubject | null {
  // Synchronous access from cache (warm after first call)
  if (cache) return cache[subjectId] ?? null;
  // Not yet loaded — trigger load and return null for this call.
  // Server routes that need the data should await listCurricula() first.
  ensureLoaded();
  return null;
}

export async function getCurriculumAsync(subjectId: string): Promise<CurriculumSubject | null> {
  const all = await ensureLoaded();
  return all[subjectId] ?? null;
}

export function listCurricula(): CurriculumSubject[] {
  // Synchronous — returns whatever is cached (may be empty on first call)
  return Object.values(cache || {});
}

export async function listCurriculaAsync(): Promise<CurriculumSubject[]> {
  const all = await ensureLoaded();
  return Object.values(all);
}

export function saveCurriculum(subject: CurriculumSubject): void {
  // Update cache immediately so the rest of the request sees it
  if (!cache) cache = {};
  cache[subject.id] = subject;
  // Persist in background — fire and forget, errors are logged
  persist(subject).catch(err => console.error('[Curriculum] Persist error:', err));
}

/**
 * Call this once at server startup so the cache is warm before the first request.
 * Safe to call multiple times — only loads once.
 */
export async function preloadCurricula(): Promise<void> {
  await ensureLoaded();
}

/** Next concept whose prerequisites are all mastered — for ANY curriculum. */
export function nextUnmasteredConcept(
  curriculum: CurriculumSubject,
  masteredIds: string[],
): CurriculumConcept | undefined {
  const known = new Set(curriculum.concepts.map(x => x.id));
  return [...curriculum.concepts]
    .sort((a, b) => a.typicalTeachingOrder - b.typicalTeachingOrder)
    .find(x =>
      !masteredIds.includes(x.id) &&
      (x.prerequisites || []).filter(p => known.has(p)).every(p => masteredIds.includes(p)),
    );
}
