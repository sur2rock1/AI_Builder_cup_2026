# Learner Model — Specification

_Status: v1.0 · 2026-09-24 · Implements: FR-09…FR-16 · Code home: `src/adaptive/`_

The Learner Model is the per-learner, **evidence-based** record of what this learner
understands, what they get wrong and why, and which teaching approaches have helped *them*.
It is the input to the Teaching Plan compiler (TEACHING_PLAN.md). It never changes the
persona (TUTOR_PERSONA.md §1).

In product language this is the "learner persona". In engineering it is the **Learner
Model**, to avoid implying fixed personality labels.

---

## 1. Principles

| # | Principle | Enforced by |
|---|---|---|
| LM1 | **Evidence, not labels.** Every claim cites the evidence event IDs behind it. Claims without valid references are dropped. | Claim validator (§6.3) |
| LM2 | **Scoped.** Claims apply to a concept, concept type or subject — never globally ("visual learner" is not allowed). | Schema: `scope` is required |
| LM3 | **Calibrated.** Every claim has a confidence and an evidence count. | Schema |
| LM4 | **Decays.** Evidence ages; stale claims weaken until reconfirmed. | Decay job (§7) |
| LM5 | **Visible and correctable.** The learner sees a friendly view and can correct it; parents and teachers see the full evidence. | UI + `learner_stated` source |
| LM6 | **Conservative.** One ambiguous observation → *suspected* only. | Ledger rules (existing) |
| LM7 | **Minimal and private.** No psychological or medical categories; no personal identifiers beyond the account. | Schema review + Firestore rules |

---

## 2. Structure (layers)

```
LearnerProfile
├── identity            studentId, displayName, grade, ageBand, locale
├── onboarding          interests[], subjectFeelings{}, accessibility{}, languagePrefs
├── subjects{}          per subject
│   └── conceptStates{} per concept (EXISTING, extended)
│       ├── BKT         pKnown, masteryScore, masteryLevel            (existing)
│       ├── ladder      highestLevel, levelEvidence{L1..L5: eventIds}  (new)
│       ├── mastery     status: none|provisional|durable|durable_plus  (new)
│       ├── ledger      misconceptionLedger[]                          (existing)
│       ├── strategies  strategyOutcomes[]                             (existing)
│       └── review      nextDueAt, intervalDays, passes, lapses        (new)
├── strategyProfile     conceptType → representation → Beta(α,β)      (new, cross-concept)
├── affect              confusionSignals, frustrationEvents, typical session length, latency baseline (new)
├── claims[]            LearnerClaim (new) — the "learner persona" in words
├── sessionSummaries[]  per session (new)
└── events/ (subcollection, append-only)   EvidenceEvent            (extends LearningEvidence)
```

---

## 3. Schema (TypeScript — extends `src/adaptive/learnerModel.ts`)

