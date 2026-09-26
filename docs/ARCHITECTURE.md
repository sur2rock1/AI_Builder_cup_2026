# ARCHITECTURE.md — pythagoras-tutor system map
_Last verified against running code: 2026-09-26. This file describes what IS, not what the spec docs (TECHNICAL_SPEC.md, BUILD_PLAN.md) originally planned — where they conflict, this file wins for current state, and TECHNICAL_SPEC.md §1 in particular is a dated pre-fix snapshot (2026-09-24), not current._

**If you are an AI agent about to edit this codebase: read `docs/AGENT_GUIDE.md` first.** It has the danger patterns that have already caused two real bugs this project.

## 1. One-sentence summary

A single Node/Express process (`server.ts`) serves REST + a `/ws/live` WebSocket proxy to Gemini Live + (in prod) the built Vite SPA, backed by a swappable persistence layer (flat JSON in dev, Firestore in prod), with a deterministic Teaching Plan compiler and a persona composer feeding a fixed-identity, per-child-adapted system prompt into each live tutoring session.

## 2. Runtime processes

- **`server.ts`** (1500+ lines) is the entire backend. One `http.Server` carries:
  - Express REST routes (see §5)
  - A WebSocket server (`wss`) scoped ONLY to `url.pathname === '/ws/live'` on the HTTP upgrade event — every other upgrade (e.g. Vite HMR in dev) is deliberately left alone (see comment at the upgrade handler; this was a fix for WS frame error floods)
  - In production, Vite's static build output (`dist/`) with an SPA fallback route
- **`functions/src/index.ts`** — a separate Firebase Cloud Functions deploy target, not part of the `server.ts` process, deployed independently via `firebase deploy --only functions`.

## 3. Deploy topology

- **Firebase Hosting** serves the built SPA (`dist/`) and rewrites `/api/**` and `/ws/**` to the **same** Cloud Run service (`dr-marcus-live`, `us-central1`) — confirmed in `firebase.json`.
- **Cloud Run** runs the Docker image (`Dockerfile`: `node:22-bookworm-slim`, non-root `USER node`, `CMD ["node", "dist/server.cjs"]`).
- **`process.env.K_SERVICE`** is the signal Cloud Run auto-sets on its containers. The repo layer uses this to auto-switch to Firestore in production (see §4) — this is intentional, not an accident.
- **Firebase Auth**: email/password only, anonymous disabled (`firebase.json`).
- Build: `vite build` (frontend) + `esbuild server.ts → dist/server.cjs` (backend), both via `npm run build`.

## 4. Data layer — the most important thing to get right before touching it

`src/adaptive/repo/index.ts` exports `getRepo()`, a factory that returns ONE of two implementations, chosen at runtime:

```
useFirestore() === true  iff  process.env.USE_FIRESTORE_LEARNERS === 'true'  OR  process.env.K_SERVICE is set (i.e. running on Cloud Run)
```

- **`FileLearnerRepository`** (`repo/file.ts`) — dev/local/test default. Flat JSON under `LEARNER_DATA_DIR` (defaults to `<cwd>/data`):
  - `data/learner-profiles.json` — one object keyed by `studentId`, read/written WHOLE on every call.
  - `data/events/{studentId}.json` — append-only array of evidence events.
  - `data/plans/{studentId}.json` — object keyed by `planVersion`.
  - `data/sessions/{studentId}.json` — object keyed by `sessionId`.
  - Has an explicit guard against a previously-real data-loss bug where the profiles file collapsed to `[]` and every save silently re-wrote `[]` (see inline comment in `file.ts` and `docs/TRACEABILITY.md`).
- **`FirestoreLearnerRepository`** (`repo/firestore.ts`) — production default on Cloud Run. Collections: `learners/{studentId}`, `.../events/{eventId}`, `.../plans/{planVersion}`, `.../sessions/{sessionId}`. Uses the Admin SDK, which bypasses `firestore.rules` entirely — all four `learners/**` rule blocks are `allow read, write: if false`, i.e. client SDKs can NEVER touch learner data directly; all access is server-side only through `requireAuth`/`requireOwnership` middleware.
- **`firestore.indexes.json` is currently empty** (`{"indexes": [], "fieldOverrides": []}`). The Firestore repo does run `.where(...).orderBy(...)` compound queries that may need composite indexes in production — this file provides no pre-declared coverage today. Flag before scaling query volume.

**Rule of thumb for any future storage change: change both `file.ts` and `firestore.ts` together, or you've silently made dev and prod diverge.**

