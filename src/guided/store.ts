// ─────────────────────────────────────────────────────────────────
// Runtime store for guided lessons made AFTER the server was built —
// the ones written automatically when a curriculum PDF is uploaded.
//
// Lessons made by `npm run guided:first-chapter` are bundled into the build
// (src/guided/generated). A server that is already running cannot bundle
// anything new, so lessons made at upload time live here instead:
//
//   Primary store  : Firestore collection "guidedScripts", one doc per concept
//                    ({ conceptId, savedAt, json }) — survives Cloud Run restarts.
//                    The script is kept as a JSON string, so Firestore's rules about
//                    nested arrays and field names can never reject it.
//   Local fallback : data/guided/runtime/<conceptId>.json (dev, tests, no Firebase).
//                    GUIDED_RUNTIME_DIR overrides the folder.
//
// The registry (registry.ts) merges these over the bundled lessons; server.ts
// re-reads them every few seconds, so a lesson appears without a restart.
// Node only (fs, firebase-admin): never import this from browser code.
// ─────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { admin } from '../firebase/admin';
import type { GuidedScript } from './types';

const COLLECTION = 'guidedScripts';

function db(): any {
  try {
    const app = admin.apps?.[0];
    return app ? admin.firestore(app) : null;
  } catch {
    return null;
  }
}

export function runtimeDir(): string {
  return process.env.GUIDED_RUNTIME_DIR || path.join(process.cwd(), 'data', 'guided', 'runtime');
}

const safeId = (id: string) => id.replace(/[^A-Za-z0-9._-]/g, '_');

/** Save a lesson that passed every check. Writes the local file always, Firestore when configured. */
export async function saveGuidedScript(script: GuidedScript): Promise<'firestore+local' | 'local'> {
  fs.mkdirSync(runtimeDir(), { recursive: true });
  fs.writeFileSync(path.join(runtimeDir(), `${safeId(script.conceptId)}.json`), JSON.stringify(script, null, 2) + '\n');
  const d = db();
  if (!d) return 'local';
  try {
    await d.collection(COLLECTION).doc(safeId(script.conceptId)).set({
      conceptId: script.conceptId,
      savedAt: new Date().toISOString(),
      json: JSON.stringify(script),
    });
    return 'firestore+local';
  } catch (err: any) {
    console.warn(`[GuidedStore] Firestore save failed for "${script.conceptId}", kept the local file:`, err?.message);
    return 'local';
  }
}

/** True if a runtime lesson already exists for this concept (Firestore first, then the local file). */
export async function guidedScriptExists(conceptId: string): Promise<boolean> {
  const d = db();
  if (d) {
    try {
      if ((await d.collection(COLLECTION).doc(safeId(conceptId)).get()).exists) return true;
    } catch { /* fall through to the local file */ }
  }
  return fs.existsSync(path.join(runtimeDir(), `${safeId(conceptId)}.json`));
}

/** Every runtime lesson. Firestore and local files are merged (Firestore wins). Never throws. */
export async function loadRuntimeGuidedScripts(): Promise<GuidedScript[]> {
  const byId = new Map<string, GuidedScript>();
  try {
    const dir = runtimeDir();
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
        try {
          const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          if (s?.conceptId && Array.isArray(s.beats)) byId.set(s.conceptId, s);
        } catch (e: any) { console.warn(`[GuidedStore] unreadable ${f}:`, e?.message); }
      }
    }
  } catch { /* no local folder */ }
  const d = db();
  if (d) {
    try {
      const snap = await d.collection(COLLECTION).get();
      snap.forEach((doc: any) => {
        try {
          const s = JSON.parse(doc.data()?.json ?? 'null');
          if (s?.conceptId && Array.isArray(s.beats)) byId.set(s.conceptId, s);
        } catch { /* skip a bad document */ }
      });
    } catch (err: any) {
      console.warn('[GuidedStore] Firestore read failed, using local files only:', err?.message);
    }
  }
  return [...byId.values()];
}
