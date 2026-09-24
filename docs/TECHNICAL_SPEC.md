# Technical Specification — Adaptive AI Tutor

_Status: v1.0 · 2026-09-24 · Repo: `pythagoras-tutor`_

## 1. Current state (as-is audit, 2026-09-24)

Stack: React 19 + Vite + Tailwind (client) · Express + `ws` in `server.ts` (API + Gemini Live
proxy) · `@google/genai` · Firebase (Auth, Firestore, Storage, Hosting, Functions) · Cloud Run
(`dr-marcus-live`) · esbuild bundle.

| Area | Finding | Impact on this plan |
|---|---|---|
| **Persona prompts** | Three different system prompts: inline `dynamicSystemInstruction` in `server.ts` (the one **actually used** by the live WebSocket), `classicSystemInstruction` and `adaptiveSystemInstruction` in `src/live/liveConfig.ts` (not wired to the live path) | Replace all three with one composer (T05–T07) |
| **Learner identity in the live session** | The `/ws/live` handler receives `topic, grade, subjectId, conceptId` but **no `studentId`**; the voice tutor has no learner context | Core gap — T04 |
| **Diagnosis** | Two paths: `assessmentEngine` (quiz clicks, tuned deltas) and `reasoningAssessor` (closed catalogue, probes; imported in `server.ts` but not called on the live path after the latency decision). `LiveObserver` produces a session-only snapshot, not persisted and not linked to a learner | Unify into one Diagnostician → `recordEvidence` (T11) |
| **Learner model** | `learnerModel.ts` + `bkt.ts` + `learnerStore.recordReasoningEvidence` are solid (BKT, ledger, strategy outcomes) | Keep and extend (T09–T10) |
| **Persistence** | `learnerStore` writes `data/learner-profiles.json` (lost on Cloud Run restart); `/api/learners` partially uses Firestore; `/api/session/*` uses the file store | Single repository, Firestore-first (T03) |
| **Security** | `firestore.rules`: `learners` has `allow read: if true` — **children's data is publicly readable** | Fix first (T02) |
| **Models** | IDs `gemini-3.8-live`, `gemini-3.6-flash`, `gemini-3.8-flash`, `gemini-3.1-flash-*` unverified (PROJECT_STATE); several paths fall back silently to local generators | Verify + fail loudly (T01) |
| **Uncommitted work** | ~14 modified/untracked files in git | Commit/branch before starting Sonnet tasks (T00) |
| **Tests** | Offline stub tests for the assessor and live paths (`tests/`) | Extend with plan/model/persona tests |

## 2. Target architecture

```
┌──────────────────────────── Client (React) ─────────────────────────────┐
│ Onboarding · Lesson stage (voice/text) · Board · Learner card ·        │
│ Tutor's-reasoning panel · Parent portal                                 │
└───────────────┬───────────────────────────────┬─────────────────────────┘
          REST /api/*                      WS /ws/live?studentId&subjectId&conceptId
┌───────────────▼───────────────────────────────▼─────────────────────────┐
│ Server (Express on Cloud Run)                                           │
│  Session Orchestrator  ── loads profile → compileTeachingPlan →          │
│                           composeSystemInstruction → opens tutor channel │
│  ├─ Persona composer         src/persona/*        (fixed core + surface)  │
│  ├─ Tutor channel: Voice     Gemini Live           (existing proxy)       │
│  ├─ Tutor channel: Text      Gemini generateContent (/api/tutor/turn)     │
│  ├─ Exchange segmenter       from Live transcripts / text turns            │
│  ├─ Diagnostician            Gemini fast model, JSON schema, closed catalogue (async) │
│  ├─ recordEvidence           BKT · ledger · ladder · mastery · strategyProfile │
│  ├─ Plan compiler/delta      deterministic, src/plan/*                    │
│  ├─ Guidance injector        plan delta → tutor (non-blocking)            │
│  ├─ Profiler (session end)   Gemini stronger model → claims + summary     │
│  └─ Claim validator, Review scheduler, Decay                              │
│  Repository layer            src/adaptive/repo/* (Firestore | file for tests) │
└───────────────┬─────────────────────────────────────────────────────────┘
                ▼
        Firestore: learners/{id}, /events, /plans, /sessions · curricula
```

