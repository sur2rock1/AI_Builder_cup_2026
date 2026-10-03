# Curriculum Library — Specification

_Status: v1.4 · 2026-09-30 · Decisions: D-2026-09-30-1…4 (quality gates / parallel L3 / verified photos), D-2026-09-26-7, D-2026-09-26-8, D-2026-09-26-9, D-2026-09-27-2, D-2026-09-27-3, D-2026-09-27-4, D-2026-09-28-7 (supersedes D-2026-09-28-1) · Code home: `src/curriculum/` · Board pictures: docs/BOARD_VISUALS.md_

The curriculum library turns uploaded **textbooks** (plus, optionally, the **official
syllabus**) into published **courses** — one per *board + grade + subject* — shaped so the
rest of the tutor (persona, learner model, teaching plan, diagnostician) can use them
without any per-book hand work.

```
Admin uploads  ─►  split ─► extract ─► merge ─► structure ─► AI review ─► publish
(textbook PDFs +      Gemini     Gemini   (code)    Gemini +     Gemini +     course in
 optional syllabus)   per chunk  per chunk          code rules   code rules   Firestore /
                                                                              data/curricula.json
Learner signs up with board + grade  ─►  sees every course for that board + grade,
chapter by chapter  ─►  picks a concept  ─►  plan + persona use the course's structure
```

---

## 1. Why this exists

Before this change the app held one hand-uploaded book with: the grade typed by whoever
uploaded it (a Secondary 3 book was tagged "Secondary 2", which also set the wrong age
register); concept ids built from the upload's **file name**; an **empty prerequisite graph**
(so three plan rules never fired); no `conceptType` (so learner strategy history split across
keys); positional misconception ids that never matched the seeded demo data; scope lists partly
**invented by the model**; and at least one **wrong worked example** passed to the tutor as fact.
The library fixes each of those at ingest time, once, for every book.

## 2. Identity — board, grade, subject, ids

All naming lives in `src/curriculum/catalog.ts` (pure functions, shared by server, pipeline, UI
and tests).

| Thing | Rule | Example |
|---|---|---|
| Board | `normaliseBoard()` — known aliases map to one spelling, anything else kept as typed | `cbse` → `CBSE`, `ib` → `IB MYP` |
| Grade | numeric 1–12 via `gradeLevelFromLabel()`; understands Grade / Class / Std / Year (UK, N−1) / Secondary (SG, N+6) / Primary / MYP (N+5) / JC (N+10) | `Class 7` → 7, `Secondary 2` → 8 |
| Subject | `normaliseSubject()` — aliases, else Title Case | `maths` → `Mathematics` |
| Course id | `courseId(board, grade, subject)` | `igcse--g8--mathematics` |
| Chapter key | `chapterKey(number, title)` | `ch9-congruence-and-similarity` |
| Concept id | `conceptId(course, chapterKey, label)` | `igcse--g8--mathematics--ch9-congruence-and-similarity--triangle-congruence-tests` |
| Misconception id | slug of the reviewer's short id or the belief; unique within the concept | `ssa-assumed-valid` → catalogue id `<conceptId>::ssa-assumed-valid` |

**Never from a file name.** Re-uploading the same book under a different file name lands on the
same ids, so learner history (keyed by concept id) is never orphaned. Uploading Book A today and
Book B tomorrow for the same board + grade + subject builds one course.

## 3. Data model (additions to `CurriculumSubject` / `CurriculumConcept`, `src/adaptive/learnerModel.ts`)

All new fields are optional, so older data and test fixtures still load.

**Course:** `board`, `gradeLevel`, `subject`, `subjectMode` (`well_structured | interpretive | skill`,
assigned at ingest), `conceptTypes` (id → description), `sources[]` (textbook/syllabus, title, file
name, pages), `syllabus[]` (topics with objectives / excluded / extension, as the document states),
`verification` (the AI review report), `updatedAt`.

