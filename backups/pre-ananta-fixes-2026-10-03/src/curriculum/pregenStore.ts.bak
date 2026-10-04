// ─────────────────────────────────────────────────────────────────
// Pre-generated lesson asset store — Firestore + Cloud Storage backed,
// same "create once / reuse forever" contract as src/curriculum/ingest.ts.
//
// Why this exists: every pre-generated lesson (and every lesson generated
// live on a cache miss, or a diagram variant generated during a live
// session) is a paid Gemini call. Before this module, all of that lived
// only in data/pregenerated/*.json on local disk (see scripts/
// pregenerate-assets.ts and the loadPregen()/cache-save code that used to
// live directly in server.ts). That is fine on a laptop, but Cloud Run's
// filesystem is ephemeral — anything written there vanishes on the next
// deploy or cold start, and the exact same concept gets regenerated (and
// re-billed) over and over. AI Builder Cup requires deployment on Cloud
// Run or Firebase (https://aibuildercup.com/themes.html), so this had to
// move before that deploy, not after.
//
// Architecture (mirrors src/curriculum/ingest.ts):
//   Primary store  : Firestore collection "pregen", one doc per concept/
//                     topic key — survives restarts, redeploys, any region.
//   Image storage  : Firebase/Cloud Storage, NOT Firestore. A generated
//                     photo comes back from Gemini as a base64 data URI;
//                     inlining that into a Firestore document risks the
//                     1 MiB document cap on a single image (base64 is
//                     ~33% bigger than the binary). The decoded bytes are
//                     uploaded to Storage and only the resulting public
//                     URL is stored in the Firestore doc / local file.
//   Local fallback : data/pregenerated/{key}.json — unchanged format,
//                     used automatically when Firestore/Storage are not
//                     configured (local dev, tests). Images stay inline
//                     as base64 in this mode, exactly as before.
//
// Public API:
//   pregenExists(candidates)        → Promise<boolean>   (skip-if-cached check)
//   getPregenAsync(candidates)      → Promise<PregenRecord | null>
//   savePregenAsync(key, record)    → Promise<PregenRecord> (resolved photoUrl)
// ─────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import type { AnyBoardVisual } from '../visual/types';
import type { QualityIssue, RecordQuality } from '../quality/types';

const FS_COLLECTION = 'pregen';

export interface PregenRecord {
  topic: string;
  grade?: string;
  conceptId?: string;
  slug: string;
  generatedAt: string;
  lessonData: any;
  /** Legacy node-and-arrow diagram variants (lessons generated before board pictures). */
  diagrams?: Record<string, any>;
  /**
   * Board pictures (docs/BOARD_VISUALS.md), keyed by role:
   *   main · contrast:<misconceptionId> · apply · 3d · focus:<slug> (drawn live for a tutor's update_diagram)
   * Each one is ~3–8 KB of JSON — far below Firestore's 1 MiB document limit even with all of them.
   */
  visuals?: Record<string, AnyBoardVisual>;
  /** Pictures the generator was asked for and declined, with its reason (e.g. "3d": "the idea is flat"). */
  visualsDeclined?: Record<string, string>;
  /**
   * Pictures that FAILED the quality gates (an error survived repair). Never served to a child;
   * kept so a human can look at them (npm run review:pregen) and the next --force run can re-draw them.
   */
  visualsQuarantine?: Record<string, { visual: AnyBoardVisual; issues: QualityIssue[] }>;
  /** Lesson text that failed the quality gates (an error survived repair). Never served. */
  lessonQuarantine?: { lesson: unknown; issues: QualityIssue[] };
  /** Photo URL or data URI. Only ever served when `photoMeta.verified` is true (docs/BOARD_VISUALS.md §Photos). */
  photoUrl?: string | null;
  /** What the vision reviewer saw: the neutral caption we display and whether the photo passed. */
  photoMeta?: { verified: boolean; caption: string; intent: string; source: 'ai-generated'; reviewedAt: string; issues?: QualityIssue[] };
  /** Outcome of the quality gates for this record (docs/BOARD_VISUALS.md §Quality gates). */
  quality?: RecordQuality;
}

// Local file fallback (dev / offline / tests). PREGEN_DATA_DIR overrides it.
function pregenDir(): string {
  return process.env.PREGEN_DATA_DIR || path.join(process.cwd(), 'data', 'pregenerated');
}