**Layer separation (project rule 17):** UI (`src/components`) · application/orchestration
(`server/session/*`) · AI/model layer (`src/ai/*` — one wrapper for model resolution, timeouts,
logging) · persona (`src/persona`) · plan (`src/plan`) · learner model (`src/adaptive`) · data
(`src/adaptive/repo`) · evaluation (`eval/`) · observability (structured logs).

## 3. Components

| Component | File(s) | Responsibility | New / changed |
|---|---|---|---|
| Model gateway | `src/ai/gateway.ts` | Resolve model IDs at startup, `generateJSON(schema)`, timeout, retry, log `{call, model, ms, tokens, ok}`; demo-mode flag disables silent fallbacks | New (consolidates duplicated candidate lists) |
| Persona composer | `src/persona/*` | TUTOR_PERSONA §19 | New |
| Plan compiler | `src/plan/compile.ts`, `delta.ts`, `render.ts` | TEACHING_PLAN | New |
| Repository | `src/adaptive/repo/{index,firestore,file}.ts` | `getProfile, saveProfile, appendEvent, listEvents, savePlan, saveSession` (async) | New; `learnerStore` refactored onto it |
| recordEvidence | `src/adaptive/learnerStore.ts` | Extend `recordReasoningEvidence` → ladder, mastery status, strategyProfile, affect, eventId, planVersion | Changed |
| Diagnostician | `src/adaptive/diagnostician.ts` | Merge of `liveObserver` (transcript windows, non-blocking) + `reasoningAssessor` (closed catalogue, error class) | New (replaces two paths) |
| Exchange segmenter | `src/adaptive/segmenter.ts` | Turn Live transcripts into `{question, answer, reasoning, confidencePhrase}` exchanges | New (extracted from observer) |
| Profiler + validator | `src/adaptive/profiler.ts`, `claimValidator.ts` | LEARNER_MODEL §5.2 | New |
| Review + decay | `src/adaptive/review.ts` | LEARNER_MODEL §7 | New |
| Session orchestrator | `server/session/orchestrator.ts` | Start: load → compile → compose → connect. Per exchange: diagnose → record → delta → push. End: profile → summarise → schedule | New (extracted from `server.ts`) |
| Text tutor endpoint | `server/routes/tutor.ts` | `POST /api/tutor/turn` | New |
| UI | `LearnerCard.tsx`, `TutorReasoningPanel.tsx`, `Onboarding.tsx`; extend `ParentPortal.tsx`, `LearnerProfilePanel.tsx` | Views | New / changed |

