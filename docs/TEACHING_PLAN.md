# Per-Learner Teaching Plan — Specification

_Status: v1.0 · 2026-09-24 · Implements: FR-17…FR-21 · Code home: `src/plan/`_

The Teaching Plan is the bridge between the fixed **persona** and the evolving **Learner
Model**. It is a small, versioned, **deterministically compiled** object that tells the tutor,
for this learner, this subject and this concept: where to start, how to teach, how hard to go,
what to watch for, and what to review. Every choice carries a human-readable reason and the
evidence IDs behind it.

```
Persona (fixed)  +  Learner Model (evidence)  +  Curriculum (concept graph)
                         │
                 compileTeachingPlan()   ← deterministic, unit-tested
                         │
                  TeachingPlan vN  ──► renderPlanForPrompt() ──► tutor system instruction
                         │                                         (+ UI "Tutor's reasoning")
            after each exchange: compilePlanDelta() → vN.1 …
```

**Why deterministic and not LLM-generated:** it is testable, reproducible for the demo,
explainable to judges and parents, and cheap. GenAI is used where it is necessary —
diagnosis (reading free-text reasoning), profiling (turning evidence into scoped claims) and
teaching (generating explanations, examples and transfer items) — not for arithmetic over
counts.

---

## 1. Inputs

| Input | From |
|---|---|
| `LearnerProfile` (ageBand, onboarding, conceptStates, strategyProfile, affect, claims, review) | LEARNER_MODEL.md |
| `CurriculumSubject` (concepts, prerequisites, misconception catalogue, difficulty, conceptType) | `data/curricula.json`, `src/curriculum/*` |
| Persona config (limits, thresholds, age-band surface, subject mode) | `src/persona/config.ts`, `ageBands.ts`, `subjectModes.ts` |
| Session context | Requested subject/concept (optional), channel, now() |

---

## 2. Output schema

```ts
export interface PlanReason { text: string; evidenceRefs: string[]; rule: string }

export interface TeachingPlan {
  planVersion: string;                 // `${studentId}:${subjectId}:${n}` — stored in learners/{id}/plans
  personaVersion: string;
  generatedAt: number;
  studentId: string; subjectId: string;
  channel: 'voice' | 'text';
  ageBand: AgeBand; subjectMode: 'well_structured' | 'interpretive' | 'skill';

  // WHAT
  reviewItems: Array<{ conceptId: string; reason: PlanReason }>;            // due spaced reviews, max 3
  targetConcept: { conceptId: string; label: string; reason: PlanReason };
  prerequisitesToProbe: Array<{ conceptId: string; label: string; checkQuestion?: string; reason: PlanReason }>;
  startLadderGoal: LadderLevel;        // e.g. 3 on first exposure, 4 when already provisional

  // HOW
  representationOrder: Array<{ strategy: TeachingStrategy; expected: number; reason: PlanReason }>;
  avoidRepresentations: Array<{ strategy: TeachingStrategy; reason: PlanReason }>;
  scaffoldLevel: 'full' | 'faded' | 'independent';
  difficulty: 1 | 2 | 3 | 4 | 5;
  fastTrackEligible: boolean;
  exampleThemes: string[];             // from onboarding interests
  watchMisconceptions: Array<{ id: string; text: string; status: 'suspected' | 'confirmed'; probe?: string; reason: PlanReason }>;

  // PACE & LIMITS
  pace: { chunkSentences: [number, number]; checkEvery: number; confidenceCheckEvery: number; sessionMinutes: number };
  limits: { probeBudget: number; retryCap: number; maxChecksWithoutTeach: number; maxPrereqProbes: number };

  // TONE (surface only — never character)
  register: string;                    // from the age band, e.g. 'friendly-curious'
  accessibility: Onboarding['accessibility'];

  // TRANSPARENCY
  thinkAloudLines: string[];           // 1–2 learner-facing sentences, e.g. "Last time tiles helped — let's start there."
}
```

---

## 3. Cold start (first session, no evidence)

| Field | Default |
|---|---|
| targetConcept | First concept by `typicalTeachingOrder`, or the learner's requested topic |
| prerequisitesToProbe | All direct prerequisites (max 3) |
| representationOrder | Subject-mode default: well-structured → `visual_diagram, worked_example, real_world_analogy, step_by_step, interactive_simulation, socratic_questioning` |
| scaffoldLevel | `full` |
| difficulty | Concept's `difficultyLevel`, adjusted −1 if onboarding feeling = `worried` |
| exampleThemes | Onboarding interests |
| pace | Age-band defaults |
| thinkAloudLines | "I'm just getting to know how you think — tell me if anything's too easy or too hard." |

---

## 4. Compile algorithm — `compileTeachingPlan(profile, curriculum, ctx)`

Each step records a `PlanReason { rule, text, evidenceRefs }`.