// ─── Firestore + Storage helpers (lazy require — admin is initialised by
// server.ts / scripts before any of these run; safe to import before that
// too, since a failed require or no app just means "not configured yet"). ───
function getFirestoreDb(): any {
  try {
    const { admin } = require('../firebase/admin') as typeof import('../firebase/admin');
    const app = admin.apps?.[0];
    if (!app) return null;
    return admin.firestore(app);
  } catch {
    return null;
  }
}

function getStorageBucket(): any {
  try {
    const { admin } = require('../firebase/admin') as typeof import('../firebase/admin');
    const app = admin.apps?.[0];
    if (!app) return null;
    return admin.storage(app).bucket();
  } catch {
    return null;
  }
}

const DATA_URI_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s;

/** Upload a base64 data-URI image to Cloud Storage and return its public URL.
 * Returns null (never throws) if there's no bucket configured or the upload
 * fails — callers fall back to keeping the base64 inline in that case. */
async function uploadImageToStorage(key: string, dataUri: string): Promise<string | null> {
  const match = DATA_URI_RE.exec(dataUri);
  if (!match) return null; // not a data URI (already a URL, e.g. Unsplash) — nothing to upload
  const bucket = getStorageBucket();
  if (!bucket) return null;
  const [, mimeType, b64] = match;
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  try {
    const buffer = Buffer.from(b64, 'base64');
    const filePath = `pregen-images/${key}.${ext}`;
    const file = bucket.file(filePath);
    await file.save(buffer, { metadata: { contentType: mimeType }, resumable: false });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
  } catch (err: any) {
    console.warn(`[Pregen] Image upload to Cloud Storage failed for "${key}", keeping inline base64:`, err?.message);
    return null;
  }
}

function localFile(key: string): string {
  return path.join(pregenDir(), `${key}.json`);
}

function loadLocalFile(candidates: string[]): PregenRecord | null {
  for (const key of candidates) {
    const file = localFile(key);
    if (fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (e: any) {
        console.warn(`[Pregen] Failed to read local file ${file}:`, e.message);
      }
    }
  }
  return null;
}

function existsLocalFile(candidates: string[]): boolean {
  return candidates.some((key) => fs.existsSync(localFile(key)));
}

function writeLocalFile(key: string, record: PregenRecord) {
  const dir = pregenDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(localFile(key), JSON.stringify(record, null, 2), 'utf8');
}

/** Firestore documents are capped at 1 MiB. The image is already routed to
 * Storage above; this only guards the JSON (lessonData + diagram variants). */
const FIRESTORE_SOFT_LIMIT = 900 * 1024;
function warnIfLarge(key: string, record: PregenRecord) {
  const bytes = Buffer.byteLength(JSON.stringify(record), 'utf8');
  if (bytes > FIRESTORE_SOFT_LIMIT) {
    console.warn(`[Pregen] "${key}" is ${(bytes / 1024).toFixed(0)} KB — close to Firestore's 1 MiB document limit.`);
  }
}

// ─── Public API ─────────────────────────────────────────────────

/** True if this concept/topic already has a pre-generated (or previously
 * cached) record, checked Firestore-first then local file. Use this instead
 * of `fs.existsSync` before spending money regenerating something. */
export async function pregenExists(candidates: string[]): Promise<boolean> {
  const db = getFirestoreDb();
  if (db) {
    for (const key of candidates) {
      try {
        const doc = await db.collection(FS_COLLECTION).doc(key).get();
        if (doc.exists) return true;
      } catch (err: any) {
        console.warn(`[Pregen] Firestore exists-check failed for "${key}", falling back to local file:`, err?.message);
        break;
      }
    }
  }
  return existsLocalFile(candidates);
}

/** Look up a cached record by curriculum concept id first, then by topic
 * slug (two courses can share a concept LABEL, so the label alone is not a
 * safe key — same rule as before this module existed). */
// ─── Firestore encoding ─────────────────────────────────────────
// Firestore rejects arrays nested directly inside arrays ("Nested arrays are
// not supported"), and board pictures are full of them — a line's two points
// [[2,-2],[2,4]], polygon vertices, table rows. Written as-is, every save
// would throw and fall back to local disk, which Cloud Run wipes on redeploy.
// So in Firestore the pictures travel as one JSON string field; local files
// keep them as plain JSON. Callers only ever see the decoded form.
type FirestorePregen = Omit<PregenRecord, 'visuals' | 'visualsQuarantine'> & { visualsJson?: string; quarantineJson?: string };

