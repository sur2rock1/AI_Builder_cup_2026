// ─────────────────────────────────────────────────────────────────
// Learner repository interface (T03).
//
// One interface, two implementations: `file` (JSON on disk — used in
// tests and as a local-dev fallback) and `firestore` (production; used
// automatically on Cloud Run). Callers never touch either implementation
// directly — always go through getRepo() in ./index.ts.
//
// Firestore layout (see docs/LEARNER_MODEL.md §9):
//   learners/{studentId}                    LearnerProfile (without events)
//   learners/{studentId}/events/{eventId}    EvidenceEvent (append-only)
//   learners/{studentId}/plans/{planVersion} TeachingPlan snapshots
//   learners/{studentId}/sessions/{sessionId} SessionSummary
// ─────────────────────────────────────────────────────────────────
import { LearnerProfile, LearningEvidence } from '../learnerModel';

export interface EventFilter {
  subjectId?: string;
  conceptId?: string;
  limit?: number;
}

export interface LearnerRepository {
  getProfile(studentId: string): Promise<LearnerProfile | null>;
  /** Creates if missing, merges (never overwrites unspecified fields) if present. */
  saveProfile(profile: LearnerProfile): Promise<void>;
  listProfiles(): Promise<LearnerProfile[]>;
  /** Deletes the profile and every subcollection under it. */
  deleteProfile(studentId: string): Promise<void>;

  appendEvent(studentId: string, event: LearningEvidence & { eventId: string }): Promise<void>;
  listEvents(studentId: string, filter?: EventFilter): Promise<(LearningEvidence & { eventId: string })[]>;

  savePlan(studentId: string, planVersion: string, plan: unknown): Promise<void>;
  getLatestPlan(studentId: string, subjectId: string): Promise<{ planVersion: string; plan: unknown } | null>;

  saveSessionSummary(studentId: string, sessionId: string, summary: unknown): Promise<void>;
}
