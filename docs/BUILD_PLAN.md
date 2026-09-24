# Build Plan — from the current repo to the complete idea

_Status: v1.0 · 2026-09-24 · Deadline per PROJECT_STATE: 18 Oct 2026 (the official site shows no
dates — re-verify on Hack2skill)_

Each task is sized so one coding agent (Sonnet) can complete it in one sitting, with explicit
files, steps and acceptance criteria. Specs referenced: **PER** = TUTOR_PERSONA.md,
**LM** = LEARNER_MODEL.md, **TP** = TEACHING_PLAN.md, **TS** = TECHNICAL_SPEC.md,
**FS** = FUNCTIONAL_SPEC.md.

Legend: Size S ≤ 2 h · M ≈ half a day · L ≈ 1 day. **Agent**: `sonnet` = straightforward coding;
`sonnet+review` = Sonnet builds, then a separate review pass (Opus or human) checks behaviour or
prompt quality.

---

## How to run a task with a Sonnet agent

Give each agent this prompt (fill in the task ID):

```
You are implementing task <ID> from docs/BUILD_PLAN.md in the pythagoras-tutor repo.
Read first: docs/BUILD_PLAN.md (task <ID> only), the spec sections it references, and
every file listed under "Files". Do not change behaviour outside the task's scope.
Rules: TypeScript strict; no secrets in code; keep existing exports working unless the
task says to remove them; add or extend tests; run `npm run lint` and the tests listed
in the acceptance criteria; commit on branch feat/<ID>-<slug> with message "<ID>: <title>".
Finish with: what changed, files touched, test output, anything left open.
```

Rules for the orchestrator (you): run tasks in the waves below; merge each wave before the next;
update TRACEABILITY.md status after each merge.

---

## Phase 0 — Foundations and hygiene

| ID | Task | Reqs | Depends | Size | Agent |
|---|---|---|---|---|---|
| T00 | Commit/branch the current uncommitted work; tag `baseline-2026-09-24` | — | — | S | human |
| T01 | Model gateway + model-ID verification | NFR-02 | T00 | M | sonnet |
| T02 | Lock Firestore rules and server auth checks for learner data | NFR-03 | T00 | S | sonnet+review |
| T03 | Learner repository (Firestore-first, file impl for tests); move `learnerStore` onto it (async) | FR-11 | T00 | L | sonnet |
| T04 | Session-scoped live WebSocket: `/ws/live?sessionId=`; server resolves learner, subject, concept, plan | FR-01, FR-17 | T03 | M | sonnet |

**T01 — Model gateway.** Files: new `src/ai/gateway.ts`; update `reasoningAssessor.ts`,
`liveObserver.ts`, `assessmentEngine.ts`, `pdfIngest.ts`, `server.ts` (lesson/diagram/image
candidates). Steps: one `resolveModels()` at startup that pings each configured ID (env
`MODEL_FAST`, `MODEL_STRONG`, `MODEL_LIVE`, `MODEL_IMAGE`) and logs which resolve;
`generateJSON({model, prompt, schema, timeoutMs})`; structured log per call; `DEMO_MODE=true` →
fallbacks raise a visible client banner via WS `system_warning`. Acceptance: `npm run
verify:models` prints ✅/❌ per ID; existing `npm run test:assessor` passes; no hard-coded model
lists remain outside the gateway.

**T02 — Security.** Files: `firestore.rules`, `server.ts` (learner routes), `src/firebase/admin.ts`.
Steps: remove `allow read: if true` on `learners`; client access denied (server-only via Admin
SDK); add a `requireAuth` middleware verifying the Firebase ID token and ownership
(`learners/{id}.ownerUid`); a dev bypass only when `NODE_ENV=development`. Acceptance: rules unit
test or emulator check shows an anonymous read is denied; API returns 401/403 without a token.

**T03 — Repository.** Files: new `src/adaptive/repo/{index,firestore,file}.ts`; refactor
`learnerStore.ts` to async repo calls; update `server.ts` callers. Steps: interface in TS §3;
Firestore layout in LM §9; events move to the `events` subcollection (keep the capped
`evidenceLog` mirror for existing UI until T22). Acceptance: all learner endpoints work with
`USE_FIRESTORE_LEARNERS=true` and `false`; a restart keeps data (Firestore); unit tests run
against the file repo.

**T04 — Session-scoped live WS.** Files: `server.ts` (WS handler), `src/utils/liveWs.ts`, `src/App.tsx`.
Steps: `/api/session/start` returns `sessionId` (+ plan once T17 lands; until then a stub plan);
the client opens `/ws/live?sessionId=`; the server looks up the session → learner, subject,
concept; reject unknown sessions. Keep the topic/grade query only for a `?guest=1` mode.
Acceptance: the live session logs `studentId`; the learner card receives updates for the right
learner.

## Phase 1 — Base tutor persona

