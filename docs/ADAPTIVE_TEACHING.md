# Adaptive teaching — how Ananta learns each child and changes how it teaches

_Updated 2026-10-17. Every statement below was checked against the code; file and function names are given so it can be
verified. To see it work: `npm run test:adaptation` (offline, no API key, about 10 seconds)._

## In one paragraph

Ananta does not label a child as a "visual learner". After every answer the tutor checks, it records **how the idea had been
explained** and **whether the child's understanding actually moved forward**. Per type of idea, it keeps a running score for
each way of explaining. Before the next lesson a deterministic planner turns that history into a plan for this child: which
approach to lead with, which to avoid, which of the child's own mix-ups to watch for, which earlier idea to check first, how
much support to give and how hard to make it. The plan is written into the voice tutor's instructions. During the lesson,
each checked answer can change the very next move. Parents see the same plan at the top of the Parent View.

## The loop

```
 child answers a question
    │  Gemini Live calls assess_child_reasoning(question, answer, the child's reasoning,
    │                                           representationUsed = how the tutor had explained it)
    ▼
 1. Diagnose       src/adaptive/reasoningAssessor.ts      Gemini (fast role, 6.5 s budget) classifies the reasoning against
                                                          the concept's catalogued misconceptions
 2. Record         src/adaptive/learnerStore.ts           recordReasoningEvidence(): evidence event, BKT mastery, evidence
                   recordReasoningEvidence()              ladder, misconception ledger, strategy profile  (deterministic)
 3. Adapt now      src/plan/delta.ts  compilePlanDelta()  the next move for THIS lesson, returned to the tutor in the same
                                                          tool response (server.ts, handleAssessChildReasoning)
 4. Plan next      src/plan/compile.ts                    compileTeachingPlan(): named rules R-TARGET … R-TALK → TeachingPlan,
                   compileTeachingPlan()                  compiled and saved when a session starts (POST /api/session/start)
 5. Tell the tutor src/plan/render.ts                     renderPlanForPrompt() → composeSystemInstruction({ planBlock }) →
                                                          Gemini Live system instruction (guided and standard tutor)
 6. Session end    src/adaptive/profiler.ts               runProfiler(): Gemini proposes claims about patterns;
                   src/adaptive/claimValidator.ts         claims not backed by real events are rejected
 7. Show parents   src/parent/report.ts, facts.ts         Parent View: "Ananta's plan for {child}'s next lesson" first,
                                                          "How Ananta figured {child} out" with the child's own words
```

Gemini is used where judgement on language is needed (steps 1 and 6, and the teaching itself). Steps 2–5 and 7 are
deterministic code, so the same history always gives the same plan and every decision carries a rule id and a reason.

Where it is stored: `data/learner-profiles.json` (concept states, strategy profile), `data/events/<id>.json` (one event per
checked answer), `data/plans/<id>.json` (every plan version). On Cloud Run the same records live in Firestore
(`learners/{id}` and its `events`, `plans`, `sessions` sub-collections).

## What is learned (step 2)

| What | Code | How |
|---|---|---|
| How well a concept is known | `bkt.ts` `updateMastery`, `ladder.ts` | Bayesian Knowledge Tracing: a probability `pKnown`, updated by each answer and weighted by the quality of the evidence. A 5-step evidence ladder records the deepest kind of answer seen (from "recognises it" to "uses it in unfamiliar situations"). |
| When a concept counts as learned | `ladder.ts` `computeMasteryStatus` | *provisional* = `pKnown ≥ 0.80` **and** step-3+ evidence on at least 2 different questions **and** no confirmed mix-up. *durable* additionally needs a passed spaced review ≥ 24 h later. |
| The child's mix-ups | `learnerStore.ts` misconception ledger | *suspected* after one answer that shows a catalogued wrong belief; *confirmed* when it shows again on a different question; *fixed* after a sound answer to a question the child had not seen. A confirmed mix-up blocks mastery. |
| **What works for this child** | `strategyProfile.ts` `recordStrategyOutcome` | For each (type of idea, way of explaining): a Beta(α, β) score starting at (1, 1). A gain adds 1 to α, no gain adds 1 to β; older evidence fades (factor 0.9 per 30 days). Score = α / (α + β). |
| Confusion | `record_confusion_signal` → `affect.confusionSignals` | Used by the pace rule. |

**What counts as a gain** (`learnerStore.ts`, `bkt.ts` `supportsMastery`): the answer itself was evidence of knowing (sound
reasoning, no standing mix-up) or reached a higher ladder step. A wrong answer never counts in favour of the approach that was
used. This was a real bug found by testing on 2026-10-16 (D-2026-10-16-4: BKT's learning-transition term lifts `pKnown` even
after a wrong answer, so wrong answers used to count as gains); the fix was re-applied on 2026-10-17.

