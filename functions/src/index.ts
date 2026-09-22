import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { setGlobalOptions } from 'firebase-functions/v2';
import type { Request, Response } from 'express';

initializeApp();

setGlobalOptions({
  region: 'us-central1',
  maxInstances: 20,
});

/** Set with: firebase functions:secrets:set GEMINI_API_KEY */
const geminiApiKey = defineSecret('GEMINI_API_KEY');

const db = getFirestore();
const auth = getAuth();
const storage = getStorage();

const LEARNERS = db.collection('learners');

type LearnerProfile = {
  studentId: string;
  name: string;
  grade: string;
  createdAt: number;
  updatedAt: number;
  subjects: Record<string, unknown>;
  globalInsights: string[];
};

function normalizePath(req: Request): string {
  // Hosting rewrite may pass /api/learners or /learners depending on runtime.
  const raw = (req.path || req.url || '/').split('?')[0];
  return raw.replace(/^\/api/, '') || '/';
}

async function listLearners(): Promise<LearnerProfile[]> {
  const snap = await LEARNERS.get();
  return snap.docs
    .map((d) => d.data() as LearnerProfile)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

async function getLearner(studentId: string): Promise<LearnerProfile | null> {
  const doc = await LEARNERS.doc(studentId).get();
  return doc.exists ? (doc.data() as LearnerProfile) : null;
}

async function getOrCreateLearner(
  studentId: string,
  name: string,
  grade: string,
): Promise<LearnerProfile> {
  const existing = await getLearner(studentId);
  if (existing) return existing;
  const fresh: LearnerProfile = {
    studentId,
    name,
    grade,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    subjects: {},
    globalInsights: [],
  };
  await LEARNERS.doc(studentId).set(fresh);
  return fresh;
}

/** Built-in curriculum list so the subject picker works without local files. */
function builtinCurricula() {
  return [
    {
      subjectId: 'pythagoras',
      label: 'Pythagoras Theorem',
      grade: 'Secondary 2 (Grade 8)',
      source: 'builtin',
      conceptCount: 6,
      concepts: [
        { id: 'right-triangle', label: 'Right triangles', typicalTeachingOrder: 1, prerequisites: [], chapter: null },
        { id: 'hypotenuse', label: 'Hypotenuse', typicalTeachingOrder: 2, prerequisites: ['right-triangle'], chapter: null },
        { id: 'pythagoras-statement', label: 'Pythagoras statement', typicalTeachingOrder: 3, prerequisites: ['hypotenuse'], chapter: null },
        { id: 'find-hypotenuse', label: 'Find the hypotenuse', typicalTeachingOrder: 4, prerequisites: ['pythagoras-statement'], chapter: null },
        { id: 'find-leg', label: 'Find a leg', typicalTeachingOrder: 5, prerequisites: ['find-hypotenuse'], chapter: null },
        { id: 'converse', label: 'Converse of Pythagoras', typicalTeachingOrder: 6, prerequisites: ['find-leg'], chapter: null },
      ],
    },
  ];
}

export const api = onRequest(
  {
    secrets: [geminiApiKey],
    cors: true,
    timeoutSeconds: 120,
    memory: '1GiB',
  },
  async (req: Request, res: Response) => {
    const path = normalizePath(req);

    try {
      if (req.method === 'GET' && (path === '/' || path === '/health')) {
        res.json({
          status: 'ok',
          project: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT,
          hasGeminiSecret: Boolean(geminiApiKey.value()),
          time: new Date().toISOString(),
        });
        return;
      }

      // ── Learners (LoginScreen / ParentPortal) ──────────────────
      if (req.method === 'GET' && path === '/learners') {
        res.json({ learners: await listLearners() });
        return;
      }

      const learnerMatch = path.match(/^\/learners\/([^/]+)$/);
      if (req.method === 'GET' && learnerMatch) {
        const learner = await getLearner(decodeURIComponent(learnerMatch[1]));
        if (!learner) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        res.json({ learner });
        return;
      }

      if (req.method === 'POST' && path === '/learners') {
        const { studentId, name, grade } = req.body || {};
        if (!studentId || !name || !grade) {
          res.status(400).json({ error: 'studentId, name, grade required' });
          return;
        }
        const learner = await getOrCreateLearner(
          String(studentId),
          String(name),
          String(grade),
        );
        // Touch updatedAt if profile already existed but name/grade changed
        await LEARNERS.doc(learner.studentId).set(
          { name: String(name), grade: String(grade), updatedAt: Date.now() },
          { merge: true },
        );
        const updated = await getLearner(learner.studentId);
        res.json({ learner: updated });
        return;
      }

      // ── Curricula list (SubjectSelector) ───────────────────────
      if (req.method === 'GET' && path === '/curricula') {
        res.json({ curricula: builtinCurricula() });
        return;
      }

      // ── Auth profile ──────────────────────────────────────────
      if (req.method === 'GET' && path === '/me') {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : '';
        if (!token) {
          res.status(401).json({ error: 'Missing Bearer token' });
          return;
        }
        try {
          const decoded = await auth.verifyIdToken(token);
          const profile = await db.collection('users').doc(decoded.uid).get();
          res.json({
            uid: decoded.uid,
            email: decoded.email,
            profile: profile.exists ? profile.data() : null,
          });
        } catch (err: any) {
          res.status(401).json({ error: err?.message || 'Invalid token' });
        }
        return;
      }

      // ── Signed media upload ───────────────────────────────────
      if (req.method === 'POST' && path === '/media/signed-upload') {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : '';
        if (!token) {
          res.status(401).json({ error: 'Missing Bearer token' });
          return;
        }
        try {
          const decoded = await auth.verifyIdToken(token);
          const { fileName, contentType } = req.body || {};
          if (!fileName || !contentType) {
            res.status(400).json({ error: 'fileName and contentType required' });
            return;
          }
          const objectPath = `users/${decoded.uid}/media/${Date.now()}-${fileName}`;
          const file = storage.bucket().file(objectPath);
          const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'write',
            expires: Date.now() + 15 * 60 * 1000,
            contentType,
          });
          res.json({ uploadUrl: url, objectPath });
        } catch (err: any) {
          res.status(500).json({ error: err?.message || 'Signed URL failed' });
        }
        return;
      }

      res.status(404).json({
        error: 'Not found',
        path,
        hint: 'Extend functions/src/index.ts to host more server routes.',
      });
    } catch (err: any) {
      console.error('[api]', path, err);
      res.status(500).json({ error: err?.message || 'Internal error' });
    }
  },
);
