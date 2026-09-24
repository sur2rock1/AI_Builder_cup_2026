// ─────────────────────────────────────────────────────────────────
// Repository factory (T03). Firestore is the default whenever it is
// configured (matches the previous `useFirestoreLearners()` heuristic
// in server.ts: explicit opt-in, or running on Cloud Run). The file
// repository is used otherwise, and always in tests.
// ─────────────────────────────────────────────────────────────────
import { FileLearnerRepository } from './file';
import { FirestoreLearnerRepository } from './firestore';
import { LearnerRepository } from './types';

export * from './types';

let cached: LearnerRepository | null = null;

export function useFirestore(): boolean {
  return process.env.USE_FIRESTORE_LEARNERS === 'true' || Boolean(process.env.K_SERVICE);
}

export function getRepo(): LearnerRepository {
  if (cached) return cached;
  cached = useFirestore() ? new FirestoreLearnerRepository() : new FileLearnerRepository();
  return cached;
}

/** Test-only: force a specific repository implementation. */
export function setRepoForTests(repo: LearnerRepository) {
  cached = repo;
}
