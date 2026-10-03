# Chapter 1 quality plan — from review finding to shipped fix

Source of findings: `docs/CH1_MATERIAL_REVIEW.md` (12 lessons, Math + Biology). This plan is the tracking
document: every finding maps to a work item (W-xx), the files it touches, and the check that proves it.
The review itself is stored in the Project as `docs/CH1_MATERIAL_REVIEW.md` and is left as written (it describes the material *as reviewed*, 12 of the 22 stored concepts); the state after the fixes is §6 below. Status is updated in place as items land (see "Status" column). Nothing is closed without its check passing.

## 0. Constraint that shapes the plan (VERIFIED FACT)

The build environment used for this work has **no route to the Gemini API** (the egress proxy returns 403 for
`generativelanguage.googleapis.com`). Consequences:
- All pipeline code, prompts, lints, UI and docs are implemented and verified here with deterministic tests and a
  stubbed model.
- The 12 existing records cannot be *regenerated* here. They are (a) upgraded in place with deterministic fixes,
  (b) scored by the new checks, and (c) queued for regeneration with one command run where the key works:
  `npm run pregen:ch1` (see W-22). Claims about regenerated quality are therefore NOT made until that run is
  reviewed with `npm run review:pregen`.

## 1. Design decisions

| # | Decision | Reason |
|---|---|---|
| D1 | Two independent layers guard every generated artefact: **deterministic lints** (cheap, exact, run everywhere) and an **independent critic model call** (a different prompt and, if configured, a different model, given the source key facts). | The review's factual errors (46→92 chromosomes, wrong classification headline) are invisible to geometry checks. A separate reviewer that has not seen the drafting prompt is the only scalable way to catch them. |
| D2 | **Fail closed for children.** A picture or lesson field with an unresolved `error` after repair is withheld and reported, never shipped. Withheld pictures go to `visualsQuarantine` with their issues. | Same precedent as `stripUnverifiedClaims`: show nothing rather than something false. |
| D3 | Persona rules become **machine-checked contracts** (`src/quality/*`), shared by pregen, live generation and tests. | The review showed prose rules in prompts are not enough. |
| D4 | The quiz is **form B of a parallel L3 pair**; the apply picture is **form A**. Neither is the source worked example. | Removes leakage, gives the two distinct L3 items H6 needs, keeps offline demo deterministic. |
| D5 | The quiz collects **reasoning before revealing correctness**; no reasoning caps evidence at L1. | Persona H1 (diagnose before judging) and the L1 ceiling of recognition-only MCQ. |
| D6 | Photos are kept only when **lesson-specific and vision-verified**, and are labelled as AI-generated. Unverified photos are hidden. Unsplash fallback removed. | Review A12: unlabelled synthetic images presented as real; irrelevant scenes. |
| D7 | Legacy `scene3d`, `photoVisual`, `diagram` are no longer generated or served for pregen records. | Dead weight that contradicted the new pictures (A11). |
| D8 | Teaching pictures are planned **one idea per picture** (≤ 2 key facts each, max 4): `main` + `focus:<slug>`. | A10; matches the runtime's existing `findVisualForFocus`. |
| D9 | Curriculum gaps (a ladder item testing something no key fact teaches) are **reported, never silently invented**. Ingest gets a coverage pass. | H12 (teach before test) without fabricating textbook content. |

## 2. Work items

Severity: S1 = teaches something wrong / breaks a hard rule; S2 = weakens teaching; S3 = polish.