1. **Review first** (rule `R-REVIEW`): concepts with `review.nextDueAt ≤ now`, ordered by overdue-ness, max 3.
2. **Target concept** (rule `R-TARGET`): the requested concept if given, else the next concept in teaching order whose `masteryStatus` is `none`/`provisional` and whose prerequisites all have `pKnown ≥ 0.6`. If a prerequisite fails that bar → the prerequisite becomes the target (`R-PREREQ-FIRST`).
3. **Prerequisite probes** (rule `R-PROBE`): direct prerequisites without `durable` mastery, max `limits.maxPrereqProbes`. Skip any with L3+ evidence in the last 14 days.
4. **Watch-list** (rule `R-WATCH`): ledger entries on the target concept with status suspected/confirmed, plus misconceptions confirmed on sibling concepts of the same `conceptType` (often the same underlying wrong rule). Attach the catalogue probe question.
5. **Representation order** (rule `R-REP`): for the target's `conceptType`, rank representations by the `strategyProfile` Beta mean (demo mode) or a Thompson sample (live mode). Tie-break by subject-mode default. Representations with ≥ 3 uses and mean < 0.3 → `avoidRepresentations` (`R-AVOID`). If there is no data for this conceptType, borrow from the nearest conceptType in the same subject, weighted 0.5.
6. **Scaffold level** (rule `R-SCAFFOLD`): `highestLevel ≤ 1` → full; `2–3` → faded; `≥ 4` → independent.
7. **Difficulty** (rule `R-DIFF`): base = concept difficulty; +1 if recent success rate > 90% over ≥ 5 items; −1 if < 60%.
8. **Fast-track** (rule `R-FAST`): eligible if all prerequisites are durable and the target already has L2+ evidence with sound reasoning.
9. **Pace** (rule `R-PACE`): age-band defaults; `checkEvery` −1 (more frequent) if `affect.confusionSignals` in the last 2 sessions ≥ 4; `sessionMinutes` = min(age-band cap, typical session length × 1.2).
10. **Ladder goal** (rule `R-GOAL`): 3 if first exposure; 4 if provisional; 5 (teach-back) if ageBand ≠ 5–7 and durable is the next step.
11. **Think-aloud lines** (rule `R-TALK`): generated from templates filled with the top reasons (e.g. `R-REP` with evidence → "Last time the {strategy} helped you with {conceptType}, so let's start there.").
12. **Persist**: write `learners/{id}/plans/{planVersion}`; return the plan.

---

## 5. Rendering into the tutor prompt — `renderPlanForPrompt(plan)`

Appended by `composeSystemInstruction` after the persona core. Example:

```
━━━ YOUR PLAN FOR AISHA (plan math:12 · persona v1.0) ━━━
Warm-up reviews (ask first, no teaching unless failed): Area of a triangle.
Target: Finding a missing side with Pythagoras' theorem. Goal: apply to a new problem (L3).
Probe these first, max 3: "square numbers", "identifying the right angle".
Teach in this order of representations: worked example → visual diagram → real-world analogy.
Avoid: pure direct explanation for relationship-type ideas (0 of 3 led to gains).
Watch for: [suspected] "adds the sides instead of squaring" — probe: "Try 6 and 8 — what do you get?"
Scaffold: faded. Difficulty 3/5. Examples: football, Minecraft.
Pace: 2–3 sentences per chunk, check every chunk, confidence check every 2nd question, ~20 min.
Limits: probe budget 2 · retry cap 3 · max 3 checks without new teaching.
Say this near the start: "Last time, working through an example first really helped you — let's do that."
```

The plan block never overrides the persona's hard rules. The composer puts the hard rules
last-in-priority-order ("If the plan conflicts with a HARD RULE, the hard rule wins").

---

## 6. In-session updates — `compilePlanDelta(plan, event)`

After each `EvidenceEvent`:

| Event outcome | Delta |
|---|---|
| Failed check with representation X | Mark X tried; next `SWITCH_REPRESENTATION` uses the next item in `representationOrder`; `retryCount++` |
| `retryCount == retryCap` | Instruction: `PARK_AND_ESCALATE`; schedule review for tomorrow |
| Misconception newly suspected | Add to the watch-list with its probe; instruction `DISCRIMINATING_PROBE` |
| Misconception confirmed | Instruction `CONTRAST_CASE`, then a transfer item |
| L3 on 2 distinct items + pKnown ≥ 0.8 | Instruction: move to `TRANSFER_FAR` or the next concept |
| Confident + wrong | Instruction: probe before teaching |
| Unsure + right | Instruction: one more item; reassure |
| 2 consecutive failures, or a frustration signal | Instruction `ENCOURAGE_RESET`, difficulty −1 |
| Language errorClass | Instruction: rephrase; no concept penalty |

The delta produces a **one-line guidance** string for the tutor (e.g.
`"Next: probe — 'what if the right angle were at the top?' Do not explain yet."`) plus the
UI reasoning-panel entry. Delivery to the live voice session is non-blocking (TECHNICAL_SPEC
§5.3; to be validated by spike T19).

---

## 7. Traceability

Every event stores `planVersion` and `moveUsed`. Every plan stores the reasons and evidence IDs.
This makes the full chain queryable:

`claim → evidence events → plan version that used it → tutor move → next evidence event`

This is what the parent portal replay and the "Tutor's reasoning" panel display.

---

## 8. Tests (unit — `tests/plan/*.test.ts`)

| ID | Given | Expect |
|---|---|---|
| TP-01 | Empty profile | Cold-start defaults (§3) |
| TP-02 | Prerequisite with pKnown 0.4 | Prerequisite becomes the target (`R-PREREQ-FIRST`) |
| TP-03 | strategyProfile: worked_example 4/5, direct 0/3 | worked_example first; direct in avoid |
| TP-04 | Review due yesterday | Appears in reviewItems |
| TP-05 | Confirmed misconception on sibling concept | Appears in the target's watch-list |
| TP-06 | Delta: 3 failed switches | PARK_AND_ESCALATE instruction |
| TP-07 | Demo mode | Identical plan for identical input (determinism) |
| TP-08 | Every plan field with a choice | Has a PlanReason with a rule ID |
