import express from 'express';
import http from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { LiveObserver } from './src/adaptive/liveObserver';
import { GoogleGenAI, Modality, Type, LiveServerMessage } from '@google/genai';
import { createDynamicLesson } from './src/utils/lessonGenerator';
import multer from 'multer';
import {
  getOrCreateLearner, getLearner, listLearners, deleteLearner, ensureSubject,
  ensureConceptState, getConceptState, recordAttempt, addGlobalInsight,
  incrementSessionCount, startSession, getSession, updateSession, endSession,
  recordReasoningEvidence, getEvidenceLog, disputeMisconception, recordConfusionSignal,
  resolveEscalation,
} from './src/adaptive/learnerStore';
import { getRepo } from './src/adaptive/repo';
import { runProfiler } from './src/adaptive/profiler';
import { requireAuth, requireOwnership } from './server/middleware/requireAuth';
import { requireAdmin, checkAdmin } from './server/middleware/requireAdmin';
import { registerTutorRoutes, clearTutorTurnState } from './server/routes/tutor';
import { compileTeachingPlan } from './src/plan/compile';
import type { TeachingPlan } from './src/plan/types';
import { composeSystemInstruction, composeKickoff, DEFAULT_PERSONA_NAME } from './src/persona/compose';
import { sanitiseTutorName } from './src/persona/tutorName';
import { ageBandFromGrade } from './src/persona/ageBands';
import { subjectModeForCurriculum } from './src/persona/subjectModes';
import { renderPlanForPrompt } from './src/plan/render';
import { verifyModels, isDemoMode } from './src/ai/gateway';
import { compilePlanDelta, initialDeltaState, deriveOutcome } from './src/plan/delta';
import type { PlanDeltaState } from './src/plan/types';
import { assessUnderstanding, selectNextStrategy, QuizReasoning } from './src/adaptive/assessmentEngine';
import {
  assessReasoningWithDeadline, misconceptionText, misconceptionCatalog,
  ReasoningAssessment, DeadlineResult,
} from './src/adaptive/reasoningAssessor';
import { MASTERY_THRESHOLD } from './src/adaptive/bkt';

import { liveConfigFor, ALL_TOOLS } from './src/live/liveConfig';
import { buildCurriculumIntelligenceContext } from './src/curriculum/curriculumIntelligence';
import { getCurriculum, listCurriculaAsync, preloadCurricula, nextUnmasteredConcept, deleteCurriculum } from './src/curriculum/ingest';
import { startIngestJob, getJob, isCourseBusy } from './src/curriculum/pdfIngest';
import { getPregenAsync, savePregenAsync, PregenRecord } from './src/curriculum/pregenStore';
import {
  KNOWN_BOARDS, GRADE_LEVELS, gradeLabel, gradeLevelFromLabel, normaliseBoard, normaliseSubject,
  courseId as makeCourseId, courseMatchesLearner, conceptTypeFor, misconceptionKey,
} from './src/curriculum/catalog';
// Board pictures (docs/BOARD_VISUALS.md): generation, and keeping the voice and the board in step.
import { conceptContext, adHocContext, VisualConceptContext, VisualRequest } from './src/visual/prompt';
import { generateBoardVisual } from './src/visual/generate';
import { gatewayModel } from './src/quality/model';
import { lintPictureVsQuiz } from './src/quality/leakLint';
import { errorsOf } from './src/quality/types';
import { generateLessonText } from './src/curriculum/lessonGen';
import { generateVerifiedPhoto, geminiImageGenerator } from './src/curriculum/photoGen';
import { reviewPhoto } from './src/quality/critic';
import { publicLesson, verifiedPhoto, cleanReasoning } from './src/curriculum/serve';
import { findVisualForFocus, boardContextBlock, toolSummary, matchScore } from './src/visual/tutorBrief';
import { VISUAL_KEYS } from './src/visual/types';
// Guided mode (src/guided) — additive; see src/guided/mode.ts
import { resolveTutorMode } from './src/guided/mode';
import { getGuidedScript, ALL_GUIDED_SCRIPTS } from './src/guided/registry';
import { buildGuidedPayload } from './src/guided/payload';
import { GuidedSession, isGuidedCall } from './src/guided/session';
import { resolvePace, isPace } from './src/guided/pace';
import { TranscriptLog } from './src/utils/transcriptLog';
import { guidedBoardBlock, guidedKickoff } from './src/guided/prompt';
import { guidedToolDeclarations } from './src/guided/tools';
import os from 'os';
import fs from 'fs';
import { AdaptiveSessionState, TeachingStrategy, CurriculumConcept, CurriculumSubject } from './src/adaptive/learnerModel';
import { initFirebaseAdmin, admin } from './src/firebase/admin';

// Bug found 2026-09-26: a single high-confidence BKT observation (e.g. one
// 'transferred'-depth answer on a virgin concept) can push cs.masteryScore
// to 90%+ from ONE exchange (see docs/AGENT_GUIDE.md landmine #3) -- but
// computeMasteryStatus() (src/adaptive/ladder.ts) already correctly requires
// pKnown >= 0.80 AND >= 2 distinct level-3+ items before calling a concept
// even "provisionally" mastered. The two auto-advance checks below used the
// raw, ungated masteryScore, so a single lucky/well-classified answer could
// advance a child past a concept they have not durably demonstrated -- the
// exact "should not move forward simply because the child produced a
// correct answer" failure this project's own principles forbid.
// recordAttempt() (the legacy quiz-click path) never sets cs.masteryStatus,
// so we can't require it unconditionally without breaking that path; this
// helper uses the properly-gated status when it exists (the BKT/live-voice
// path, where the bug lives) and only falls back to the raw threshold for
// concepts that have never been touched by that path.
function isConceptMastered(cs: { masteryScore: number; masteryStatus?: string }): boolean {
  if (cs.masteryStatus) return cs.masteryStatus !== 'none';
  return cs.masteryScore >= MASTERY_THRESHOLD;
}


dotenv.config();
initFirebaseAdmin();
// Warm the curriculum cache from Firestore at startup
preloadCurricula().catch(err => console.warn('[Startup] Curriculum preload failed:', err?.message));

// ── Guard against Vite-internal WebSocket frame errors ──────────
// When Vite runs in middlewareMode, its bundled ws instance can emit
// uncaught errors for malformed HMR close frames (Node 18+).
// These are non-fatal and should not crash the server.
process.on('uncaughtException', (err: any) => {
  if (
    err?.code === 'WS_ERR_INVALID_CLOSE_CODE' ||
    err?.message?.includes('Invalid WebSocket frame') ||
    err?.message?.includes('WebSocket')
  ) {
    console.debug('[Server] Non-fatal WebSocket frame error suppressed:', err.message);
    return; // swallow and continue
  }
  // Re-throw anything genuinely unexpected
  console.error('[Server] Uncaught exception:', err);
  process.exit(1);
});


// ── Pre-generated asset cache ──────────────────────────────────────────────
// Storage itself (Firestore + Cloud Storage, with a local-file fallback for
// dev/tests) lives in src/curriculum/pregenStore.ts — see that file for why:
// Cloud Run's disk is ephemeral, so anything written only to data/pregenerated/
// on that instance is gone on the next deploy or cold start, and the exact
// same concept gets regenerated (and re-billed) again. This module just
// builds the lookup keys and calls into the store.

