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
