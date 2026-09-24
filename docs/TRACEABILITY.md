# Traceability Matrix

_Status legend: ⬜ not started · 🟨 in progress · ✅ done · ♻️ existing code reused_
_Update the Status column when a task merges. Last updated: 2026-09-24_

## 1. Requirement → design → build → verify → demo

| Req | Summary | Spec | Tasks | Code (target) | Verified by | Demo beat | Status |
|---|---|---|---|---|---|---|---|
| FR-01 | One base persona for everyone, versioned | PER §1–3, §19 | T05, T06, T07 | `src/persona/*` | Composer snapshots; P-01…P-18 | 2:15 architecture | ⬜ |
| FR-02 | Teach-before-test session arc | PER §4 | T05, T07 | `persona/core.ts` | P-16 | 1:30 live | ⬜ |
| FR-03 | Reasoning elicited after every answer | PER H1, §6 | T05, T07 | `persona/core.ts`, `moves.ts` | P-01, P-02 | 1:30 live | ⬜ (adaptive prompt has it ♻️) |
| FR-04 | Move ID + reason per turn | PER §6 | T05, T10, T23 | `moves.ts`, `EvidenceEvent.moveUsed` | Event field coverage 100% | Reasoning panel | ⬜ |
| FR-05 | Age-band surface | PER §12.1 | T05, T06 | `ageBands.ts` | P-14; snapshots | 0:45 two learners | ⬜ |
| FR-06 | Subject modes | PER §12.2 | T05, T06 | `subjectModes.ts` | Text-mode interpretive run | (optional) | ⬜ |
| FR-07 | Safety / safeguarding | PER §16 | T05, T26 | `safety.ts` | P-13 | — | ⬜ |
| FR-08 | Academic integrity | PER §15 | T05, T26 | `core.ts` | P-10, P-11 | — | ⬜ |
| FR-09 | Onboarding | LM §3–4 | T13 | `Onboarding.tsx` | First plan uses interests | 0:45 | ⬜ |
| FR-10 | Async per-exchange diagnosis | LM §5.1, TS §5.2 | T11 | `diagnostician.ts`, `segmenter.ts` | EV-01; latency test | 1:30 | ⬜ (♻️ reasoningAssessor, liveObserver) |
| FR-11 | Append-only evidence events | LM §3, §9 | T03, T10 | `repo/*`, `learnerStore.ts` | Restart persistence test | Parent replay | ⬜ |
| FR-12 | Misconception ledger | LM §5.1 | T10 | `learnerStore.ts` | Existing + new unit tests | 1:30 "mastery goes down" | ♻️ |
| FR-13 | Ladder + mastery status | PER §5, LM §3 | T10 | `ladder.ts` | Unit tests | Learner card | ⬜ |
| FR-14 | Confidence capture | PER §9 | T12 | UI + segmenter | Coverage ≥ 50% | 1:30 | ⬜ |
| FR-15 | Strategy profile (Beta) | LM §6.2 | T10 | `strategyProfile.ts` | Unit tests; TP-03 | 0:45 plan diff | ⬜ |
| FR-16 | Profiler claims, validator, decay, review | LM §5.2, §7 | T14, T15 | `profiler.ts`, `claimValidator.ts`, `review.ts` | Validator tests | Learner card | ⬜ |
| FR-17 | Deterministic plan compile | TP §3–4 | T17 | `src/plan/compile.ts` | TP-01…TP-08 | 0:45 plan diff | ⬜ |
| FR-18 | Plan rendered into the tutor | TP §5 | T18 | `src/plan/render.ts`, `compose.ts` | Snapshot | 0:45 | ⬜ |
| FR-19 | In-session plan deltas + guidance | TP §6, TS §5.3 | T19, T20 | `src/plan/delta.ts`, injector | Spike report; latency | 1:30 switch | ⬜ |
| FR-20 | Limits enforced | PER §14 | T20 | `delta.ts`, `config.ts` | P-09; TP-06 | — | ⬜ |
| FR-21 | Spaced review at session start | LM §7.2, TP §4.1 | T15, T18 | `review.ts` | TP-04 | 0:45 returning learner | ⬜ |
| FR-22 | Learner card + dispute | LM §8 | T21 | `LearnerCard.tsx` | J3 walkthrough | 1:30 | ⬜ (♻️ LearnerProfilePanel) |
| FR-23 | Parent portal replay | LM §8 | T22 | `ParentPortal.tsx` | J4 walkthrough | (optional) | ⬜ (♻️ ParentPortal) |
| FR-24 | Tutor's-reasoning panel | TP §7 | T23 | `TutorReasoningPanel.tsx` | Live update in demo | 0:45 + 1:30 | ⬜ |
| FR-25 | Text channel | TS §4 | T08 | `/api/tutor/turn` | Curl script; EV-02 | — | ⬜ |
| FR-26 | Seeded demo learners | FS §7 | T27 | `scripts/seed-demo.ts` | Load < 2 s | 0:45 | ⬜ |
| NFR-02 | No silent model fallback in demo | TS §3 | T01 | `src/ai/gateway.ts` | `verify:models` | — | ⬜ |
| NFR-03 | Privacy | TS §8, LM §9 | T02, T30 | `firestore.rules`, routes | Emulator/anon read denied | 2:40 privacy | ⬜ |
| NFR-04 | Cloud Run deploy | TS §9 | T29 | `scripts/deploy-cloudrun.sh` | Smoke test | — | 🟨 (existing deploy ♻️) |
| EV-01 | Diagnosis accuracy | FS §5 | T24 | `eval/diagnosis/*` | Report | 2:40 | ⬜ |
| EV-02 | Adapted vs base (simulated) | FS §5 | T25 | `eval/simulated/*` | Report | 2:40 | ⬜ |
| EV-03 | Persona adherence | PER §18 | T26 | `eval/persona/*` | Report | 2:15 | ⬜ |

## 2. Judging coverage

| Capability | Technical Merit (40%) | Impact (25%) | Innovation (25%) | UX (10%) | Evidence (planned) |
|---|---|---|---|---|---|
| Fixed persona + adaptive plan | Strong (versioned, testable) | Moderate | Strong | Moderate | Composer snapshots, EV-03 |
| Async reasoning diagnosis (closed catalogue) | Strong | Strong | Strong | Moderate | EV-01 |
| Evidence-cited learner model + claim validator | Strong | Strong | Strong | Moderate | Validator tests, parent replay |
| Deterministic plan with reasons | Strong | Moderate | Moderate | Strong (reasoning panel) | TP tests, demo plan diff |
| Spaced review / durable mastery | Moderate | Strong | Moderate | Moderate | Review tests |
| Simulated-learner A/B | Strong | Strong | Moderate | — | EV-02 (labelled simulated) |
| Voice + board | Moderate | Strong | Weak (commoditised) | Strong | Existing |

**Gap to watch:** Impact is evidenced only by simulated learners unless even a small real-user
test (e.g. 3–5 children, with parental consent) is run before 17 Oct.

## 3. Decision references
- D-2026-09-24-1 Persona stays fixed; the per-learner Teaching Plan adapts (DECISIONS.md)
- D-2026-09-24-2 Plan compile is deterministic; GenAI only for diagnosis, profiling, teaching (DECISIONS.md)