/** Convert a topic name to the same slug used by pregenerate-assets.ts */
function slugifyTopic(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** Load a pregenerated lesson: by curriculum concept id first (one record
 * per concept — two courses can share a concept LABEL, e.g. "Photosynthesis"
 * in Grade 7 and Grade 9, so the label is not a safe cache key), then by
 * topic slug for ad-hoc topics typed into the topic picker. */
async function loadPregen(topic: string, conceptId?: string): Promise<PregenRecord | null> {
  const candidates = [
    ...(conceptId && /^[a-z0-9-]+$/.test(conceptId) ? [conceptId] : []),
    slugifyTopic(topic),
  ];
  return getPregenAsync(candidates);
}

/** The key a lesson for this concept/topic is stored under. */
function pregenKey(topic: string, conceptId?: string): string {
  return conceptId && /^[a-z0-9-]+$/.test(conceptId) ? String(conceptId) : slugifyTopic(topic);
}

/** The curriculum concept (and its course) behind a concept id, if any. */
async function findConcept(conceptId?: string): Promise<{ concept: CurriculumConcept; course: CurriculumSubject } | null> {
  if (!conceptId) return null;
  try {
    for (const course of await listCurriculaAsync()) {
      const concept = course.concepts.find((c) => c.id === conceptId);
      if (concept) return { concept, course };
    }
  } catch (err: any) {
    console.warn('[findConcept] curriculum lookup failed (non-fatal):', err?.message);
  }
  return null;
}

/** What the picture generator knows about a lesson: the concept's own authored
 * material (key facts, verified worked examples, misconceptions, ladder,
 * representation ideas) for a course concept; just the topic otherwise. */
async function visualContextFor(topic: string, grade: string, conceptId?: string): Promise<VisualConceptContext> {
  const found = await findConcept(conceptId);
  return found ? conceptContext(found.concept, found.course, grade) : adHocContext(topic, grade);
}

/** An empty legacy diagram: keeps older UI code that reads lessonData.diagram
 * safe without showing the static generator's generic template. */
const EMPTY_DIAGRAM = { diagramType: 'flow' as const, title: '', description: '', nodes: [], connections: [] };

/** Attach a record's board pictures to lesson data for the browser. Only pictures that
 * passed the quality gates are in `record.visuals` (failures live in `visualsQuarantine`). */
function withVisuals(lesson: any, record: PregenRecord | null): any {
  const visuals = record?.visuals;
  if (!visuals?.[VISUAL_KEYS.main]) return lesson;
  return { ...lesson, visual: visuals[VISUAL_KEYS.main], visual3d: visuals[VISUAL_KEYS.space] ?? null };
}

// Console output is also written to logs/server-<start>.log so it can be read without the terminal.
try {
  fs.mkdirSync('logs', { recursive: true });
  const logFile = `logs/server-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
  const out = fs.createWriteStream(logFile, { flags: 'a' });
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...a: any[]) => {
      orig(...a);
      try { out.write(`${new Date().toISOString()} [${level}] ${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`); } catch { /* logging must never break the server */ }
    };
  }
} catch { /* read-only disk: keep console-only */ }

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;
// Cloud Run / Hosting terminate TLS and forward the original host/proto.
app.set('trust proxy', true);

// How long the voice model may be kept waiting for a diagnosis. The Live tool
// call blocks speech, so this is felt directly as silence by the child.
// Measured in a real session (2026-09-30): the diagnosis takes 3.1-4.3 s on gemini-3.6-flash, so the old
// 2.5 s budget timed out on EVERY answer and the generic 'transfer move' replaced the real diagnosis.
const ASSESS_BUDGET_MS = Number(process.env.ASSESS_BUDGET_MS) || 6500;

app.use(express.json());

// Browser-side events (board pictures, front-end errors) land in the same log as the server's.
app.post('/api/client-log', (req, res) => {
  const { tag, msg } = req.body || {};
  console.log(`[client] ${String(tag || '').slice(0, 40)} ${String(msg || '').slice(0, 600)}`);
  res.json({ ok: true });
});

// API health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

// Lesson for a topic/concept: served from the pregen store when it exists;
// otherwise the lesson text and the main board picture are generated in
// parallel, the picture fact-checked, and both saved so they are never
// generated (or billed) again.
app.post('/api/generate-lesson', async (req, res) => {
  const { topic, grade, conceptId } = req.body;
  const targetTopic = topic || 'Photosynthesis';
  const targetGrade = grade || 'Middle School (Grade 6-8)';

  // ── Cache-first: serve pre-generated lesson if available ─────────────────
  const cached = await loadPregen(targetTopic, conceptId);
  if (cached?.lessonData) {
    // Merge with the static generator so every UI field exists (e.g. the explorer's
    // calculateOutcome) — but its generic template diagram / 3D scene / photo never stand in for
    // content the lesson does not have (D7), and tutor-only fields never leave the server.
    const staticBase = createDynamicLesson(targetTopic, targetGrade);
    const { scene3d: _s, photoVisual: _p, ...base } = staticBase as any;
    const merged: any = { ...base, ...publicLesson(cached.lessonData), diagram: EMPTY_DIAGRAM };
    const data = withVisuals(merged, cached);
    const photo = verifiedPhoto(cached);
    console.log(`[API /api/generate-lesson] Cache HIT for "${targetTopic}"${data.visual ? ' (with board pictures)' : ' (no board pictures yet — npm run pregen -- --visuals-only)'}${photo.photoUrl ? ' + verified photo' : ''}`);
    return res.json({ success: true, data, photoUrl: photo.photoUrl, photoCaption: photo.photoCaption, source: 'pregenerated-cache' });
  }
  console.log(`[API /api/generate-lesson] Cache MISS for "${targetTopic}" — generating`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ fallback: true, message: 'Using local generator fallback (GEMINI_API_KEY not set)' });
  }

  try {
    const found = await findConcept(conceptId);
    const ctx = found ? conceptContext(found.concept, found.course, targetGrade) : adHocContext(targetTopic, targetGrade);
    const model = gatewayModel(apiKey, 0, 40_000);
    const cacheKey = pregenKey(targetTopic, conceptId);

    // Lesson text and teaching picture are independent: two gated generators, one wait.
    // (A child is waiting, so 2 attempts each; the pregen run uses 3 with a larger budget.)
    const [text, picture] = await Promise.all([
      generateLessonText(ctx, { model, prerequisiteDetails: found?.concept.prerequisiteDetails, maxAttempts: 1, critic: false, seed: cacheKey, timeoutMs: 40_000 })
        .catch((err: any) => ({ lesson: null, quality: [], attempts: 0, criticRan: false, error: String(err?.message || err) } as Awaited<ReturnType<typeof generateLessonText>>)),
      generateBoardVisual(ctx, { purpose: 'teach' }, { model, timeoutMs: 40_000, label: 'main.live', maxAttempts: 1, critic: false })
        .catch((err: any) => ({ visual: null, issues: [], quality: [], attempts: 0, keyFactsCovered: [], criticRan: false, error: String(err?.message || err) } as Awaited<ReturnType<typeof generateBoardVisual>>)),
    ]);

    if (text.lesson) {
      let mainPicture = picture.visual;
      // The picture was drawn in parallel, so only now is the quiz known: a picture that states its answer is dropped.
      if (mainPicture && errorsOf(lintPictureVsQuiz(mainPicture, text.lesson.quiz, VISUAL_KEYS.main)).length) {
        console.warn('[API /api/generate-lesson] board picture states the quiz answer — not shown or saved');
        mainPicture = null;
      }
      try {
        const existing = await getPregenAsync([cacheKey]);
        if (!existing?.lessonData) {
          await savePregenAsync(cacheKey, {
            topic: targetTopic, grade: targetGrade, conceptId: conceptId || undefined, slug: cacheKey,
            generatedAt: new Date().toISOString(),
            lessonData: text.lesson,
            visuals: { ...(existing?.visuals || {}), ...(mainPicture ? { [VISUAL_KEYS.main]: mainPicture } : {}) },
            visualsDeclined: existing?.visualsDeclined,
            visualsQuarantine: { ...(existing?.visualsQuarantine || {}), ...(picture.withheld && picture.quarantined ? { [VISUAL_KEYS.main]: { visual: picture.quarantined, issues: picture.quality } } : {}) },
            photoUrl: existing?.photoUrl ?? null, photoMeta: existing?.photoMeta,
            quality: { version: 'quality-v1', checkedAt: new Date().toISOString(), errors: 0, warnings: text.quality.length + picture.quality.length, criticRan: text.criticRan && picture.criticRan, coverageGaps: [], untaughtLadderItems: [], withheld: picture.withheld ? [VISUAL_KEYS.main] : [], notes: ['generated live on a cache miss (2 attempts) — run npm run pregen for the full pass'] },
          });
          console.log(`[API /api/generate-lesson] Saved new lesson${mainPicture ? ' and board picture' : ''} to pregen store: ${cacheKey}`);
        }
      } catch (cacheErr: any) {
        console.warn('[API /api/generate-lesson] Cache save failed (non-fatal):', cacheErr.message);
      }
      const { scene3d: _s, photoVisual: _p, ...base } = createDynamicLesson(targetTopic, targetGrade) as any;
      const lesson = { ...base, ...publicLesson(text.lesson), diagram: EMPTY_DIAGRAM, visual: mainPicture ?? null, visual3d: null };
      return res.json({ success: true, data: lesson, source: 'gemini' });
    }

    // Fail closed: a lesson that failed the gates is NOT shown as if it were sound. The curriculum-engine
    // lesson is a plain template; the response says so.
    console.warn(`[API /api/generate-lesson] no lesson passed the quality gates for "${targetTopic}" (${text.withheld ? 'withheld: ' + text.quality.map((q) => q.message).join('; ').slice(0, 300) : text.error || 'unknown'}) — serving the curriculum-engine template`);
    return res.json({ success: true, data: createDynamicLesson(targetTopic, targetGrade), source: 'intelligent-curriculum-engine' });
  } catch (err: any) {
    console.error('[API /api/generate-lesson] Error in lesson generation pipeline:', err?.message || err);
    return res.status(200).json({ success: true, data: createDynamicLesson(targetTopic, targetGrade), source: 'intelligent-curriculum-engine' });
  }
});

/** Which picture a focus asks for: a known misconception gets its contrast case,
 * "apply" gets the application picture, anything else a focused teaching picture. */
function visualRequestFor(ctx: VisualConceptContext, focus: string): { req: VisualRequest; key: string } {
  const f = focus.trim();
  if (/^apply\b/i.test(f)) {
    const item = ctx.ladderItems.find((l) => l.level === 3) || ctx.ladderItems.find((l) => l.level === 4);
    if (item) return { req: { purpose: 'apply', item }, key: VISUAL_KEYS.apply };
  }
  const bare = f.replace(/^contrast\s*:?\s*/i, '');
  const m = ctx.misconceptions
    .map((mis) => ({ mis, score: Math.max(matchScore(bare, mis.belief), mis.id ? matchScore(bare, mis.id.replace(/-/g, ' ')) : 0) }))
    .filter((x) => x.score >= 0.6)
    .sort((a, b) => b.score - a.score)[0]?.mis;
  if (m) {
    const id = m.id || misconceptionKey(m.belief);
    return { req: { purpose: 'contrast', misconception: { ...m, id } }, key: VISUAL_KEYS.contrast(id) };
  }
  return { req: { purpose: 'teach', focus: f }, key: VISUAL_KEYS.focus(slugifyTopic(f)) };
}

// The tutor asked to show something specific (update_diagram tool, or the
// board's own request). Prepared pictures are used first — the contrast case
// for a misconception, the application picture, anything drawn before for this
// focus — and only on a miss is a new picture drawn, fact-checked and saved.
// There is no generic fallback: if nothing can be drawn, the board keeps the
// picture it already has rather than show a template.
// ── Guided mode (src/guided) ─────────────────────────────────────
// The server's default mode, and the prepared lesson script for a concept.
app.get('/api/tutor-mode', (_req, res) => {
  res.json({
    default: resolveTutorMode(undefined, process.env.TUTOR_MODE),
    guidedConcepts: ALL_GUIDED_SCRIPTS.map((s) => s.conceptId),
  });
});

app.get('/api/guided-script', async (req, res) => {
  const conceptId = String(req.query.conceptId || '');
  const script = getGuidedScript(conceptId);
  if (!script) return res.status(404).json({ error: 'No guided lesson for this concept.' });
  try {
    const record = await loadPregen(String(req.query.topic || ''), conceptId);
    res.json(buildGuidedPayload(script, (record?.visuals ?? null) as Record<string, unknown> | null));
  } catch (err: any) {
    console.warn('[guided] could not load pictures for', conceptId, err?.message);
    res.json(buildGuidedPayload(script, null));
  }
});

app.post('/api/update-diagram', async (req, res) => {
  const { topic, grade, focus, conceptId } = req.body;
  const targetTopic = String(topic || '');
  const targetGrade = String(grade || 'Grade 8');
  const focusText = String(focus || targetTopic);

  const record = await loadPregen(targetTopic, conceptId);
  const hit = findVisualForFocus(record?.visuals, focusText, slugifyTopic);
  if (hit) {
    console.log(`[API /api/update-diagram] "${focusText}" → prepared picture "${hit.key}" (${hit.visual.title})`);
    return res.json({ success: true, visual: hit.visual, key: hit.key, source: 'pregenerated-cache' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.json({ success: false, error: 'GEMINI_API_KEY not set — keeping the current picture' });

  try {
    const ctx = await visualContextFor(targetTopic, targetGrade, conceptId);
    let { req: visualReq, key } = visualRequestFor(ctx, focusText);
    // An older lesson with no picture at all, asked for the topic itself: draw its main
    // teaching picture and keep it as such, so every later load has it.
    if (!record?.visuals?.[VISUAL_KEYS.main] && slugifyTopic(focusText) === slugifyTopic(targetTopic)) {
      visualReq = { purpose: 'teach' };
      key = VISUAL_KEYS.main;
    }
    console.log(`[API /api/update-diagram] no prepared picture for "${focusText}" — drawing a ${visualReq.purpose} picture`);
    const r = await generateBoardVisual(ctx, visualReq, { apiKey, timeoutMs: 20_000, label: `${visualReq.purpose}.live`, maxAttempts: 1, critic: false, key, quiz: record?.lessonData?.quiz });
    if (!r.visual) return res.json({ success: false, error: r.error || 'no picture could be drawn — keeping the current one' });

    // Persist so this focus is never drawn (or billed) twice for this concept.
    try {
      const cacheKey = pregenKey(targetTopic, conceptId);
      const existing = await getPregenAsync([cacheKey]);
      await savePregenAsync(cacheKey, {
        ...(existing ?? {
          topic: targetTopic, grade: targetGrade, conceptId: conceptId || undefined, slug: cacheKey,
          generatedAt: new Date().toISOString(), lessonData: null, photoUrl: null,
        }),
        visuals: { ...(existing?.visuals || {}), [key]: r.visual },
      });
      console.log(`[API /api/update-diagram] saved picture "${key}" to pregen store: ${cacheKey}`);
    } catch (cacheErr: any) {
      console.warn('[API /api/update-diagram] Cache save failed (non-fatal):', cacheErr.message);
    }
    return res.json({ success: true, visual: r.visual, key, source: 'gemini' });
  } catch (err: any) {
    console.error('[API /api/update-diagram] Error:', err?.message);
    return res.json({ success: false, error: 'picture generation failed — keeping the current picture' });
  }
});

// Lesson photo. Two cases (docs/BOARD_VISUALS.md §Photos, decision D6):
//   default (no prompt) — the concept's lesson-specific photo: served from the pregen store only when a vision
//     review verified it; otherwise planned from the concept's key facts, generated, reviewed, and cached only if verified;
//   custom prompt (the child or tutor asked to see something) — generated and reviewed against that request, never cached.
// An image nobody has looked at is never returned, and there is no stock-photo fallback: on failure the answer is
// { success:false } and the UI says so. Every image is labelled AI-generated with the reviewer's neutral caption.
app.post('/api/generate-image', async (req, res) => {
  const { prompt: userPrompt, topic, conceptId, grade } = req.body || {};
  const cacheKey = !userPrompt
    ? (conceptId && /^[a-z0-9-]+$/.test(conceptId) ? String(conceptId) : slugifyTopic(topic || 'science'))
    : null;
  if (cacheKey) {
    const cached = await getPregenAsync([cacheKey]);
    const photo = verifiedPhoto(cached);
    if (photo.photoUrl) {
      console.log(`[API /api/generate-image] Cache HIT for "${topic}" — serving verified photo`);
      return res.json({ success: true, imageUrl: photo.photoUrl, caption: photo.photoCaption, aiGenerated: true, source: 'pregenerated-cache' });
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.json({ success: false, error: 'Picture generation is not configured on this server.' });

  try {
    const targetTopic = String(topic || 'Science');
    const found = await findConcept(conceptId);
    const ctx = found ? conceptContext(found.concept, found.course, grade) : adHocContext(targetTopic, String(grade || 'Grade 8'));
    const model = gatewayModel(apiKey, 0, 60_000);
    const imageGen = geminiImageGenerator(apiKey);

    if (userPrompt) {
      const wanted = String(userPrompt).slice(0, 300);
      const scene = `${wanted}. A clear, realistic, uncluttered educational image. Do not put any words, letters, numbers or labels anywhere in the image.`;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const img = await imageGen(scene);
        if (!img) continue;
        const review = await reviewPhoto(model, ctx, wanted, img);
        if (!review.ran) break; // never show an image nobody has looked at
        if (review.ok) return res.json({ success: true, imageUrl: `data:${img.mimeType};base64,${img.data}`, caption: review.caption, aiGenerated: true, promptUsed: wanted });
      }
      return res.json({ success: false, error: 'I could not make a picture of that I trust to be accurate. Try describing it another way.' });
    }

    const out = await generateVerifiedPhoto(ctx, { model, imageGen });
    const existing = await getPregenAsync([cacheKey!]);
    try {
      await savePregenAsync(cacheKey!, {
        ...(existing ?? { topic: targetTopic, conceptId: conceptId || undefined, slug: cacheKey!, generatedAt: new Date().toISOString(), lessonData: null }),
        photoUrl: out.photoUrl, photoMeta: out.meta ?? existing?.photoMeta,
      });
    } catch (cacheErr: any) { console.warn('[API /api/generate-image] Cache save failed (non-fatal):', cacheErr.message); }
    if (!out.photoUrl) return res.json({ success: false, error: 'No verified picture is available for this topic yet.' });
    return res.json({ success: true, imageUrl: out.photoUrl, caption: out.meta?.caption, aiGenerated: true, promptUsed: out.meta?.intent });
  } catch (err: any) {
    console.error('[API /api/generate-image] failed:', err?.message);
    return res.json({ success: false, error: 'Picture generation failed — please try again.' });
  }
});

// Generalized Tools for Gemini Live Interactive Voice Session
// Voice tools — restored verbatim from pythagoras-tutor-old (21 Sep).
const dynamicFunctionDeclarations = [
  {
    name: 'update_chalkboard_notes',
    description: 'Writes or updates lecture notes, definitions, formulas, or bullet points on the digital chalkboard.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Title of the notes section' },
        bulletPoints: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Key bullet points or steps to write on the board',
        },
        coreRuleOrFormula: {
          type: Type.STRING,
          description: 'Optional core governing formula, law, or golden rule to highlight in golden chalk',
        },
      },
      required: ['bulletPoints'],
    },
  },
  {
    name: 'write_live_note',
    description: 'Appends an instant chalk bullet note to the board while actively explaining a specific detail.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        note: { type: Type.STRING, description: 'The exact short note or insight to write' },
      },
      required: ['note'],
    },
  },
  {
    name: 'switch_board_view',
    description:
      'Switches the digital blackboard view to focus the student on a specific visual mode requested by them or decided by you. Modes: 2d (schematic / concept diagram), 3d (interactive 3D spatial model), photo (photorealistic image / scientific camera visual), chalkboard (lecture notes), explorer (simulation sandbox), quiz (question).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tab: {
          type: Type.STRING,
          enum: ['2d', '3d', 'photo', 'chalkboard', 'explorer', 'quiz'],
          description: 'The visual blackboard view tab to display',
        },
      },
      required: ['tab'],
    },
  },
  {
    name: 'generate_photo_visual',
    description: 'Generates a new photorealistic image or visual study on the blackboard when requested by the student.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: { type: Type.STRING, description: 'Detailed prompt for the realistic photo or visual' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'set_topic',
    description: 'Switches or changes the learning topic on the fly to a new topic requested by the student.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, description: 'The new topic to teach on the fly' },
        grade: { type: Type.STRING, description: 'Optional grade level' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'highlight_concept',
    description: 'Highlights a specific concept node or term on the blackboard to draw student attention.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        nodeIdOrName: { type: Type.STRING, description: 'The node ID or title to highlight' },
      },
      required: ['nodeIdOrName'],
    },
  },
  {
    name: 'pose_quiz',
    description: 'Presents an interactive concept check question on the blackboard for the student to solve.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        question: { type: Type.STRING, description: 'The challenge question' },
        options: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Four multiple choice options',
        },
        correctIndex: { type: Type.NUMBER, description: '0-indexed correct option' },
        explanation: { type: Type.STRING, description: 'Why this answer is correct' },
      },
      required: ['question', 'options', 'correctIndex', 'explanation'],
    },
  },
];


// ═══════════════════════════════════════════════════════════════
// Any curriculum — looks up an uploaded textbook curriculum by id.
function curriculumFor(subjectId: string) {
  return getCurriculum(subjectId);
}

// MULTER for PDF uploads
// ═══════════════════════════════════════════════════════════════
// Streams to a temp file instead of memory: a scanned textbook is 100+ MB.
const UPLOAD_DIR = path.join(os.tmpdir(), 'pt-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 500 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(new Error(`"${file.originalname}" is not a PDF`));
  },
});

// ─── Curriculum library (docs/CURRICULUM.md §5–§6) ─────────────
// A course = board + grade + subject. Students see only the courses for
// their own board + grade; uploading and deleting is admin-only.

/** Lightweight course shape for the subject selector / onboarding. */
function courseSummary(c: any) {
  return {
    subjectId: c.id,
    label: c.label,
    subject: c.subject || c.label,
    board: c.board || null,
    gradeLevel: c.gradeLevel ?? gradeLevelFromLabel(c.grade) ?? null,
    grade: c.grade,
    subjectMode: subjectModeForCurriculum(c),
    source: c.source,
    conceptCount: c.concepts.length,
    concepts: c.concepts.map((con: any) => ({
      id: con.id,
      label: con.label,
      typicalTeachingOrder: con.typicalTeachingOrder,
      prerequisites: con.prerequisites || [],
      chapter: con.chapter || null,
      chapterId: con.chapterId || null,
      chapterNumber: con.chapterNumber ?? null,
    })),
  };
}

// GET /api/curricula?board=IGCSE&grade=8 — courses, optionally filtered to a
// learner's board + grade. No filter = every course (admin/parent views).
app.get('/api/curricula', async (req, res) => {
  const all = await listCurriculaAsync();
  const board = typeof req.query.board === 'string' ? req.query.board : undefined;
  const grade = typeof req.query.grade === 'string' ? req.query.grade : undefined;
  const filtered = (board || grade)
    ? all.filter(c => courseMatchesLearner(c, { board, gradeLevel: gradeLevelFromLabel(grade), grade }))
    : all;
  res.json({ curricula: filtered.map(courseSummary) });
});

// GET /api/catalog — what signup and the admin form can offer: known boards
// plus any board in the library, grades 1–12, and which board+grade pairs
// actually have content.
app.get('/api/catalog', async (_req, res) => {
  const all = await listCurriculaAsync();
  const available = all
    .filter(c => c.board && (c.gradeLevel ?? gradeLevelFromLabel(c.grade)))
    .map(c => ({ board: c.board!, gradeLevel: (c.gradeLevel ?? gradeLevelFromLabel(c.grade))!, subject: c.subject || c.label, subjectId: c.id }));
  const boards = [...new Set([...available.map(a => a.board), ...KNOWN_BOARDS])];
  res.json({ boards, grades: GRADE_LEVELS.map(g => ({ level: g, label: gradeLabel(g) })), available });
});

// GET /api/admin/check — lets the admin screen validate a token before use.
app.get('/api/admin/check', async (req, res) => {
  const r = await checkAdmin(req);
  if (r.ok) return res.json({ ok: true, via: r.via });
  res.status(r.status || 401).json({ ok: false, error: r.error });
});

// GET /api/admin/courses — full course list with verification reports.
app.get('/api/admin/courses', requireAdmin, async (_req, res) => {
  const all = await listCurriculaAsync();
  res.json({
    courses: all.map(c => ({
      ...courseSummary(c),
      sources: c.sources || [],
      conceptTypes: c.conceptTypes || {},
      verification: c.verification || null,
      scopeSources: [...new Set((c.scopeMaps || []).map(s => s.source || 'unknown'))],
      prerequisiteEdges: c.concepts.reduce((n, x) => n + (x.prerequisites?.length || 0), 0),
      updatedAt: c.updatedAt || null,
      busy: isCourseBusy(c.id),
    })),
  });
});

// DELETE /api/admin/courses/:id — remove a course from the library.
app.delete('/api/admin/courses/:id', requireAdmin, async (req, res) => {
  if (isCourseBusy(req.params.id)) return (res as any).status(409).json({ error: 'That course is being ingested right now.' });
  const ok = await deleteCurriculum(req.params.id);
  if (!ok) return (res as any).status(404).json({ error: 'Course not found' });
  res.json({ ok: true });
});

// POST /api/curriculum/upload — ADMIN ONLY. Textbook PDF(s) + optional
// official syllabus PDF(s) + chapterLimit (number | "all", default 3) for one board + grade + subject → background
// ingest job (split → extract → structure → AI review → publish).
// requireAdmin runs BEFORE multer so an unauthorised upload is never written to disk.
app.post('/api/curriculum/upload',
  requireAdmin,
  upload.fields([{ name: 'textbooks', maxCount: 10 }, { name: 'syllabus', maxCount: 3 }, { name: 'pdfs', maxCount: 10 }]),
  (req: any, res: any) => {
    const textbooks: any[] = [...(req.files?.textbooks || []), ...(req.files?.pdfs || [])];
    const syllabi: any[] = [...(req.files?.syllabus || [])];
    const all = [...textbooks, ...syllabi];
    const cleanup = () => all.forEach(f => fs.promises.unlink(f.path).catch(() => {}));
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { cleanup(); return res.status(500).json({ error: 'GEMINI_API_KEY not set on the server' }); }
    if (!textbooks.length) { cleanup(); return res.status(400).json({ error: 'Add at least one textbook PDF.' }); }
    const board = normaliseBoard(String(req.body.board || ''));
    const subject = normaliseSubject(String(req.body.subject || ''));
    const gradeLevel = gradeLevelFromLabel(String(req.body.grade || ''));
    if (!board || !subject || !gradeLevel) {
      cleanup();
      return res.status(400).json({ error: 'Board, grade (1–12) and subject are all required.' });
    }
    // Chapter limit (D-2026-09-26-9): "all" = the whole book; a number = only
    // the first N chapters are read and published. Missing field → the
    // DEFAULT_CHAPTER_LIMIT env var, else 3 — the demo-safe default, so a
    // direct API call can never read and pre-generate a whole book by accident.
    const rawLimit = String(req.body.chapterLimit ?? process.env.DEFAULT_CHAPTER_LIMIT ?? '3').trim().toLowerCase();
    const chapterLimit = rawLimit === 'all' || rawLimit === '0' ? undefined : Number.parseInt(rawLimit, 10);
    if (chapterLimit !== undefined && (!Number.isFinite(chapterLimit) || chapterLimit < 1 || chapterLimit > 200)) {
      cleanup();
      return res.status(400).json({ error: 'Chapters to load must be a number from 1 to 200, or "all".' });
    }
    const courseId = makeCourseId(board, gradeLevel, subject);
    if (isCourseBusy(courseId)) {
      cleanup();
      return res.status(409).json({ error: `${board} · ${gradeLabel(gradeLevel)} · ${subject} is already being ingested — wait for that job to finish.` });
    }
    const job = startIngestJob({
      apiKey, board, gradeLevel, subject,
      textbooks: textbooks.map(f => ({ path: f.path, originalName: f.originalname })),
      syllabi: syllabi.map(f => ({ path: f.path, originalName: f.originalname })),
      chapterLimit,
    });
    res.json({ success: true, jobId: job.id, subjectId: courseId, chapterLimit: chapterLimit ?? 'all' });
  });

// GET /api/curriculum/jobs/:id — progress of an ingestion job (admin).
app.get('/api/curriculum/jobs/:id', requireAdmin, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return (res as any).status(404).json({ error: 'Unknown job (the server may have restarted)' });
  res.json({ job });
});

// Errors on /api routes are always JSON. Without this, an oversized upload
// returned Express's HTML error page and the browser failed on "<!DOCTYPE".
app.use('/api', (err: any, _req: any, res: any, _next: any) => {
  const tooBig = err?.code === 'LIMIT_FILE_SIZE';
  const tooMany = err?.code === 'LIMIT_FILE_COUNT';
  res.status(tooBig ? 413 : 400).json({
    error: tooBig ? 'That file is over 500 MB.'
      : tooMany ? 'Upload at most 10 PDFs at a time.'
      : String(err?.message || 'Upload failed'),
  });
});

// ─── Learner endpoints ──────────────────────────────────────────
// Storage backend (file vs Firestore) is decided inside src/adaptive/repo
// (T03) — these routes no longer branch on it directly. Ownership is
// enforced by requireAuth/requireOwnership (T02); DEV bypass only under
// NODE_ENV=development && ALLOW_DEV_AUTH_BYPASS=true.

app.get('/api/learners', requireAuth, async (_req, res) => {
  try {
    res.json({ learners: await listLearners() });
  } catch (err: any) {
    console.error('[API /api/learners]', err);
    res.status(500).json({ error: err?.message || 'Failed to list learners' });
  }
});
app.get('/api/learners/:studentId', requireAuth, requireOwnership, async (req, res) => {
  try {
    const l = await getLearner(req.params.studentId);
    if (!l) return (res as any).status(404).json({ error: 'Not found' });
    res.json({ learner: l });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load learner' });
  }
});
app.post('/api/learners', requireAuth, async (req, res) => {
  try {
    const { studentId, name, grade, board } = req.body;
    if (!studentId || !name || !grade)
      return (res as any).status(400).json({ error: 'studentId, name, grade required' });
    if ((req as any).authUid !== String(studentId))
      return (res as any).status(403).json({ error: 'Not authorized for this learner profile' });
    // docs/CURRICULUM.md §6: board + grade chosen at signup decide which
    // courses this learner sees. The grade is stored both as a number (for
    // matching and the age band) and as a display label.
    const gradeLevel = gradeLevelFromLabel(req.body.gradeLevel ?? grade);
    res.json({
      learner: await getOrCreateLearner(studentId, name, gradeLevel ? gradeLabel(gradeLevel) : String(grade), {
        board: board ? normaliseBoard(String(board)) : undefined,
        gradeLevel,
      }),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to create learner' });
  }
});
app.delete('/api/learners/:studentId', requireAuth, requireOwnership, async (req, res) => {
  try {
    await deleteLearner(req.params.studentId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to delete learner' });
  }
});
app.post('/api/learners/:studentId/onboarding', requireAuth, requireOwnership, async (req, res) => {
  try {
    const { studentId } = req.params;
    const learner = await getLearner(studentId);
    if (!learner) return (res as any).status(404).json({ error: 'Not found' });
    const { interests, subjectFeelings, accessibility, languagePrefs, ageBand } = req.body || {};
    learner.onboarding = {
      interests: Array.isArray(interests) ? interests : [],
      subjectFeelings: subjectFeelings || {},
      accessibility: accessibility || {},
      languagePrefs,
      completedAt: Date.now(),
    };
    if (ageBand) learner.ageBand = ageBand;
    learner.updatedAt = Date.now();
    await getRepo().saveProfile(learner);
    res.json({ learner });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to save onboarding' });
  }
});
// The child names their tutor at login (docs/TUTOR_PERSONA.md §2). Saved on the profile so the
// next login pre-fills it. The name is cleaned here too: never trust the browser.
app.post('/api/learners/:studentId/tutor-name', requireAuth, requireOwnership, async (req, res) => {
  try {
    const learner = await getLearner(req.params.studentId);
    if (!learner) return (res as any).status(404).json({ error: 'Not found' });
    const name = sanitiseTutorName(req.body?.name);
    if (!name) return (res as any).status(400).json({ error: 'Please pick a different name (letters and numbers, up to 24 characters).' });
    learner.tutorName = name;
    learner.updatedAt = Date.now();
    await getRepo().saveProfile(learner);
    res.json({ tutorName: name });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to save tutor name' });
  }
});
app.get('/api/learners/:studentId/events', requireAuth, requireOwnership, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { conceptId, limit } = req.query as { conceptId?: string; limit?: string };
    const events = await getRepo().listEvents(studentId, {
      conceptId, limit: limit ? Number(limit) : undefined,
    });
    res.json({ events });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load events' });
  }
});

// T21 (FR-22) — "That's not right" on the learner card. See disputeMisconception's
// comment in learnerStore.ts for why this marks the ledger entry rather than a
// separate claim (T14's profiler/claim validator isn't built yet).
app.post(
  '/api/learners/:studentId/subjects/:subjectId/concepts/:conceptId/misconceptions/:misconceptionId/dispute',
  requireAuth, requireOwnership,
  async (req, res) => {
    try {
      const { studentId, subjectId, conceptId, misconceptionId } = req.params;
      const rec = await disputeMisconception(studentId, subjectId, conceptId, misconceptionId);
      if (!rec) return (res as any).status(404).json({ error: 'Misconception not found' });
      res.json({ misconception: rec });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to dispute misconception' });
    }
  },
);

// T22 (FR-20) — parent/teacher marks a PARK_AND_ESCALATE event as reviewed
// from the Parent Portal, so it stops showing as needing attention.
app.post(
  '/api/learners/:studentId/escalations/:escalationId/resolve',
  requireAuth, requireOwnership,
  async (req, res) => {
    try {
      const { studentId, escalationId } = req.params;
      const { note } = req.body || {};
      const rec = await resolveEscalation(studentId, escalationId, note);
      if (!rec) return (res as any).status(404).json({ error: 'Escalation not found' });
      res.json({ escalation: rec });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to resolve escalation' });
    }
  },
);

// ─── Adaptive session endpoints ─────────────────────────────────
app.post('/api/session/start', requireAuth, async (req, res) => {
  try {
    const { studentId, name, grade, subjectId, channel, conceptId } = req.body;
    if (!studentId || !subjectId)
      return (res as any).status(400).json({ error: 'studentId and subjectId required' });
    if ((req as any).authUid !== String(studentId))
      return (res as any).status(403).json({ error: 'Not authorized for this learner profile' });

    const curriculum = getCurriculum(subjectId);
    if (!curriculum) return (res as any).status(404).json({ error: 'Curriculum not found' });
    const learner = await getOrCreateLearner(studentId, name || 'Student', grade || curriculum.grade);
    await ensureSubject(studentId, subjectId, curriculum.label, curriculum.grade, curriculum.source);

    // Bug found 2026-09-26: this route always auto-picked
    // nextUnmasteredConcept() regardless of which concept the student
    // actually clicked in SubjectSelector.tsx — the UI's per-concept picker
    // had no effect on which concept the tutor started on. requestedConceptId
    // was already a first-class concept in compileTeachingPlan() (T17), just
    // never threaded through from this route. Fixed: an explicit conceptId
    // is honored (falling back to auto-pick if it's not in the curriculum),
    // and App.tsx's handleSubjectConceptSelect now sends it.
    const requestedConcept = conceptId ? curriculum.concepts.find(c => c.id === conceptId) : undefined;
    const masteredIds = Object.values(learner.subjects[subjectId]?.conceptStates || {})
      .filter(cs => isConceptMastered(cs)).map(cs => cs.conceptId);
    const nextConcept = requestedConcept || nextUnmasteredConcept(curriculum, masteredIds) || curriculum.concepts[0];
    await ensureConceptState(studentId, subjectId, nextConcept.id, nextConcept.label, 'direct_explanation', conceptTypeFor(nextConcept));

    const sessionId = `session_${Date.now()}_${studentId}`;

    // T17/T18: compile the per-learner Teaching Plan before the tutor opens.
    let plan: TeachingPlan | null = null;
    try {
      const refreshedLearner = await getLearner(studentId);
      if (refreshedLearner) {
        plan = compileTeachingPlan(refreshedLearner, curriculum, {
          studentId, subjectId, channel: channel === 'text' ? 'text' : 'voice', requestedConceptId: nextConcept.id,
        });
        await getRepo().savePlan(studentId, plan.planVersion, plan);
      }
    } catch (planErr: any) {
      console.error('[session/start] plan compile failed (continuing without a plan)', planErr?.message || planErr);
    }

    const session: AdaptiveSessionState = {
      sessionId, studentId, subjectId,
      currentConceptId: nextConcept.id,
      currentStrategy: 'direct_explanation',
      sessionStarted: Date.now(),
      interactionCount: 0,
      recentAttempts: [],
    };
    startSession(session);
    (session as any).planVersion = plan?.planVersion;
    res.json({
      sessionId, learner, currentConcept: nextConcept,
      conceptState: await getConceptState(studentId, subjectId, nextConcept.id),
      strategy: 'direct_explanation',
      plan,
    });
  } catch (err: any) {
    console.error('[POST /api/session/start]', err);
    res.status(500).json({ error: err?.message || 'Failed to start session' });
  }
});

app.get('/api/session/:sessionId', requireAuth, async (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return (res as any).status(404).json({ error: 'Session not found' });
  if ((req as any).authUid !== session.studentId)
    return (res as any).status(403).json({ error: 'Not authorized for this session' });
  const learner = await getLearner(session.studentId);
  const curriculum = getCurriculum(session.subjectId);
  const concept = curriculum?.concepts.find(c => c.id === session.currentConceptId);
  const conceptState = await getConceptState(session.studentId, session.subjectId, session.currentConceptId);
  res.json({ session, learner, currentConcept: concept, conceptState });
});

app.post('/api/session/:sessionId/assess', requireAuth, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return (res as any).status(500).json({ error: 'No API key' });
  const session = getSession(req.params.sessionId);
  if (!session) return (res as any).status(404).json({ error: 'Session not found' });
  if ((req as any).authUid !== session.studentId)
    return (res as any).status(403).json({ error: 'Not authorized for this session' });

  const { questionSummary, studentAnswer, correctAnswer, selectedOptionIndex } = req.body;
  const reasoning = cleanReasoning(req.body?.reasoning);

  const curriculum = getCurriculum(session.subjectId);
  const concept = curriculum?.concepts.find(c => c.id === session.currentConceptId);
  if (!concept) return (res as any).status(404).json({ error: 'Concept not found' });

  // The stored quiz is the source of truth for the key and the tutor-only notes (they are not sent to the browser).
  // The pick is matched by option TEXT, so a client that re-ordered options still resolves correctly.
  const stored = (await loadPregen(concept.label, concept.id))?.lessonData?.quiz;
  const pickedIdx = stored && Array.isArray(stored.options) ? stored.options.findIndex((o: string) => o === studentAnswer) : -1;
  const storedMatches = !!stored && stored.question === questionSummary && pickedIdx >= 0;
  const correctOptionIndex = storedMatches ? stored.correctIndex : req.body.correctOptionIndex;
  const isCorrect = storedMatches ? pickedIdx === stored.correctIndex : selectedOptionIndex === correctOptionIndex;
  const conceptState = await getConceptState(session.studentId, session.subjectId, concept.id);
  if (!conceptState) return (res as any).status(404).json({ error: 'Concept state not found' });

  const assessment = await assessUnderstanding({
    concept, questionAsked: questionSummary, studentAnswer,
    correctAnswer, isCorrect, selectedOptionIndex, conceptState, apiKey, reasoning,
    lookFor: storedMatches ? stored.lookFor : undefined,
    chosenOptionNote: storedMatches ? stored.optionNotes?.[pickedIdx] : undefined,
  });

  const attempt = {
    timestamp: Date.now(), questionSummary, conceptTag: concept.id,
    selectedOption: selectedOptionIndex, correctOption: correctOptionIndex,
    isCorrect, understandingDepth: assessment.understandingDepth,
    misconceptionDetected: assessment.misconceptionDescription,
    strategyUsed: session.currentStrategy as TeachingStrategy,
    teachingNote: assessment.teachingNote,
  };
  // Keep what the child said about how they chose, so a later review sees the evidence, not just the score.
  if (reasoning) (attempt as any).reasoning = reasoning;
  await recordAttempt(session.studentId, session.subjectId, concept.id, attempt, assessment);

  const nextStrategy = selectNextStrategy(conceptState, assessment);
  let nextConceptId = session.currentConceptId;
  let advancedToConcept = null;

  if (['advance','praise_and_continue'].includes(assessment.recommendedAction)) {
    const updated = await getConceptState(session.studentId, session.subjectId, concept.id);
    // Note: this route runs after recordAttempt() (the legacy quiz-click path),
    // which does not set masteryStatus -- isConceptMastered() falls back to the
    // raw MASTERY_THRESHOLD check here, preserving this path's existing
    // behavior exactly. The BKT/live-voice path (recordReasoningEvidence(),
    // /api/session/start above) is the one that gets the real fix.
    if (updated && isConceptMastered(updated)) {
      const currentLearner = await getLearner(session.studentId);
      const masteredIds = Object.values(
        currentLearner?.subjects?.[session.subjectId]?.conceptStates || {}
      ).filter(cs => isConceptMastered(cs)).map(cs => cs.conceptId);
      const next = curriculum ? nextUnmasteredConcept(curriculum, masteredIds) : undefined;
      if (next && next.id !== session.currentConceptId) {
        nextConceptId = next.id; advancedToConcept = next;
        await ensureConceptState(session.studentId, session.subjectId, next.id, next.label, 'direct_explanation', conceptTypeFor(next));
      }
    }
  }

  updateSession(session.sessionId, {
    currentConceptId: nextConceptId, currentStrategy: nextStrategy,
    interactionCount: session.interactionCount + 1,
    recentAttempts: [...session.recentAttempts.slice(-4), attempt],
    pendingStrategySwitch: assessment.recommendedAction === 'switch_strategy' ? nextStrategy : undefined,
    switchReason: assessment.recommendedAction === 'switch_strategy' ? assessment.teachingNote : undefined,
  });

  res.json({
    assessment, nextStrategy, advancedToConcept,
    updatedConceptState: await getConceptState(session.studentId, session.subjectId, nextConceptId),
    learner: await getLearner(session.studentId),
    session: getSession(session.sessionId),
  });
});

app.post('/api/session/:sessionId/end', requireAuth, async (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) { res.json({ ok: true }); return; }
  if ((req as any).authUid !== session.studentId)
    return (res as any).status(403).json({ error: 'Not authorized for this session' });
  const durationMins = Math.round((Date.now() - session.sessionStarted) / 60000);
  await incrementSessionCount(session.studentId, session.subjectId, durationMins);
  endSession(session.sessionId);
  clearTutorTurnState(session.sessionId); // T08 — drop this session's text-channel history too
  res.json({ ok: true, durationMinutes: durationMins });
});

// T08 (docs/BUILD_PLAN.md, docs/TRACEABILITY.md FR-25) — text-channel tutor
// turn. Backend-only: no UI calls this. See server/routes/tutor.ts for why
// it exists (EV-01/EV-02/EV-03 need a text doorway to drive many turns
// without a microphone) and how it reuses the voice path's persona, plan
// and diagnosis pipeline.
registerTutorRoutes(app);

// GET learner context for voice tutor system prompt
app.get('/api/learner-context/:studentId/:subjectId', requireAuth, requireOwnership, async (req, res) => {
  const { studentId, subjectId } = req.params;
  const learner = await getLearner(studentId);
  if (!learner) return (res as any).status(404).json({ error: 'Learner not found' });
  const subject = learner.subjects[subjectId];
  if (!subject) return res.json({ context: 'No prior learning history for this subject.' });

  const conceptSummaries = Object.values(subject.conceptStates)
    .sort((a, b) => b.lastVisited - a.lastVisited).slice(0, 10)
    .map(cs => {
      const lines = [`- ${cs.label}: mastery ${cs.masteryScore}/100 (${cs.masteryLevel})`];
      if (cs.confirmedMisconceptions.length)
        lines.push(`  CONFIRMED MISCONCEPTIONS: ${cs.confirmedMisconceptions.join('; ')}`);
      if (cs.effectiveStrategies.length)
        lines.push(`  EFFECTIVE STRATEGIES: ${cs.effectiveStrategies.join(', ')}`);
      if (cs.ineffectiveStrategies.length)
        lines.push(`  DID NOT HELP: ${cs.ineffectiveStrategies.join(', ')}`);
      return lines.join('\n');
    }).join('\n');

  const context = `LEARNER: ${learner.name} (${learner.grade})\nSessions: ${subject.sessionCount}, Minutes: ${subject.totalMinutes}\n\nCONCEPT MASTERY:\n${conceptSummaries || 'None yet'}\n\nINSIGHTS: ${learner.globalInsights.slice(-3).join(' | ') || 'None yet'}`;
  res.json({ context });
});

// ─── Voice session log ────────────────────────────────────────
// One file per session in logs/. Timings, tool calls, closes and what was said,
// so a "the tutor went quiet" report can be diagnosed from evidence.
// Local development only; the folder is git-ignored.
function openVoiceLog(topic: string) {
  const dir = path.join(process.cwd(), 'logs');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(dir, `voice-${stamp}.log`);
  const t0 = Date.now();
  // Buffered stream: a synchronous write per event would stall the same
  // event loop that relays audio between the browser and Gemini.
  const stream = fs.createWriteStream(file, { flags: 'a' });
  stream.on('error', () => {});
  const write = (line: string) => { stream.write(line + '\n'); };
  write(`# voice session ${new Date().toISOString()} topic="${topic}"`);
  return (event: string, data?: Record<string, any>) => {
    const t = ((Date.now() - t0) / 1000).toFixed(2).padStart(8);
    const body = data ? ' ' + JSON.stringify(data).slice(0, 400) : '';
    write(`${t}s  ${event}${body}`);
    if (!/^(tutor_said|child_said)$/.test(event)) console.log(`[voice] ${event}${body.slice(0, 160)}`);
  };
}

// WebSocket Server for Live API audio and events
const wss = new WebSocketServer({ noServer: true });
wss.on('error', (err) => {
  console.error('[WSS] Server error:', err.message);
});

// Only claim /ws/live. Leave every other upgrade alone so Vite HMR can
// handle its own WebSocket — stealing those connections causes a flood of
// "Invalid WebSocket frame: invalid status code" errors in the terminal.
server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname !== '/ws/live') return;
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } catch (upgradeErr) {
    console.warn('[Server] WebSocket upgrade error:', upgradeErr);
    try {
      socket.destroy();
    } catch (_) {}
  }
});

