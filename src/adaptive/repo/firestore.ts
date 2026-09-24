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

export class FirestoreLearnerRepository implements LearnerRepository {
  async getProfile(studentId: string): Promise<LearnerProfile | null> {
    const doc = await db().collection('learners').doc(studentId).get();
    return doc.exists ? (doc.data() as LearnerProfile) : null;
  }

  async saveProfile(profile: LearnerProfile): Promise<void> {
    await db().collection('learners').doc(profile.studentId).set(profile, { merge: true });
  }

  async listProfiles(): Promise<LearnerProfile[]> {
    const snap = await db().collection('learners').get();
    return snap.docs
      .map((d) => d.data() as LearnerProfile)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async deleteProfile(studentId: string): Promise<void> {
    const ref = db().collection('learners').doc(studentId);
    for (const sub of ['events', 'plans', 'sessions']) {
      const snap = await ref.collection(sub).get();
      const batch = db().batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      if (!snap.empty) await batch.commit();
    }
    await ref.delete();
  }

  async appendEvent(studentId: string, event: LearningEvidence & { eventId: string }): Promise<void> {
    await db().collection('learners').doc(studentId).collection('events').doc(event.eventId).set(event);
  }

  async listEvents(studentId: string, filter: EventFilter = {}): Promise<(LearningEvidence & { eventId: string })[]> {
    let q: FirebaseFirestore.Query = db().collection('learners').doc(studentId).collection('events');
    if (filter.conceptId) q = q.where('conceptId', '==', filter.conceptId);
    q = q.orderBy('timestamp', 'asc');
    if (filter.limit) q = q.limitToLast(filter.limit);
    const snap = await q.get();
    return snap.docs.map((d) => d.data() as LearningEvidence & { eventId: string });
  }

  async savePlan(studentId: string, planVersion: string, plan: unknown): Promise<void> {
    await db().collection('learners').doc(studentId).collection('plans').doc(planVersion).set(plan as any);
  }

  async getLatestPlan(studentId: string, subjectId: string): Promise<{ planVersion: string; plan: unknown } | null> {
    const snap = await db()
      .collection('learners').doc(studentId).collection('plans')
      .where('subjectId', '==', subjectId)
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { planVersion: doc.id, plan: doc.data() };
  }

  async saveSessionSummary(studentId: string, sessionId: string, summary: unknown): Promise<void> {
    await db().collection('learners').doc(studentId).collection('sessions').doc(sessionId).set(summary as any);
  }
}