**Which approach gets the credit** (`server.ts` `handleAssessChildReasoning`): the one the tutor reports in
`representationUsed` on `assess_child_reasoning` (added 2026-10-17). If the tutor leaves it out, the approach last recorded
on that concept is used, which defaults to "direct explanation".

Because the score is kept **per type of idea** (`conceptTypeFor`), what is learned on one concept carries over to the next
concept of the same type. All four Grade 4 Number concepts share the type `place-value-and-number-systems`.

## How the next lesson's plan changes (step 4)

`compileTeachingPlan()` is pure code: each part of the plan comes from a named rule, and the reason is stored in the plan.

| Rule | What it decides from the child's history |
|---|---|
| `R-REVIEW` | Concepts with a review due become warm-ups (spaced-review scheduling itself is not built yet, see Limits). |
| `R-TARGET` / `R-GOAL` / `R-FAST` | The concept to teach (the one the child picked, else the next one without durable mastery), the ladder step to aim for, and whether to fast-track. |
| `R-PREREQ-FIRST` / `R-PROBE` | A weak prerequisite (`pKnown < 0.6`) is taught first; prerequisites without durable mastery are probed first (max 3). |
| `R-WATCH` | The child's suspected or confirmed mix-ups on this concept, plus confirmed ones on related concepts of the same type, each with a probe question. |
| **`R-REP`** | **The order of ways to explain**, ranked by this child's score for this type of idea. With no evidence yet, the subject's default order. |
| **`R-AVOID`** | A way of explaining with ≥ 3 uses and a score below 0.3 is marked *avoid*, moved to the end, and never chosen by the mid-lesson switch. |
| `R-SCAFFOLD` | Highest ladder step on the target: 0–1 → full support, 2–3 → faded, 4+ → independent. |
| `R-DIFF` | Difficulty: the concept's base level, +1 if over 90 % of the last 5 answers (at least 3) were sound, −1 if under 60 %. |
| `R-PACE` | Age-band chunk size and check frequency; checks more often after 4+ confusion signals. |
| `R-TALK` | The opener: "Last time, *worked example* really helped you with this kind of idea — let's start there", when the top approach has evidence and a score above 0.5; otherwise "I'm still getting to know how you think". |
| interests | Examples are themed on the child's own interests from onboarding. |

`renderPlanForPrompt()` writes this into the tutor's instructions as `YOUR PLAN FOR <child>` (see the real output below).
The guided chalkboard tutor is told to lead each idea with the plan's first approach (a picture with `show_picture`, an example
worked aloud, or an analogy from the child's interests), to use the opener, and to check the watched mix-ups gently
(`src/guided/prompt.ts`). The prepared board lines are the same for every child; **how they are explained** follows the plan.

## How it adapts within a lesson (step 3)

After every checked answer `compilePlanDelta()` (`src/plan/delta.ts`) returns the next move, which the server puts first in the
tool response the tutor receives:

| Outcome | Next move |
|---|---|
| Sound answer | Carry on; the miss streak for this concept is cleared. |
| Missed, no reasoning given | Do not say it is wrong yet; ask, warmly, how they got it. |
| Missed, reasoning given | Name the one step that goes off track and re-explain with the **next approach in this child's order** (never an avoided one). |
| Two misses in a row | Normalise it ("this one is tricky at first"), stop asking questions, teach it directly. |
| Three misses on the concept | Teach it directly; the tutor never stops, parks or hands off. |
| Mix-up suspected | Ask a discriminating probe question (at most 2 per question) before deciding. |

## Proof

### 1. Automated: `npm run test:adaptation`

`tests/smoke/adaptation-proof.mjs` runs the real pipeline (record → plan → what the tutor is told → mid-lesson move) on a
throwaway data folder. Three children, same Grade 4 course and lesson, different histories. Output on 2026-10-17:

