# Functional Specification — Adaptive AI Tutor

_Status: v1.1 · 2026-10-09 (audited: FR-20 changed; FR-47/48 added; product name is Ananta — see docs/AUDIT_2026-10-09.md)_
_Companion docs: TUTOR_PERSONA.md · LEARNER_MODEL.md · TEACHING_PLAN.md · TECHNICAL_SPEC.md · BUILD_PLAN.md · TRACEABILITY.md_

## 1. Product in one paragraph

A judgement-free, one-to-one AI tutor. Every learner starts with the same carefully designed
tutor persona. As they learn, the system builds an evidence-based **Learner Model** — what they
understand, what they get wrong and why, and which explanations help *them*. Before and during
every session it compiles a **Teaching Plan** from that model, so the same tutor teaches each
learner differently, and can explain why.

> **Every child meets the same great teacher. Over time, that teacher learns them.**

**Hackathon anchor (verified 2026-09-24, aibuildercup.com/themes.html):** there is no education
theme. The entry is filed under **Sustainability & Social Impact** (equitable access to
individual tutoring) — _open decision OQ-2 in PROJECT_STATE.md_. Mandatory requirements: Google
AI models (Gemini/Gemma) or Google agent platforms; deployment on Google Cloud via Cloud Run or
Firebase; a proposal PDF; a public 3-minute video. Judging: Technical Merit & GenAI 40% ·
Problem Alignment & Impact 25% · Innovation & Creativity 25% · UX & Solution Design 10%.

## 2. Users

| User | Goal | Primary surfaces |
|---|---|---|
| **Learner** (primary; any age; demo focus 8–14) | Understand, without embarrassment | Onboarding, lesson (voice/text), learner card |
| **Parent** | See real progress and where help is needed | Parent portal |
| **Teacher** (secondary, light) | See misconception patterns; get escalations | Escalation notes in the parent/teacher view |
| **Judge / demo viewer** | See the adaptivity and the GenAI's role | Tutor's-reasoning panel, seeded learners |
| **Admin** (content owner) | Load textbooks + syllabi for each board / grade / subject | Content library (admin only) |

## 3. User journeys

### J0 — Admin loads a course (docs/CURRICULUM.md)
1. Admin opens the content library (login screen → "Content library (admin)"; `ADMIN_TOKEN` or local machine).
2. Chooses board, grade, subject; uploads textbook PDF(s) and, optionally, the official syllabus PDF.
3. The pipeline reads, structures (prerequisites, concept types, subject mode) and **AI-reviews** the content (worked examples re-worked, facts checked, ladder items written), then publishes automatically. The review report is shown and stored.
4. Every learner with that board + grade now sees the subject, chapter by chapter.

### J1 — First session (cold start)
1. Learner signs up with name, **board and grade** (age band follows from the grade) → **"Name your tutor"** (keep "Dr. Marcus" or type another name; asked again, pre-filled, at every login - FR-09a) → **onboarding** (≈3 min): 3 interests, how they feel about each of *their* subjects, accessibility options.
2. Picks one of their subjects → a chapter → a concept (any concept; "Builds on" hints, no locks).
3. Tutor opens (persona `OPEN_SESSION`), **probes prerequisites** (max 3), then teaches the first chunk with a visual + concise board notes.
4. Check → "walk me through it" → diagnosis → next move. The learner card begins to fill with evidence.
5. Session closes with a summary of what the learner did and a review scheduled.

### J2 — Returning learner
1. Sign in → the plan is compiled from the learner model.
2. Tutor opens with **due reviews** (max 3), says one think-aloud line ("Last time… so let's…").
3. Teaches using the learner's best representation for this concept type; watches for known misconceptions.
4. After each exchange the plan updates (switch representation, probe, advance, reset, park).

### J3 — Learner corrects the model
Learner opens "What I've learned about you" → taps "That's not right" on a claim → the claim becomes `disputed` and is excluded from plans until new evidence arrives.

### J4 — Parent reviews progress
Parent portal → subject → concept ladder, misconception ledger (suspected / confirmed / resolved), claims with "show evidence" (replays the exchanges), session summaries, escalations.

### J5 — Demo (3 minutes)
Seeded learners (clearly labelled as simulated): **same concept, two learners, different teaching**, with the Tutor's-reasoning panel visible; one live exchange updates the learner card in real time. See §7.

## 4. Functional requirements

Priority: **M** = must · **H** = high value · **N** = nice to have.