```ts
export type AgeBand = '5-7' | '8-12' | '13-17' | 'adult';
export type LadderLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type MasteryStatus = 'none' | 'provisional' | 'durable' | 'durable_plus';
export type Confidence3 = 'unsure' | 'fairly_sure' | 'sure';
export type ErrorClass =
  | 'none' | 'slip' | 'guess' | 'missing_prerequisite' | 'misconception'
  | 'right_answer_wrong_reasoning' | 'procedural' | 'overgeneralisation'
  | 'language' | 'attention';

export interface Onboarding {
  interests: string[];                          // learner-stated
  subjectFeelings: Record<string, 'love' | 'ok' | 'worried' | 'skip'>;
  accessibility: { audioFirst?: boolean; largeText?: boolean; captions?: boolean };
  languagePrefs?: { primary: string; alsoUnderstands?: string[] };
  completedAt?: number;
}

/** One diagnosed exchange. Append-only. Extends the existing LearningEvidence. */
export interface EvidenceEvent extends LearningEvidence {
  eventId: string;                 // uuid
  sessionId: string;
  subjectId: string;
  conceptType: string;             // e.g. 'geometry.relationship' — drives strategyProfile
  itemId?: string;                 // distinct-item check for the mastery rule
  ladderLevel: LadderLevel;        // derived from understandingDepth (TUTOR_PERSONA §5)
  errorClass: ErrorClass;
  learnerConfidence?: Confidence3;
  moveUsed: string;                // move ID (TUTOR_PERSONA §6)
  representationUsed: TeachingStrategy;
  planVersion?: string;            // which Teaching Plan was active — traceability
  diagnosticianModel?: string;     // observability
  source: 'voice' | 'text' | 'quiz_click' | 'review';
}

export interface LadderState {
  highestLevel: LadderLevel;
  levelEvidence: Partial<Record<LadderLevel, string[]>>;  // eventIds
}

export interface ReviewState {
  nextDueAt?: number;
  intervalDays: number;            // 1 → 3 → 7 → 14 → 30
  passes: number;
  lapses: number;
}

export interface StrategyStat { alpha: number; beta: number; lastUsed: number } // Beta(1,1) prior
export type StrategyProfile = Record<string /*conceptType*/, Partial<Record<TeachingStrategy, StrategyStat>>>;

export interface AffectState {
  confusionSignals: Record<string, number>;   // dont_understand, repeat_differently, …
  frustrationEvents: number;
  medianLatencyMs?: number;
  typicalSessionMinutes?: number;
}

export type ClaimKind = 'strength' | 'gap' | 'strategy' | 'engagement' | 'preference' | 'pattern';
export interface LearnerClaim {
  claimId: string;
  kind: ClaimKind;
  statement: string;               // plain language, scoped, no labels
  childFriendly?: string;          // second-person version for the learner card
  scope: { subjectId?: string; conceptType?: string; conceptId?: string };
  confidence: number;              // 0..1, after decay
  evidenceRefs: string[];          // eventIds — REQUIRED for all sources except learner_stated
  source: 'rule' | 'profiler' | 'learner_stated' | 'parent_stated';
  status: 'active' | 'stale' | 'retracted' | 'disputed';
  createdAt: number;
  lastConfirmedAt: number;
}

export interface SessionSummary {
  sessionId: string; startedAt: number; endedAt: number;
  conceptsTouched: string[]; ladderMoves: Array<{ conceptId: string; from: LadderLevel; to: LadderLevel }>;
  misconceptionsChanged: Array<{ id: string; from: string; to: string }>;
  movesUsed: Record<string, number>; representationsUsed: Record<string, number>;
  narrative: string;               // Profiler-written, evidence-grounded
  planVersion: string;
}

// ConceptState additions (all optional → backward compatible)
//   conceptType?: string; ladder?: LadderState; masteryStatus?: MasteryStatus; review?: ReviewState;
// LearnerProfile additions (all optional)
//   ageBand?: AgeBand; onboarding?: Onboarding; strategyProfile?: StrategyProfile;
//   affect?: AffectState; claims?: LearnerClaim[]; sessionSummaries?: SessionSummary[];
```

**Backward compatibility:** every new field is optional. Existing `globalInsights` and `notes`
are kept read-only and superseded by `claims`.

---

## 4. Where the data comes from

| Source | Produces | When |
|---|---|---|
| Onboarding flow | `onboarding`, `ageBand`, initial prerequisite evidence | First login |
| Diagnostician (per exchange) | `EvidenceEvent` | After each learner answer + reasoning |
| Confusion signals (tool + UI buttons) | `affect.confusionSignals`, event flags | Any time |
| Confidence buttons / phrases | `EvidenceEvent.learnerConfidence` | With checks |
| Profiler (session end) | `claims`, `sessionSummaries` | Session end or disconnect |
| Review runs | `review`, `masteryStatus` | Spaced-review items |
| Learner or parent corrections | `claims` with source `learner_stated` / `parent_stated`, or status `disputed` | UI |

---

## 5. Update loops

### 5.1 Fast loop — every exchange (target < 3 s, never blocks the voice)

```
learner answers + reasoning (voice transcript / text / click)
  → Diagnostician (Gemini, JSON schema, closed misconception catalogue)
      output: classification, understandingDepth, errorClass, candidateMisconceptionIds, confidence
  → recordEvidence()                               [deterministic]
      1. append EvidenceEvent (eventId)
      2. misconception ledger: suspected / confirmed / resolved  (existing rules)
      3. BKT update of pKnown                                   (existing bkt.ts)
      4. ladder: highestLevel + levelEvidence
      5. masteryStatus per rule (TUTOR_PERSONA §5)
      6. strategyOutcomes (concept) + strategyProfile (concept type): α += gain, β += no-gain
      7. affect counters
  → compilePlanDelta()                             [deterministic, TEACHING_PLAN §6]
  → push to UI (learner card, Tutor-reasoning panel) + guidance to the tutor session
```

**Gain definition** for strategy statistics: the event's `masteryAfter > masteryBefore`
**or** its ladder level is above the previous event's level on the same concept.

### 5.2 Slow loop — session end

