# Traceability Matrix

_Status legend: ⬜ not started · 🟨 in progress · ✅ done · ♻️ existing code reused_
_Last updated: 2026-09-24 (after the T00-T04/T05-T07/T09-T11(partial)/T17-T18/T20 commit)_

## 1. Requirement → design → build → verify → demo

| Req | Summary | Spec | Tasks | Code (target) | Verified by | Demo beat | Status |
|---|---|---|---|---|---|---|---|
| FR-01 | One base persona for everyone, versioned | PER §1–3, §19 | T05, T06, T07 | `src/persona/*` | Composer snapshots; P-01…P-18 | 2:15 architecture | ✅ composer live-verified (WS run shows `[persona v1.0.0]` prompt); snapshot tests (P-01…P-18) not yet written |
| FR-02 | Teach-before-test session arc | PER §4 | T05, T07 | `persona/core.ts` | P-16 | 1:30 live | 🟨 arc encoded in `core.ts`/`compose.ts`; P-16 not run |
| FR-03 | Reasoning elicited after every answer | PER H1, §6 | T05, T07 | `persona/core.ts`, `moves.ts` | P-01, P-02 | 1:30 live | 🟨 `assess_child_reasoning` now actually reachable from the live tool list (was dead code); P-01/P-02 rates not measured |
| FR-04 | Move ID + reason per turn | PER §6 | T05, T10, T23 | `moves.ts`, `EvidenceEvent.moveUsed` | Event field coverage 100% | Reasoning panel | 🟨 `moveUsed` field exists and is populated from `assess_child_reasoning`; coverage not measured; no reasoning-panel UI yet (T23) |
| FR-05 | Age-band surface | PER §12.1 | T05, T06 | `ageBands.ts` | P-14; snapshots | 0:45 two learners | 🟨 `ageBands.ts` built and wired into the composer; not snapshot-tested across all 4 bands |
| FR-06 | Subject modes | PER §12.2 | T05, T06 | `subjectModes.ts` | Text-mode interpretive run | (optional) | 🟨 `subjectModes.ts` built and wired; no interpretive text-mode run yet (needs T08) |
| FR-07 | Safety / safeguarding | PER §16 | T05, T26 | `safety.ts` | P-13 | — | 🟨 `safety.ts` built and included in every composed prompt; P-13 not run |
| FR-08 | Academic integrity | PER §15 | T05, T26 | `core.ts` | P-10, P-11 | — | 🟨 integrity block in `safety.ts`/`core.ts`; P-10/P-11 not run |
| FR-09 | Onboarding | LM §3–4 | T13 | `Onboarding.tsx` | First plan uses interests | 0:45 | ⬜ `POST /api/learners/:id/onboarding` route exists; no UI |
| FR-10 | Async per-exchange diagnosis | LM §5.1, TS §5.2 | T11 | `diagnostician.ts`, `segmenter.ts` | EV-01; latency test | 1:30 | 🟨 (♻️ `reasoningAssessor.ts` unchanged, now actually wired async into the live WS path via `handleAssessChildReasoning`); not split into `segmenter.ts`/`diagnostician.ts`; EV-01 not run |
| FR-11 | Append-only evidence events | LM §3, §9 | T03, T10 | `repo/*`, `learnerStore.ts` | Restart persistence test | Parent replay | ✅ `src/adaptive/repo/*` (file + Firestore) + `EvidenceEvent` append in `recordReasoningEvidence`, verified by `tests/smoke/plan-and-store.mjs` |
| FR-12 | Misconception ledger | LM §5.1 | T10 | `learnerStore.ts` | Existing + new unit tests | 1:30 "mastery goes down" | ✅ ♻️ preserved verbatim + smoke-tested (suspected→confirmed at 2 independent observations) |
| FR-13 | Ladder + mastery status | PER §5, LM §3 | T10 | `ladder.ts` | Unit tests | Learner card | ✅ `src/adaptive/ladder.ts`, smoke-tested; no dedicated unit-test file yet |
| FR-14 | Confidence capture | PER §9 | T12 | UI + segmenter | Coverage ≥ 50% | 1:30 | ⬜ `learnerConfidence` field exists on `EvidenceEvent`; nothing populates it yet |
| FR-15 | Strategy profile (Beta) | LM §6.2 | T10 | `strategyProfile.ts` | Unit tests; TP-03 | 0:45 plan diff | ✅ `src/adaptive/strategyProfile.ts`, wired into `recordReasoningEvidence` and `compileTeachingPlan`'s `R-REP`/`R-AVOID`; no dedicated unit-test file yet |
| FR-16 | Profiler claims, validator, decay, review | LM §5.2, §7 | T14, T15 | `profiler.ts`, `claimValidator.ts`, `review.ts` | Validator tests | Learner card | ⬜ types exist (`LearnerClaim`, `SessionSummary`, `ReviewState`); nothing populates or schedules them |
| FR-17 | Deterministic plan compile | TP §3–4 | T17 | `src/plan/compile.ts` | TP-01…TP-08 | 0:45 plan diff | ✅ `src/plan/compile.ts`, all rules R-REVIEW…R-TALK implemented; smoke-tested (R-TARGET, R-WATCH); TP-01…TP-08 not run as a formal suite |
| FR-18 | Plan rendered into the tutor | TP §5 | T18 | `src/plan/render.ts`, `compose.ts` | Snapshot | 0:45 | ✅ `renderPlanForPrompt` wired into `composeSystemInstruction`'s plan block and into `/api/session/start`'s response; no snapshot test yet |
| FR-19 | In-session plan deltas + guidance | TP §6, TS §5.3 | T19, T20 | `src/plan/delta.ts`, injector | Spike report; latency | 1:30 switch | 🟨 `compilePlanDelta` wired fire-and-forget into the live WS (`plan_update` message) after every `assess_child_reasoning` call; the formal T19 latency spike (≥10 exchanges, p50/p95, options A/B/C) was not run — a DECISIONS.md entry with those numbers is still owed |
| FR-20 | Limits enforced | PER §14 | T20 | `delta.ts`, `config.ts` | P-09; TP-06 | — | ✅ probe budget, retry cap → PARK_AND_ESCALATE, consecutive-failure → ENCOURAGE_RESET all implemented and smoke-tested (misconception-confirmed path); P-09/TP-06 not run formally |
| FR-21 | Spaced review at session start | LM §7.2, TP §4.1 | T15, T18 | `review.ts` | TP-04 | 0:45 returning learner | ⬜ `R-REVIEW` rule reads `review.nextDueAt` in the compiler, but nothing ever advances/schedules `ReviewState` (T15 not started), so `reviewItems` is always empty in practice |
| FR-22 | Learner card + dispute | LM §8 | T21 | `LearnerCard.tsx` | J3 walkthrough | 1:30 | ⬜ (♻️ `LearnerProfilePanel` unchanged) |
| FR-23 | Parent portal replay | LM §8 | T22 | `ParentPortal.tsx` | J4 walkthrough | (optional) | ⬜ (♻️ `ParentPortal.tsx` only got an `authFetch` swap; no evidence-replay UI) |
| FR-24 | Tutor's-reasoning panel | TP §7 | T23 | `TutorReasoningPanel.tsx` | Live update in demo | 0:45 + 1:30 | ⬜ not started |
| FR-25 | Text channel | TS §4 | T08 | `/api/tutor/turn` | Curl script; EV-02 | — | ⬜ not started |
| FR-26 | Seeded demo learners | FS §7 | T27 | `scripts/seed-demo.ts` | Load < 2 s | 0:45 | ⬜ not started |
| NFR-02 | No silent model fallback in demo | TS §3 | T01 | `src/ai/gateway.ts` | `verify:models` | — | ✅ `src/ai/gateway.ts` + `npm run verify:models`; not yet adopted by every caller listed in T01 (`liveObserver.ts`, `assessmentEngine.ts`, `pdfIngest.ts` still call models directly) |
| NFR-03 | Privacy | TS §8, LM §9 | T02, T30 | `firestore.rules`, routes | Emulator/anon read denied | 2:40 privacy | 🟨 `firestore.rules` closed (`learners/**` → `if false`, server-only); `requireAuth`/`requireOwnership` added but ship with a documented, logged DEMO_MODE/dev bypass because the client has no real per-profile sign-in yet (D-2026-09-24-3) — **not production-ready**; delete endpoint exists (T30) but not end-to-end reviewed |
| NFR-04 | Cloud Run deploy | TS §9 | T29 | `scripts/deploy-cloudrun.sh` | Smoke test | — | 🟨 (existing deploy ♻️, not re-smoke-tested against this change set) |
| EV-01 | Diagnosis accuracy | FS §5 | T24 | `eval/diagnosis/*` | Report | 2:40 | ⬜ |
| EV-02 | Adapted vs base (simulated) | FS §5 | T25 | `eval/simulated/*` | Report | 2:40 | ⬜ |
| EV-03 | Persona adherence | PER §18 | T26 | `eval/persona/*` | Report | 2:15 | ⬜ |