### Persona & teaching
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-01 | Every session uses the single base persona, composed from versioned modules | M | One composer used by voice and text; `personaVersion` logged per session; the three legacy prompts removed or flag-gated |
| FR-02 | Session follows the teach-before-test arc (TUTOR_PERSONA §4) | M | P-16 passes; phase transitions logged |
| FR-03 | Reasoning elicited after every answer, right or wrong | M | P-01 = 100%, P-02 ≥ 90% on the simulated set |
| FR-04 | Every tutor turn is tagged with a move ID and reason | M | `moveUsed` on 100% of evidence events; visible in the reasoning panel |
| FR-05 | Surface adapts to age band (register, chunk size, check frequency, session length) | H | Two bands demonstrably different on the same concept; P-14 passes |
| FR-06 | Subject mode: well-structured + interpretive (rubric-based) | H | One interpretive topic works end-to-end in text mode |
| FR-07 | Safety and safeguarding behaviour | M | P-13 passes; safeguarding flag written |
| FR-08 | Academic-integrity behaviour | M | P-10, P-11 pass |

### Learner model
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-09a | After every login the learner is asked what to call the tutor; the name is pre-filled with their last choice (default "Dr. Marcus"), saved on their profile, and used on every screen label and in the voice tutor's prompt | M | `profile.tutorName`; `POST /api/learners/:id/tutor-name`; invalid/empty falls back to the default; tests/tutor-name/run.mjs |
| FR-09 | Onboarding captures interests, feelings, age band, accessibility | M | Stored in `profile.onboarding`; used in the first plan |
| FR-10 | Every learner answer is diagnosed (closed misconception catalogue, error class, ladder level) without blocking the voice | M | Diagnosis p95 < 4 s; voice never waits on it |
| FR-11 | Append-only evidence events with IDs, session, plan version, move, representation | M | Firestore subcollection; events survive restarts |
| FR-12 | Misconception ledger: suspected → confirmed (2 independent observations) → resolved (sound transfer) | M | Existing tests + new unit tests pass |
| FR-13 | Ladder level + mastery status (provisional / durable) | M | Rule per TUTOR_PERSONA §5 unit-tested |
| FR-14 | Learner confidence captured (buttons / phrases) | H | ≥ 50% of checks carry confidence in a demo session |
| FR-15 | Cross-concept strategy profile (Beta per conceptType × representation) | M | Updated on every event; unit-tested |
| FR-16 | Session-end Profiler writes scoped claims with evidence refs; decay + spaced review | M | Claims without valid refs rejected (test); banned-label lexicon enforced; reviews scheduled |

### Content quality (added 2026-09-30 — docs/CH1_FIX_PLAN.md)
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-40 | Pre-generated lesson content passes deterministic lints and an independent critic before it can be served | M | `npm run test:quality` passes; `review:pregen` scorecard lists lint errors and critic status per record; a critic that did not run is never counted as a pass |
| FR-41 | Content that fails a gate is withheld and quarantined, never shown or replaced by a generic fallback | M | Quarantined items appear in the record's `quarantine` with reasons; the learner-facing lesson omits them (`serve.mjs`) |
| FR-42 | Learner-facing text obeys the language contract (banned verdict words, no verdict symbols, no pre-announced misconceptions, no tutor jargon) | M | `language.ts` lints; zero language errors in shipped records |
| FR-43 | Quiz answer key and tutor-only notes never reach the browser; quiz evidence needs reasoning before reveal | M | `serve.mjs` (4 checks), `quiz-evidence.mjs` (5 checks) |
| FR-44 | The L3 rung has a parallel pair (apply picture = L3-A, quiz = L3-B); curriculum coverage gaps are reported, not invented | H | `ladder-pair.mjs` (5 checks); `coverageGaps` in the ingest report |
| FR-45 | Photos are lesson-specific, vision-verified, labelled AI-generated; no stock fallback | H | `photo-gen.mjs` (5 checks); no image is shipped when the reviewer is unreachable |
| FR-46 | Board pictures teach one idea each (planner: ≤ 4 pictures, 1–2 facts each) and open with a prediction question | H | Planner prompt + `predict.no-hook-question` lint; `quality.mjs` |

### Added after v1.0 (retroactive, 2026-10-09)
| ID | Requirement | Pri | Acceptance criteria / status |
|---|---|---|---|
| FR-47 | Guided tutor mode: tutor follows a prepared beat script and writes one growing board; switchable per session (`?tutor=guided`, `TUTOR_MODE`), falls back to standard when a concept has no script | H | `src/guided/*`, 4 scripts; `tests/guided/run.mjs` currently crashes (stale) — status 🟨, undocumented until this audit |
| FR-48 | Child names the tutor at login; name saved on the profile and used in UI + prompt (cleaned, ≤24 chars) | N | `tests/tutor-name/run.mjs` 13/13; not verified in browser (D-2026-10-07-1) |