| ID | Task | Reqs | Depends | Size | Agent |
|---|---|---|---|---|---|
| T05 | Encode the persona spec as modules `src/persona/*` | FR-01…FR-08 | T00 | L | sonnet+review |
| T06 | `composeSystemInstruction()` + snapshot tests | FR-01, FR-05, FR-06 | T05 | M | sonnet |
| T07 | Replace the three legacy prompts with the composer (flag `PERSONA=v1`, legacy behind `PERSONA=legacy`) | FR-01 | T06, T04 | M | sonnet+review |
| T08 | Text-channel tutor `POST /api/tutor/turn` (same composer, channel=text) | FR-25 | T06, T03 | M | sonnet |

**T05.** Files: `src/persona/{core,moves,representations,diagnosisPolicy,ageBands,subjectModes,channels,safety,config}.ts`.
Steps: transcribe PER §2–§17 into typed data + text blocks; **moves as data** (id, purpose,
trigger, shape, examples by age band); all numbers in `config.ts`; `PERSONA_VERSION='1.0.0'`.
Acceptance: `tsc` clean; every move ID in PER §6 exists; every limit in PER §14 is in config;
the reviewer confirms the text matches the spec (no invented rules).

**T06.** Files: `src/persona/compose.ts`, `tests/persona/compose.test.ts`. Signature:
`composeSystemInstruction({ageBand, subjectMode, channel, plan?, curriculumCtx?, learnerName?}): string`.
Order: identity → hard rules → session arc → moves (compact) → error policy → language rules →
surface (age band, subject mode) → channel constraints → **plan block** (TP §5) → curriculum
context → "If the plan conflicts with a HARD RULE, the hard rule wins." Acceptance: snapshots
for 4 age bands × 2 channels; the voice-channel output contains the board and tool rules from
the current adaptive prompt; length report printed (flag if > 12k chars for voice).

**T07.** Files: `server.ts` (replace `dynamicSystemInstruction`), `src/live/liveConfig.ts`
(keep tool declarations; mark classic/adaptive prompt functions deprecated), kickoff built from
the plan. Acceptance: live voice works end-to-end locally with `PERSONA=v1`; `PERSONA=legacy`
restores the old prompt; P-01 and P-16 are spot-checked manually on one session (log
transcript attached to the PR).

**T08.** Files: new `server/routes/tutor.ts` (or a section in `server.ts`). Steps: stateless per
turn with session history in memory/Firestore; returns `{tutorText, move, board?, reasoning}`;
runs the same per-exchange pipeline as voice. Acceptance: a curl script runs a 6-turn lesson;
events are recorded.

## Phase 2 — Learner model

| ID | Task | Reqs | Depends | Size | Agent |
|---|---|---|---|---|---|
| T09 | Extend types (LM §3) + `conceptType` on curriculum concepts | FR-11, FR-13, FR-15 | T03 | S | sonnet |
| T10 | Extend `recordEvidence`: eventId, ladder, mastery status, strategyProfile, affect, planVersion, moveUsed | FR-11…FR-15 | T09 | M | sonnet |
| T11 | Unified Diagnostician (segmenter + closed-catalogue classification + errorClass), async, feeding `recordEvidence`; route quiz clicks through the same recorder | FR-10 | T10, T01, T04 | L | sonnet+review |
| T12 | Confidence capture: UI buttons (text/board) + spoken-phrase detection in the segmenter | FR-14 | T11 | S | sonnet |
| T13 | Onboarding flow (UI + API) | FR-09 | T03 | M | sonnet |
| T14 | Profiler + claim validator (session end) | FR-16 | T10, T01 | M | sonnet+review |
| T15 | Spaced review + decay | FR-16, FR-21 | T10 | S | sonnet |

_(T16 is reserved for scope that comes up during the build.)_

**T09.** Files: `src/adaptive/learnerModel.ts`, `src/types.ts` (UI mirrors), `src/curriculum/*`
(derive `conceptType` — e.g. `subject.category` from the extractor; default `'general'`).
Acceptance: all optional; the existing profile JSON still loads.

**T10.** Files: `src/adaptive/learnerStore.ts`, new `src/adaptive/ladder.ts`,
`src/adaptive/strategyProfile.ts`, tests. Rules: PER §5 (depth→level map, mastery rule),
LM §5.1 (gain definition), LM §6.2 (Beta). Acceptance: unit tests — correct-with-flawed-method
lowers mastery (existing behaviour kept); L3 on 2 distinct items + pKnown ≥ 0.8 → provisional;
the Beta updates correctly.

**T11.** Files: new `src/adaptive/{segmenter,diagnostician}.ts`; retire the prompt in
`liveObserver.ts` (keep the class as a thin adapter) and fold the `reasoningAssessor` prompt
into the diagnostician; `server.ts` wiring; tests with the genai stub. Output schema: TS §6.
Acceptance: the voice path never awaits diagnosis; p95 diagnosis < 4 s on the stub-latency
test; one exchange → one event with an eventId; the existing four stub scenarios still pass.

**T13.** Files: new `src/components/Onboarding.tsx`, `POST /api/learners/:id/onboarding`.
Fields: LM §3 `Onboarding` + age band (from grade). ≤ 6 taps; skippable except the age band.
Acceptance: the first plan uses the interests (T17 test).

