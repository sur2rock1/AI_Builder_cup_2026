# PROJECT STATE

_Last updated: 2026-10-09 (audited — see docs/AUDIT_2026-10-09.md)_


## STATUS 2026-10-09 (audited; supersedes the stale sections below where they disagree)
- **Product name:** Ananta (code, README). Older sections say "Dr. Marcus" / "Adaptive AI Tutor"; the child now names the tutor (D-2026-10-07-1).
- **Deadline:** 18 Oct 2026 (9 days). Grand Finale 4 Dec 2026, Singapore.
- **Content:** curriculum library (IGCSE G8 Maths + Biology, Cambridge G4 Maths) — no longer empty or Pythagoras-only.
- **Models:** FAST/STRONG roles resolved on the owner's machine (2026-09-26). 2026-10-09 logs show the primary flash models hitting the 20 s deadline in the Profiler and falling back to `gemini-3.1-flash-lite`. IMAGE role was quota-blocked on 2026-09-26; photo status since then not re-verified.
- **Deployment: NOT DONE.** No Cloud Run URL exists in the repo or docs. `firebase-config.json` still points at `sceneflow-f9529` (not the owner's project) and `.firebaserc` is a placeholder; `deploy-cloudrun.sh` refuses to run until fixed. This is a mandatory competition requirement.
- **Submission artefacts:** proposal PDF — not started; 3-minute video — not started.
- **Evidence of effectiveness:** EV-01/02/03 (diagnosis accuracy, adapted-vs-base, persona adherence) NOT built. No measured result exists.
- **Privacy/auth:** deployed builds default `DEMO_MODE=true` (no token checks; `GET /api/learners` lists all profiles). Not acceptable for real children's data.
- **Tests:** `tsc` clean; `tests/live/run.mjs` fails 7 assertions (since 28 Sep); `tests/guided/run.mjs` crashes (stale test); `npm test` is red.
- **In progress / uncommitted:** guided tutor mode (`src/guided/`, toggle `TUTOR_MODE`, default `standard`), tutor-name feature, 25 modified files.
- **Removed behaviour:** PARK_AND_ESCALATE no longer runs in the live path (D-2026-09-30-9); Parent-Portal escalation card is dead code.
- **Not built:** T12 confidence capture, T15 spaced review/decay, T19 latency spike, T24–T26 eval harnesses.

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
Primary: a secondary-school learner on any board (IGCSE, CBSE, IB, Singapore MOE, …) — board and
grade chosen at signup (2026-09-26; was: "a Secondary 2 (Grade 8) student in Singapore").
Secondary: the parent (progress evidence), the teacher (misconception patterns).

## Value proposition
A judgement-free tutor that finds out *how* the child is thinking — including when a
correct answer hides a broken method — and re-teaches with a different representation
until the method holds up.

## Current MVP
_Superseded 2026-09-26 — see the last update below._ Content now comes from the curriculum
library (docs/CURRICULUM.md): the admin uploads textbooks (+ optional syllabus) per board +
grade + subject; the library is currently EMPTY after the stale-data wipe. The original
built-in Pythagoras set (`src/curriculum/pythagoras.ts`, Think! Mathematics 2B Ch 9) was unused
and has been removed.

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

## Update — 2026-09-26 (real-HTTP verification of T21-T23 + a second real bug fixed)

**What changed:** ran the actual server (not the smoke stub) in this
sandbox with the dev auth bypass, and hit `GET /api/learners`,
`POST /api/session/start`, `POST .../dispute`, and
`GET /api/learners/:id/events` over real HTTP against the 3 seeded demo
learners. This is the first real (non-smoke-test) evidence that:
- The FR-11 persistence fix (D-2026-09-25-2) works through the actual
  route layer, not just via direct file inspection.
- A hand-seeded overdue spaced review renders correctly through a real
  `/api/session/start` call as a `reviewItems` entry with reason
  `R-REVIEW` — the "returning learner" plan beat genuinely works.
- The dispute route (not just the store function) flips ledger status
  correctly.

**Found and fixed a second real bug:** `/api/session/start` always
auto-picked the next unmastered concept and completely ignored which
concept the student clicked in `SubjectSelector.tsx` — the client wasn't
even sending a `conceptId`. This would have broken the demo in a subtle,
bad way: clicking a learner's seeded concept to show off their history
would silently land on a different, empty concept instead. Fixed in
`server.ts` and `src/App.tsx` (D-2026-09-26-1) and verified: requesting
Marcus's seeded scale-drawings concept by ID now correctly returns that
concept as `plan.targetConcept`, with his review-due beat still
composing correctly alongside it.

**Demo data was reset again after this verification** (the test session
itself touched `demo_marcus` and disputed `demo_aisha`'s misconception) —
`npm run seed:demo -- --reset` restores the clean pre-demo state; run it
again right before recording if any more testing happens in between.

**Still not verified:** the voice/WebSocket path itself (real Gemini
diagnosis, the reasoning panel actually rendering in a browser) — that
needs a working `GEMINI_API_KEY` (still unconfirmed — user needs to run
`npm run verify:models` themselves) and a real browser session, neither
of which this sandbox provides.

**Updated priority for the actual demo recording:**
1. Confirm `npm run verify:models` works on your own machine.
2. In the real running app: log in as "Aisha (Simulated)", open her
   learner card, click "That's not right" on the SSA misconception —
   this is the one live-dispute moment the seed data was built for.
3. Log in as "Marcus (Simulated)" or "Priya (Simulated)", explicitly
   select their seeded concept from the subject/concept picker (now that
   this actually works), and open the parent portal / reasoning panel to
   confirm they render the seeded history correctly in the browser.
4. Re-run `npm run seed:demo -- --reset` immediately before recording.

## Update — 2026-09-26 (model connectivity confirmed — biggest risk closed)

User ran `npm run verify:models` on their own machine (this sandbox
cannot reach Google's API). Result: FAST and STRONG roles both resolve
fully against the real API key — this is the pipeline that runs
diagnosis, persona composition, and teaching-plan adaptation, i.e. the
core Technical Merit story. IMAGE role fails with a free-tier quota of 0
(not a bug — needs billing to ever work), which only affects the
`generate_photo_visual` "real-world photo" blackboard mode; the seeded
geometry concepts all work fine in 2d/3d schematic mode, which needs no
image API call at all. See D-2026-09-26-2.

**This closes the single biggest outstanding demo-readiness risk.**
Remaining before recording:
1. Open the real app in a browser and run one actual voice session end to
   end (login → pick a seeded concept → trigger the misconception →
   watch the reasoning panel/plan update live → dispute on the learner
   card → check the parent portal replay). Nothing left to verify from
   code — this is the one step that needs a human at a keyboard with a
   working mic.
2. Pick one real impact metric from that session's own logs (e.g.
   diagnosisLatencyMs, or turns-to-confirmed-misconception) rather than
   an invented number, for the demo's 2:40-3:00 beat.
3. Re-run `npm run seed:demo -- --reset` immediately before recording.
4. Write/rehearse the 3-minute script against the structure in the
   hackathon's own instructions (problem → why existing tools fail →
   live demo → technical architecture → measured impact).

## Update — 2026-09-26 (external judge assessment triaged: T19 gap fixed + made worse-than-reported finding, T22 escalations built, T13 confirmed built-but-undeployed, T14 confirmed not started)

A pasted external assessment claimed 4 gaps against Problem
Alignment/Innovation criteria. Re-verified each against actual code
rather than trusting it at face value (source-of-truth principle):

- **T13 (onboarding UI):** confirmed correct — `Onboarding.tsx` existed
  in the working tree from earlier this session but was uncommitted and
  had never been deployed to the server the user tested against, which
  is exactly why manual testing only ever saw "name + grade." Still
  uncommitted (see docs/TRACEABILITY.md FR-09).
- **T19 (guidance injection):** the assessment understated this. Directly
  re-verified an earlier audit's claim that plan-delta guidance "already
  reaches the tutor via a different mechanism" and found it was wrong —
  `compilePlanDelta()`'s `delta.instruction` (including PARK_AND_ESCALATE's
  own guidance) reached only the browser debug panel, never the live
  Gemini model. Fixed by piggybacking it onto the shared
  `sendToolResponse()` funnel every tool call already goes through — no
  new Live API surface, so nothing new to risk-test in a sandbox with no
  reachable Gemini Live endpoint. `[T19 latency]` log line added so real
  p50/p95 numbers can be captured on the user's own machine (BUILD_PLAN's
  stated acceptance criterion is not yet met with evidence — see
  docs/AGENT_GUIDE.md landmine #4, DECISIONS.md D-2026-09-26-4).