### Teaching plan
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-17 | Plan compiled deterministically at session start | M | TP-01…TP-08 pass |
| FR-18 | Plan rendered into the tutor's instructions | M | Rendered block present in the composed prompt; snapshot test |
| FR-19 | Plan updated after each exchange; guidance delivered to the tutor | M | Delta visible in the UI within 4 s; delivered to the voice session if spike T19 succeeds, else applied at the next tutor turn via text channel or next session |
| FR-20 | Limits enforced (probe budget, retry cap → **teach directly**; park-and-escalate REMOVED 2026-09-30, D-2026-09-30-9) | M | P-09 passes; escalation record written |
| FR-21 | Due spaced reviews run at session start | H | Review items asked first; review state updated |

### Views
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| FR-22 | Learner card "What I've learned about you" with correction | H | Shows child-friendly claims; dispute works (J3) |
| FR-23 | Parent portal with evidence replay | H | Claim → evidence → exchanges in ≤ 2 clicks |
| FR-24 | Tutor's-reasoning panel (move, why, evidence) | M | Updates live in the demo |
| FR-25 | Text-channel tutor (same persona) | M | Used by eval harness; fallback when voice is unavailable |
| FR-26 | Seeded demo learners with synthetic histories, labelled "simulated" | M | 2–3 seeded profiles load in < 2 s |
| FR-27 | Curriculum library: one course per board + grade + subject; learner signs up with board + grade and sees only their courses, by chapter | M | Filtered `/api/curricula`; stable ids independent of file names |
| FR-28 | Admin-only ingestion of textbooks + optional official syllabus (scope from the syllabus when given, never model-invented) | M | Upload refused without admin; scope maps carry provenance |
| FR-29 | Automated AI review before publishing: examples re-worked, facts checked, misconception ids, L1–L4 ladder items, representation ideas; report stored | M | `npm run test:curriculum`; review report shown in the admin library |
| FR-30 | Ingested structure drives the tutor: prerequisite DAG (probe first, detour on evidence), conceptType, subject mode, age band from grade | M | Plan checks in `tests/smoke/curriculum-ingest.mjs` |

## 5. Evaluation requirements

| ID | Requirement | Output metric |
|---|---|---|
| EV-01 | Diagnosis eval set: ≥ 40 labelled responses per demo concept, including ≥ 10 right-answer-wrong-reasoning cases | Detection rate, false-positive rate, per-class accuracy |
| EV-02 | Simulated-learner comparison: base plan vs adapted plan on scripted-misconception learners | Turns to resolve a misconception; turns to L3; retry-cap hits |
| EV-03 | Persona adherence (TUTOR_PERSONA §18) | Pass rate per P-ID |

All numbers are reported as **measured on simulated learners** unless real user tests are run.

## 6. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | Voice turn latency not increased by diagnosis (diagnosis runs asynchronously) |
| NFR-02 | Every Gemini call: model ID resolved at startup, timeout, fallback, structured log (model, latency, tokens, outcome). **No silent fallback to canned content in demo mode** — show a visible banner instead |
| NFR-03 | Privacy: learner data readable only by the owner/parent; no public Firestore reads; delete endpoint; no psychological or medical labels stored |
| NFR-04 | Deployed on Cloud Run (+ Firebase Hosting/Firestore) |
| NFR-05 | Accessibility: captions, alt text for visuals, audio-first option, keyboard navigable |
| NFR-06 | Determinism in demo mode (plan compile uses the mean, not a Thompson sample; seeded data) |
| NFR-07 | Cost: Profiler once per session; Diagnostician uses a fast model |

## 7. Demo storyboard (target 3:00)

| Time | Beat | Evidence shown |
|---|---|---|
| 0:00–0:20 | Problem: children don't ask; teachers can't give unlimited individual explanation | One line + visual |
| 0:20–0:45 | Why existing tools fall short: they answer, or quiz and score; they don't diagnose *why* or remember what worked for *this* child | — |
| 0:45–1:30 | **Same question, two learners.** A new learner vs "Aisha, 6 weeks (simulated)". Different opening, representation and watch-list — the reasoning panel shows why, with evidence | Plan diff side by side |
| 1:30–2:15 | **Live exchange:** correct answer → "walk me through it" → flawed reasoning → probe → misconception confirmed → mastery goes *down* despite a correct answer → representation switch → transfer. Learner card updates live | Ledger, BKT derivation, card |
| 2:15–2:40 | Architecture: persona (fixed) + learner model (evidence) + plan (deterministic) + Gemini where necessary (diagnosis, profiling, teaching) | One diagram |
| 2:40–3:00 | Measured: diagnosis detection/FP rates; simulated turns-to-resolution base vs adapted; privacy stance | EV-01/EV-02 numbers |

## 8. Out of scope (for the hackathon)

Multi-classroom teacher dashboards, payments, real-student studies at scale, more than 2 subjects
in depth, native mobile apps, avatar or voice cloning work, learning-style labelling.