## 4. APIs

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/learners` | Create/update the profile (existing; move onto the repo) |
| GET | `/api/learners/:id` | Profile (owner/parent only) |
| DELETE | `/api/learners/:id` | Delete the profile + subcollections (NFR-03) |
| POST | `/api/learners/:id/onboarding` | Save onboarding |
| POST | `/api/learners/:id/claims/:claimId/dispute` | Learner/parent correction |
| GET | `/api/learners/:id/events?conceptId=` | Evidence replay |
| POST | `/api/session/start` | Compile the plan; returns `{sessionId, plan}` (existing, extended) |
| POST | `/api/session/:id/end` | Trigger the Profiler (existing, extended) |
| POST | `/api/tutor/turn` | Text-channel turn: `{sessionId, learnerText, confidence?}` → `{tutorText, board?, move, reasoning}` |
| WS | `/ws/live?sessionId=…` | Voice; the server resolves learner/plan from `sessionId` (**not** from client-sent topic/grade) |
| WS msg | `learner_update`, `plan_update`, `tutor_reasoning` | Server → client pushes |

All learner endpoints require Firebase Auth; the server verifies the ID token and ownership.

## 5. Key sequences

### 5.1 Session start
`client → POST /session/start {studentId, subjectId, conceptId?, channel}` → repo.getProfile →
`compileTeachingPlan` → repo.savePlan → `composeSystemInstruction(persona, ageBand, subjectMode,
channel, plan, curriculumCtx)` → return `{sessionId, plan}` → client opens WS with `sessionId`
→ server connects Gemini Live with the composed instruction and a kickoff built from the plan
(reviews first, then prerequisite probes).

### 5.2 Per exchange (voice)
Live transcripts → segmenter detects `turnComplete` after a learner answer → Diagnostician
(async, deadline 4 s, never awaited by the voice path) → `recordEvidence` → `compilePlanDelta`
→ WS push `learner_update`, `plan_update`, `tutor_reasoning` → guidance injector.

### 5.3 Guidance injection (spike T19 decides)
Option A: send the one-line guidance into the Live session as client text content at the next
turn boundary (only when the model is not speaking). Option B: expose `get_next_step` as a
**fast** tool (returns the last computed delta instantly from memory — no model call inside the
tool, so no speech pause beyond a round-trip). Option C (fallback): UI + next-session only.
Acceptance: added voice latency p95 < 300 ms and no interruption of tutor speech.
_Hypothesis: option B is the most reliable given the earlier finding that blocking tools caused
pauses — a pure in-memory tool should not block. To be measured._

### 5.4 Session end
`/session/:id/end` or WS close or idle → Profiler (deadline 20 s, off the request path) →
validator → repo.saveProfile + saveSession → review scheduling.

## 6. AI calls (GenAI necessity)

| Call | Model tier | Input | Output (JSON schema) | Why GenAI is necessary | Failure handling | Evaluation |
|---|---|---|---|---|---|---|
| Tutor (voice) | Gemini Live | Composed persona + plan + curriculum context; audio | Speech + tool calls | Natural, adaptive explanation and dialogue | Reconnect/resume; text-channel fallback | EV-03 adherence |
| Tutor (text) | Fast model | Same composed prompt + history | `{tutorText, move, board?}` | Same | Retry once; canned "let me think" + retry | EV-03 |
| Diagnostician | Fast model | Question, answer, reasoning, closed catalogue, concept facts, recent ledger | `{classification, understandingDepth, errorClass, candidateMisconceptionIds, confidence, reasoningSummary, probeQuestion?}` | Interpreting free-text reasoning; rules cannot | Deadline → conservative "needs_clarification" (existing behaviour); never asserts a misconception on failure | EV-01 |
| Profiler | Stronger model | Session events, active claims, onboarding | `{claims[], retire[], narrative}` | Summarising patterns across evidence into scoped plain language | Skip → retry at next session; model state is still correct without it | Claim-validator rejection rate; human spot-check |
| Content generation (visuals, examples, transfer items) | Existing image/lesson paths | Concept + interests + representation | Visual / item | Generating a new representation on demand | Pre-generated assets for the demo concept | Manual review |

## 7. Observability
Structured JSON logs per AI call (`src/ai/gateway.ts`); per session: `personaVersion`,
`planVersion`, moves, event IDs; a `/api/debug/session/:id` endpoint (dev only) returning the
timeline. Demo mode shows a visible banner if any model fell back.

## 8. Security & privacy
Firebase Auth required; server-side ownership checks; Firestore rules deny client reads of
`learners/**` except by the owner/linked parent; no public reads; delete endpoint; data
minimisation (no school names, photos or addresses); no psychological or medical labels (claim
validator lexicon). Pitch answer: Singapore PDPA-aligned practices — consent by a parent
account, purpose limitation, access and deletion (legal review not performed; state it as a
design stance).

## 9. Deployment
Cloud Run service (existing `scripts/deploy-cloudrun.sh`) with env: `GEMINI_API_KEY` (Secret
Manager), `USE_FIRESTORE_LEARNERS=true`, `DEMO_MODE`, model IDs. Firebase Hosting for the client
with `/api/**` rewrites (existing). WebSocket direct to Cloud Run (existing workaround).

## 10. Testing strategy
| Layer | Tests |
|---|---|
| Plan compiler | TP-01…TP-08 (pure unit) |
| recordEvidence | Ledger, BKT, ladder, mastery status, strategyProfile (pure unit with the file repo) |
| Claim validator | Missing refs, banned labels, confidence caps, disputes |
| Persona composer | Snapshot per age band × subject mode × channel; hard rules present; plan block present |
| Diagnostician | Existing offline stub scenarios + EV-01 labelled set (live model, run manually) |
| End-to-end | Simulated-learner harness through `/api/tutor/turn` (EV-02, EV-03) |