- **T22 (Parent Portal escalation view):** confirmed correct — zero
  references existed. Built `EscalationEvent` (deliberately NOT a
  `LearnerClaim`, since PARK_AND_ESCALATE is a deterministic rule with no
  LLM judgment to validate — decouples this from the still-unbuilt T14
  Profiler, see DECISIONS.md D-2026-09-26-5) + persistence + a resolve
  endpoint + a "Needs Your Attention" section and roster badge in
  `ParentPortal.tsx`. `npx tsc --noEmit` and `npx vite build` both clean.
- **T14 (session-end Profiler):** confirmed correct — `src/adaptive/{profiler,claimValidator}.ts`
  do not exist. Not started; largest remaining item, in progress next.

**Not independently verifiable from code:** the assessment's claim that
testing has relied entirely on simulated learners (`demo_aisha`/`demo_marcus`/`demo_priya`)
rather than a real learner — that's a fact about how the team has been
testing, not something the repo can confirm or refute.

**Still nothing has run against a live Gemini Live session in this
sandbox** (confirmed, again, via `git stash` producing an identical
`ECONNREFUSED` on unmodified code) — every fix above is verified by
`tsc`/`vite build`/direct code inspection, not by an actual voice
session. That remains the standing pre-demo verification gap noted in
every update above.