```
course: Mathematics (Grade 4); target: "Positive and negative numbers"; concept type: place-value-and-number-systems
  new child:          visual_diagram -> worked_example -> real_world_analogy -> step_by_step -> interactive_simulation -> socratic_questioning
  examples child:     worked_example -> real_world_analogy -> step_by_step -> interactive_simulation -> socratic_questioning -> visual_diagram   avoid: visual_diagram
  pictures child:     visual_diagram -> real_world_analogy -> step_by_step -> interactive_simulation -> socratic_questioning -> worked_example   avoid: worked_example
PASS  a child for whom worked examples worked is taught with a worked example first
PASS  ...and pictures, which failed 4 times, are marked "avoid" and moved to the end of the order
PASS  the mirror-image child is taught with a picture first
PASS  ...and worked examples are avoided for that child
PASS  three children, three different plans for the same lesson
PASS  the tutor is told to open with what worked ("Last time, worked example really helped you...")
PASS  the tutor is told what to avoid
PASS  4 wrong answers taught with pictures score 0 gains, 4 misses (alpha 1.00, beta 5.00)
PASS  after a miss mid-lesson the tutor switches to "real_world_analogy", the next approach in this child's order
PASS  after two misses in a row the tutor stops questioning and teaches directly
all adaptation checks passed
```

### 2. Two Grade 4 learners, same lesson: `npm run seed:g4`

`scripts/seed-g4-pair.ts` creates two **simulated** learners (scripted answers, labelled "(Simulated)", ids `demo_g4_*`) and
runs their answers through the real pipeline. Both studied 4-digit numbers → ordering and rounding → positive and negative
numbers, then open **Money and decimal place value**.

| | Maya (Simulated) | Leo (Simulated) |
|---|---|---|
| History | Plain spoken explanation did not land; pictures (place-value chart, number line, thermometer) did. All three concepts learned. | Pictures left him unsure; worked examples and written steps did. Still believes "−5 is greater than −1". |
| Learned scores, `place-value-and-number-systems` | picture **0.91** (α 10, β 1) · plain explanation 0.33 (α 2, β 4) | worked example **0.80** (α 4, β 1) · steps 0.75 (α 3, β 1) · picture **0.17** (α 1, β 5) |
| Tutor is told (`renderPlanForPrompt`) | Teach in this order: visual diagram → worked example → real-world analogy → step by step. Examples themed on football, drawing. "Last time, visual diagram really helped you…" | Teach in this order: worked example → step by step → real-world analogy → interactive simulation. **Avoid: visual diagram (4 uses, only 17% led to a gain).** Watch for: [confirmed] "−5 is greater than −1". Examples themed on cooking, Lego. "Last time, worked example really helped you…" |
| Parent View: plan card | Next lesson: Money and decimal place value. "Begin by drawing it out." | Next lesson: Positive and negative numbers (the open mix-up first). "Begin by working through an example together." "Avoid a picture or diagram, which has not helped Leo so far." |
| Parent View: story | "…so Ananta stopped explaining it in words and switched to drawing it out." → Fixed | "…so Ananta stopped drawing it out and switched to working through an example together." → still open |

The board lines of the lesson are identical for both children; the plan that shapes how they are taught is not.

### 3. Other tests that cover the loop

| Test | What it checks |
|---|---|
| `tests/smoke/plan-and-store.mjs` | plan compile rules and plan storage |
| `npm run test:plan-delta-outcome` | every branch that turns a diagnosis into a mid-lesson outcome |
| `tests/smoke/plan-delta-never-stops.mjs` | the tutor never parks or gives up; a miss leads to a new representation |
| `tests/smoke/profiler.mjs`, `tests/smoke/claim-validator.mjs` | session-end claims are only kept when real events back them |
| `tests/smoke/quiz-evidence.mjs` | quiz answers are capped as evidence (a bare correct answer is not proof of understanding) |
| `npm run test:parent` | the Parent View is built only from the child's real answers (25 checks) |

## Limits (stated, not hidden)

1. **Learning needs checked answers.** If the tutor never calls `assess_child_reasoning` in a session, nothing is learned and
   the Parent View does not change (seen on 2026-10-16: sessions stopped before the first question).
2. **The voice tutor is instructed, not forced.** Whether Gemini Live leads with the planned approach, and fills in
   `representationUsed`, has not yet been measured in live sessions. The "adapted vs base" evaluation (EV-02) is not built.
3. **Before 2026-10-17, live sessions credited the concept's last recorded approach** (usually "direct explanation"), not
   what the tutor actually did; profiles built then under-credit other approaches until new evidence accumulates.
4. **Ranking uses the average score.** Thompson sampling was designed but is not implemented, so untried approaches are only
   explored through the default order.
5. **Spaced review is not built (T15).** "Durable" mastery appears only when a passed review is recorded; the Grade 4 demo
   seed sets one by hand, and only where the app's own rule already says "provisional".
6. **Maya and Leo are simulated** (scripted answers through the real code), not real children.
7. **"What works" is about this child on this type of idea so far**, not a fixed learning style: it fades over time and is
   re-tested by every new answer.
