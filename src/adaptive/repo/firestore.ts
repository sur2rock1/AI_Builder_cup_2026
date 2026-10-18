// ─────────────────────────────────────────────────────────────────
// Firestore-backed learner repository (production default — T03).
// Uses the Admin SDK, which bypasses firestore.rules; ownership and
// auth are enforced by server/middleware/requireAuth.ts before any
// repo call is made.
// ─────────────────────────────────────────────────────────────────
import { admin, initFirebaseAdmin } from '../../firebase/admin';
import { LearnerProfile, LearningEvidence } from '../learnerModel';
import { EventFilter, LearnerRepository } from './types';

function db() {
  initFirebaseAdmin();
  return admin.firestore();
}

/**
 * Firestore rejects a document that contains `undefined` anywhere (and objects with custom prototypes). The learner
 * store builds objects with optional fields left `undefined`; the local JSON file repository silently drops them, so
 * this only ever failed on Cloud Run — and it failed EVERY live assessment write (2026-10-17, see
 * tests/cloud/firestore-payloads.mjs). Every write goes through this: undefined is dropped, NaN/Infinity become null.
 */
export function toFirestoreData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

function isMissingIndex(err: any): boolean {
  return err?.code === 9 || /FAILED_PRECONDITION|requires an index/i.test(String(err?.message || ''));
}

export class FirestoreLearnerRepository implements LearnerRepository {
  async getProfile(studentId: string): Promise<LearnerProfile | null> {
    const doc = await db().collection('learners').doc(studentId).get();
    return doc.exists ? (doc.data() as LearnerProfile) : null;
  }

  async saveProfile(profile: LearnerProfile): Promise<void> {
    await db().collection('learners').doc(profile.studentId).set(toFirestoreData(profile), { merge: true });
  }

  async listProfiles(): Promise<LearnerProfile[]> {
    const snap = await db().collection('learners').get();
    return snap.docs
      .map((d) => d.data() as LearnerProfile)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async deleteProfile(studentId: string): Promise<void> {
    const ref = db().collection('learners').doc(studentId);
    for (const sub of ['events', 'plans', 'sessions', 'transcripts']) {
      const snap = await ref.collection(sub).get();
      const batch = db().batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      if (!snap.empty) await batch.commit();
    }
    await ref.delete();
  }

  async appendEvent(studentId: string, event: LearningEvidence & { eventId: string }): Promise<void> {
    await db().collection('learners').doc(studentId).collection('events').doc(event.eventId).set(toFirestoreData(event));
  }

  async listEvents(studentId: string, filter: EventFilter = {}): Promise<(LearningEvidence & { eventId: string })[]> {
    const col = db().collection('learners').doc(studentId).collection('events');
    let q: FirebaseFirestore.Query = col;
    if (filter.conceptId) q = q.where('conceptId', '==', filter.conceptId);
    if (filter.sessionId) q = q.where('sessionId', '==', filter.sessionId);
    q = q.orderBy('timestamp', 'asc');
    if (filter.limit) q = q.limitToLast(filter.limit);
    try {
      const snap = await q.get();
      return snap.docs.map((d) => d.data() as LearningEvidence & { eventId: string });
    } catch (err: any) {
      if (!isMissingIndex(err)) throw err;
      // Composite index not built yet (firestore.indexes.json): filter in memory so nothing downstream breaks.
      console.warn('[FirestoreRepo] events index not ready, filtering in memory:', String(err?.message || err).slice(0, 160));
      let all = (await col.get()).docs.map((d) => d.data() as LearningEvidence & { eventId: string; sessionId?: string });
      if (filter.conceptId) all = all.filter((e) => e.conceptId === filter.conceptId);
      if (filter.sessionId) all = all.filter((e) => e.sessionId === filter.sessionId);
      all.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      return filter.limit ? all.slice(-filter.limit) : all;
    }
  }

  async savePlan(studentId: string, planVersion: string, plan: unknown): Promise<void> {
    await db().collection('learners').doc(studentId).collection('plans').doc(planVersion).set(toFirestoreData(plan) as any);
  }

  async getLatestPlan(studentId: string, subjectId: string): Promise<{ planVersion: string; plan: unknown } | null> {
    const col = db().collection('learners').doc(studentId).collection('plans');
    try {
      const snap = await col.where('subjectId', '==', subjectId).orderBy('generatedAt', 'desc').limit(1).get();
      if (snap.empty) return null;
      const doc = snap.docs[0];
      return { planVersion: doc.id, plan: doc.data() };
    } catch (err: any) {
      if (!isMissingIndex(err)) throw err;
      console.warn('[FirestoreRepo] plans index not ready, filtering in memory');
      const docs = (await col.where('subjectId', '==', subjectId).get()).docs
        .sort((a, b) => ((b.data() as any).generatedAt || 0) - ((a.data() as any).generatedAt || 0));
      return docs.length ? { planVersion: docs[0].id, plan: docs[0].data() } : null;
    }
  }

  async saveTranscript(studentId: string, sessionId: string, transcript: unknown): Promise<void> {
    await db().collection('learners').doc(studentId).collection('transcripts').doc(sessionId).set(toFirestoreData(transcript) as any);
  }

  async listTranscripts(studentId: string, limit = 20): Promise<unknown[]> {
    const snap = await db().collection('learners').doc(studentId).collection('transcripts')
      .orderBy('endedAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => d.data());
  }

  async saveSessionSummary(studentId: string, sessionId: string, summary: unknown): Promise<void> {
    await db().collection('learners').doc(studentId).collection('sessions').doc(sessionId).set(toFirestoreData(summary) as any);
  }
}