## Update — 2026-09-26 (T14 built: session-end Profiler + Claim Validator)

Built `src/adaptive/profiler.ts` and `src/adaptive/claimValidator.ts`
(docs/LEARNER_MODEL.md §5.2), wired into the live-voice WS session-end
(`clientWs.on('close', ...)` in `server.ts`, fire-and-forget). The
Profiler calls Gemini (gateway `role: 'strong'`) with this session's
evidence events + existing claims + onboarding + misconception ledger,
proposing durable cross-exchange claims and a plain-language narrative.
Every proposed claim passes through the deterministic Claim Validator
before touching a learner's profile: evidence-ownership check, required
scope, a banned-label lexicon (blocks things like "visual learner,"
"ADHD," "gifted," "lazy" — enforcing this project's own "do not
represent fixed psychological labels" principle at the code level, not
just the prompt level), confidence computed ONLY from evidence count
(never from the model — see `docs/AGENT_GUIDE.md` landmine #5), and a
conservative contradiction check against any `learner_stated`/`parent_stated`
claim in the same slot. Validated claims merge into the learner's
profile; a `SessionSummary` (concepts touched, ladder moves,
misconceptions changed, moves/representations used, narrative) is
written both on the profile and via the dedicated `saveSessionSummary()`
repo call that already existed but nothing had ever called.

**Verified without live Gemini access** (this sandbox has none): 19 unit
assertions against `claimValidator.ts` (confidence cap table, every
rejection path, merge/dedup logic) and an end-to-end integration run of
`profiler.ts` against the real file-backed repo — seeded a learner with
two real evidence events in one session, ran `runProfiler` with a fake
API key, confirmed the deterministic SessionSummary facts compute
correctly, the fallback narrative fires correctly when the model call
fails, and everything persists correctly to both storage locations. Also
confirmed a session with zero events is correctly skipped (returns
`null`) rather than fabricating a claim from nothing.

**Explicitly NOT done in this pass (see D-2026-09-26-6):**
- T15 (spaced-review scheduling, §7.2, and claim/strategy confidence decay
  over time, §7.1) — separate, unstarted task. Claims are written with
  full confidence at creation; nothing decays them yet.
- The idle-10-minute session-end trigger from §5.2 — only WS-close
  (true disconnect/end) is wired; there's no idle-timeout watcher.
- An actual successful Gemini `strong`-role call producing real proposed
  claims — needs a live run on a machine with real Gemini access to
  confirm the prompt actually produces sensible, well-scoped claims in
  practice (as opposed to the code path around it, which is fully
  exercised by the tests above).

**Remaining work in this session's queue:** task #8 (final consolidated
documentation pass — this update, plus TRACEABILITY.md/AGENT_GUIDE.md/
DECISIONS.md updates for T14, are already done as part of building T14
itself, per this session's standing "keep docs updated in the same
change" instruction; task #8 will do a last cross-check for anything
missed across T13/T19/T22/T14 together).

## Update — 2026-09-26 (curriculum library: any board / grade / subject; AI-reviewed ingestion; stale data wiped)

**Trigger:** a review of the one ingested syllabus (Think! Mathematics 3B Ch 9–11, loaded
2026-09-23) against the adaptive build showed it predated and did not fit the teaching journey
(details in DECISIONS.md D-2026-09-26-7). The user's direction: the admin uploads textbooks per
board + grade + subject (e.g. IGCSE Grade 8 Maths, CBSE Grade 7 Maths, IB Grade 8 History); a
learner picks board + grade at signup and studies every subject for it, chapter by chapter; no
human review — the AI reviews and publishes; remove the old data.

**Built (full spec: docs/CURRICULUM.md):**
- Course identity board + grade + subject with stable ids that never include a file name
  (`src/curriculum/catalog.ts`).
- Ingestion rebuilt (`src/curriculum/pdfIngest.ts` + deterministic `structure.ts`): extract →
  merge → **structure** (subject mode, concept types, acyclic prerequisite graph, syllabus
  mapping) → **AI review** (re-works every worked example, corrects facts, stable misconception
  ids, L1–L4 ladder items in the subject mode, representation ideas, rejects non-concepts) →
  publish, merging new books into existing courses without touching published ids/types.
  Optional official syllabus is the authority for scope; otherwise only what the book states.
- Admin-only content library (`AdminLibrary.tsx`, `requireAdmin`: `ADMIN_TOKEN` / Firebase
  `admin` claim / loopback when unset) with stage progress and the stored review report.
- Learner signup captures board + grade; subjects filtered to them and grouped by chapter;
  prerequisites shown as "Builds on" instead of locks; the plan probes prerequisites first and
  detours only on evidence (D-2026-09-26-8).
