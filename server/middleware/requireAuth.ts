// ─────────────────────────────────────────────────────────────────
// Auth middleware for learner-data routes (T02).
//
// Verifies the Firebase ID token on the Authorization header and checks
// that the caller owns the learner profile being accessed (or is a
// parent account linked to it — linking is not yet implemented, so for
// now ownership == the learner's own Firebase uid == :studentId).
//
// A development bypass is allowed ONLY when NODE_ENV=development AND
// ALLOW_DEV_AUTH_BYPASS=true, so local development without Firebase
// Auth configured still works. It is refused in any other environment.
// ─────────────────────────────────────────────────────────────────
import type { Request, Response, NextFunction } from 'express';
import { admin, initFirebaseAdmin } from '../../src/firebase/admin';

export interface AuthedRequest extends Request {
  authUid?: string;
}

let warnedOnce = false;

function devBypassAllowed(): boolean {
  // Real per-profile Firebase Auth is not yet wired into the client's
  // profile-picker flow (LoginScreen.tsx creates a studentId locally,
  // with no sign-in step) — see docs/BUILD_PLAN.md T02 review note and
  // docs/DECISIONS.md 2026-09-24. Until that is built, DEMO_MODE and local
  // dev both bypass token verification but still scope every request to
  // the studentId in the URL/body, so one learner's data cannot be read
  // by naming a different studentId from a DIFFERENT unauthenticated caller
  // without also knowing that id — the real fix (T02 follow-up) is a
  // proper sign-in step per profile.
  const allowed = process.env.DEMO_MODE === 'true' || (process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH_BYPASS !== 'false');
  if (allowed && !warnedOnce) {
    warnedOnce = true;
    console.warn('[requireAuth] DEV/DEMO bypass active — learner routes are NOT verifying Firebase ID tokens. Do not run this in production without real client sign-in wired up (docs/BUILD_PLAN.md T02).');
  }
  return allowed;
}

/** Verifies the caller is signed in. Does not check ownership of a specific resource. */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      if (devBypassAllowed()) {
        req.authUid = String(req.params.studentId || req.body?.studentId || 'dev-user');
        return next();
      }
      return res.status(401).json({ error: 'Missing Authorization: Bearer <idToken>' });
    }

    initFirebaseAdmin();
    if (!admin.apps.length) {
      if (devBypassAllowed()) {
        req.authUid = String(req.params.studentId || req.body?.studentId || 'dev-user');
        return next();
      }
      return res.status(500).json({ error: 'Auth not configured on the server' });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    req.authUid = decoded.uid;
    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Verifies the authenticated caller owns the :studentId in the route.
 * Call requireAuth first. A learner's own account owns its profile;
 * parent-linked access is a planned extension (LEARNER_MODEL.md §8).
 */
export function requireOwnership(req: AuthedRequest, res: Response, next: NextFunction) {
  const studentId = req.params.studentId || req.body?.studentId;
  if (!studentId) return res.status(400).json({ error: 'studentId required' });
  if (req.authUid !== studentId) {
    return res.status(403).json({ error: 'Not authorized for this learner profile' });
  }
  next();
}