```
session end / disconnect / idle 10 min
  → Profiler (Gemini, stronger model, JSON schema)
      input: this session's events, existing active claims, onboarding, ledger, strategyProfile
      output: proposed claims (add / update / retire), session narrative
  → Claim validator                               [deterministic]
      - every evidenceRef must exist and belong to this learner
      - scope required; banned-label lexicon check (e.g. "visual learner", "lazy", "ADHD")
      - confidence ≤ f(evidence count): 1 event → max 0.4; 2 → 0.6; 3+ → 0.85
      - reject claims that contradict a learner_stated/parent_stated claim; mark those `disputed`
  → merge claims, write SessionSummary
  → schedule reviews (§7.2)
```

---

## 6. Algorithms

### 6.1 Mastery (existing, kept)
Bayesian Knowledge Tracing with evidence-quality-conditioned slip/guess (`src/adaptive/bkt.ts`).
Parameters are **chosen, not fitted** — this must be stated in the documentation and the pitch.

### 6.2 Strategy effectiveness (new, cross-concept)
For each (conceptType, representation), a Beta(α, β) with prior Beta(1, 1). Expected success
= α / (α + β). The plan ranks representations by a **Thompson sample** (or by the mean in demo
mode, for determinism) so untried representations still get explored.
Minimum evidence before a strategy claim may be written: 3 uses.

### 6.3 Claim confidence
`confidence = min(cap(n), base) × decay(age)`, where `n` = number of distinct supporting events,
`cap(1)=0.4, cap(2)=0.6, cap(≥3)=0.85`, and `decay(age) = 0.5^(age / halfLife)`.

---

## 7. Time: decay, review, grade transitions

### 7.1 Decay
| Item | Half-life | Effect |
|---|---|---|
| Claims | 60 days (strategy), 30 days (gap/strength) | Confidence decays; below 0.25 → `stale` (hidden from plan, kept for history) |
| Strategy stats | α, β × 0.9 per 30 days | Old preferences fade and new evidence dominates |
| BKT pKnown | Not decayed | Retention is handled by review, not by silently lowering mastery |

### 7.2 Spaced review
Intervals 1 → 3 → 7 → 14 → 30 days. Pass → next interval, `passes++`. Fail → interval back
to 1, `lapses++`, and `masteryStatus` falls from durable to provisional. First pass after ≥ 24 h
→ `durable`; a pass after ≥ 7 days → `durable_plus`.

### 7.3 Grade transitions / long gaps
No special re-profiling. On a new grade: `ageBand` is recomputed, new curriculum concepts
are linked via prerequisites to old evidence, and decay has already weakened old claims.
After a gap of more than 30 days, the plan inserts prerequisite review for the first session.

---

## 8. Views

| View | Audience | Shows |
|---|---|---|
| **"What I've learned about you" card** | Learner | 3–5 `childFriendly` claims, current goals, next review; a "That's not right" button → `disputed` + optional correction |
| **Parent portal** | Parent | Concept ladder per subject, misconception ledger with status, claims with evidence replay (events), session summaries, safeguarding flags |
| **Tutor's reasoning panel** | Demo / teacher | Current move, why (plan rule + evidence refs), the Diagnostician's last classification |

---

## 9. Storage (Firestore)

```
learners/{studentId}                         LearnerProfile (without events)
learners/{studentId}/events/{eventId}        EvidenceEvent (append-only)
learners/{studentId}/plans/{planVersion}     TeachingPlan snapshots (traceability)
learners/{studentId}/sessions/{sessionId}    SessionSummary + raw transcript pointer (optional)
```
Rules: read/write only by the owning account (learner or linked parent) through server
endpoints; no public read (the current rules allow public read of `learners` — must be fixed,
BUILD_PLAN T02). A delete endpoint removes the profile and its subcollections.

---

## 10. Existing vs new

| Capability | Status in code today | Action |
|---|---|---|
| BKT mastery | ✅ `bkt.ts` | Keep |
| Misconception ledger with confirmation threshold | ✅ `learnerStore.recordReasoningEvidence` | Keep; route all diagnosis through it |
| Per-concept strategy outcomes | ✅ | Keep; add the cross-concept `strategyProfile` |
| Evidence log | ✅ capped at 200, inside the profile JSON | Move to an append-only subcollection with IDs |
| Live observer snapshot | ⚠️ session-only, not persisted, not linked to `studentId` | Merge into the Diagnostician → `recordEvidence` |
| Persistence | ⚠️ JSON file + partial Firestore | Single repository, Firestore-first |
| Ladder, mastery status, review, claims, affect, onboarding | ❌ | New |
