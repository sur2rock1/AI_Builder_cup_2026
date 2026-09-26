# PROJECT STATE

_Last updated: 2026-09-19_

## Theme
No education theme exists in the AI Builder Cup 2026 list (BFSI; Retail & Commerce;
Manufacturing; Media, Content & Digital Experiences; Future of Work & Enterprise
Productivity; Sustainability & Social Impact).

**OPEN DECISION — entry must be filed under Sustainability & Social Impact**, framed
as equitable access to individualised tutoring rather than as edtech. This affects
Problem Alignment & Impact (25%) and is not yet settled.

## Problem statement
Children meet concepts they do not understand and often will not ask — embarrassment,
peer judgement, not knowing how to phrase the question, or not knowing what they do
not know. A teacher cannot give unlimited individual explanation. The gap is not
answers; it is diagnosis of *why* a particular child is stuck.

## Target users
Primary: a Secondary 2 (Grade 8) student in Singapore.
Secondary: the parent (progress evidence), the teacher (misconception patterns).

## Value proposition
A judgement-free tutor that finds out *how* the child is thinking — including when a
correct answer hides a broken method — and re-teaches with a different representation
until the method holds up.

## Current MVP
Pythagoras' Theorem, Think! Mathematics 2B Ch 9, seven concepts with enumerated
misconceptions per concept (`src/curriculum/pythagoras.ts`).

## Implemented
- Live voice tutor (Gemini Live over WebSocket, `server.ts`)
- Diagnostic teaching contract: elicit → assess → probe → confirm → re-represent → transfer
- `assess_child_reasoning` server-side tool; the model never judges an answer itself
- `reasoningAssessor.ts` — four-category classification, closed misconception vocabulary,
  discriminating probe generation, conservative fallback that elicits rather than asserts
- `bkt.ts` — Bayesian Knowledge Tracing with evidence-quality-conditioned slip/guess
- `learnerStore.recordReasoningEvidence` — per-turn evidence log, misconception ledger
  (suspected → confirmed at two independent observations → resolved), strategy outcomes
- `TeachingCanvas.tsx` — geometry figure, progressive reveal, child's reasoning on the
  board, understanding rail, confusion vocabulary buttons
- Light UI theme, single accent
- Three overlay defects fixed in `Interactive2DDiagram.tsx`
- Typecheck clean (0 errors); client and server both bundle

## In progress
- Nothing currently mid-flight

## Planned
- Misconception eval set (~40 labelled responses per concept, incl. ~10 correct-answer
  -with-flawed-reasoning cases); report detection rate and false-positive rate
- Firestore instead of `data/learner-profiles.json` (Cloud Run is stateless)
- Cloud Run / Firebase deployment (an eligibility requirement)
- Parent-portal session replay over the evidence log

## Differentiators
1. Diagnoses the *method*, not the answer — probes correct answers too
2. Mastery derived from an explicit probabilistic model with a stated derivation
3. Misconception ledger with an explicit confirmation threshold, not one-shot labelling
4. The child's own reasoning is rendered on the board

## Validation evidence
- Correct Answer Trap literature (arXiv 2606.23205, 2605.23925): detection 57%–84% for
  misconceptions behind correct answers; false alarms ~4:1 to 8:1 at real prevalence
- Cognitive-load / multimedia principles for the board design
- Person-vs-process praise literature for the feedback rules

## Known risks
- **Theme fit** — no education category; framing decision still open
- **Model IDs unverified** — `gemini-3.8-live`, `gemini-3.6-flash`, `gemini-3.8-flash`,
  `gemini-3.1-flash-image` have NOT been confirmed to resolve. The lesson endpoint falls
  back silently to a local generator, so a broken model ID looks like a working demo
- **Over-probing** makes the tutor tiring; probe caps not yet implemented
- **Child data** — storing a minor's learning profile invites a judging question
- **BKT parameters are chosen, not fitted** — must be stated, not implied otherwise
- **Geometry renderer is topic-specific** — other topics fall back to the legacy board
- ~4 weeks to the 18 Oct prototype deadline

## Technical debt
- `data/learner-profiles.json` file store is not viable on Cloud Run
- Two assessment paths exist (`assessmentEngine` for clicked quizzes,
  `reasoningAssessor` for voice). Should converge
- `DynamicBlackboard` and its six tabs are dead weight once the canvas is proven

