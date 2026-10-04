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

**2026-09-26:** `EventFilter` (`repo/types.ts`) gained a `sessionId` field (T14 — the Profiler needs "this session's events," not just "this concept's events"), implemented in both backends. The Firestore path now does `.where('conceptId', ...).where('sessionId', ...).orderBy('timestamp', ...)` when both are given — this MAY need a composite index the first time it runs against a real Firestore project; `firestore.indexes.json` (see above) does not pre-declare it and this sandbox cannot create/test Firestore indexes. Verify on first real deploy.

**Rule of thumb for any future storage change: change both `file.ts` and `firestore.ts` together, or you've silently made dev and prod diverge.**

### 4.1 Curriculum library store (2026-09-26 — docs/CURRICULUM.md)

Courses (one per board + grade + subject, id e.g. `igcse--g8--mathematics`) live in `src/curriculum/ingest.ts`: Firestore collection `curricula/{courseId}` when the Admin SDK is initialised (reached via `require()`, so in practice the bundled production server), else `data/curricula.json` (`CURRICULA_FILE` overrides it — tests). In-memory cache loaded once. `saveCurriculumAsync()` loads the store before writing (a cold fire-and-forget save could previously overwrite the local file with one course) and strips `undefined` before Firestore writes. `deleteCurriculum()` removes a course. One course = one Firestore document (1 MiB limit; warning logged above 900 KB). Concept ids, misconception ids and `conceptType` are assigned once at ingest and never changed — learner data is keyed on them (AGENT_GUIDE landmine #6).

### 4.2 Pre-generated lesson/diagram/photo cache (2026-09-27 — docs/CURRICULUM.md §8, D-2026-09-27-2)

`src/curriculum/pregenStore.ts`: Firestore collection `pregen/{conceptId-or-topic-slug}` for the
lesson/diagram JSON, Cloud Storage (`pregen-images/<key>.<ext>`, public) for the generated photo —
base64 in, URL stored, never inlined into the Firestore doc. Local-file fallback
(`data/pregenerated/*.json`) when Firebase isn't configured, same format as before this store
existed. Same `require('../firebase/admin')` caveat as §4.1 (production-CJS only; `npx tsx` dev
falls back to the local file). Every one of the three live REST endpoints that call Gemini for
lesson/diagram/photo content now cache-checks before calling and cache-saves the result:
`/api/generate-lesson`, `/api/update-diagram`, `/api/generate-image` (the last of these had **no**
caching at all before this — every photo request, including a repeat request for the same topic in
the same session, called Gemini again; fixed by keying on `conceptIdFor(topic)` from `App.tsx`,
skipped only when the request carries a user-typed custom prompt, which is a genuinely one-off image
and is never cached). `scripts/pregenerate-assets.ts` (the batch ingest-time job) uses the same store.

**Board pictures** (2026-09-28, D-2026-09-28-7) live in the same record under `visuals`
(`main`, `contrast:<id>`, `apply`, `3d`, `focus:<slug>`) plus `visualsDeclined`. Firestore rejects
arrays nested inside arrays, which pictures are full of, so `pregenStore.ts` stores the maps as JSON
string fields (`visualsJson`, `quarantineJson`) in Firestore (`toFirestore`/`fromFirestore`) and as plain JSON in
local files. **Quality fields (2026-09-30, D-2026-09-30-1…4):** `visualsQuarantine` (pictures that failed the gates — never served),
`lessonQuarantine`, `photoUrl` + `photoMeta{verified, caption, intent, source:'ai-generated'}` (served only when `verified`),
`quality` (`RecordQuality`: errors, warnings, `criticRan`, `coverageGaps`, `untaughtLadderItems`, `withheld`), and tutor-only `lessonData.diagnostics`. Pictures are never stored inside `lessonData`; `/api/generate-lesson` attaches them
(`lessonData.visual`, `lessonData.visual3d`) when serving.

### 4.2b Content quality layer (2026-09-30 — docs/BOARD_VISUALS.md §5b, D-2026-09-30-1…4, docs/CH1_FIX_PLAN.md)

`src/quality/` holds the gates every generated artefact passes; nothing in it imports the server or the UI, and it talks to a model only
through the `JsonModel` seam (`model.ts`: production = gateway, tests = scripted fake). Layers: **lints** (`language`, `quizTools`,
`leakLint`, `visualLint`, `lessonLint`) → **independent critic** (`critic.ts`, gateway role `review`) → **repair loop** in the generators
(`src/visual/generate.ts`, `src/curriculum/lessonGen.ts`, `photoGen.ts`) → **fail closed** (quarantine, never serve). `recordLint.ts` re-runs
the lints over stored records (used by `scripts/review-pregen.ts`, `scripts/upgrade-pregen.ts`); `upgrade.ts` is the offline, deterministic
upgrade of pre-gate records. `src/curriculum/serve.ts` is the boundary rule for what reaches a browser. Client-side, `App.tsx` puts every quiz in
seeded order (`normalizeQuiz`) and `DynamicBlackboard.tsx`'s `QuizPanel` asks *how did you decide?* before revealing.

### 4.3 Board pictures (2026-09-28 — docs/BOARD_VISUALS.md, D-2026-09-28-7)

`src/visual/` (isomorphic except `generate.ts`): `types.ts` (the brick vocabulary, steps),
`expr.ts` (safe maths-expression compiler, no eval), `sanitize.ts` (sanitizer + fact-checker),
`prompt.ts` (tutor-method prompts: main / contrast / apply / 3D, persona + truth rules, repair + planner prompts), `generate.ts` (planner, gated draft→lint→critic→repair loop, strip unverified claims, quarantine), `tutorBrief.ts` (voice-prompt block, `reveal_part`
matching, focus lookup), `layout.ts` (frame mapping, ticks, clipping, collision-free labels),
`samples.ts` (reference pictures — never given to the model). Rendered by
`src/components/BoardVisualView.tsx` (SVG) and `src/components/Board3DView.tsx` (Three.js), chosen
in `ScenePanel.tsx`.

## 5. REST API (all routes in `server.ts`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness + whether `GEMINI_API_KEY` is set |
| POST | `/api/generate-lesson` | generate/serve a cached lesson; optional `conceptId` → pregen store (§4.2), else topic slug. Attaches the board pictures (`visual`, `visual3d`). On a cache miss, lesson text (`generateLessonText`) and the main picture are generated in parallel through the gates (2 attempts) and saved back; a lesson that fails the gates is **not** shown (curriculum-engine template, `source: 'intelligent-curriculum-engine'`). Strips tutor-only fields (`diagnostics`, `quiz.optionNotes/lookFor`) and legacy `scene3d/photoVisual/diagram`; returns `photoUrl` + `photoCaption` only for a verified photo |
| POST | `/api/update-diagram` | a board picture for a focus (`{ success, visual, key, source }`): a prepared one first (exact key, `contrast: <id>`, `apply`, or fuzzy match), else one drawn with the concept's own material, fact-checked and saved as `focus:<slug>` (or `main` for an older lesson with none). On failure `success: false` — the board keeps its picture; there is no generic fallback |
| POST | `/api/generate-image` | the illustration tab; default photo is served from the pregen store **only when `photoMeta.verified`**, else planned → generated → vision-reviewed → cached only if verified. A custom prompt is generated and reviewed against that request, never cached. `{success:false, error}` on failure — no stock fallback. Responses carry the reviewer's `caption` and `aiGenerated:true` |
| GET | `/api/curricula?board=&grade=` | courses for the subject selector / onboarding, filtered to a learner's board + grade (no filter = all) |
| GET | `/api/catalog` | boards (known + in library), grades 1–12, and which board+grade pairs have content — for signup and the admin form |
| POST | `/api/curriculum/upload` | **admin** (`requireAdmin`, before multer). Fields `textbooks[]` (+ legacy `pdfs`), optional `syllabus`, `board`, `grade`, `subject` → background ingest job; 409 if that course is already ingesting |
| GET | `/api/curriculum/jobs/:id` | **admin** — poll ingest progress (stage, progress, warnings, review report) |
| GET | `/api/admin/check` | validate admin access (token / claim / local-dev) |
| GET / DELETE | `/api/admin/courses`, `/api/admin/courses/:id` | **admin** — course list with review reports; delete a course |
| GET/POST/DELETE | `/api/learners`, `/api/learners/:studentId` | learner CRUD (`requireAuth` + `requireOwnership`); POST accepts `board` + `gradeLevel` (2026-09-26) |
| POST | `/api/learners/:studentId/onboarding` | save onboarding answers |
| GET | `/api/learners/:studentId/events` | evidence event log, filterable by `conceptId` and (2026-09-26) `sessionId` |
| POST | `/api/learners/:studentId/subjects/:subjectId/concepts/:conceptId/misconceptions/:misconceptionId/dispute` | "That's not right" dispute action |
| POST | `/api/learners/:studentId/escalations/:escalationId/resolve` | (2026-09-26, T22) parent/teacher marks a PARK_AND_ESCALATE event reviewed — see AGENT_GUIDE.md landmine #4, D-2026-09-26-5 |
| POST | `/api/session/start` | resolve/create learner + curriculum + next concept (via `isConceptMastered()` — gates on the evidence-checked `masteryStatus` when set, see AGENT_GUIDE.md landmine #3 — not raw `masteryScore` alone), compile Teaching Plan, return `sessionId` |
| GET | `/api/session/:sessionId` | fetch session + learner + current concept state |
| POST | `/api/session/:sessionId/assess` | grade a quiz answer (non-voice path); body carries `reasoning {how, text}` (asked **before** the reveal) and `itemId`. The key and tutor-only notes come from the **stored** quiz (matched by option text), not the client; `capForEvidence` caps a pick with no child-written reasoning at recognition; auto-advance also gated by `isConceptMastered()` |
| POST | `/api/session/:sessionId/end` | close session |
| GET | `/api/learner-context/:studentId/:subjectId` | plain-text learner summary used to seed the voice tutor's prompt |

## 6. WebSocket (`/ws/live`)

Client → server messages: `audio`/`audio_in` (forwarded to Gemini Live), `text`, `tool_response` (logged only, no action taken), `close`.

Gemini Live tool calls dispatched in `server.ts`'s switch:
- `assess_child_reasoning` → `handleAssessChildReasoning()` → `recordReasoningEvidence()`, sends `learner_update_v2`/`plan_update` back to the browser. Fire-and-forget so the voice model isn't blocked past `ASSESS_BUDGET_MS` (2500ms).
- `record_confusion_signal` → `handleRecordConfusionSignal()` → `recordConfusionSignal()` (added 2026-09-26 — see AGENT_GUIDE.md landmine #2).
- `update_diagram` → `handleUpdateDiagramTool()` (2026-09-28): a store read bounded to 1.2 s finds the prepared picture for the focus and answers with its **step names** (`board.steps` + an instruction to build it with `reveal_part`); on a miss it answers at once with "a new picture is being drawn". It never generates — the browser's `/api/update-diagram` does, so nothing is billed twice. At session start the concept's pictures are also given to the tutor up front (`composeSystemInstruction({ boardContext })`, the THE BOARD PICTURES block from `src/visual/tutorBrief.ts`).
- Every other tool name (`update_chalkboard_notes`, `set_figure`, `reveal_part`, `pose_quiz`, `generate_photo_visual`, etc.) is a pure board/UI relay to the browser and gets an immediate generic ack — **these never touch the learner model.** If you add a new tool that SHOULD persist something, you must add an explicit dispatch case, or it silently no-ops (see AGENT_GUIDE.md landmine #2 for exactly this mistake already made once).

### 6.1 Plan-delta guidance delivery (T19, 2026-09-26)

`compilePlanDelta()`'s result (`delta.instruction` — PARK_AND_ESCALATE's parking
guidance, `encourageReset`'s pacing guidance, representation-switch instructions)
is queued in a `pendingPlanGuidance` closure variable and merged into the
`instruction` field of whichever tool response fires NEXT via the shared
`sendToolResponse()` function — not sent through a new Live API call. See
AGENT_GUIDE.md landmine #4 and DECISIONS.md D-2026-09-26-4 for why (this
sandbox cannot reach Gemini Live to test a new injection mechanism) and its
known latency trade-off (`[T19 latency]` console log captures real numbers
on a machine with Gemini Live access).

### 6.2 Session-end Profiler (T14, 2026-09-26)

`clientWs.on('close', ...)` fires `runProfiler()` (`src/adaptive/profiler.ts`,
fire-and-forget) — the slow loop from `docs/LEARNER_MODEL.md §5.2`. Calls
Gemini via `src/ai/gateway.ts`'s `role: 'strong'`, proposes claims + a
narrative, gates every claim through `src/adaptive/claimValidator.ts`
(deterministic — confidence, evidence-ownership, banned-label lexicon,
scope, contradiction checks all live there, never in the LLM call — see
AGENT_GUIDE.md landmine #5), then persists merged claims + a `SessionSummary`
via `getRepo().saveProfile()`/`saveSessionSummary()`. T15 (decay + spaced
review scheduling) is NOT part of this — see D-2026-09-26-6.

## 7. The persona / prompt pipeline (read this before touching tutor behavior)

Session start (`POST /api/session/start`) → `compileTeachingPlan()` (`src/plan/compile.ts`) reads the learner's full history (mastery, ladder, misconception ledger, `strategyProfile`) and produces a `TeachingPlan`: target concept, prerequisites to probe, **representation order** (ranked via `rankRepresentations()` against that child's Beta-distribution strategy-effectiveness profile), representations to avoid, watched misconceptions, difficulty, pace, scaffold level.

That plan is rendered to text by `renderPlanForPrompt()` (`src/plan/render.ts`) and passed as `planBlock` into `composeSystemInstruction()` (`src/persona/compose.ts`) — the ONLY function that assembles the actual system prompt sent to Gemini Live. It also takes `ageBand` and `subjectMode` (both derived from session metadata, not learner history) and `channel`. **2026-09-26:** `ageBand` comes from the learner's numeric grade (`ageBandFromGrade`, Grades 8–12 → 13–17); `subjectMode` is the course's own `subjectMode` assigned at ingest (`subjectModeForCurriculum`). The curriculum block (`curriculumIntelligence.ts`) now supplies only WHAT to teach — scope with its provenance, verified worked examples, prerequisite check questions, L1–L4 ladder items, representation ideas, misconception probes — and no longer carries its own teaching order that competed with the plan's representation order. See docs/CURRICULUM.md §7.

**This is the only live path.** `src/live/liveConfig.ts` still contains two older system-instruction builders (`classicSystemInstruction`, `adaptiveSystemInstruction`) and `server.ts` has a third, inline fallback string gated behind `process.env.PERSONA === 'legacy'`. None of these three are used by default — only `persona/compose.ts` is. Do not edit `liveConfig.ts`'s instruction builders expecting it to change live tutor behavior.

**Key architectural decision (see AGENT_GUIDE.md and DECISIONS.md):** the persona's identity/voice/character/safety rules are DELIBERATELY fixed across every learner. Personalization happens entirely in the Teaching Plan layer (representation order, avoid-list, difficulty, pace), not in the persona's voice. Do not build a mechanism that mutates the persona's core identity per child — that was considered and rejected; see the product discussion in this project's chat history / DECISIONS.md if a "make the persona itself adapt" request comes up again.

## 8. Frontend (`src/components/`, orchestrated by root `App.tsx`)

Notable ones: `DynamicBlackboard.tsx` (main teaching canvas, largest component), `Interactive2DDiagram.tsx` (client-side figure rendering — no Gemini image call needed for most concepts), `PhotoRealisticVisual.tsx` (AI-generated, reviewed illustrations via `/api/generate-image`; labelled AI-generated, shows a plain notice instead of a stock/placeholder picture when none can be verified — 2026-09-30), `LearnerProfilePanel.tsx` (the child's mastery/misconception card — this is what BUILD_PLAN.md calls `LearnerCard.tsx`; that file was never created, this one was extended instead — tracked drift, not a bug), `TutorReasoningPanel.tsx` (surfaces live diagnosis output for judges/parents), `ParentPortal.tsx` (parent dashboard — had a cross-student evidence-caching bug fixed 2026-09-26, see AGENT_GUIDE.md landmine #1; gained a "Needs Your Attention" escalations section 2026-09-26, see landmine #4 / D-2026-09-26-5), `Onboarding.tsx` (2026-09-26 — 4-step interests/feelings/access/language flow, built but not yet deployed, see TRACEABILITY.md FR-09), `CurriculumUpload.tsx` + `AdminLibrary.tsx` (2026-09-26 — admin content library: upload textbooks/syllabus per board+grade+subject, stage progress, AI review report, delete; reached from the login screen, never from learner screens), `LoginScreen.tsx` (signup now captures board + grade), `SubjectSelector.tsx` (only the learner's board+grade courses, grouped by chapter, "Builds on" hints instead of locks — D-2026-09-26-8). **2026-09-28:** `BoardVisualView.tsx` / `Board3DView.tsx` draw the board pictures (§4.3, docs/BOARD_VISUALS.md) in `ScenePanel.tsx`'s Shape and 3D views; `App.tsx` holds `visualStep` / `visual3dStep` / `visualSpotlight` and moves them from `reveal_part`, `highlight_concept`, `update_diagram` and `switch_board_view` (the tool-call callback reads the current pictures through `boardVisualsRef`). The legacy `ConceptMapRenderer` and `Interactive3DVisual` are used only for lessons generated before board pictures; the 3D tab is hidden when a concept has no 3D picture.

## 9. Test coverage — honest state

Real but narrow: `tests/run.mjs` (model-selection/retry/timeout edge cases for `reasoningAssessor.ts`, stubbed Gemini), `tests/live/run.mjs` (genuine WS-protocol integration test against a stubbed Live session), `tests/smoke/gateway.mjs` and `tests/smoke/plan-and-store.mjs` (the latter is NOT wired into `npm test` — runs manually only). **2026-09-26:** added `tests/smoke/claim-validator.mjs` (19 assertions) and `tests/smoke/profiler.mjs` (end-to-end against a real throwaway file-repo dir, deterministic-fallback path since this sandbox has no Gemini network access) — same convention as `plan-and-store.mjs`: real, runnable, NOT wired into `npm test` yet. Run manually: `npx tsx tests/smoke/claim-validator.mjs` / `npx tsx tests/smoke/profiler.mjs`. See D-2026-09-26-6. **2026-09-26:** added `tests/smoke/curriculum-ingest.mjs` (`npm run test:curriculum`) — the real ingest pipeline end to end with stubbed model steps, catalog/age-band/subject-mode parsing, the plan's prerequisite rules, delete. **2026-09-27:** added `tests/smoke/pregen-store.mjs` — the pregen store's local-fallback round trip, inline-base64-preserved-when-no-Storage-configured, candidate-list lookup, merge semantics; the Firestore/Storage branches themselves are NOT exercised against a real project (no credentials in this environment) — only that their `if (db)`/`if (bucket)` guards route correctly to the fallback. **2026-09-28:** added `tests/smoke/board-visual.mjs` + `board-visual-render.mjs` (`npm run test:visuals`, 46 checks: expression compiler, sanitizer and every fact-check, strip-on-failure, reveal matching, focus lookup, voice brief, Firestore encoding with no nested arrays, and the real React renderer server-rendered step by step) and `tests/smoke/board-visual-http.mjs` (7 checks against the real server with a temp pregen dir). These are the first tests that render a React component; the 3D view (WebGL) is not covered. **2026-09-30:** added `npm run test:gates` — `quality.mjs` (33 checks incl. the scripted-model repair/withhold/critic-unreachable loops and a regression corpus of the reviewed defective Chapter 1 material), `lesson-gen.mjs` (9), `photo-gen.mjs` (5), `quiz-evidence.mjs` (5), `ladder-pair.mjs` (5), `serve.mjs` (4). Real-model output quality is not covered. `tests/live/run.mjs` has 7 failures that pre-date this work (identical on the pre-change `server.ts`). **Zero coverage** on: every REST route (the curriculum/admin routes were exercised once over real HTTP, not by a test), `requireAuth`/`requireOwnership`/`requireAdmin`, the Firestore repo path, any React component, the persona composer, and a real (non-stubbed) Gemini ingest. Treat any change to those areas as untested until proven otherwise by manual verification.

## 10. Known drift / landmines

See `docs/AGENT_GUIDE.md` for the full, maintained list — it is the doc you must update when you find or fix another one.