// Live transcripts arrive as `inputTranscription` / `outputTranscription`
// (@google/genai 2.x). They are forwarded as whole-turn subtitles and fed to
// the learner observer. Tool calls are logged as board events for context.
function observeMessage(message: LiveServerMessage, observer: LiveObserver | null, clientWs: WebSocket) {
  if (!observer) return;
  const sc: any = message.serverContent;
  const childText = sc?.inputTranscription?.text;
  const tutorText = sc?.outputTranscription?.text;
  if (childText) {
    observer.add('child', childText);
    clientWs.send(JSON.stringify({ type: 'input_transcript', text: observer.currentText('child') }));
  }
  if (tutorText) {
    observer.add('tutor', tutorText);
    clientWs.send(JSON.stringify({ type: 'output_transcript', text: observer.currentText('tutor') }));
  }
  for (const call of message.toolCall?.functionCalls || []) {
    const a: any = call.args || {};
    const detail = [a.title, a.note, a.text, a.question, a.topic, a.concept, a.tab,
      Array.isArray(a.bulletPoints) ? a.bulletPoints.join(' | ') : ''].filter(Boolean).join(' — ');
    observer.add('board', `${call.name}${detail ? ': ' + String(detail).slice(0, 300) : ''}`);
  }
  if (sc?.interrupted) observer.boundary();
  if (sc?.turnComplete) observer.exchangeDone();
}

wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
  // Parse query parameters. (T04) sessionId is the primary key: the server
  // resolves studentId/subjectId/conceptId/plan from the session it started
  // via POST /api/session/start, rather than trusting client-supplied values
  // for who the learner is. topic/grade/subjectId/conceptId remain as a
  // `?guest=1` fallback for a quick no-login demo path.
  const wsConnectedAt = Date.now();
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const sessionIdParam = url.searchParams.get('sessionId') || '';
  const isGuest = url.searchParams.get('guest') === '1';
  const activeSession = sessionIdParam ? getSession(sessionIdParam) : undefined;

  let topic = url.searchParams.get('topic') || 'the requested subject';
  let grade = url.searchParams.get('grade') || 'the student level';
  let subjectId = url.searchParams.get('subjectId') || '';
  let conceptId = url.searchParams.get('conceptId') || '';
  let studentId = '';
  let resolvedPlan: TeachingPlan | null = null;
  let resolvedLearnerName: string | undefined;
  let resolvedTutorName: string | undefined; // the name this child gave their tutor

  if (sessionIdParam && !activeSession && !isGuest) {
    clientWs.send(JSON.stringify({ type: 'error', code: 'SESSION_NOT_FOUND', message: 'Unknown or expired sessionId. Start a session via POST /api/session/start first.' }));
    clientWs.close();
    return;
  }

  if (activeSession) {
    studentId = activeSession.studentId;
    subjectId = activeSession.subjectId;
    conceptId = activeSession.currentConceptId;
    const curriculumForSession = getCurriculum(subjectId);
    const conceptDef = curriculumForSession?.concepts.find((c) => c.id === conceptId);
    topic = conceptDef?.label || topic;
    const learnerForSession = await getLearner(studentId);
    grade = learnerForSession?.grade || grade;
    resolvedLearnerName = learnerForSession?.name;
    resolvedTutorName = sanitiseTutorName(learnerForSession?.tutorName) || undefined;
    const latestPlan = await getRepo().getLatestPlan(studentId, subjectId);
    if (latestPlan) resolvedPlan = latestPlan.plan as TeachingPlan;
  }

  // Guided mode: per-session switch (?mode=), server default (TUTOR_MODE), else standard.
  // A concept with no guided script quietly runs as standard.
  const requestedMode = url.searchParams.get('mode');
  const guidedScript = process.env.PERSONA === 'legacy' || resolveTutorMode(requestedMode, process.env.TUTOR_MODE) !== 'guided'
    ? null
    : getGuidedScript(conceptId);
  const guidedSession = guidedScript ? new GuidedSession(guidedScript, resolvePace(url.searchParams.get('pace'))) : null;
  console.log(`[WebSocket] tutor mode: ${guidedSession ? 'guided' : 'standard'} (requested=${requestedMode || '-'}, default=${process.env.TUTOR_MODE || '-'}, concept=${conceptId || '-'})`);

  // Build curriculum intelligence context if we have a subject and concept
  const curriculumCtx = (subjectId && conceptId)
    ? buildCurriculumIntelligenceContext(subjectId, conceptId)
    : null;

  if (curriculumCtx) {
    console.log(`[WebSocket] Curriculum intelligence loaded for ${subjectId}/${conceptId}`);
  }
  console.log(`[WebSocket] Live session started. studentId=${studentId || '(guest)'} topic="${topic}" grade="${grade}"`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[WebSocket] GEMINI_API_KEY is missing');
    clientWs.send(
      JSON.stringify({
        type: 'error',
        code: 'API_KEY_MISSING',
        message: 'GEMINI_API_KEY is required for live voice interaction. Please configure it in AI Studio settings.',
      })
    );
    clientWs.close();
    return;
  }

  let liveSession: any = null;
  let observer: LiveObserver | null = null;
  const transcriptLog = new TranscriptLog();
  // Guided: how long the voice stays silent after a guided tool call (the cost of writing line by line).
  let guidedVoiceClock: { at: number; tool: string } | null = null;
  let isClosed = false;

  // T11 (partial): per-connection plan-delta state. A fuller implementation
  // (docs/BUILD_PLAN.md T11) extracts this into src/adaptive/diagnostician.ts +
  // src/adaptive/segmenter.ts; this inline version wires the SAME assessor
  // (reasoningAssessor.ts) that already implements the closed-catalogue,
  // deadline-bounded diagnosis into the actual live path for the first time —
  // previously it was imported but never called from here (docs/PROJECT_STATE.md).
  let deltaState: PlanDeltaState = initialDeltaState();
  // Bug found 2026-09-26 (T19): compilePlanDelta()'s result (delta.instruction --
  // includes PARK_AND_ESCALATE's "park it, tell the learner..." guidance,
  // encourageReset's pacing guidance, and representation-switch instructions)
  // was ONLY ever sent to the browser as a 'plan_update' message for the
  // Tutor's-reasoning panel -- it never reached the live model at all, so the
  // tutor genuinely never knew a retry cap was hit or that it should park a
  // concept. Fixed by piggybacking it on the NEXT tool response of ANY kind
  // (sendToolResponse is the single shared funnel every tool call already
  // goes through, see below) -- zero new live-session mechanism, zero risk of
  // interrupting speech, since it rides an outgoing response that was already
  // about to be sent. See docs/AGENT_GUIDE.md landmine #4 and DECISIONS.md
  // D-2026-09-26-4.
  let pendingPlanGuidance: string | null = null;
  // Queued-at timestamp for the pending guidance above, so we can log real
  // added-latency numbers (T19 acceptance criterion: p50/p95 added voice
  // latency) the next time this runs against live Gemini Live -- this
  // sandbox has no reachable Gemini Live endpoint (confirmed via
  // `npm run test:live` -> ECONNREFUSED even on unmodified code), so these
  // numbers cannot be fabricated here. Run a live session on a machine with
  // real Gemini Live access and grep server logs for "[T19 latency]" to
  // collect a sample, then compute p50/p95 and append the result to
  // DECISIONS.md D-2026-09-26-4 per docs/BUILD_PLAN.md T19's acceptance
  // criterion.
  let pendingPlanGuidanceQueuedAt: number | null = null;

  async function handleAssessChildReasoning(call: any) {
    const args = call.args || {};
    if (!studentId || !subjectId || !conceptId) {
      // Guest/no-login session — nothing to record against. Ask the tutor to
      // continue eliciting without asserting anything.
      sendToolResponse(call, { instruction: 'Ask the learner to walk you through their method before saying anything about whether it is right.' });
      return;
    }
    const curriculumHere = getCurriculum(subjectId);
    const conceptDef = curriculumHere?.concepts.find((c) => c.id === conceptId);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!conceptDef || !apiKey) {
      sendToolResponse(call, { instruction: 'Ask the learner to explain their method, one step at a time.' });
      return;
    }
    const conceptStateHere = await getConceptState(studentId, subjectId, conceptId);

    const deadlineResult = await assessReasoningWithDeadline({
      concept: conceptDef,
      conceptState: conceptStateHere,
      questionAsked: String(args.questionAsked || ''),
      childAnswer: String(args.childAnswer || ''),
      childReasoning: String(args.childReasoning || ''),
      expectedAnswer: args.expectedAnswer ? String(args.expectedAnswer) : undefined,
      currentStrategy: (conceptStateHere?.strategiesUsed?.[conceptStateHere.strategiesUsed.length - 1] || 'direct_explanation') as TeachingStrategy,
      apiKey,
      // Course context so the diagnosis is phrased for this subject and age
      // (docs/CURRICULUM.md §7) rather than assuming Grade 8 maths.
      subjectLabel: curriculumHere?.label,
      gradeLevel: curriculumHere?.gradeLevel ?? gradeLevelFromLabel(curriculumHere?.grade),
      subjectMode: subjectModeForCurriculum(curriculumHere),
    }, ASSESS_BUDGET_MS);
    const assessment = deadlineResult.assessment;

    // Respond exactly once. The response is deferred until the plan delta has
    // been computed so the tutor gets diagnosis + plan guidance TOGETHER on
    // this very turn. Previously the assessor's "probe, don't say it's wrong"
    // guidance went out immediately and the plan delta was queued for the NEXT
    // tool call, i.e. one turn late (D-2026-09-30-9).
    let responded = false;
    const respond = (instruction: string) => {
      if (responded) return;
      responded = true;
      sendToolResponse(call, { instruction });
    };
    if (deadlineResult.timedOut) {
      console.warn(`[assess] diagnosis exceeded its ${deadlineResult.elapsedMs}ms budget for "${String(args.childAnswer || '').slice(0, 40)}" -- using the generic transfer move, which records as low-confidence 'recognised' evidence`);
    }

    const candidateMisconceptions = assessment.candidateMisconceptionIds
      .map((id) => ({ id, text: misconceptionText(conceptDef, id) || id }));

    const promptType = ['teach', 'check', 'probe', 'transfer'].includes(args.promptType) ? args.promptType : 'check';

    const evidenceResult = await recordReasoningEvidence({
      studentId, subjectId, conceptId,
      conceptType: conceptTypeFor(conceptDef, conceptStateHere),
      difficultyLevel: conceptDef.difficultyLevel || 2,
      promptType,
      questionAsked: String(args.questionAsked || ''),
      childAnswer: String(args.childAnswer || ''),
      childReasoning: String(args.childReasoning || ''),
      classification: assessment.classification,
      understandingDepth: assessment.understandingDepth,
      candidateMisconceptions,
      confidence: assessment.confidence,
      strategyInUse: (conceptStateHere?.strategiesUsed?.[conceptStateHere.strategiesUsed.length - 1] || 'direct_explanation') as TeachingStrategy,
      moveUsed: assessment.shouldProbe ? 'DISCRIMINATING_PROBE' : 'ELICIT_REASONING',
      sessionId: sessionIdParam,
      planVersion: resolvedPlan?.planVersion,
      diagnosticianModel: 'gemini (reasoningAssessor)',
      source: 'voice',
    }).catch((err) => {
      console.error('[assess] recordReasoningEvidence failed; answering the tutor anyway', err);
      return null;
    });

    const moveUsed = assessment.shouldProbe ? 'DISCRIMINATING_PROBE' : 'ELICIT_REASONING';

    // T23 — the Tutor's-reasoning panel needs to see what the diagnosis
    // actually found, not just the resulting ladder/mastery numbers, so the
    // full assessment + the question/answer/reasoning it was based on ride
    // along on the same message the panel already listens for.
    if (clientWs.readyState === WebSocket.OPEN && evidenceResult) {
      clientWs.send(JSON.stringify({
        type: 'learner_update_v2',
        evidence: evidenceResult,
        diagnosis: {
          classification: assessment.classification,
          understandingDepth: assessment.understandingDepth,
          confidence: assessment.confidence,
          shouldProbe: assessment.shouldProbe,
          tutorGuidance: assessment.tutorGuidance,
          moveUsed,
          questionAsked: String(args.questionAsked || ''),
          childAnswer: String(args.childAnswer || ''),
          childReasoning: String(args.childReasoning || ''),
          candidateMisconceptions,
          diagnosisLatencyMs: deadlineResult.elapsedMs,
        },
      }));
    }

    if (resolvedPlan) {
      // Single source of truth shared with server/routes/tutor.ts's text
      // handler — see deriveOutcome() in src/plan/delta.ts
      // (docs/DECISIONS.md D-2026-09-28-4 for the bug this used to have,
      // D-2026-09-28-5 for why the logic now lives in one place).
      const outcome = deriveOutcome({
        classification: assessment.classification,
        candidateMisconceptionsCount: candidateMisconceptions.length,
        newlyConfirmedCount: evidenceResult ? evidenceResult.newlyConfirmed.length : 0,
      });
      const delta = compilePlanDelta(resolvedPlan, deltaState, {
        conceptId,
        outcome,
        representationUsed: (conceptStateHere?.strategiesUsed?.[conceptStateHere.strategiesUsed.length - 1] || 'direct_explanation') as TeachingStrategy,
        questionKey: String(args.questionAsked || conceptId),
        hasReasoning: String(args.childReasoning || '').trim().length > 3,
      });
      deltaState = delta.state;
      // Plan guidance is authoritative on a miss (see delta.ts). It goes FIRST,
      // in the same response as the diagnosis.
      respond(delta.instruction
        ? `${delta.instruction} (Assessor note, lower priority: ${assessment.tutorGuidance})`
        : assessment.tutorGuidance);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'plan_update',
          instruction: delta.instruction,
          nextRepresentation: delta.nextRepresentation,
          outcome,
          moveUsed,
        }));
      }
    }
    // No plan resolved (or nothing above answered): still answer the tool call.
    respond(assessment.tutorGuidance);
  }

  async function handleRecordConfusionSignal(call: any) {
    const args = call.args || {};
    const signal = String(args.signal || '');
    if (!studentId || !signal) {
      // Guest session or malformed call — nothing to persist against, but
      // never surface this as a failure to the tutor.
      sendToolResponse(call, { result: 'noted' });
      return;
    }
    const result = await recordConfusionSignal({
      studentId,
      subjectId: subjectId || undefined,
      conceptId: conceptId || undefined,
      signal,
      aboutWhat: args.aboutWhat ? String(args.aboutWhat) : undefined,
    });
    sendToolResponse(call, result
      ? { result: 'recorded', signal: result.signal, notedOnConcept: result.notedOnConcept }
      : { result: 'noted' });
  }

  function sendToolResponse(call: any, response: Record<string, unknown>) {
    try {
      let finalResponse = response;
      if (pendingPlanGuidance) {
        // Merge onto whatever this call was already going to say, rather than
        // overwriting it -- e.g. assess_child_reasoning's own per-turn
        // { instruction } and this plan-level guidance can both matter.
        const existing = typeof finalResponse.instruction === 'string' ? finalResponse.instruction : '';
        finalResponse = {
          ...finalResponse,
          instruction: existing ? `${existing} ${pendingPlanGuidance}` : pendingPlanGuidance,
        };
        const addedLatencyMs = pendingPlanGuidanceQueuedAt !== null ? Date.now() - pendingPlanGuidanceQueuedAt : null;
        console.log(`[T19 guidance-injection] delivered queued plan guidance on tool "${call.name}"'s response (queued-to-delivered latency: ${addedLatencyMs}ms): "${pendingPlanGuidance}"`);
        console.log(`[T19 latency] ${addedLatencyMs}`);
        pendingPlanGuidance = null;
        pendingPlanGuidanceQueuedAt = null;
      }
      if (liveSession) {
        liveSession.sendToolResponse({ functionResponses: [{ id: call.id, name: call.name, response: finalResponse }] });
      }
    } catch (respErr) {
      console.error('[Gemini Live] Error sending tool response:', respErr);
    }
  }

  // update_diagram: the browser fetches and draws the picture (/api/update-diagram);
  // the tutor needs to know its STEP NAMES to build it up with reveal_part. Board
  // tools used to be acked with a bare {result:'ok'}, so the tutor never knew what
  // it was pointing at. Only prepared pictures are looked up here (a quick store
  // read, bounded) — never generated, so the voice is not held up and nothing is
  // billed twice (the browser's request does any drawing).
  async function handleUpdateDiagramTool(call: any) {
    const focus = String(call.args?.focus || topic);
    const lookup = loadPregen(topic, conceptId || undefined)
      .then((rec) => findVisualForFocus(rec?.visuals, focus, slugifyTopic))
      .catch(() => null);
    const hit = await Promise.race([lookup, new Promise<null>((r) => setTimeout(() => r(null), 1200))]);
    if (hit) {
      const summary = toolSummary(hit.visual);
      sendToolResponse(call, { result: 'ok', board: { title: summary.title, steps: summary.steps }, instruction: summary.instruction });
    } else {
      sendToolResponse(call, {
        result: 'ok',
        instruction: 'A NEW picture for this is being drawn and may take up to ~20 seconds; the board keeps its current picture until it arrives. '
          + 'Do not call reveal_part for parts of it yet. Keep explaining in words, and stay on the lesson concept — do not request pictures of other topics.',
      });
    }
  }

  // The prepared board pictures for this concept, told to the tutor up front so it
  // builds the picture step by step as it speaks (docs/BOARD_VISUALS.md §5).
  let boardContextText: string | undefined;
  try {
    const boardRecord = await loadPregen(topic, conceptId || undefined);
    if (boardRecord?.visuals) {
      const found = await findConcept(conceptId || undefined);
      boardContextText = boardContextBlock({
        visuals: boardRecord.visuals,
        misconceptions: found?.concept.misconceptionDetails ?? [],
      }) || undefined;
      if (boardContextText) console.log(`[WebSocket] Board pictures loaded for "${topic}": ${Object.keys(boardRecord.visuals).join(', ')}`);
    }
  } catch (boardErr: any) {
    console.warn('[WebSocket] Board pictures unavailable (non-fatal):', boardErr?.message);
  }

    // T07: single composed persona (docs/TUTOR_PERSONA.md), replacing the
  // three prompts that used to diverge (this inline one, plus
  // classicSystemInstruction/adaptiveSystemInstruction in src/live/liveConfig.ts,
  // now deprecated). PERSONA=legacy restores the old text verbatim for A/B
  // comparison during the build.
  const ageBand = ageBandFromGrade(grade);
  const subjectModeForPrompt = subjectId ? subjectModeForCurriculum(getCurriculum(subjectId)) : 'well_structured';
  const planBlockText = resolvedPlan ? renderPlanForPrompt(resolvedPlan, resolvedLearnerName) : undefined;

  const dynamicSystemInstruction = process.env.PERSONA === 'legacy'
    ? `You are "${resolvedTutorName || DEFAULT_PERSONA_NAME}", an inspiring, warm, and brilliant Senior Educator and AI Tutor teaching a student in ${grade} on the topic of "${topic}". You speak in a clear, encouraging, friendly mentor voice with genuine passion for learning.

PEDAGOGICAL RULES & REAL-TIME BLACKBOARD INTERACTION:
1. You have an interactive real-time digital blackboard right next to you that updates dynamically.
2. ON-THE-FLY VISUAL MODES: The student may ask you at any moment to view concepts in:
   - "2d" (2D interactive schematic / concept diagram): call switch_board_view with tab: '2d'
   - "3d" (interactive 3D spatial simulation / orbit / molecular / geometric model): call switch_board_view with tab: '3d'
   - "photo" / "picture" / "camera" (photorealistic observational visual): call switch_board_view with tab: 'photo' or call generate_photo_visual with a detailed prompt!
   - "notes" / "formulas" / "chalkboard": call switch_board_view with tab: 'chalkboard'
   - "simulator" / "experiment": call switch_board_view with tab: 'explorer'
   - "quiz" / "test": call switch_board_view with tab: 'quiz' or pose_quiz
3. TOPIC SWITCHING: If the student asks to learn a different topic (e.g. "Teach me about black holes now"), enthusiastically call set_topic with the new topic and immediately welcome them to it!
4. LIVE CHALKBOARD NOTES:
   - Call "update_chalkboard_notes" or "write_live_note" to put notes on the chalkboard so the student can follow along visually.
   - Call "highlight_concept" when pointing to a specific part of the diagram or system.
5. Teach in concise, dialogue-driven conversational turns (1–3 sentences maximum). Never give long uninterrupted monologues.
6. Encourage the student warmly, praise good questions, and tailor your vocabulary directly to a student in ${grade}.
7. CHOOSE THE RIGHT VIEW AS YOU TEACH, and switch as the explanation moves on (switch_board_view):
   - 'photo' = a real-world situation (e.g. a ladder against a wall) — when introducing an idea or linking it to real life.
   - '2d' = the clean shape — when naming parts or reasoning about the figure.
   - '3d' = the spatial model — when depth or turning the shape helps.
   - 'chalkboard' = step-by-step working, calculations, rules and definitions. Whenever you work something out step by step, write it with update_chalkboard_notes (one step per bullet) — the board switches to the chalkboard by itself.
   - When you give the student a problem to solve, ALWAYS write the problem on the chalkboard first (update_chalkboard_notes, title "Your turn", the question as the first bullet), then ask it. As the student tells you their working, write each of their steps with write_live_note.
8. NEVER GO QUIET BEFORE A BOARD ACTION. Before update_chalkboard_notes, pose_quiz or generate_photo_visual, first say one short natural phrase out loud — e.g. "Let me write that on the board for you…" or "Let's work through it step by step…" — then call the tool, then carry on explaining.
9. NEVER REPEAT WHAT YOU JUST WROTE. After calling update_chalkboard_notes or write_live_note, do NOT read the bullet points aloud — the student can already see them on the board. Continue with the NEXT thought, a question, or a new explanation. Saying the same sentence twice — whether before and after a tool call, or in two consecutive turns — is always wrong.
10. ONE IDEA PER TURN. Each spoken turn must introduce exactly one new idea or question. If you catch yourself about to say something you said in the last turn, say something different instead.
${curriculumCtx ? '\n\n' + curriculumCtx.systemPromptBlock : ''}`.trimEnd()
    : composeSystemInstruction({
        ageBand,
        subjectMode: subjectModeForPrompt as any,
        channel: 'voice',
        learnerName: resolvedLearnerName,
        personaName: resolvedTutorName,
        planBlock: planBlockText,
        curriculumContext: curriculumCtx?.systemPromptBlock,
        boardContext: guidedSession ? undefined : boardContextText,
        boardBlockOverride: guidedScript ? guidedBoardBlock(guidedScript) : undefined,
        topic,
      });

  try {
    // Force Gemini Developer API for Live. With GOOGLE_GENAI_USE_ENTERPRISE /
    // GOOGLE_CLOUD_PROJECT set, the SDK otherwise routes AQ.* AI Studio keys to
    // Vertex and closes immediately with a misleading "Invalid resource" error.
    const ai = new GoogleGenAI({
      apiKey,
      vertexai: false,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });

    // ── Learner panel side-channel (additive; never touches the voice session) ──
    observer = new LiveObserver(topic, grade, apiKey, (snap) => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify({ type: 'learner_update', snapshot: snap }));
    });
    clientWs.on('close', () => observer?.close());

    const liveModel = process.env.LIVE_MODEL || 'gemini-3.8-live';
    liveSession = await ai.live.connect({
      model: liveModel,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: dynamicSystemInstruction,
        tools: [{ functionDeclarations: process.env.PERSONA === 'legacy' ? dynamicFunctionDeclarations : (guidedSession ? guidedToolDeclarations() : ALL_TOOLS) }],
      },
      callbacks: {
        onopen: () => {
          console.log('[Gemini Live] Session connected', liveModel);
        },
        onmessage: (message: LiveServerMessage) => {
          if (isClosed || clientWs.readyState !== WebSocket.OPEN) return;
          transcriptLog.feed(message);

          // 1. Audio chunks from model
          const modelParts = message.serverContent?.modelTurn?.parts;
          if (modelParts && Array.isArray(modelParts)) {
            for (const part of modelParts) {
              if (part.inlineData?.data) {
                if (guidedVoiceClock) {
                  console.log(`[guided] voice resumed ${Date.now() - guidedVoiceClock.at}ms after ${guidedVoiceClock.tool}`);
                  guidedVoiceClock = null;
                }
                clientWs.send(
                  JSON.stringify({
                    type: 'audio_out',
                    data: part.inlineData.data,
                  })
                );
              }
              if (part.text) {
                clientWs.send(
                  JSON.stringify({
                    type: 'output_transcript',
                    text: part.text,
                  })
                );
              }
            }
          }

          // 2. Output and Input Transcriptions
          const outTrans = (message.serverContent as any)?.outputAudioTranscription?.text;
          if (outTrans) {
            clientWs.send(
              JSON.stringify({
                type: 'output_transcript',
                text: outTrans,
              })
            );
          }

          const inTrans = (message.serverContent as any)?.inputAudioTranscription?.text;
          if (inTrans) {
            clientWs.send(
              JSON.stringify({
                type: 'input_transcript',
                text: inTrans,
              })
            );
          }

          // 3. Barge-in / Interrupted
          if (message.serverContent?.interrupted) {
            clientWs.send(JSON.stringify({ type: 'interrupted' }));
          }

          // 4. Tool Calls
          const functionCalls = message.toolCall?.functionCalls;
          if (functionCalls && Array.isArray(functionCalls) && functionCalls.length > 0) {
            const guidedBudget = { lineWritten: false }; // guided: one board line per model message
            for (const call of functionCalls) {
              console.log(`[Tool Call] Executing: ${call.name}`, call.args);

              clientWs.send(
                JSON.stringify({
                  type: 'tool_call',
                  id: call.id,
                  name: call.name,
                  args: call.args || {},
                })
              );

              if (guidedSession && isGuidedCall(call.name)) {
                // The server holds the board (src/guided/session.ts); the browser gets a snapshot
                // and shows it in step with the voice.
                const reply = guidedSession.handle(call.name, (call.args || {}) as Record<string, any>, guidedBudget);
                console.log(`[guided] ${reply.log}`);
                sendToolResponse(call, reply.response);
                if (reply.changed) clientWs.send(JSON.stringify({ type: 'guided_state', state: guidedSession.state }));
                guidedVoiceClock = { at: Date.now(), tool: call.name };
                continue;
              }

              if (call.name === 'assess_child_reasoning') {
                // Diagnosis + evidence recording + plan delta (see
                // handleAssessChildReasoning above). Not awaited here — the
                // handler sends its own tool response as soon as the
                // assessor returns (bounded by assessReasoningWithDeadline's
                // budget), so the voice model is never blocked longer than
                // that budget.
                handleAssessChildReasoning(call).catch((err) => {
                  console.error('[assess_child_reasoning] failed', err);
                  sendToolResponse(call, { instruction: 'Ask the learner to walk you through their method before saying anything about whether it is right.' });
                });
                continue;
              }

              if (call.name === 'record_confusion_signal') {
                // Persists to the learner profile (see handleRecordConfusionSignal
                // above); not awaited here so the voice model is never blocked.
                handleRecordConfusionSignal(call).catch((err) => {
                  console.error('[record_confusion_signal] failed', err);
                  sendToolResponse(call, { result: 'noted' });
                });
                continue;
              }

              if (call.name === 'update_diagram') {
                // Answers with the picture's step names when it is a prepared one
                // (bounded store read, see handleUpdateDiagramTool above).
                handleUpdateDiagramTool(call).catch((err) => {
                  console.error('[update_diagram] failed', err);
                  sendToolResponse(call, { result: 'ok' });
                });
                continue;
              }

              // Board/UI tools: immediately ack so the tutor keeps speaking.
              sendToolResponse(call, { result: 'ok' });
            }
          }

          // 5. Learner panel side-channel — reads what already arrived, sends
          //    extra messages to the browser only. Cannot affect the voice.
          try { observeMessage(message, observer, clientWs); } catch (obsErr) {
            console.warn('[LiveObserver] ignored:', obsErr);
          }
        },
        onerror: (err: any) => {
          console.error('[Gemini Live] Session error:', err);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(
              JSON.stringify({
                type: 'error',
                code: 'LIVE_ERROR',
                message: err?.message || 'Gemini Live encountered an error',
              })
            );
          }
        },
        onclose: (ev: any) => {
          const reason = String(ev?.reason || '').trim();
          const code = ev?.code;
          console.log('[Gemini Live] Session closed', code, reason);
          if (clientWs.readyState === WebSocket.OPEN) {
            const credits = /credits? are depleted|prepayment|billing/i.test(reason);
            clientWs.send(
              JSON.stringify({
                type: 'error',
                code: credits ? 'CREDITS_DEPLETED' : 'LIVE_CLOSED',
                message: credits
                  ? 'Gemini Live credits are depleted. Top up billing at https://ai.studio/projects then retry voice.'
                  : reason || `Gemini Live closed (code ${code ?? 'unknown'})`,
              })
            );
            clientWs.send(JSON.stringify({ type: 'session_closed' }));
          }
        },
      },
    });

    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'session_ready' }));
      clientWs.send(JSON.stringify({ type: 'tutor_mode', mode: guidedSession ? 'guided' : 'standard' }));

      // Send initial turn welcoming the student to the topic
      try {
        liveSession.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [
                {
                  text: process.env.PERSONA === 'legacy'
                    ? `The student has just entered the classroom to learn about "${topic}" at the ${grade} level. Greet them warmly as ${resolvedTutorName || DEFAULT_PERSONA_NAME}, express excitement for exploring "${topic}", mention that you have prepared the digital blackboard, and ask what aspect they would like to explore first.`
                    : (guidedSession ? guidedKickoff(topic) : composeKickoff(topic, Boolean(resolvedPlan))),
                },
              ],
            },
          ],
          turnComplete: true,
        });
      } catch (initErr) {
        console.error('[Gemini Live] Error sending initial turn:', initErr);
      }
    }
  } catch (err: any) {
    console.error('[WebSocket] Failed to initialize Gemini Live session:', err);
    clientWs.send(
      JSON.stringify({
        type: 'error',
        code: 'INITIALIZATION_FAILED',
        message: err?.message || 'Failed to start Live session',
      })
    );
    clientWs.close();
    return;
  }

  // Handle messages from client
  clientWs.on('message', (rawData) => {
    if (isClosed || !liveSession) return;

    try {
      const msg = JSON.parse(rawData.toString());

      if ((msg.type === 'audio' || msg.type === 'audio_in') && msg.data) {
        liveSession.sendRealtimeInput({
          audio: {
            data: msg.data,
            mimeType: 'audio/pcm;rate=16000',
          },
        });
      } else if (msg.type === 'text' && msg.text) {
        observer?.add('child', String(msg.text)); // side-channel only
        liveSession.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: msg.text }] }],
          turnComplete: true,
        });
      } else if (msg.type === 'guided_pace') {
        if (guidedSession && isPace(msg.pace)) { guidedSession.setPace(msg.pace); console.log(`[guided] pace -> ${msg.pace}`); }
      } else if (msg.type === 'tool_response') {
        console.log('[WebSocket] Tool execution confirmed:', msg.id);
      } else if (msg.type === 'close') {
        isClosed = true;
        clientWs.close();
      }
    } catch (parseErr) {
      console.error('[WebSocket] Failed to parse client message:', parseErr);
    }
  });

  clientWs.on('close', () => {
    isClosed = true;
    console.log('[WebSocket] Client disconnected');
    if (liveSession) {
      try {
        liveSession.close();
      } catch (closeErr) {
        console.error('[Gemini Live] Error closing session:', closeErr);
      }
    }
    // T14 -- session-end Profiler (docs/LEARNER_MODEL.md §5.2). Fire-and-
    // forget: the client is already gone, there is nothing to respond to,
    // and this must never block or delay the WS teardown above. A real
    // learner (has studentId+subjectId, i.e. not a guest session) with a
    // real API key is required; guests and misconfigured servers skip
    // silently rather than erroring into an empty console.
    if (studentId && subjectId && apiKey) {
      const sessionStartedAt = activeSession?.sessionStarted || wsConnectedAt;
      runProfiler({
        studentId, subjectId,
        sessionId: sessionIdParam || `adhoc_${studentId}_${wsConnectedAt}`,
        sessionStartedAt,
        apiKey,
      }).catch((err) => console.error('[Profiler] runProfiler threw:', err));
    }
  });
});

async function startServer() {
  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    // Run HMR on its own port so it never shares the Live API upgrade path.
    const hmrPort = Number(process.env.HMR_PORT) || (PORT + 10000);
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { port: hmrPort, clientPort: hmrPort },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] AI Tutor backend running on http://localhost:${PORT}`);
  });
}

// .catch() added 2026-09-28 — startServer() used to be a fire-and-forget
// `startServer();` with no rejection handler. Found no evidence this ever
// actually rejected in practice, but a startup-time throw (e.g. from the
// Vite import in dev mode) would previously have surfaced only as a
// generic, hard-to-trace "unhandled rejection" — this attributes it.
startServer().catch((e) => console.error('[Server] startServer() failed:', e));
