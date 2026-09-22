/**
 * Server-side Firebase Admin bootstrap.
 * Uses FIREBASE_SERVICE_ACCOUNT_PATH (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

let initialized = false;

export function initFirebaseAdmin() {
  if (initialized || admin.apps.length) {
    initialized = true;
    return admin.app();
  }

  const saPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (saPath) {
    const resolved = path.isAbsolute(saPath) ? saPath : path.join(process.cwd(), saPath);
    if (!fs.existsSync(resolved)) {
      console.warn(`[Firebase Admin] Service account file not found: ${resolved}`);
      return null;
    }
    const serviceAccount = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket:
        process.env.FIREBASE_STORAGE_BUCKET ||
        `${serviceAccount.project_id}.firebasestorage.app`,
      projectId: serviceAccount.project_id,
    });
  } else if (process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT) {
    // Cloud Functions / Cloud Run default credentials
    admin.initializeApp({
      storageBucket:
        process.env.FIREBASE_STORAGE_BUCKET ||
        `${process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT}.firebasestorage.app`,
    });
  } else {
    console.warn('[Firebase Admin] No credentials configured (set FIREBASE_SERVICE_ACCOUNT_PATH)');
    return null;
  }

  initialized = true;
  console.log('[Firebase Admin] Initialized for project', admin.app().options.projectId);
  return admin.app();
}

export { admin };
