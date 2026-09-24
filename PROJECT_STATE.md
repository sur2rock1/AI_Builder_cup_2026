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