## Demo flow
1. Tutor teaches; board reveals each part as it is named
2. Tutor asks; child answers **correctly**
3. Tutor asks *how* — child's method appears on the board
4. Method is wrong; tutor asks one discriminating probe, never states the answer
5. Misconception confirmed; **mastery goes down despite a correct answer**
6. Re-teach with a different representation; transfer item; ledger marks it resolved

## Judging alignment
| Capability | Technical Merit | Impact | Innovation | UX | Evidence |
|---|---|---|---|---|---|
| Reasoning diagnosis pipeline | Strong | Strong | Strong | Moderate | Literature + code; eval set pending |
| BKT mastery model | Strong | Moderate | Moderate | Moderate | Derivation string per update |
| Misconception ledger | Strong | Strong | Moderate | Moderate | Confirmation threshold in code |
| Progressive-reveal canvas | Moderate | Moderate | Moderate | Strong | Cognitive-load principles |
| Live voice | Moderate | Strong | Weak | Strong | Commoditised — not a differentiator |
| Measured impact | Not yet demonstrated | — | — | — | **GAP: eval set not built** |

## Open questions
1. Which theme do we file under, and how is the framing written?
2. Do the model IDs in the repo actually resolve?
3. What is the probe cap per concept before the tutor becomes tiring?
4. What is our answer on storing a minor's learning data?

---

## Update — 2026-09-24: complete-idea architecture adopted

**Product thesis (now):** one fixed, detailed base tutor persona for every learner → an evidence-based
Learner Model per learner → a per-learner Teaching Plan compiled before and during each session.
"Every child meets the same great teacher. Over time, that teacher learns them."

**Source of truth for the build:** `docs/` — TUTOR_PERSONA, LEARNER_MODEL, TEACHING_PLAN,
FUNCTIONAL_SPEC, TECHNICAL_SPEC, BUILD_PLAN (T00–T30), TRACEABILITY.

**Official requirements re-verified 2026-09-24 (aibuildercup.com/themes.html):** 6 themes, still no
education theme; Google AI models or agent platforms required; deploy on Cloud Run or Firebase; proposal
PDF + public 3-minute video; criteria weights unchanged. No dates on the page — the 18 Oct deadline
needs re-checking on Hack2skill.

**New known risks from the audit:** the live session has no learner identity (T04); `learners` is
publicly readable in firestore.rules (T02); three divergent persona prompts (T05–T07); model IDs still
unverified (T01).

**Open questions added:** OQ-1 persona name; OQ-3 second subject for the cross-subject proof.

---

## Update — 2026-09-24 (later): build-plan critical path implemented and committed

Executed against the repo (commit `6478d3a`, on top of baseline tag `baseline-2026-09-24`):
T01, T02 (partial — see risk below), T03, T04, T05–T07, T09–T10, T11 (partial), T17–T18, T20.
Full detail in DECISIONS.md (D-2026-09-24-3) and docs/TRACEABILITY.md.

**What actually runs now, verified:**
- The live voice tutor's system prompt and tool list are the new composed persona
  (`composeSystemInstruction` + all 13 tools), not the old hand-written prompt — confirmed by a
  manual WebSocket run against the real `server.ts` bundle.
- `assess_child_reasoning` — previously declared as a tool but never actually reachable from the
  live path — now fires on every answer, feeds `reasoningAssessor.ts` (unchanged), records an
  `EvidenceEvent`, updates the ladder/mastery/strategy profile, and pushes a plan-delta
  instruction back over the socket.
- `/api/session/start` compiles and persists a deterministic Teaching Plan.
- `tests/smoke/plan-and-store.mjs`: misconception suspected→confirmed→drives the plan's
  watch-list, plan-delta produces the right instruction on confirmation, mastery correctly stays
  `none` while a misconception stands — all pass.
- `npx tsc --noEmit` clean; `npm run test:assessor` 13/13 unchanged.