- Alignment fixes found on the way: age band from grade (Grade 8 was getting the 8–12 register);
  diagnostician prompt no longer hard-codes "13-year-old's mathematics tutor"/triangles;
  `conceptTypeFor()` as the one key for strategy history; misconception catalogue on stable ids;
  R-PROBE check question bug; curriculum prompt block no longer carries a competing teaching
  order; the normal concept-picker path now shows the compiled plan in the Tutor's-reasoning
  panel (it never set it); pregenerated lessons keyed by concept id; "Earth Science" no longer
  classified interpretive; hard-coded `'pythagoras'` demo start removed.
- Seed script rebuilt to seed Aisha/Marcus/Priya (Simulated) against a real library course using
  its own misconception ids.
- **Stale data wiped** (local): curricula, pregenerated lessons, learner profiles, events,
  plans, sessions; `src/curriculum/pythagoras.ts` removed. The deployed Firestore project was
  NOT touched — delete its old `curricula` (and test `learners`) documents yourself.

**Verified:** `tsc` clean; `npm run test:assessor`, all smoke tests (gateway, plan-and-store,
claim-validator, profiler) pass unchanged; new `npm run test:curriculum` passes; server bundle and
web build succeed; curriculum/admin/learner routes exercised over real HTTP (including 401s
without the admin token and a rejected upload never reaching disk).
**Not verified:** a real textbook ingested with the live Gemini API (this environment cannot reach
it); the new screens clicked through in a browser; `npm run test:live` (fails identically on
unmodified code here — ECONNREFUSED).

**Next steps, in order:**
1. Set `ADMIN_TOKEN` in `.env` (optional locally), start the app, open "Content library (admin)",
   upload one real textbook (+ syllabus if you have it) and read the review report.
2. `npm run seed:demo -- --reset` to recreate the demo learners on that course.
3. Delete the old Firestore `curricula` documents before deploying.
4. Hand-check ~20 reviewed concepts against the book to measure the AI review's catch rate —
   the one new claim that is currently unsupported by evidence.

## Update — 2026-09-27 (pre-generated assets moved off local disk — required for the mandatory Cloud Run/Firebase deploy)

**Trigger:** the user asked which Gemini model produces the paid-for images and roughly what
pre-generating the first 3 chapters would cost. Answering that surfaced two real problems, not just
a cost figure: (1) `scripts/pregenerate-assets.ts`'s image model names
(`gemini-3.0-flash-preview-image-generation`, `imagen-3.0-generate-002`) don't appear on the current
Gemini pricing page at all — likely silently falling back to a stock Unsplash photo while still
paying for the concept's text calls; (2) every pre-generated and live-generated asset lived only on
local disk (`data/pregenerated/*.json`), which does not survive a Cloud Run redeploy or cold start —
and the AI Builder Cup rules require deployment on Cloud Run or Firebase
(aibuildercup.com/themes.html), so this had to be fixed before that deploy, not after.

**Built (full detail: DECISIONS.md D-2026-09-27-1/2/3, docs/CURRICULUM.md §8/§9):**
- Fixed the stale image model names to match `src/ai/gateway.ts`'s already-current `image` role
  (`gemini-3.1-flash-image` → `gemini-3.1-flash-lite-image`), with a `MODEL_IMAGE` override.
- New `src/curriculum/pregenStore.ts` — Firestore (`pregen` collection) + Cloud Storage (the photo,
  never inlined into the Firestore doc — base64 risks the 1 MiB cap) with a local-file fallback for
  dev/tests, same pattern as the existing curriculum/learner Firestore repos.
- Wired into **every** place that calls Gemini for lesson/diagram/photo content:
  `scripts/pregenerate-assets.ts` (batch), and all three live REST routes in `server.ts` —
  `/api/generate-lesson`, `/api/update-diagram`, `/api/generate-image`. The last one had **no**
  caching at all before this (found in a follow-up pass, not the first one) — every photo-tab open
  for the same topic was re-billing Gemini, even repeats in the same session.
- `App.tsx handleGeneratePhoto()` now sends `conceptId` (via the existing `conceptIdFor()` helper)
  so the photo cache keys on the same concept id as the lesson/diagram cache.
- `tests/smoke/pregen-store.mjs` added (local-fallback round trip, merge semantics); full `tsc
  --noEmit` clean; all 6 smoke tests pass.

**Not done / caveat:** no real Firestore/Storage credentials in this environment, so the
Firestore/Storage write path itself was not exercised against a live project — only that it falls
back correctly when unconfigured. Run `npm run pregen:first` once against real `.env` credentials
before relying on it in production; look for `[Pregen] Saved "..." to Firestore (photo in Cloud
Storage)` rather than "to local file" in the log.

## Update — 2026-09-28 (honest material-quality review + concept-specific visual generation)

**Why:** user asked for an honest review of whether the actual generated learning material
(diagrams, 3D scenes, quiz) is genuinely weak against the project's own adaptive/misconception-first
teaching philosophy, or an inherent trade-off of a real-world/2D/3D-visual-first design — explicitly
asked not to be flattered.