## 5. REST API (all routes in `server.ts`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness + whether `GEMINI_API_KEY` is set |
| POST | `/api/generate-lesson` | generate/serve a cached ad-hoc lesson (topic+grade, not curriculum-driven) |
| POST | `/api/update-diagram`, `/api/generate-image` | board-tool support endpoints |
| GET | `/api/curricula` | list curricula for the subject selector |
| POST | `/api/curriculum/upload` | multipart PDF upload → background ingest job |
| GET | `/api/curriculum/jobs/:id` | poll ingest progress |
| GET/POST/DELETE | `/api/learners`, `/api/learners/:studentId` | learner CRUD (`requireAuth` + `requireOwnership`) |
| POST | `/api/learners/:studentId/onboarding` | save onboarding answers |
| GET | `/api/learners/:studentId/events` | evidence event log, filterable by conceptId |
| POST | `/api/learners/:studentId/subjects/:subjectId/concepts/:conceptId/misconceptions/:misconceptionId/dispute` | "That's not right" dispute action |
| POST | `/api/session/start` | resolve/create learner + curriculum + next concept (via `isConceptMastered()` — gates on the evidence-checked `masteryStatus` when set, see AGENT_GUIDE.md landmine #3 — not raw `masteryScore` alone), compile Teaching Plan, return `sessionId` |
| GET | `/api/session/:sessionId` | fetch session + learner + current concept state |
| POST | `/api/session/:sessionId/assess` | grade a quiz-click answer (legacy, non-voice path); auto-advance also gated by `isConceptMastered()` |
| POST | `/api/session/:sessionId/end` | close session |
| GET | `/api/learner-context/:studentId/:subjectId` | plain-text learner summary used to seed the voice tutor's prompt |

## 6. WebSocket (`/ws/live`)

Client → server messages: `audio`/`audio_in` (forwarded to Gemini Live), `text`, `tool_response` (logged only, no action taken), `close`.

Gemini Live tool calls dispatched in `server.ts`'s switch:
- `assess_child_reasoning` → `handleAssessChildReasoning()` → `recordReasoningEvidence()`, sends `learner_update_v2`/`plan_update` back to the browser. Fire-and-forget so the voice model isn't blocked past `ASSESS_BUDGET_MS` (2500ms).
- `record_confusion_signal` → `handleRecordConfusionSignal()` → `recordConfusionSignal()` (added 2026-09-26 — see AGENT_GUIDE.md landmine #2).
- Every other tool name (`update_chalkboard_notes`, `set_figure`, `reveal_part`, `pose_quiz`, `generate_photo_visual`, etc.) is a pure board/UI relay to the browser and gets an immediate generic ack — **these never touch the learner model.** If you add a new tool that SHOULD persist something, you must add an explicit dispatch case, or it silently no-ops (see AGENT_GUIDE.md landmine #2 for exactly this mistake already made once).

## 7. The persona / prompt pipeline (read this before touching tutor behavior)

Session start (`POST /api/session/start`) → `compileTeachingPlan()` (`src/plan/compile.ts`) reads the learner's full history (mastery, ladder, misconception ledger, `strategyProfile`) and produces a `TeachingPlan`: target concept, prerequisites to probe, **representation order** (ranked via `rankRepresentations()` against that child's Beta-distribution strategy-effectiveness profile), representations to avoid, watched misconceptions, difficulty, pace, scaffold level.

That plan is rendered to text by `renderPlanForPrompt()` (`src/plan/render.ts`) and passed as `planBlock` into `composeSystemInstruction()` (`src/persona/compose.ts`) — the ONLY function that assembles the actual system prompt sent to Gemini Live. It also takes `ageBand` and `subjectMode` (both derived from session metadata, not learner history) and `channel`.

**This is the only live path.** `src/live/liveConfig.ts` still contains two older system-instruction builders (`classicSystemInstruction`, `adaptiveSystemInstruction`) and `server.ts` has a third, inline fallback string gated behind `process.env.PERSONA === 'legacy'`. None of these three are used by default — only `persona/compose.ts` is. Do not edit `liveConfig.ts`'s instruction builders expecting it to change live tutor behavior.

**Key architectural decision (see AGENT_GUIDE.md and DECISIONS.md):** the persona's identity/voice/character/safety rules are DELIBERATELY fixed across every learner. Personalization happens entirely in the Teaching Plan layer (representation order, avoid-list, difficulty, pace), not in the persona's voice. Do not build a mechanism that mutates the persona's core identity per child — that was considered and rejected; see the product discussion in this project's chat history / DECISIONS.md if a "make the persona itself adapt" request comes up again.

## 8. Frontend (`src/components/`, orchestrated by root `App.tsx`)

Notable ones: `DynamicBlackboard.tsx` (main teaching canvas, largest component), `Interactive2DDiagram.tsx` (client-side figure rendering — no Gemini image call needed for most concepts), `PhotoRealisticVisual.tsx` (AI-generated photo visuals via `/api/generate-image` — currently blocked by zero image quota, see DECISIONS.md), `LearnerProfilePanel.tsx` (the child's mastery/misconception card — this is what BUILD_PLAN.md calls `LearnerCard.tsx`; that file was never created, this one was extended instead — tracked drift, not a bug), `TutorReasoningPanel.tsx` (surfaces live diagnosis output for judges/parents), `ParentPortal.tsx` (parent dashboard — had a cross-student evidence-caching bug fixed 2026-09-26, see AGENT_GUIDE.md landmine #1), `CurriculumUpload.tsx`.

## 9. Test coverage — honest state

Real but narrow: `tests/run.mjs` (model-selection/retry/timeout edge cases for `reasoningAssessor.ts`, stubbed Gemini), `tests/live/run.mjs` (genuine WS-protocol integration test against a stubbed Live session), `tests/smoke/gateway.mjs` and `tests/smoke/plan-and-store.mjs` (the latter is NOT wired into `npm test` — runs manually only). **Zero coverage** on: every REST route, `requireAuth`/`requireOwnership`, the Firestore repo path, any React component, the persona composer, curriculum ingestion. Treat any change to those areas as untested until proven otherwise by manual verification.

## 10. Known drift / landmines

See `docs/AGENT_GUIDE.md` for the full, maintained list — it is the doc you must update when you find or fix another one.