export function toFirestore(record: PregenRecord): FirestorePregen {
  const { visuals, visualsQuarantine, ...rest } = record;
  // Pictures live only in `visuals`; server.ts attaches them to lessonData when serving.
  // Strip any copy inside lessonData so no nested array can reach Firestore that way.
  if (rest.lessonData && (rest.lessonData.visual || rest.lessonData.visual3d)) {
    const { visual: _v, visual3d: _v3, ...lesson } = rest.lessonData;
    rest.lessonData = lesson;
  }
  const out: FirestorePregen = { ...rest };
  if (visuals && Object.keys(visuals).length) out.visualsJson = JSON.stringify(visuals);
  if (visualsQuarantine && Object.keys(visualsQuarantine).length) out.quarantineJson = JSON.stringify(visualsQuarantine);
  return out;
}

export function fromFirestore(doc: FirestorePregen): PregenRecord {
  const { visualsJson, quarantineJson, ...rest } = doc;
  const out = rest as PregenRecord;
  const decode = (json: string | undefined, what: string) => {
    if (!json) return undefined;
    try { return JSON.parse(json); } catch (err: any) {
      console.warn(`[Pregen] "${doc.slug}": stored ${what} could not be decoded — ignoring them:`, err?.message);
      return undefined;
    }
  };
  const visuals = decode(visualsJson, 'board pictures');
  const quarantine = decode(quarantineJson, 'quarantined pictures');
  if (visuals) out.visuals = visuals;
  if (quarantine) out.visualsQuarantine = quarantine;
  return out;
}

export async function getPregenAsync(candidates: string[]): Promise<PregenRecord | null> {
  const db = getFirestoreDb();
  if (db) {
    for (const key of candidates) {
      try {
        const doc = await db.collection(FS_COLLECTION).doc(key).get();
        if (doc.exists) return fromFirestore(doc.data() as FirestorePregen);
      } catch (err: any) {
        console.warn(`[Pregen] Firestore read failed for "${key}", falling back to local file:`, err?.message);
        break;
      }
    }
  }
  return loadLocalFile(candidates);
}

/** Persist a pre-generated (or live-generated, cache-miss) record exactly
 * once. If `record.photoUrl` is a base64 data URI and Storage is
 * configured, the image is uploaded and the stored photoUrl becomes a
 * Storage URL; otherwise the base64 is kept inline (local dev/tests, or
 * Storage temporarily unavailable — the record is never silently dropped).
 * Returns the record as actually persisted, so the caller logs/serves the
 * resolved photoUrl rather than the original base64. */
export async function savePregenAsync(key: string, record: PregenRecord): Promise<PregenRecord> {
  const db = getFirestoreDb();
  let toPersist = record;

  if (db && record.photoUrl) {
    const uploaded = await uploadImageToStorage(key, record.photoUrl);
    if (uploaded) {
      toPersist = { ...record, photoUrl: uploaded };
    } else if (DATA_URI_RE.test(record.photoUrl)) {
      // Storage upload failed/unavailable but Firestore IS configured — do not
      // risk blowing the 1 MiB doc cap with an inlined base64 image. Drop the
      // photo from the Firestore copy rather than fail the whole save; the
      // lesson JSON (the expensive part) still gets persisted.
      console.warn(`[Pregen] "${key}": could not upload photo to Storage — saving lesson without an image (photo will regenerate next time).`);
      toPersist = { ...record, photoUrl: null };
    }
  }

  if (db) {
    try {
      warnIfLarge(key, toPersist);
      await db.collection(FS_COLLECTION).doc(key).set(JSON.parse(JSON.stringify(toFirestore(toPersist))));
      console.log(`[Pregen] Saved "${key}" to Firestore${toPersist.photoUrl && toPersist.photoUrl !== record.photoUrl ? ' (photo in Cloud Storage)' : ''}`);
      return toPersist;
    } catch (err: any) {
      console.warn(`[Pregen] Firestore write failed for "${key}", saving to local file:`, err?.message);
    }
  }

  // Local fallback (or Firestore write failed above) — keep the ORIGINAL
  // record with any base64 photo intact, so nothing is lost in dev/offline.
  writeLocalFile(key, record);
  console.log(`[Pregen] Saved "${key}" to local file`);
  return record;
}