| ID | Work item | Review findings | Files | Check | Status |
|---|---|---|---|---|---|
| W-01 | Quiz integrity: seeded shuffle, position/length/distractor lint, runtime normaliser for legacy records | A1 (S1) | `src/quality/quizTools.ts`, `DynamicBlackboard.tsx`, `App.tsx` | quality test: index spread; legacy record renders shuffled | **done** (tests pass) |
| W-02 | Answer-leak lints (chalk↔quiz, quiz↔worked example, apply↔lookFor, picture text↔quiz answer) | A2, A3 (S1) | `src/quality/leakLint.ts` | quality test + regression corpus flags known leaks | **done** (tests pass) |
| W-03 | Photo pipeline: lesson-specific prompt, vision verification, `photoMeta`, AI label + caption in UI, hide unverified, drop Unsplash | A11, A12 (S1) | `scripts/pregenerate-assets.ts`, `src/quality/photo.ts`, `ScenePanel.tsx`, `server.ts` | stub-model test; UI shows badge | **done** (tests pass) |
| W-04 | 3D gating: structural lint + critic "adds value"; stop serving legacy scene3d | A11, A13 (S1) | `src/visual/generate.ts`, `src/quality/visualLint.ts` | quality test: empty-step / single-solid 3D rejected | **done** (tests pass) |
| W-05 | Independent critic for pictures and lesson text (accuracy vs key facts, label↔drawing, coverage, leakage, persona) + repair loop + withhold | B, C lists (S1) | `src/quality/critic.ts`, `src/visual/generate.ts` | stub-model test: critic error → repair → withhold | **done** (tests pass) |
| W-06 | Deterministic geometry: general-form line claims (`2x − 5y = 32`), label-attachment check (label sits on the line it names, within tolerance), wrong-line detection | Graphically swapped labels, floating labels (S1) | `src/visual/sanitize.ts` | board-visual test with the real swapped-label fixture | **done** (tests pass) |
| W-07 | Apply integrity: situation-only lint (numbers/points from `lookFor`, drawn intersections, ordered answer lists) | A3 (S1) | `src/quality/leakLint.ts` | regression corpus | **done** (tests pass) |
| W-08 | Persona language lint (banned words, emoji, "Mistaken Rule", "Impossible", jargon labels) on pictures and lesson text | A6, A9 (S1) | `src/quality/language.ts` | quality test | **done** (tests pass) |
| W-09 | Predict-first & elicitation structure for pictures (hook question, mandatory `checkQuestion`, apply ends in a question) | A5 (S1) | `src/quality/visualLint.ts`, `src/visual/prompt.ts` | quality test | **done** (tests pass) |
| W-10 | Contrast pictures: phase contract (teach → contrast → teach → check), rule's own working shown | A6, A7 (S1) | `src/visual/prompt.ts`, `visualLint.ts` | quality test + critic | **done** (tests pass) |
| W-11 | Parallel L3 pair: ingest authors two L3 items; lesson gen produces form B for the quiz; `itemId` flows to assess | A4 (S2) | `src/curriculum/structure.ts`, `learnerModel.ts`, `lessonGen.ts`, `server.ts`, `App.tsx` | ladder test: 2 distinct L3 ids | **done** (tests pass) |
| W-12 | Quiz reasoning capture before reveal; neutral reveal styling; assessor uses reasoning; no reasoning → L1 cap | A1, H1 (S1) | `DynamicBlackboard.tsx`, `App.tsx`, `server.ts`, `assessmentEngine.ts` | offline assess test | **done** (tests pass) |
| W-13 | Chalk-notes contract (key-fact traceable, no alerts, no invented formulas, no over-absolute claims) | A6 + per-lesson (S1) | `src/quality/lessonLint.ts`, `lessonGen.ts` | quality test + critic | **done** (tests pass) |
| W-14 | Suggested questions in the child's voice; diagnostics moved to tutor-only `record.diagnostics` | A9 (S1) | `lessonGen.ts`, `DynamicBlackboard.tsx` | quality test | **done** (tests pass) |
| W-15 | Teaching-picture planner (D8) + coverage report; ladder-vs-key-fact coverage flags (D9); ingest coverage pass | A10 (S2) | `src/visual/generate.ts`, `src/quality/coverage.ts`, `structure.ts` | stub-model planner test | **done** (tests pass) |
| W-16 | Layout lint using the renderer's own metrics: label/box overlap, edge clipping, connector-through-box, unreferenced always-visible bricks, empty steps, text-slide ratio | A8 + layout defects (S2) | `src/quality/visualLint.ts`, `src/visual/layout.ts` | quality test + regression corpus | **done** (tests pass) |
| W-17 | One shared lesson generator (pregen + live) with repair loop; plain tagline/overview; subject from course | A11 (S2/S3) | `src/curriculum/lessonGen.ts`, `server.ts`, `pregenerate-assets.ts` | stub-model test | **done** (tests pass) |
| W-18 | In-place upgrade of existing records (backup, strip legacy, shuffle quiz, hide unverified photos, quarantine failing pictures, per-record `quality`) | all (S1) | `scripts/upgrade-pregen.ts` | run on the 12 records; report | **done** (tests pass) |
| W-19 | `review:pregen` scorecard + HTML gallery (per-step render) + non-zero exit on errors | process | `scripts/review-pregen.ts` | run on the 12 records | **partial** — scorecard + non-zero exit built; a per-step HTML gallery was not (existing `preview:visuals` covers pictures) |
| W-20 | Test suite wired into `npm test` | process | `tests/smoke/quality.mjs`, `lesson-gen.mjs` | `npm test` green | **partial** — `test:quality`, `test:gates`, `verify` added; `npm test` deliberately left as-is because `tests/live` has 7 pre-existing failures (landmine #12) |
| W-21 | Documentation sync (list in §4) | mandate | docs | `check:docs`; manual diff | **done** (tests pass) |
| W-22 | Regeneration runbook (`npm run pregen:ch1`) | constraint §0 | `package.json`, docs | dry-run flag works | **partial** — `npm run pregen:ch1` exists; there is no dry-run flag |

## 3. Verification strategy

1. **Unit/lint tests** with fixtures taken from the real defective material (swapped labels, leaking apply pictures,
   "Mistaken Rule", `correctIndex = 0`, empty 3D steps).
2. **Regression corpus:** the 12 existing records must be flagged by the new lints where the review found a
   deterministic defect. A lint that passes known-bad material is itself a bug.
3. **Stub-model integration tests:** repair loops, planner, critic and withhold behaviour run against a scripted
   fake gateway (no network).
4. **Type-check:** `npm run lint` (tsc) clean.
5. **Not verifiable here (stated openly):** real-model output quality, and browser rendering of regenerated
   pictures. Both are covered by the `review:pregen` gallery and a human pass after `pregen:ch1`.

## 4. Documents updated with the change

`docs/BOARD_VISUALS.md` (new lints, planner, critic, quarantine), `docs/TEACHING_PLAN.md` (predict-first in
pictures, quiz reasoning capture), `docs/CURRICULUM.md` (parallel L3, coverage pass, pregen contract),
`docs/TECHNICAL_SPEC.md`, `docs/ARCHITECTURE.md` (quality layer, review role), `docs/LEARNER_MODEL.md`
(quiz evidence rules, itemId), `docs/TUTOR_PERSONA.md` (artefact contract), `docs/FUNCTIONAL_SPEC.md`,
`docs/TRACEABILITY.md`, `docs/BUILD_PLAN.md`, `docs/AGENT_GUIDE.md`, `docs/CODE_DOC_MAP.json`, `PROJECT_STATE.md`,
`DECISIONS.md`, `README.md`, `docs/CH1_MATERIAL_REVIEW.md` (status appendix).

## 6. State after implementation (2026-09-30)

**Built and verified here (no network):** items W-01…W-18 and W-21 — quality layer `src/quality/**`,
shared lesson generator, photo pipeline, parallel L3 pair, quiz-reasoning evidence, in-place upgrade,
scorecard. Evidence: `npm run lint` clean; `npm run test:gates` green (quality 33, lesson-gen 9,
photo-gen 5, quiz-evidence 5, ladder-pair 5, serve 4, board-visual 46, curriculum-ingest).
Scripted models stand in for Gemini, so these tests prove the *loops* (lint → critic → repair →
withhold), not the model's output quality.

**Upgrade applied to the stored records** (`npm run upgrade:pregen`; the plan's "12 records" were
in fact 22 concepts: 16 Math + 6 Biology). Backups: `backups/pre-quality-20260930/` (originals) and
`backups/upgrade-2026-09-30T02-55-47-062Z/`. Scorecard now (`npm run review:pregen`):

| Measure | Value |
|---|---|
| Records | 22 |
| Records still with lint errors | 14 |
| Pictures served / held back | 28 / 74 |
| Verified photos | 0 (all hidden — unverified) |
| Critic-reviewed | 0 / 22 |

**Consequence to know before a demo:** the upgrade is fail-closed, so most concepts currently show an
emptier board than before (74 pictures withheld, all photos hidden, 9 quizzes quarantined). That is
intended — the withheld items were defective or unverifiable — but the material is *not* at the
target quality until it is regenerated. To restore the previous content, copy back from the backup folder.

**Not verified (needs GEMINI_API_KEY, which this environment cannot use):**
1. `npm run pregen:ch1` — regenerate Chapter 1 through the new gates.
2. `npm run review:pregen` — expect errors → 0 and critic-reviewed → 22/22; if repair does not
   converge for some concepts, they stay withheld and are listed with reasons.
3. `npm run preview:visuals -- --concept <id>` — a human look at each regenerated picture; no test
   can say whether a picture *teaches well*.

**Not done:** per-step HTML gallery (W-19), pregen dry-run (W-22), wiring the new gates into `npm test`
(blocked by the pre-existing `tests/live` failures, W-20).

## 7. Regeneration runbook
```
npm run pregen:ch1        # needs GEMINI_API_KEY; Chapter 1 only, --force
npm run review:pregen -- --details --write   # scorecard + reports/pregen-scorecard.md
npm run preview:visuals -- --concept <id>    # look at every picture and step
npm run verify            # tsc + gates + scorecard (exit 1 while any served item has an error)
```

## 8. First real run and what it showed (2026-09-30, D-2026-09-30-5)

The user ran `npm run pregen:ch1` on real Gemini. Evidence from that log: bounded, not an endless loop, but
~43 model calls and 5–13 min per concept (303 calls / 7 concepts), 79 repair rounds, 97 picture-critic calls;
3 of 7 biology lessons were withheld and **overwrote** stored lessons with `null`. Causes and fixes are in
D-2026-09-30-5 (keep-best, multi-part leak rule, contrast phase, repair only on errors + early stop,
`--resume`, `--max-calls`, `--max-images`, call accounting). §6's numbers pre-date that run and are stale for
the concepts it regenerated. **Not yet measured:** cost and yield after these fixes — rerun `npm run pregen:ch1`
(it resumes past finished concepts) and compare the printed "💸" totals.

## 9. Single-shot redesign (2026-09-30, D-2026-09-30-6)

The repair-loop design is retired. The plan of artefacts is fixed in code (`lessonVisualJobs`, printed by
`npm run pregen:ch1:plan`); each is generated once; ONE review per concept (`src/quality/review.ts`,
applied by `src/curriculum/reviewApply.ts`) withholds what it finds wrong without regenerating. Chapter 1
worst case: 96 text calls + 12 images + 12 vision checks (first run: 303 text calls for 7 concepts).
**Not measured:** first-shot yield on the real model; withheld artefacts will need a human decision
(`--repair 1` on just those). §3's "repair" language and W-05/W-17 describe the superseded loop.