**New known risk (important — surface this to judges proactively, don't wait to be asked):**
`requireAuth`/`requireOwnership` exist but run in a documented DEMO_MODE/dev bypass because the
client (`LoginScreen.tsx`) has no real per-profile Firebase sign-in yet. `firestore.rules` is
correctly locked (`learners/**` denies all client reads/writes), so this is an API-layer gap, not
a database one — but it means NFR-03 is not fully met. Must be closed (real sign-in flow) before
any non-demo deployment.

**Not yet verified in this pass:** `npm run test:live` (the project's own live-harness assertions)
— the sandboxed remote-bridge environment's slow first-time module resolution made its built-in
timeouts unreliable; re-run it directly on the development machine.

**Deliberately deferred (see TRACEABILITY.md for the full list):** T08 text channel, T11's
segmenter/diagnostician split, T12 confidence capture, T13 onboarding UI, T14 profiler/claim
validator, T15 spaced-review scheduling, T19's formal latency spike, T21–T23 learner-facing views,
T24–T27 eval harnesses, T29–T30 deploy/delete review.

**Immediate next steps, in priority order (see BUILD_PLAN.md "Never cut": T02 real auth, T11,
T17 — done, T23, T24):**
1. Build a real per-profile Firebase sign-in flow and turn off the DEMO_MODE/dev bypass (closes
   the NFR-03 gap flagged above).
2. T21–T23: learner card, parent-portal evidence replay, tutor's-reasoning panel — these are the
   UX (10%) and part of the Technical-Merit story judges can actually see; currently the strongest
   pipeline work (ladder, ledger, plan, delta) has no visible surface yet.
3. T24: diagnosis eval set — the single biggest unsupported claim right now is "the diagnosis
   works"; nothing quantifies detection/false-positive rate.
4. T19: run the formal latency spike (≥10 exchanges) and record p50/p95 in DECISIONS.md — the
   fire-and-forget wiring shipped without that measurement.

---

## Update — 2026-09-24 (later still): T21-T23 built — learner card, parent portal, reasoning panel

Commit `11dc4e5`. Closes the "no visible surface" gap flagged in the previous update: the
ladder/ledger/plan pipeline (T09-T10, T17-T20) is now actually shown to a learner, a parent and
a judge.

- **Tutor's-reasoning panel** (`TutorReasoningPanel.tsx`, new, toggled from the left edge): the
  compiled plan's target/reviews/prerequisites/representation-order/watch-list, each with its
  rule id + reason text straight from the compiler, plus a live feed of every diagnosis and the
  plan delta it triggered. This is the single highest-value addition for judges — it makes the
  "deterministic plan with reasons" claim inspectable in real time instead of asserted in docs.
- **Learner card dispute**: "That's not right" on a misconception, on the existing
  `LearnerProfilePanel`. Deliberately simplified — see D-2026-09-24-4 — to operate on the
  misconception ledger directly rather than a Profiler-generated claim, since T14 isn't built.
  Honest about the gap rather than faking a claim system.
- **Parent portal evidence replay**: ladder/mastery-status badges, the real per-entry ledger, and
  a "View evidence" button per concept that replays the actual question → answer → reasoning →
  classification chain from the events already being recorded.

**Verified:** `tsc --noEmit` clean, `vite build` succeeds, `esbuild server.ts` bundles,
`test:assessor` 13/13, extended smoke test (now covers dispute) passes.

**Not verified:** a real live-WS run of the new WS message enrichment — the test harness's stub
has no scenario for it and `npm run test:live` remains unreliable in this sandboxed environment.
Needs a check on the development machine before relying on it for the demo.

**Updated priority list** (supersedes the previous one — T21-T23 are now off it):
1. Real per-profile Firebase sign-in (closes the NFR-03 dev-bypass gap, D-2026-09-24-3) —
   still the most important compliance-shaped gap.
2. Verify the reasoning panel and dispute flow against a **real** live session on your machine
   (not the sandboxed bridge) — this is currently the least-verified part of the newest work.
3. T24: diagnosis eval set — still the single biggest unsupported technical claim.
4. T19: the formal latency spike/report for guidance injection.
5. T14 (Profiler/claim validator) if there's time — would let the T21 dispute button operate on
   real claims instead of the ledger-entry simplification.

## Update — 2026-09-25 (liveObserver/gateway fix + full build-plan cross-check)

**Trigger:** user hit a real runtime error (`[LiveObserver] observation skipped: no
observer model available`) and asked for a full cross-check against the build plan,
not just a re-assertion that "everything's built."

**Fixed this pass:**
- `liveObserver.ts` migrated onto `src/ai/gateway.ts` (closes part of the NFR-02 gap
  flagged in TRACEABILITY.md since 2026-09-24; see D-2026-09-25-1).
- Found and fixed a real bug in the gateway itself: `responseMimeType` was declared and
  forwarded by `generateJSON()` but never actually placed on the Gemini request —
  JSON mode was never really requested from the model on any caller. New smoke test
  (`tests/smoke/gateway.mjs`) verifies the fix at the request-payload level.

**Still NOT confirmed:** whether the user's actual model IDs/API key/network work —
my own `verify:models` check is unreliable from this sandboxed tool (proxy blocks
`generativelanguage.googleapis.com`). Needs the user to run it themselves.

**Cross-check verdict (full detail in docs/TRACEABILITY.md, updated same day):**
Of BUILD_PLAN.md's 31 tasks (T00–T30), roughly a third are genuinely ✅ done and
verified by a test, a third are 🟨 built but with a named, real gap (usually: the
formal verification/eval named in the task's acceptance criteria hasn't been run
against real usage, or a sibling caller wasn't migrated), and the rest — most notably
**T02 (real per-profile auth — still a dev bypass), T08 (text channel), T12
(confidence capture), T13 (onboarding UI), T14 (Profiler/claim validator), T15
(spaced review scheduling), T19 (formal latency spike/measurement), T24–T27 (eval
harnesses, seeded demo data)** — are ⬜ not started. This is not new information;
TRACEABILITY.md already stated all of it honestly. The user's error was a concrete,
correct signal that "built" in this repo currently means "code exists and unit/smoke
tests pass," not "verified against a real live session with a real API key," and that
distinction had not been surfaced clearly enough until this prompted a direct answer.

**Top priorities unchanged:** 1) real per-profile Firebase sign-in (NFR-03), 2) verify
the T21–T23 reasoning-panel/dispute flow and the new WS messages against an actual
live session (not just smoke tests), 3) T24 diagnosis eval set, 4) T19 latency spike,
5) T14 Profiler.