**Finding (full detail: DECISIONS.md D-2026-09-28-1, docs/CURRICULUM.md §8/§9):** the reasoning/
adaptive layer is genuinely strong on direct code inspection — `curriculumIntelligence.ts` injects
nearly everything authored per concept (key facts, worked examples, prerequisite checks, all 4
ladder levels, representation ideas, misconception probes/corrections) into the live tutor's actual
system prompt; `reasoningAssessor.ts` runs a real closed-vocabulary "correct-answer trap" diagnosis
requiring two independent observations before confirming a misconception; `ladder.ts` gates mastery
behind pKnown ≥ 0.80, evidence on ≥2 distinct L3+ items, and a passed spaced review — none of that is
a wrapper. The weak point was the VISUAL layer: `diagram`/`scene3d` generation (both
`scripts/pregenerate-assets.ts` and server.ts's live cache-miss routes) used one fixed generic
schema regardless of concept — every math topic got the same "geometry" scene3d, and the concept's
own authored `representationIdeas`/`ladderItems` never reached the visual generator at all, only the
voice prompt. A graphing concept about reading line intersections got a generic node diagram, not a
graph — exactly the opposite of what its own authored representation idea called for.

> **Superseded later the same day** — see "Update — 2026-09-28 (board pictures …)" at the end of this
> file and DECISIONS.md D-2026-09-28-7. `visualGuidance.ts` and `findConceptRichData()` described
> below no longer exist; the "Not done" item about misconception-contrasting visuals is now built.

**Built:** new `src/curriculum/visualGuidance.ts` (concept-type-aware heuristic, shared by both
generation paths); `ladderItems`/`representationIdeas` now flow into the diagram/scene3d/quiz
prompts in both `pregenerate-assets.ts` and `server.ts`'s live routes (`server.ts` gained
`findConceptRichData()` to look up a concept's authored fields for a live cache-miss, not just the
batch path); the quiz question is now grounded in the concept's authored apply/transfer ladder item;
`scene3d.elements[].position` is now requested by the prompt when the concept needs spatial/
geometric accuracy (the field existed since the 2026-09-27 3D-rendering fix but was never asked
for, so it always fell back to an auto-computed ring).