## 2. Judging coverage

| Capability | Technical Merit (40%) | Impact (25%) | Innovation (25%) | UX (10%) | Evidence (planned) |
|---|---|---|---|---|---|
| Fixed persona + adaptive plan | Strong (versioned, testable, now actually running live) | Moderate | Strong | Moderate | Composer snapshots (not yet written), EV-03 |
| Async reasoning diagnosis (closed catalogue) | Strong (now wired into the live path — was dead code before this pass) | Strong | Strong | Moderate | EV-01 |
| Evidence-cited learner model + claim validator | Moderate (ladder/strategy done; claims/validator not built) | Moderate | Strong | Weak (no learner-facing UI yet) | Validator tests, parent replay — both not yet run |
| Deterministic plan with reasons | Strong (compiler + delta done, smoke-tested) | Moderate | Moderate | Weak (no reasoning panel yet) | Smoke test now; TP suite still owed |
| Spaced review / durable mastery | Weak (mastery-status rule done; scheduling not built) | Moderate | Moderate | Weak | Review tests — not yet written |
| Simulated-learner A/B | Not yet demonstrated | Not yet demonstrated | Not yet demonstrated | — | EV-02 |
| Voice + board | Moderate | Strong | Weak (commoditised) | Strong | Existing |

**Gap to watch (unchanged):** Impact is evidenced only by simulated learners unless even a small
real-user test (e.g. 3–5 children, with parental consent) is run before 17 Oct.

**New gap surfaced this pass:** NFR-03 (privacy) is not actually met end-to-end yet — the
Firestore side is locked down, but the API-layer auth has a documented dev bypass until real
per-profile sign-in exists (D-2026-09-24-3). A skeptical judge should be told this proactively
rather than asked about it.

## 3. Decision references
- D-2026-09-24-1 Persona stays fixed; the per-learner Teaching Plan adapts (DECISIONS.md)
- D-2026-09-24-2 Plan compile is deterministic; GenAI only for diagnosis, profiling, teaching (DECISIONS.md)
- D-2026-09-24-3 Build plan executed; requireAuth ships with a documented dev bypass pending real sign-in (DECISIONS.md)