**Concept:** `conceptType`, `chapterId`, `chapterNumber`, `orderInChapter`, `ladderItems[]`
(L1–L4 in the course's subject mode, each with `prompt` + `lookFor`), `representationIdeas[]`
(`TeachingStrategy` + concrete idea), `sourceRef` (source id + absolute pages), `verification`
(`verified | corrected` + notes). `misconceptionDetails[].id` (stable). `prerequisiteDetails[].conceptId`
(set = in-course prerequisite; unset = earlier grade / other subject, probe-only).

**Scope map:** `source: 'syllabus' | 'textbook'`, `syllabusRefs[]`.

**Learner:** `board`, `gradeLevel` (plus the existing `grade` display label).

## 4. Ingestion pipeline (`src/curriculum/pdfIngest.ts` + `src/curriculum/structure.ts`)

The split is deliberate: **Gemini proposes, deterministic code disposes** — the same pattern as
the Profiler/Claim Validator (AGENT_GUIDE landmine #5). Every model call goes through
`src/ai/gateway.ts` (role `strong`, with `transientRetries` so a brief 429 does not silently fall
back to a weaker model). Every validation rule lives in `structure.ts`, which has no network access
and is covered by `tests/smoke/curriculum-ingest.mjs`.

| Stage | Who | What | Rules that decide what survives |
|---|---|---|---|
| 1 Split | code | PDFs → ≤60-page / ≤40 MB chunks (pdf-lib) | — |
| 2 Extract | Gemini per chunk (2 parallel) | Textbook: chapters, concepts, key facts, the book's own worked examples, misconceptions (belief, trigger, probe, correction), prerequisites (+ check question), page refs, and only the objectives/exclusions/extensions **the book states**. Syllabus: topics with objectives/excluded/extension **as the document states** | Invalid entries dropped; a concept with no key facts is dropped |
| 3 Merge | code | Chapters straddling chunks merged by (source, chapter no./title); concepts by label; stable ids | — |
| 4 Structure | Gemini once over the whole course (existing + new concepts) | Subject mode; 3–10 concept types; direct prerequisites; which textbook-implied prerequisites are outside the course; chapter → syllabus-topic mapping | Mode must be one of 3; type must be declared (else `general`); **an edge is kept only if both ends exist, it isn't a self-edge and the prerequisite is taught earlier** (guarantees an acyclic graph); ≤4 direct prerequisites; external prerequisites must be labels the extractor found; syllabus refs must exist. **Published concepts keep their type** |
| 5 AI review | Gemini per chapter (2 parallel) | Re-works every worked example step by step (`verified` / `corrected` / `wrong_unfixable`); corrects key facts; keeps only specific, discriminating misconceptions with short ids; writes L1–L4 ladder items in the subject mode (`LADDER_LEVEL_NAMES`) — **L3 as a parallel pair `L3-A` / `L3-B`** and only items answerable from the concept's own key facts + worked examples (§Parallel L3 and coverage below); 2–4 representation ideas from the shared `TeachingStrategy` list; verdict `ok / corrected / reject` | `wrong_unfixable` and silently-omitted examples dropped; `reject` → concept not published (and edges to it removed); ladder levels outside 1–4 dropped; a third L3 dropped; reviewer-reported `coverageGaps` and a single-L3 concept are listed in the ingest issues; unknown strategies dropped; **if the review call fails the concept is published without its worked examples** |
| 6 Publish | code | Merge into the existing course (earlier books untouched except for *added* prerequisite edges); recompute global teaching order; scope maps; save; start asset pre-generation | Nothing published if every concept was rejected |

**Chapter limit (D-2026-09-26-9).** Each upload has a *Chapters to load* setting — default **3**
(the demo-safe default; `DEFAULT_CHAPTER_LIMIT` changes the server default), or **All chapters**.
With a limit, textbook parts are read one at a time in page order and reading **stops as soon as
chapter N+1 appears** (`chapterLimitReached`), so the rest of the PDF is never sent to Gemini;
`limitChapters` then keeps only the first N chapters, and structure, review, publishing and
pre-generation cover exactly those. The count is over the *book's* chapters, including ones
already published, so uploading the same book again with a higher number (or All) adds the next
chapters and leaves the published ones untouched. A chapter that straddles two parts is still read
completely (the part that starts chapter N+1 also holds the end of chapter N). The syllabus, if
uploaded, is always read in full.

**Scope provenance.** When a syllabus was uploaded and a chapter maps to its topics, the chapter's
in-scope / extension / out-of-scope lists are the syllabus's own text (`source: 'syllabus'`).
Otherwise they are only what the textbook states (`source: 'textbook'`); with no stated objectives,
in-scope is the chapter's concept list and out-of-scope is empty. **Nothing model-invented is ever
stored as scope.**

**No human review step (D-2026-09-26-7).** The AI review is the gate. Its report (checked /
corrected / rejected / examples fixed and dropped / invalid edges removed / notes) is stored on the
course and shown in the admin library, so what the automation changed is always inspectable.


### Parallel L3 pair and coverage (D-2026-09-30-2, review findings A4 / H12)

The review found the quiz repeated the application picture's problem (or a worked example), so a child who
had seen the picture was tested on it. Ingest now authors **two L3 items of the same structure with a new
context and new numbers each** (`LadderItem.id`: `L3-A`, `L3-B`):

| Item | Used for |
|---|---|
| `L3-A` (form A) | the **application picture** (`apply`, situation only) — and the tutor's live L3 question |
| `L3-B` (form B) | the lesson **quiz** (multiple-choice version); `quiz.itemId = "L3-B"`, `quiz.parallelOf = "L3-A"` |

If a concept has only one L3 item (older data, or the reviewer produced one), `lessonGen.ts` **authors form B itself**
(new context, new numbers) and the ingest issue list says so. `lintLesson` (`quiz.same-as-apply`) rejects a quiz that repeats form A,
and `leakLint` rejects a quiz that is a worked example.

**Teach before test (H12).** Every ladder item must be answerable by a learner who has learned *only* the concept's key facts and
worked examples. The reviewer is told not to invent facts to fit an item; if it cannot write a sound item it lists it in `coverageGaps`
instead. Gaps are **reported, never silently filled**: at pregen, `reviewLadderCoverage` (critic) re-checks each ladder item against the
key facts, and untaught items land in `record.quality.untaughtLadderItems` (shown by `npm run review:pregen`) for a human to resolve —
by adding the missing fact from the textbook or removing the item. Chapter 1 Math has known cases (the review's gradient-formula and
parallel-line-gradient items).

### 4a. Design decisions made at ingest (same review call)
The review also returns, per concept: `ladder[].hints` (three graded hints for each L3 item, none containing the answer — dropped if they repeat the key) and
`presentation {photo{useful,scene,why}, spatial3d{useful,why}}` decided from what the concept is, never from the subject name. They drive which
pictures are pre-generated (`docs/BOARD_VISUALS.md` §6). Curricula ingested earlier: `npm run backfill:design`.

## 5. Admin content library

- **Who:** only the admin uploads or deletes (students never do). `server/middleware/requireAdmin.ts`
  accepts `X-Admin-Token` = `ADMIN_TOKEN` (constant-time compare) or a Firebase ID token with custom
  claim `admin: true`. With no `ADMIN_TOKEN` configured, requests from the server's own machine
  (loopback TCP peer, not `X-Forwarded-For`) are allowed with a warning, so local dev works; anywhere
  else uploads return 503 until `ADMIN_TOKEN` is set. The guard runs **before** multer, so an
  unauthorised upload is never written to disk.
- **UI:** login screen → "Content library (admin)" → `AdminLibrary.tsx`: token check, upload form
  (`CurriculumUpload.tsx`: board with suggestions, grade 1–12, subject, textbook PDFs, optional
  syllabus PDF), live stage-by-stage progress, the review report, the published-course list grouped
  by board · grade, delete.
- **Routes:** `POST /api/curriculum/upload` (admin; fields `textbooks[]`, `syllabus`, `board`, `grade`,
  `subject`, `chapterLimit` = number 1–200 or `all`, default 3; 409 if that course is already ingesting), `GET /api/curriculum/jobs/:id` (admin),
  `GET /api/admin/check`, `GET /api/admin/courses`, `DELETE /api/admin/courses/:id`.

## 6. Learner journey

- **Signup** (`LoginScreen.tsx`): name + **board** + **grade**; shows which subjects are ready for
  that pair (`GET /api/catalog`). Stored as `board`, `gradeLevel`, `grade: "Grade N"`.
- **Subjects** (`SubjectSelector.tsx`): `GET /api/curricula?board=&grade=` — only this learner's
  courses; concepts grouped by chapter in teaching order; the chapter in progress opens first.
- **No hard locks (D-2026-09-26-8).** A concept shows "Builds on: …" instead of being locked until
  prerequisites reach 40% — a learner must be able to study the chapter their class is on today.
  The plan probes prerequisites first and detours only on evidence (see §7).
- **Onboarding** asks feelings only about the learner's own subjects.

## 7. How the course drives the rest of the tutor

| Course field | Consumer | Effect |
|---|---|---|
| `gradeLevel` | `ageBandFromGrade()` (`src/persona/ageBands.ts`) | Age-band register: Grades 1–2 → 5–7, 3–7 → 8–12, 8–12 → 13–17 (was: Grade 8 / Sec 2 → 8–12) |
| `subjectMode` | `subjectModeForCurriculum()` → persona surface, plan representation defaults, diagnostician's "correct answer trap" wording | History is judged claim→evidence→reasoning; languages on production; maths/science on answer + method |
| `prerequisites` / `prerequisiteDetails` | `compileTeachingPlan` R-PROBE / R-PREREQ-FIRST / R-FAST; curriculum prompt block | In-course prerequisites probed with the target's own check question; earlier-grade ones probed as `external:*`; an **evidenced** weak prerequisite becomes the target |
| `conceptType` | `conceptTypeFor()` (catalog.ts) — the ONE function every writer and reader uses | strategyProfile (R-REP "last time X helped"), R-WATCH sibling misconceptions, Profiler claim scope |
| `misconceptionDetails[].id` | `misconceptionCatalog()` (reasoningAssessor.ts) | Closed catalogue ids `<conceptId>::<id>`; ledger entries line up across sessions and with seeded data |
| `ladderItems`, `representationIdeas`, verified `workedExamples`, scope with provenance | `curriculumIntelligence.ts` prompt block | Tutor gets WHAT to teach; HOW stays with persona + plan (the block no longer hard-codes its own teaching order) |
| `subject`, `gradeLevel` | `assessReasoning()` prompt | Diagnosis phrased for the real subject and age, not "a 13-year-old's mathematics tutor" |

## 8. Pre-generated lessons

After publishing, the pipeline writes a snapshot of the course and runs
`scripts/pregenerate-assets.ts --curricula-file <snapshot>` in the background (works whether
Firestore or the local file is the store; `DISABLE_PREGEN=true` turns it off). Lessons are cached
per **concept id** through `src/curriculum/pregenStore.ts` — Firestore collection `pregen` (one doc
per concept id) plus Cloud Storage for the generated "real-world photo" image, with a local-file
fallback (`data/pregenerated/<key>.json`, unchanged format) when neither is configured. This is a
"generate once, reuse forever" cache, not just a build-time optimisation: every save is a paid
Gemini call (the lesson/diagram JSON on `gemini-3.8-flash`, the photo on `gemini-3.1-flash-image`),
so nothing that has already been generated — locally during dev, or live during a real session —
should ever be regenerated for the same concept.

Two write paths feed the same store:
- **Batch, from the ingest pipeline** — `pregenerate-assets.ts` generates, per concept, the lesson
  text (`src/curriculum/lessonGen.ts`: tagline, overview, chalk notes, the **form-B quiz** with per-option notes,
  child-voice suggested questions, tutor-only `diagnostics`), the **board pictures** (planned teaching pictures `main` + `focus:<slug>`,
  one contrast case per misconception, the application picture, and a 3D picture only if the model judges depth helps — docs/BOARD_VISUALS.md),
  a ladder-coverage check, and a **vision-verified, lesson-specific photo** (none if unverified); every artefact goes through the quality gates
  (lints + independent critic + repair, **withheld if an error survives** — docs/BOARD_VISUALS.md §5b), and `record.quality` summarises the outcome. Checks the store before spending, and `savePregenAsync()`s the result. Runs as a spawned
  child process, so it calls `initFirebaseAdmin()` itself rather than inheriting the server's app.
  `--visuals-only` adds pictures to lessons that already exist without regenerating their text or
  photo (the upgrade path for lessons made before board pictures). `--skip-photo` and `--chapter <regex>` scope a run;
  `npm run pregen:ch1` = Chapter 1 with `--force` (the regeneration run the Chapter 1 review calls for).
- **Live, on a cache miss** — `POST /api/generate-lesson`, `POST /api/update-diagram` (called by the
  `update_diagram` live-session tool), and `POST /api/generate-image` (the board's real-world photo
  tab, `App.tsx handleGeneratePhoto()`) all check the store first; on a miss they call Gemini
  (through the same gated generators, with 2 attempts so a child is not kept waiting) and now **save the result back** through the same `savePregenAsync()` before responding,
  merging onto whatever the concept already has (a picture drawn live never overwrites the lesson,
  and vice versa). Before D-2026-09-27-2/3, `/api/update-diagram` and
  `/api/generate-image` never persisted anything at all, so the same live-generated diagram or photo
  was re-billed every time — for the photo route, even a repeat open of the same topic's photo tab
  in the same session. `/api/generate-image` skips the cache entirely (read and write) when the
  request carries a user-typed custom prompt — that's a one-off image, not the reusable default. Since D-2026-09-30-3 a photo is stored and served only after a vision review verified it (`photoMeta.verified`); there is no stock-photo fallback.

`server.ts loadPregen()` looks up by concept id first, then topic slug for ad-hoc topics.
`App.tsx` sends the concept id with lesson/diagram requests for the current concept.

**The pictures are composed per concept, not picked from templates (D-2026-09-28-7).** Until
2026-09-28 the board had two fixed drawing shapes (a node-and-arrow concept map, a ring of spheres)
chosen by subject area, so a graphing concept was drawn as boxes of prose. A same-day interim fix
(D-2026-09-28-1) steered those templates with a keyword heuristic; it made the text inside the boxes
concept-specific but left the shape wrong, and is superseded. Now the model composes each picture
from a small drawing vocabulary (points, lines, curves from real equations, shapes, text, boxes,
arrows, tables, 3D solids) using the concept's own authored material — key facts, the worked
examples verified at ingest (their numbers are reused), misconceptions, the evidence ladder and the
representation ideas — and every picture is fact-checked before it is stored. Full specification:
docs/BOARD_VISUALS.md.

The concept's authored material is used like this: `representationIdeas` and the subject's
representation order choose what the main picture shows; `misconceptionDetails` each get a
contrast picture; the L3 (else L4) `ladderItems` entry becomes the application picture (situation
only, never the answer) and grounds the lesson quiz; `workedExamples` supply the numbers.

**Why the image goes to Storage, not Firestore:** a generated photo comes back from Gemini as a
base64 data URI; base64 is ~33% larger than the binary and easily runs several hundred KB, which
would blow through Firestore's 1 MiB document cap on the first or second image if inlined. The
decoded bytes are uploaded to Cloud Storage (`pregen-images/<key>.<ext>`, made public) and only the
resulting URL is stored in the Firestore doc. If Storage isn't reachable, the lesson JSON is still
saved to Firestore and the photo is dropped (regenerates next time) rather than risking the whole
save; the local-file fallback keeps the base64 inline exactly as before, since local dev/tests have
no Firestore doc cap to worry about.

## 9. Limits and known risks

- **Firestore 1 MiB document limit.** One course is one document. A warning is logged above
  900 KB; a very large course would need concepts moved to a subcollection.
- **Jobs are in memory.** A server restart mid-ingest loses the job (re-upload; published data is
  unaffected). A per-course lock prevents two concurrent ingests of the same course.
- **Pre-generated assets are Firestore/Storage-backed (§8), not local-disk-only** — fixed
  2026-09-27 so they survive a Cloud Run redeploy/cold start instead of silently regenerating (and
  re-billing) on every new instance. The local-file fallback (`data/pregenerated/`) still exists for
  dev/tests without Firebase credentials configured, and IS still ephemeral there — that's expected.
- `src/curriculum/pregenStore.ts` finds Firestore/Storage via the same `require('../firebase/admin')`
  pattern as `ingest.ts` — same ESM/`npx tsx` caveat below applies to it too.
- **The AI review is an automated check, not a guarantee.** It is a second, independent pass with a
  different task (verify, not extract) and its changes are reported, but it can miss errors.
  Measuring its catch rate against a hand-checked sample is open work.
- **`src/curriculum/ingest.ts` finds Firestore via `require()`**, which only resolves in the bundled
  CommonJS server (production). Under `npx tsx server.ts` (ESM dev) it falls back to
  `data/curricula.json`. Pre-existing behaviour; noted, not changed.
- Existing Firestore `curricula` documents from before this change are not migrated — delete them
  (see §10).
- **Stored Chapter 1 records are the deterministic *upgrade* of the pre-gate output, not regenerated material.** `npm run upgrade:pregen`
  (offline) dropped legacy fields, shuffled quizzes, held back quizzes/pictures that fail the lints (74 of 102 pictures and 9 quizzes across the 22 records) and
  hides the never-reviewed photos. Records with `quality.errors > 0` (14 of 22 at the time of writing, `npm run review:pregen`) still need `npm run pregen:ch1`; until that is run and
  reviewed, no claim is made about the quality of regenerated content, and the missing pictures show the empty-board state rather than a defective picture.
- **Lessons generated before board pictures have none until upgraded.** Pregen never regenerates on
  its own (never re-billed). Run `npm run pregen -- --visuals-only` to add pictures to existing
  lessons (text and photo untouched), then review them with
  `npm run preview:visuals -- --concept <id>` before a demo. Until then those lessons show their old
  concept map; the first time the tutor switches such a lesson to the Shape view, its main picture is
  drawn live and saved.

## 10. Stale data, seeding, tests

- **Wiped 2026-09-26:** `data/curricula.json` → `[]`, `data/learner-profiles.json` → `{}`, all
  `data/pregenerated`, `data/events`, `data/plans`, `data/sessions` files, and the unused built-in
  `src/curriculum/pythagoras.ts`. The deployed Firestore project was **not** touched — delete its old
  `curricula` documents (and old `learners`) from the Firebase console, or through the admin library
  once they are visible there.
- **Demo learners:** `npm run seed:demo -- [--course <id>] [--reset] [--list]` seeds Aisha / Marcus /
  Priya (Simulated) against a course that is actually in the library, using that course's own
  misconception catalogue ids, board and grade. Upload a textbook first.
- **Tests:** `npm run test:curriculum` (`tests/smoke/curriculum-ingest.mjs`) — catalog parsing, age
  bands, subject modes, the full pipeline with stubbed model steps (cycles/forward edges dropped,
  invented prerequisites ignored, unfixable examples dropped, rejected concepts removed, syllabus vs
  textbook scope, second-book merge keeps published ids/types, review failure path), the plan's
  prerequisite behaviour, and delete. `tests/smoke/pregen-store.mjs` — the pregen store's
  local-fallback round trip (save/read, inline-base64 preserved, candidate-list lookup, merge
  semantics for the live diagram-save path); no live Firestore/Storage credentials in test envs, so
  the Firestore/Storage branches are exercised only by their `if (db)`/`if (bucket)` guards routing
  correctly to the fallback, not against a real project.