**Not done this pass (flagged as HIGH VALUE, not MUST HAVE, in the review):** generating a visual
that directly contradicts a specific *confirmed* misconception at diagnosis time; an evaluation
dataset for the diagnostic pipeline (§18 of the project's own instructions) — no accuracy numbers
exist yet for `assessReasoning`, only a working demo.

**Caveat:** pregen is immutable-by-design, so the 3 chapters already generated in this session keep
their old generic visuals until explicitly regenerated (`npm run pregen -- --force`). Not yet
visually verified against a live model call (no network/API-key access in this environment) —
regenerate one concept and look at the actual diagram/scene3d before the demo.

**Evidence:** `npx tsc --noEmit` clean; all 6 smoke tests pass.

## Update — 2026-09-28 (T08 built: text-channel tutor turn, `POST /api/tutor/turn`)

**Why:** user asked to build T08 (docs/BUILD_PLAN.md, docs/TRACEABILITY.md FR-25) so EV-01/EV-02/
EV-03 have a way to drive many turns through the real diagnosis pipeline without a microphone or a
WebSocket, explicitly confirmed backend-only — no chat box, no UI change (D-2026-09-28-2).

**Built:** new `server/routes/tutor.ts`, registered from `server.ts`. `POST /api/tutor/turn` takes
`{sessionId, learnerText}` against a session already started via `/api/session/start`, and returns
`{sessionId, turn, tutorText, move, diagnosis, planUpdate}`. It is not a separate implementation of
the tutor — it composes the SAME persona (`composeSystemInstruction({channel:'text', ...})`), the
SAME compiled Teaching Plan, and drives the SAME diagnosis pipeline (`assessReasoningWithDeadline` →
`recordReasoningEvidence` → `compilePlanDelta`) the voice WebSocket handler in `server.ts` already
uses, gated behind the model's own real tool-calling decision (`assess_child_reasoning` /
`record_confusion_signal`, filtered from the same `ALL_TOOLS` array voice uses — no board tools,
since there is no board here). Full design rationale: D-2026-09-28-2 (why no UI) and D-2026-09-28-3
(why plan guidance is delivered immediately here, unlike voice's queued T19 mechanism).

New test: `tests/smoke/tutor-turn.mjs` (`npm run test:tutor-turn`) — starts the real server (not a
stub) and runs session-start → opening turn → a turn with a reasoning-bearing scripted answer →
session end, over real HTTP, checking response shapes, auth/ownership (403), unknown/ended sessions
(404), and that ending a session clears T08's per-session history too.

**Verified:** `npx tsc --noEmit` clean. `npm run test:tutor-turn` run against the real server on the
user's machine: session start, auth bypass, ownership check, unknown-session and ended-session 404s
all pass.

**Not yet verified: an actual Gemini call completing inside a turn.** This sandbox's own shell has no
route to `generativelanguage.googleapis.com` (confirmed directly with curl — connection reset, error
56) — a restriction of this tool's own network egress, not of the user's machine, where the project's
other Gemini-calling scripts already work normally. Both real-model turns in the run above returned
`{"error":"fetch failed"}` for exactly that reason; nothing about session/auth/routing failed. **Action
item, next thing to do on your machine:** run `npm run test:tutor-turn` yourself once — that closes
out the one thing this pass could not confirm, and gives EV-01/EV-02 their first real text-channel
diagnosis output to look at.

**Deliberately not done:** the text fallback is not reachable from the app UI (by design, see
D-2026-09-28-2) — if Gemini Live is down mid-demo, a student still cannot keep learning through this
route; only a script/curl call can. EV-01/EV-02/EV-03 themselves (T24-T26) are still not built — T08
was the blocker for them, not the eval logic itself, so they remain the next real gap.

## Update — 2026-09-28 (T08 re-reviewed offline; found and fixed two real bugs, one shared with voice)

**Why:** user could not run `npm run test:tutor-turn` (on mobile) and asked for the logic and code to
be reviewed again, then to proceed and keep docs in sync. This sandbox still cannot reach
`generativelanguage.googleapis.com` (reconfirmed), so a second live run was not possible either —
static re-reading alone cannot verify a tool-calling loop's control flow, so a genuinely offline,
network-independent test was built instead.

**Built:** `tests/offline-tutor-setup.ts` (real learner/plan/session setup + registers the real
`server/routes/tutor.ts` routes on a throwaway server), `tests/genai-tool-stub.mjs` (a scriptable fake
`@google/genai`, distinguishing the diagnostician's JSON-mode calls from tutor.ts's tool-enabled
conversational calls), and `tests/smoke/tutor-turn-offline.mjs` (`npm run test:tutor-turn-offline`) —
5 scripted scenarios over real HTTP against the real production pipeline (learnerStore, repo,
curriculum, persona composer, plan compiler, diagnostician parsing — nothing stubbed except the model
itself).

**Found and fixed two real bugs** (full detail: docs/DECISIONS.md D-2026-09-28-4):
1. An empty/whitespace model reply was sent to the child as a blank `tutorText: ""` turn.
   `server/routes/tutor.ts` now falls back to a neutral prompt when that happens.
2. `misconception_behind_correct` (the diagnostician's own first-class "answer looks right, reasoning
   isn't" classification — this project's central differentiator per the project instructions'
   MISCONCEPTION DETECTION section) with no catalogued `candidateMisconceptionIds` used to silently
   compile to `outcome: 'sound'`, telling the tutor to keep teaching as if nothing were wrong. This
   bug **pre-dated T08** — it was mirrored faithfully from `server.ts`'s voice WS handler, which had
   the identical logic already. Fixed in both `server/routes/tutor.ts` and `server.ts`: that
   classification now maps to `misconception_suspected` on its own.

**Verified:** `npx tsc --noEmit` clean. `node tests/smoke/tutor-turn-offline.mjs` — all 22 checks
pass (before the fixes: 3 failed, catching exactly the two bugs above). `npm run test:assessor` —
13/13, no regression. **Still not verified: an actual Gemini call** — same sandbox network limitation
as before (reconfirmed via curl). The offline test verifies the endpoint's handling of whatever the
model calls, not what a real model actually decides to call — that half still needs the user's own
`npm run test:tutor-turn`.

**Known risk, flagged not fixed:** `textTurnStates`'s per-session `contents: Content[]` array grows
unboundedly across turns (cleared only at session end via `clearTutorTurnState`). For a normal lesson
this is fine; for EV-02's eval harness running hundreds of scripted turns per session, this could
become a real latency/cost/context-limit problem. No test has demonstrated an actual failure from
this yet, so no trimming/compaction was added — added speculatively, it would be exactly the kind of
complexity the project instructions warn against. Revisit once EV-02 (T25) exists and can show
whether it's a real problem.

## Update — 2026-09-28 (deriveOutcome() extracted to one place; test-infra gaps found and fixed; a real, separate finding surfaced and flagged)

**Why:** user asked "we keep finding these bugs now and then, how do I ensure there is none?" then
asked to build the recommendations that followed: extract the duplicated outcome logic into one shared
function, and add a branch-coverage test for it.

**Built:** `deriveOutcome()` in `src/plan/delta.ts` — the single place `server.ts` and
`server/routes/tutor.ts` both now call for the `assess_child_reasoning` → `compilePlanDelta` outcome;
neither file has its own copy anymore. `tests/smoke/plan-delta-outcome.mjs`
(`npm run test:plan-delta-outcome`, also added to the main `npm run test` aggregate — pure function,
no network, runs in under a second) enumerates every classification × candidate-count × confirmed-count
combination and asserts the exact outcome for each, 16/16 passing. Full rationale, and the two
test-infrastructure bugs this surfaced along the way (a missing stub export that broke `npm run test`'s
build, and a too-short health-check timeout + `localhost`-vs-`127.0.0.1` bug in `tests/live/run.mjs`,
both fixed): docs/DECISIONS.md D-2026-09-28-5.

**Verified:** `npx tsc --noEmit` clean. `node tests/smoke/plan-delta-outcome.mjs` 16/16. `node
tests/smoke/tutor-turn-offline.mjs` 22/22 (re-confirmed through the real endpoint after the extraction).
`npm run test:assessor` 13/13. `npm run test` (full aggregate) now builds and runs to completion for
the first time in this environment.

**Found, NOT fixed — flagged for priority, not silently patched:** with the build/timeout bugs fixed,
`tests/live/run.mjs` (the voice-path regression test) ran and failed 7 of its own assertions against a
hardcoded "original build" snapshot — including a literal prompt-text check for `"Dr. Marcus Vance"`, a
persona name that predates the current persona composer and is almost certainly just a stale baseline.
Two of the seven are more than a stale string match and may be a real bug in
`src/adaptive/liveObserver.ts`: `understanding moves at most 20 per exchange (model said 90, shown 0)`
and the misconception-status/concept-fields checks. Not investigated further this session — the
observer is a distinct subsystem from what this session's work covered, and guessing which of the 7
failures are "stale baseline" versus "real regression" without a dedicated pass would risk quietly
rewriting away a genuine bug. This needs its own pass, prioritized by the user.

## Update — 2026-09-28 (board pictures: model-composed, step-by-step, fact-checked — replaces fixed diagram/3D templates)

**Why:** after regenerating chapter 1 the user saw the Shape tab still showing boxes and arrows for a
coordinate-line concept, and rejected any fixed per-topic template (including the graph renderer first
proposed here): the picture a child sees should be decided by the topic and by how our tutor explains
it, generated by the model — not picked from a template. Full rationale: DECISIONS.md D-2026-09-28-7;
full spec: docs/BOARD_VISUALS.md.

**Built:**
- `src/visual/` — the drawing vocabulary (`types.ts`: plane / canvas / space frames; 13 2D and 7 3D
  bricks), a safe expression parser (`expr.ts`, no `eval`), the sanitizer + fact-checker
  (`sanitize.ts`), the generation prompt written around the tutor's method (`prompt.ts`), generation
  with one repair round (`generate.ts`), label layout (`layout.ts`), voice↔board matching and the
  voice prompt's THE BOARD PICTURES block (`tutorBrief.ts`), and reference samples (`samples.ts`, never
  shown to the model).
