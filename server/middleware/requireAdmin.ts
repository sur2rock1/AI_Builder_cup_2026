// ─────────────────────────────────────────────────────────────────
// Admin guard for the content library (docs/CURRICULUM.md §5).
//
// Uploading textbooks/syllabi and deleting courses is an admin action —
// students never upload (D-2026-09-26-7). Two ways in, checked in order:
//
//   1. X-Admin-Token header equal to the ADMIN_TOKEN env var (constant-time
//      compare). This works today, before real per-user sign-in exists.
//   2. A Firebase ID token whose custom claim `admin === true`, for when
//      real sign-in is wired up (set the claim with the Admin SDK).
//
// If ADMIN_TOKEN is NOT configured, requests from the machine the server
// runs on (loopback TCP peer — req.socket.remoteAddress, deliberately not
// req.ip, which honours X-Forwarded-For and could be spoofed behind
// `trust proxy`) are allowed with a warning, so local development works
// out of the box. Anywhere else, uploads are refused until ADMIN_TOKEN is set.
// ─────────────────────────────────────────────────────────────────
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { admin, initFirebaseAdmin } from '../../src/firebase/admin';

let warnedOpen = false;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function isLoopback(req: Request): boolean {
  const addr = req.socket?.remoteAddress || '';
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

// A single shape (not a discriminated union): this repo's tsconfig is not
// strict, and non-strict TS does not narrow unions on a boolean `ok`.
export interface AdminCheck { ok: boolean; via?: 'token' | 'claim' | 'local-dev'; status?: number; error?: string }

export async function checkAdmin(req: Request): Promise<AdminCheck> {
  const configured = process.env.ADMIN_TOKEN || '';
  const sent = String(req.headers['x-admin-token'] || '');
  if (configured && sent && safeEqual(sent, configured)) return { ok: true, via: 'token' };

  const header = req.headers.authorization || '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (idToken) {
    try {
      initFirebaseAdmin();
      if (admin.apps.length) {
        const decoded = await admin.auth().verifyIdToken(idToken);
        if ((decoded as any).admin === true) return { ok: true, via: 'claim' };
      }
    } catch { /* fall through */ }
  }

  if (!configured && isLoopback(req)) {
    if (!warnedOpen) {
      warnedOpen = true;
      console.warn('[requireAdmin] ADMIN_TOKEN is not set — allowing content-library admin actions from this machine only. Set ADMIN_TOKEN in .env before deploying.');
    }
    return { ok: true, via: 'local-dev' };
  }
  if (!configured) return { ok: false, status: 503, error: 'Content uploads are disabled: set ADMIN_TOKEN on the server.' };
  return { ok: false, status: 401, error: sent ? 'Wrong admin token.' : 'Admin token required.' };
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const r = await checkAdmin(req);
  if (r.ok) return next();
  res.status(r.status || 401).json({ error: r.error });
}