## Update — 2026-09-25 (fixed a real profile-save bug; added demo-learner seeding)

**Trigger:** user asked to build the "seeded demo learners" I recommended
in the demo-readiness cross-check, so the parent portal / learner card /
reasoning panel could be tested with real data instead of a blank slate.

**Found and fixed a real bug, not just added a script:** this checkout's
local `data/learner-profiles.json` had silently become `[]`. Every
`saveProfile()` call was appearing to succeed while actually discarding
the write — `JSON.stringify` on a JS array drops non-index properties, and
nothing checked the file's shape before treating it as the profiles
dictionary. This means the earlier answer to "is the student profile
being saved?" (asked two turns ago) was, in this checkout, **no** — not
"unverified," actually broken. Fixed in `src/adaptive/repo/file.ts` with
a `readProfiles()` guard; see D-2026-09-25-2. Re-verified after the fix:
`npm run seed:demo` now produces a `learner-profiles.json` that genuinely
persists 3 profiles.

**Added `scripts/seed-demo-learners.ts` / `npm run seed:demo`:** a
lightweight T27 stand-in (not the full simulated-learner harness). Drives
the real `learnerStore.ts` API to produce 3 clearly-labelled "(Simulated)"
learners with real BKT/ladder-derived history:
- **Aisha (Simulated)** — a standing, undisputed, confirmed misconception
  on triangle congruence (SSA), left in place on purpose so the live demo
  can click "That's not right" on it in front of judges.
- **Marcus (Simulated)** — a misconception confirmed then resolved after
  switching from direct explanation to a visual diagram, reaching
  provisional mastery on scale factor; plus a hand-set overdue spaced
  review on a second concept (hand-set because T15 isn't built — called
  out explicitly in the script).
- **Priya (Simulated)** — a disputed ledger entry (different status from
  Aisha's, for UI variety) and real recovering mastery after an early
  string of wrong answers, showing BKT doesn't jump straight to "mastered"
  from one good answer.

Timestamps are backdated across realistic 1-14-day session windows as a
pure post-processing pass (no ladder/mastery/misconception value is
hand-set by that step).

**Still not done:** actually clicking through the running app with these
seeded learners to confirm the parent portal / learner card / reasoning
panel render them correctly — the seed script only proves the data model
persists correctly, not that the UI reads it correctly end-to-end. That's
still the top remaining pre-demo verification step.