- `BoardVisualView.tsx` (SVG) and `Board3DView.tsx` (Three.js) — one renderer each, any brick
  combination, stepped reveal, spotlight on what the tutor is naming.
- Per concept: `main`, up to 3 `contrast:<misconception>` pictures, an `apply` picture (the ladder
  situation, never its answer), an optional `3d` picture (the model may decline; reason recorded), and
  `focus:` pictures made on demand. This closes the earlier "not done" item: misconception-contrasting
  visuals now exist.
- Voice and board are synced: the voice prompt lists each picture's step names; `reveal_part`,
  `highlight_concept`, `update_diagram`, `switch_board_view` move the picture.
- Pregen: `--visuals-only` flag; lesson prompt no longer asks for `diagram`/`scene3d`; the hardcoded
  "Mathematics / Geometry" subject label is gone. Server: `/api/generate-lesson` and
  `/api/update-diagram` attach/generate pictures and never substitute a generic template.
- Storage: `visuals` stored in Firestore as a `visualsJson` string (nested-array landmine #13).
- Removed: `src/curriculum/visualGuidance.ts`.
- Still hand-built on purpose: the Pythagoras figure. Old lessons without pictures still render
  through the legacy boxes/spheres views until regenerated.

**Verified:** `npx tsc --noEmit` clean; `npm run test:visuals` 46/46; `tests/smoke/board-visual-http.mjs`
7/7 against the real server; all other smoke suites and `tests/run.mjs` pass; `vite build` OK. Sample
pictures checked by real Chromium screenshots (which caught the glow-filter bug, landmine #14).

**Not verified — must do before the demo:** pictures from the real model. Gemini isn't reachable from
this environment. On the dev machine: `npm run pregen -- --visuals-only` (cheap: pictures only), then
`npm run preview:visuals -- --concept <id>` for each demo concept, and look at every step.

**Unchanged, still open:** `tests/live/run.mjs` fails the same 7 pre-existing assertions (D-2026-09-28-5,
landmine #12) — not caused by this change.

**Judging lens:** strengthens Technical Merit & GenAI (the model composes and sequences a teaching
picture, grounded by a code-level fact-checker, instead of filling a template) and Innovation (a
picture per catalogued misconception, revealed in step with the voice). Weakest point now: quality of
real model output is unmeasured — no evaluation set for pictures yet.

## Update — 2026-09-30 (Chapter 1 material quality: gates, parallel L3, verified photos, quiz reasoning)

**Why:** the honest Chapter 1 review (docs/CH1_MATERIAL_REVIEW.md) ranked the pregenerated material below
the tutor persona's own standard. Plan and state: docs/CH1_FIX_PLAN.md (§6). Decisions:
D-2026-09-30-1…4.

**Built:**
- `src/quality/**` — language, quiz, leak, picture, lesson and record lints; independent critic
  (`review` model role); scripted-model seam for tests.
- One lesson generator for pregen and live (`lessonGen.ts`) with repair loop; photo pipeline with
  vision verification (`photoGen.ts`); server serving helpers (`serve.ts`) that keep the quiz key server-side.
- Parallel L3 pair (apply = L3-A, quiz = L3-B) and coverage-gap reporting at ingest.
- Quiz reasoning before reveal; no reasoning → evidence capped at L1.
- `upgrade:pregen` (in-place, backed up) and `review:pregen` (scorecard); `verify` script.
- Docs updated: BOARD_VISUALS v2.0, CURRICULUM v1.4, TECHNICAL_SPEC v1.1, ARCHITECTURE, LEARNER_MODEL,
  TUTOR_PERSONA, TEACHING_PLAN, FUNCTIONAL_SPEC (FR-40…46), TRACEABILITY, BUILD_PLAN, AGENT_GUIDE
  (landmines #15–#17), CODE_DOC_MAP, README.

**Verified here:** tsc clean; `npm run test:gates` green (61 quality checks + 46 picture checks +
curriculum-ingest). **Loops proven with scripted models only.**

**Current stored-content state (scorecard, 22 concepts):** 14 records still have lint errors; 74
pictures withheld, 28 served; 0 verified photos; 0/22 critic-reviewed; 9 quizzes quarantined.
The board is therefore emptier than before *by design* until regeneration.

**Known risks / open:**
- Real-model quality and repair convergence are unmeasured — owner must run `npm run pregen:ch1`
  (needs GEMINI_API_KEY), then `npm run review:pregen` and `npm run preview:visuals`.
- `tests/live/run.mjs` fails the same 7 assertions as before (landmine #12), so `npm test` is still red.
- Not built: per-step HTML gallery, pregen dry-run flag.

**Red-team:** weakest point = no measured real-model output; AI-wrapper risk is reduced by the
gate/critic/repair loop but a judge will ask for the before/after scorecard, which needs the regeneration run.

## Update — 2026-09-30 (first real regeneration run: cost problem found and fixed)
The user's real `pregen:ch1` run showed ~43 calls and 5–13 min per concept, and withheld lessons overwriting stored ones.
Fixed (D-2026-09-30-5): keep-best, leak-rule and contrast-phase corrections, repair only on errors with early stop,
`--resume`, call/image budgets and accounting. Quality suite now 36 checks. **Unmeasured:** post-fix cost and yield —
rerun `npm run pregen:ch1`. The earlier claim that the material was ready for regeneration was optimistic: the first
real run exposed defects my scripted-model tests could not.

## Update — 2026-09-30 (pregen redesigned as single-shot, D-2026-09-30-6)
User's direction: decide exactly what to generate, call once, no trial-and-error. Done: deterministic artefact plan
(`npm run pregen:ch1:plan`: ≤ 96 text + 12 image + 12 vision calls for all of Chapter 1), one generation call per
artefact, one review per concept applied in code, repair opt-in only. Quality suite 40 checks. Unmeasured: real
first-shot yield — some artefacts will be withheld until a human opts into `--repair 1` for them.

## Update — 2026-09-30 (spec-driven, subject-agnostic generation, D-2026-09-30-7)
Photo/3D/hints are decided at ingest (`presentation`, `ladderItems[].hints`), not by static lists. Pregen executes the content spec
(`src/visual/specJobs.ts`): teach chunks + alternative board + contrast per misconception + apply, worked/drawn form per representation.
Existing curricula need `npm run backfill:design` (2 calls for the current 2 courses) before the plan shows photo/3D/hints correctly.
Safe procedure: `npm run backfill:design -- --dry-run` → `npm run backfill:design` → `npm run pregen:ch1:plan` → one concept with `--concept` → send the 💸 line → full chapter.
Unmeasured: real cost and first-shot yield.


## Update — 2026-10-07 (tutor name chosen by the child)
- Built: after every login the child is asked what to call the tutor (default "Dr. Marcus", pre-filled with the last choice, saved on the profile as `tutorName`). All on-screen labels (stage, avatar, bottom bar, boards, scene panel, onboarding) and the voice tutor's prompt use the chosen name. See D-2026-10-07-1, docs/TUTOR_PERSONA.md §2, FR-09a.
- Verified: unit checks (tests/tutor-name/run.mjs, 13) and `tsc --noEmit`. Not yet verified: in a browser, in a live voice session, on Firestore.
- Closed: OQ-1 (persona name).
