// tests/offline-tutor-setup.ts — bundled by tests/smoke/tutor-turn-offline.mjs.
//
// Not a smoke test by itself. It sets up ONE real session (real curriculum
// data, a real compiled Teaching Plan, a real learner profile) against a
// scratch LEARNER_DATA_DIR, registers the REAL server/routes/tutor.ts routes
// on a throwaway Express app, and exports what the runner needs to drive it
// over HTTP. The only thing not real here is @google/genai — the runner's
// esbuild call aliases it to tests/genai-tool-stub.mjs so the tool-calling
// LOGIC in server/routes/tutor.ts can be verified deterministically, offline,
// without a reachable Gemini endpoint. Every other module (learnerStore,
// repo, curriculum ingest, the persona composer, the plan compiler, the
// diagnostician's parsing/validation code) is the actual production code,
// unmodified.
import express from 'express';
import http from 'http';
import {
  getOrCreateLearner, ensureSubject, ensureConceptState, startSession, getLearner,
} from '../src/adaptive/learnerStore';
import { getRepo } from '../src/adaptive/repo';
import { getCurriculum, listCurriculaAsync } from '../src/curriculum/ingest';
import { compileTeachingPlan } from '../src/plan/compile';
import { conceptTypeFor } from '../src/curriculum/catalog';
import { registerTutorRoutes } from '../server/routes/tutor';
import type { AdaptiveSessionState } from '../src/adaptive/learnerModel';

export async function setup(subjectId: string, studentId: string) {
  await listCurriculaAsync(); // warms getCurriculum()'s sync cache
  const curriculum = getCurriculum(subjectId);
  if (!curriculum) throw new Error(`offline-tutor-setup: curriculum not found for "${subjectId}" — is data/curricula.json present?`);
  const concept = curriculum.concepts[0];
  if (!concept) throw new Error(`offline-tutor-setup: curriculum "${subjectId}" has no concepts`);

  await getOrCreateLearner(studentId, 'Offline Test', curriculum.grade);
  await ensureSubject(studentId, subjectId, curriculum.label, curriculum.grade, curriculum.source);
  await ensureConceptState(studentId, subjectId, concept.id, concept.label, 'direct_explanation', conceptTypeFor(concept));

  const sessionId = `session_offline_${Date.now()}`;
  const refreshedLearner = await getLearner(studentId);
  if (!refreshedLearner) throw new Error('offline-tutor-setup: learner vanished immediately after creation');
  const plan = compileTeachingPlan(refreshedLearner, curriculum, {
    studentId, subjectId, channel: 'text', requestedConceptId: concept.id,
  });
  await getRepo().savePlan(studentId, plan.planVersion, plan);

  const session: AdaptiveSessionState = {
    sessionId, studentId, subjectId,
    currentConceptId: concept.id,
    currentStrategy: 'direct_explanation',
    sessionStarted: Date.now(),
    interactionCount: 0,
    recentAttempts: [],
  };
  startSession(session);

  const app = express();
  app.use(express.json());
  registerTutorRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    port, sessionId, studentId, subjectId,
    conceptId: concept.id, conceptLabel: concept.label,
    planVersion: plan.planVersion,
    server,
  };
}