**T14.** Files: new `src/adaptive/{profiler,claimValidator}.ts`, hook in the session end.
Validator rules: LM §5.2. Banned-label lexicon in `config.ts`. Acceptance: validator unit
tests (missing ref, foreign ref, banned label, confidence cap, disputed conflict); one real
session produces ≥ 1 valid claim with refs.

**T15.** Files: new `src/adaptive/review.ts`. Rules: LM §7. Acceptance: unit tests for
interval progression, lapse reset, status transitions.

## Phase 3 — Per-learner teaching plan

| ID | Task | Reqs | Depends | Size | Agent |
|---|---|---|---|---|---|
| T17 | `compileTeachingPlan()` + persistence + tests TP-01…TP-08 | FR-17 | T10, T15, T05 | M | sonnet |
| T18 | `renderPlanForPrompt()`; wire into `/session/start` + composer + kickoff | FR-18, FR-21 | T17, T07 | S | sonnet |
| T19 | **Spike:** guidance injection into Live (options A/B/C, TS §5.3); measure latency; pick one | FR-19 | T11, T18 | M | sonnet+review |
| T20 | `compilePlanDelta()` + limits enforcement (probe budget, retry cap, park & escalate) | FR-19, FR-20 | T19 | M | sonnet |

**T19 acceptance:** a written result appended to DECISIONS.md with measured added latency p50/p95
and the interruption count across ≥ 10 exchanges per option; the chosen option implemented behind
`GUIDANCE_MODE`.

## Phase 4 — Views

| ID | Task | Reqs | Depends | Size | Agent |
|---|---|---|---|---|---|
| T21 | Learner card "What I've learned about you" + dispute | FR-22 | T14 | M | sonnet |
| T22 | Parent portal: ladder, ledger, claims → evidence replay, summaries, escalations | FR-23 | T14, T03 | M | sonnet |
| T23 | Tutor's-reasoning panel (move, rule, reason, evidence refs, last diagnosis) | FR-24, FR-04 | T20 | M | sonnet |

## Phase 5 — Evaluation and demo

| ID | Task | Reqs | Depends | Size | Agent |
|---|---|---|---|---|---|
| T24 | Diagnosis eval set (≥ 40 items per demo concept, ≥ 10 right-answer-wrong-reasoning) + runner → detection/FP report | EV-01 | T11 | M | sonnet+review (labels reviewed by a human) |
| T25 | Simulated-learner harness: Gemini-played students with scripted misconceptions + persona; base plan vs adapted plan via `/api/tutor/turn` → turns-to-resolution report | EV-02 | T08, T20 | L | sonnet+review |
| T26 | Persona adherence checker: rule checks (P-01, P-03, P-04, P-06, P-08, P-09…) + LLM-judge rubric for quality items | EV-03 | T08 | M | sonnet |
| T27 | Seeded demo learners (2–3 synthetic histories via the harness, labelled "simulated") + `npm run seed:demo` | FR-26 | T25 | S | sonnet |
| T28 | Demo script + rehearsal checklist; update PROJECT_STATE, DECISIONS, proposal PDF inputs | — | T21–T27 | S | human + Opus |

## Phase 6 — Deploy

| ID | Task | Reqs | Depends | Size | Agent |
|---|---|---|---|---|---|
| T29 | Cloud Run deploy with Firestore, Secret Manager, `DEMO_MODE`; smoke test script | NFR-04 | T02, T03, T07 | S | sonnet |
| T30 | Delete endpoint + data-minimisation review | NFR-03 | T03 | S | sonnet |

---

## Execution waves (parallelisable)

| Wave | Tasks (parallel within a wave) | Target dates |
|---|---|---|
| W0 | T00 | 25 Sep |
| W1 | T01, T02, T03, T05 | 25–28 Sep |
| W2 | T04, T06, T09, T13 | 28–30 Sep |
| W3 | T07, T08, T10, T15 | 30 Sep–2 Oct |
| W4 | T11, T14, T17 | 2–5 Oct |
| W5 | T12, T18, T19, T24, T26 | 5–8 Oct |
| W6 | T20, T21, T22, T30 | 8–10 Oct |
| W7 | T23, T25, T29 | 10–13 Oct |
| W8 | T27, T28 — record video, write proposal | 13–17 Oct |

**Critical path:** T03 → T10 → T11 → T19 → T20 → T25 → T27 → T28.
**If time runs short, cut in this order:** T06 interpretive mode, T12 voice-phrase confidence
(keep buttons), T22 escalations, T15 decay (keep review), the age bands beyond two.
**Never cut:** T02, T11, T17, T23, T24 — they carry the Technical Merit and judge-question answers.

## Open questions (owner decisions)
- **OQ-1** Persona name (keep "Dr. Marcus Vance" vs an age-neutral name).
- **OQ-2** Theme framing under Sustainability & Social Impact.
- **OQ-3** Second subject for the "works across subjects" proof (suggest a science concept in text mode).
- **OQ-4** Do the configured Gemini model IDs resolve? (T01 answers it.)
