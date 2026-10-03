# Board Pictures — Specification

_Status: v2.0 · 2026-09-30 · Decisions: D-2026-09-28-7 (bricks, not pictures) and D-2026-09-30-1…4 (quality gates, fail-closed, verified photos — see `docs/CH1_FIX_PLAN.md`) · Code home: `src/visual/`, `src/quality/`, `src/components/BoardVisualView.tsx`, `src/components/Board3DView.tsx`_

The pictures a child sees in the **Shape** and **3D** views. Each one is composed by the model,
per concept, from a small drawing vocabulary, fact-checked before it is stored, and built up on
the board step by step as the voice tutor explains it.

---

## 1. Why this exists

The board used to have exactly two drawing tools: a node-and-arrow concept map and a ring of
labelled spheres. However well the model understood a concept, its picture was squeezed into one
of those two shapes, chosen by subject area. A concept about where two lines cross on a graph was
drawn as boxes of prose. Adding more fixed renderers (a graph renderer, a number-line renderer, …)
would only move the problem: every new kind of idea would need new code, and the model would still
be picking from a menu instead of deciding how to teach.

So the model gets **bricks, not pictures**, and one renderer draws any combination of them. The same
few bricks produce a coordinate graph, a number line, a timeline, a process loop, a labelled
diagram, a geometric construction or algebra worked line by line.

What counts as success (the project's central principle): the picture makes the idea *visible* so the
learner can see why it is true — it does teaching work words alone can't — rather than decorating
the lesson.

## 2. How it follows the tutor's own method (docs/TUTOR_PERSONA.md)

| Tutor principle | What the picture does |
|---|---|
| §4 Teach ONE idea, then check | A picture is **3–6 steps**, one idea each; the last step is often a check (`phase: "check"`). |
| §7 "The board shows only what is being said" | The picture **starts almost empty**; each step adds only what its caption talks about. The current step is spotlighted, earlier parts fade back. |
| §7 Board follows the voice (`reveal_part`) | The voice prompt lists the picture's step names; the tutor calls `reveal_part` with a step name at the moment it starts that step. |
| §7 Representation catalogue | The picture declares which representation it realises and why; the prompt gives the subject's default representation order and the concept's authored representation ideas. |
| §8 Misconception → contrast case | For every catalogued misconception a **contrast picture** is prepared: set up → apply the learner's rule and let the picture show it break → the rule that works → ask the learner to explain the difference. |
| §10 The error belongs to the rule | Captions say "let's test this rule", never "wrong". Enforced by `src/quality/language.ts` (§5b). |
| §4 Predict / notice before telling | **Step 1 of a teaching picture asks** (a question the child can notice or predict) and the picture ends on a `checkQuestion`. Enforced by `predict.no-hook-question`, `elicit.no-check-question` (§5b). |
| §15 Integrity | The **application picture** shows the problem's situation only, never its answer — no answer text, no drawn answer point, no curves crossing at the answer (`lintApplyPicture`). |
| One idea at a time | A concept gets a **planned set** of teaching pictures, one idea (≤ 2 key facts) each — `main` + `focus:<slug>` (§6). |
| Worked examples verified at ingest | The prompt tells the model to reuse those exact numbers when drawing an example. |

## 3. Pipeline

```
curriculum concept ─► planner (visual.plan): one idea per picture ─► for each picture:
   key facts, verified examples,
   misconceptions, ladder, representation ideas
        │
        ▼
   draft  (src/visual/prompt.ts → model, role "strong")
        ▼
   sanitize + fact-check geometry (src/visual/sanitize.ts)        ← gate 1a: what is drawn is what is labelled
        ▼
   lints (src/quality/visualLint.ts, leakLint.ts, language.ts)    ← gate 1b: persona + layout + leak contracts
        ▼  (only when the cheap gates have no error)
   independent critic (src/quality/critic.ts, role "review")      ← gate 2: subject-matter review vs the KEY FACTS
        │
        ├─ no errors ──────────────────────────────────────────► picture (served)
        ├─ errors, attempts left ─► repair prompt quoting every finding ─► back to sanitize
        └─ errors after the last attempt ─► WITHHELD: kept in visualsQuarantine, never served (fail closed)

picture ─► pregen store (visuals.<key>) ─► /api/generate-lesson (attached as lessonData.visual / visual3d)
                                       ─► /api/update-diagram  (prepared pictures by focus)
                                       ─► voice system prompt  (THE BOARD PICTURES block)
                                       ─► BoardVisualView / Board3DView (step-by-step)
```

Every model call goes through `src/ai/gateway.ts` (logged, timed, model fallback), labelled
`visual.plan`, `visual.main`, `visual.focus`, `visual.contrast`, `visual.apply`, `visual.3d`,
`visual.*.repair`, `visual.*.live`, `critic.picture.<key>`.

## 4. The vocabulary (`src/visual/types.ts`)

**Frames**
- `plane` — real maths coordinates, y up, drawn with real axes and numbers. `axes: "x"` makes a
  number line or timeline (compact band, no y scale). `equalScale` keeps shapes and angles true.
- `canvas` — free layout, x 0..100, y 0..60 (y down): processes, cycles, labelled parts, algebra steps.
- `space` (3D) — x right, y up, z toward the viewer.

**2D bricks:** `point` (solid/open), `segment` (arrows, dashed), `line` (infinite, clipped),
`ray`, `polygon` (filled), `polyline`, `circle`/ellipse, `angle` (arc or right-angle square),
`function` (y = expr, safely parsed), `text` (optionally maths font), `box` (canvas), `connector`
(joins two bricks by their edges, optional bend), `table` (one, drawn beside the picture).

**3D bricks:** `point`, `segment`, `polygon` (a face or plane region), `sphere`, `cuboid`,
`cylinder` (`rTop: 0` = cone), `label`.

Every brick has an `id`, and optionally a `name` (how the tutor would say it), a `label`, and a
`color` from a named palette (`ink, muted, emerald, amber, sky, violet, rose, teal`) — named, not
hex, so the model cannot produce unreadable colours; colour carries meaning and stays consistent.

**Steps:** `{ id, name, caption, show[], focus?[], phase? }`. A brick appears in the first step
that shows it and stays; bricks in no step are always visible (quiet scaffolding).

**Picture header:** `title`, `purpose` (`teach | contrast | apply`), `representation`, `why`
(for the tutor, not the child), `focus`, `misconceptionId`, `checkQuestion`.

Limits: 32 bricks, 7 steps, 90-character labels, 160-character captions, 8×5 tables.

## 5. Fact-checking (`src/visual/sanitize.ts`)

Model output is untrusted. First it is **sanitized**: unknown or malformed bricks dropped (with the
reason), ids de-duplicated, colours mapped, canvas coordinates clamped, the plane widened to fit what
is drawn, connectors to missing bricks dropped, a connector moved to the step where both its ends
are visible, steps repaired or synthesised, equal scaling switched on when angles/circles need it
and off when the ranges are too lopsided to read.

Then every **checkable claim** is compared with what is drawn:

| Claim | Checked against |
|---|---|
| `"B(2, 1)"` on a point | the point's position |
| `"x = 2"`, `"y = -3"`, `"y = 2x + 1"` on a line/segment/ray | both defining points |
| `"y = x^2 - 4"` on a curve | the plotted expression at five x values |
| right-angle mark / `"35°"` | the real angle |
| `"5 cm"`, `"r = 3"` (only when axes are shown — a scale drawing may legitimately shrink) | real length / radius |
| `"3 × 4 × 5"` on a cuboid, `(x, y, z)` on a 3D point | real size / position |
| coordinates quoted in a caption or title | a point, vertex, line, curve or circle actually passing there (warning) |

Severities: `fix` (already corrected), `warn` (sent back to the model, never auto-removed), `error`
(sent back; if the repair doesn't fix it, `stripUnverifiedClaims()` deletes the false label — or, for a
label attached to the wrong line, the whole element — the geometry of what remains stays true). A child
never sees a label the checker proved false.

Added in v2 (found by the Chapter 1 review, `docs/CH1_MATERIAL_REVIEW.md`):

| Claim | Checked against |
|---|---|
| general-form equations `"2x − 5y = 32"`, `"x + y = 7"` (previously misread as `y = 32`) | both defining points, exactly |
| a text/label brick that states an equation (`"y = 2x + 1"` sitting near a line) | the drawn curve it must **match** and sit **next to** — a label beside the wrong line (the review's swapped parallel-lines picture), or floating with no line, is an `error` and the element is removed with its step references |

The `function` brick's expression goes through `src/visual/expr.ts`: a recursive-descent parser over
a whitelist (x, numbers, + − × ÷ ^, brackets, |x|, sqrt, trig, log, ln, exp, pi, e), compiled to
closures — never `eval`. It accepts how people write school maths ("2x + 1", "3(x − 2)²", "√(x+1)").

## 5b. Quality gates (`src/quality/`) — what must be true before a child sees it

Every artefact (picture, lesson text, photo) passes **two independent layers** and **fails closed**
(decision D-2026-09-30-1/2). A picture is served only when it has no `error` after the repair loop;
otherwise it is moved to `PregenRecord.visualsQuarantine` with its findings and is **never served**.

**Layer 1 — deterministic lints** (exact, free, run everywhere including tests). `lintVisual` (`visualLint.ts`):

| Code | Rule |
|---|---|
| `predict.no-hook-question` | teaching picture, learner ≥ 8: step 1's caption must be a question (predict/notice before being told) |
| `elicit.no-check-question` | every non-apply picture has a `checkQuestion` ending in `?` |
| `contrast.no-clash-step` / `contrast.no-check` / `contrast.no-working` | a contrast picture has a step in phase `contrast` (the rule applied and visibly failing), ends on a `check` question, and shows the rule's own working (warn) |
| `apply.no-question` / `apply.has-contrast` | an application picture ends on an `apply` question and shows the situation only |
| `steps.*` | warnings: fewer than 3 steps (`too-few`), more than 6 (`too-many`), a step that adds and highlights nothing (`empty`), more than 6 bricks appearing at once (`crowded`), a teaching picture that does not end on a `check` step (`no-final-check`). **Error:** `always-visible` — labelled/text bricks in no step are on the board before their idea is taught |
| `layout.overlap` / `layout.off-board` (errors) · `layout.connector-crosses` (warn) | measured with the **renderer's own metrics** (`elementRects` in `src/visual/layout.ts`, shared with `BoardVisualView`) |
| `form.text-slide` | every brick is text = error; mostly text = warn: a slide, not a picture |
| `3d.decorative` / `3d.empty-step` (errors) · `3d.unlabelled` (warn) | one solid, a step that reveals nothing, or unlabelled solids: 3D that adds nothing |
| `persona.*` (`language.ts`) | verdict words (wrong, incorrect, mistake, silly, careless …), emoji/tick/cross verdicts, pre-announced "misconception / alert / watch out", tutor jargon (prerequisite, diagnostic, probe, ladder, L1–L5); marketing words in a tagline (warn) |
| `leak.*` (`leakLint.ts`) | an apply picture states or draws the answer (text, equation, coordinate pair, drawn answer point, ≥ 2 curves crossing at the answer); any picture states the lesson quiz's answer |

**Layer 2 — independent critic** (`critic.ts`, gateway role `review`, `MODEL_REVIEW`; a fresh prompt that has *not*
seen the drafting prompt, given the curriculum's key facts, told to attack the work). It checks fact, drawing-vs-label
(counts, positions, directions), which **key facts** the picture actually teaches (`keyFactsCovered`), scope, persona and
the purpose-specific contract (contrast clash shown not asserted; apply leaks; 3D adds nothing a flat picture would).
It runs only once the lints are quiet (it is the expensive call). **A critic call that fails is recorded as
`criticRan: false`** — the artefact is never presented as independently reviewed when it was not.

**Repair loop** (`generateBoardVisual`): draft → checks → if errors, one repair prompt quoting *every* finding (sanitizer, lints,
critic) → re-check; default 3 attempts (pregen), 2 for a live cache miss. The best candidate (fewest errors, then warnings) is kept.

**Evaluation of the gates themselves:** `tests/smoke/quality.mjs` — fixtures from the real defective material, a scripted
`JsonModel` for the repair/withhold/critic-unreachable paths, and a **regression corpus**: the pre-quality Chapter 1 records
(`backups/pre-quality-*`) must still trigger the lints for the defects the review found (a lint that passes known-bad
material is itself a bug).

## 5c. One idea per picture (`planTeachingPictures`)

A concept with 3+ key facts is planned into ≤ 4 teaching pictures of ≤ 2 key facts each (`visual.plan`, validated:
every key fact in exactly one picture; fallback `chunkPlan` groups contiguous facts). Keys: `main` (first) and
`focus:<slug>` — the same keys the runtime's `findVisualForFocus` already resolves. The critic reports which facts each
picture really covers, and `coverageGaps` (key facts no shipped picture teaches) is recorded in `record.quality`.

## 5d. Photos (`src/curriculum/photoGen.ts`) — verified, lesson-specific, labelled

The old pipeline generated "a photorealistic photo of <topic label>" (the same student-at-a-desk scene for every
maths concept), never looked at the result, and could fall back to an Unsplash keyword search. Now: a scene is
**planned from this concept's key facts** (no text/numbers in the image — image models garble them); the image is
generated; a **vision review** (`reviewPhoto`) checks it shows the concept, nothing is false, no garbled text, and writes a
neutral one-sentence caption; only a **verified** image is stored/served (`photoMeta.verified`), with the reviewer's caption
and an "AI-generated illustration" label. Rejected → retried once with the rejection fed back; still rejected, or the
reviewer unavailable → **no photo** (the "Real world" tab is hidden). No stock-photo fallback, no invented annotation pins.
`/api/generate-image` follows the same rules for a child's/tutor's custom request (generated, reviewed against that
request, never cached, `{success:false}` on failure).

## 6. Which pictures a concept gets (`src/visual/generate.ts`)

Keys in the pregen record's `visuals` map:

| Key | Purpose | When the tutor uses it |
|---|---|---|
| `main` | The first teaching picture (planner item 1) | Built up while first teaching the idea (TEACH CHUNK) |
| `focus:<slug>` | Further teaching pictures, one idea each (planner items 2–4) — or drawn live for an `update_diagram` focus | The next TEACH CHUNK; reused next time the same focus is asked for |
| `contrast:<misconceptionId>` | Contrast case per catalogued misconception (max 3) | When diagnosis suspects/confirms that misconception |
| `apply` | The ladder's **first L3 item (form A)** (else L4) — situation only. The quiz is the **parallel L3 item (form B)**, a different problem (`docs/CURRICULUM.md` §Parallel L3) | Moving to APPLY |
| `3d` | Only if the model judges depth genuinely helps | `switch_board_view('3d')`; otherwise the 3D view is not offered |

**Spec-driven (D-2026-09-30-7).** Pregen no longer plans pictures itself: it executes `buildConceptSpec` (`src/curriculum/contentSpec.ts`) via `specToJobs`.
Extra key `alt:<strategy>` = the curriculum's second, different representation, kept ready for SWITCH_REPRESENTATION. Each board has a **form**:
`drawn` (shapes/graphs) or `worked` (step-by-step working of equations/tables/text; exempt from `form.text-slide`). `3d` is generated only when the
ingest review set `presentation.spatial3d.useful`; the photo only when `presentation.photo.useful` (scene from the review).

The model can **decline** the 3D picture (`{"useful": false, "reason": …}`). The decision is stored
in `visualsDeclined` so it is never asked again, and the 3D tab is hidden for that concept. No
decorative 3D.

## 7. Keeping the voice and the board in step (`src/visual/tutorBrief.ts`)

- **Voice prompt.** When a session starts, `server.ts` loads the concept's pictures and
  `composeSystemInstruction({ boardContext })` adds a **THE BOARD PICTURES** block: the main
  picture's steps in order with captions, the contrast pictures and which belief each is for, the
  application picture, whether a 3D view exists, and how to ask for anything else.
- **`reveal_part`.** The browser matches each name the tutor passes to a step or a brick
  (`matchRevealTarget`): rarity-weighted word matching, symmetric so paraphrases work ("where the two
  lines meet" finds the step "where they meet"), with "point A"-style names kept intact. A step name
  moves the picture to that step (forward or back); naming a part only brings it in if it isn't drawn
  yet, and spotlights it for six seconds.
- **`update_diagram`.** `server.ts` answers the tool call itself: a bounded (1.2 s) store read finds a
  prepared picture for the focus (`findVisualForFocus`: exact keys, "contrast: id", or fuzzy match on
  focus/title/misconception) and returns its **step names** in the tool response, so the tutor can
  build it up. It never generates here — the browser's `/api/update-diagram` request does any drawing,
  so nothing is billed twice.
- **`highlight_concept`** spotlights a named brick. **`switch_board_view('3d')`** falls back to the
  Shape view when the concept has no 3D picture.

## 8. Rendering

**`BoardVisualView.tsx`** (SVG, 1000×600 view box, server-render safe). Real axes with nice tick
numbers; lines/rays clipped in data space; curves sampled with breaks at asymptotes; every label
placed at the least-crowded of 32 candidate spots around its anchor, avoiding other labels, points,
boxes, text, tick numbers, axis lines and the edge. The current step's bricks animate in (strokes draw
themselves); its focus glows; the rest dims. `StepBar` shows the title, step n of N, arrows, "Whole
picture" / "Walk me through it", and the caption with its phase ("Look", "Idea", "Test the rule",
"Your turn to think", "Use it").

**`Board3DView.tsx`** (Three.js + OrbitControls). The same step/spotlight model; axes with numbers;
labels as sprites stacked when they share a position; slow auto-rotate that the learner can stop;
reset view.

**`ScenePanel.tsx`** chooses: the hand-built Pythagoras figure for Pythagorean topics (it has
`set_figure` and calibrated photo tracing), else the board picture, else — only for lessons
generated before board pictures — the legacy concept map. The 3D tab appears only when there is a
3D picture (or a legacy scene for an older lesson).

## 9. Storage

Pictures live in `PregenRecord.visuals` (served) + `visualsDeclined` + `visualsQuarantine` (failed the gates — never served, kept for review and re-drawn by the next `--force` run). **Firestore rejects arrays nested
inside arrays**, and pictures are full of them (a line's two points, polygon vertices, table rows),
so in Firestore the maps are stored as JSON string fields `visualsJson` / `quarantineJson` (`toFirestore` /
`fromFirestore` in `pregenStore.ts`); local files keep plain JSON. Pictures are never stored inside
`lessonData` — `server.ts` attaches them when serving. Each picture is ~3–8 KB. The record also carries `photoUrl` + `photoMeta` (verified flag, caption, intent), `lessonQuarantine`, and `quality` (`RecordQuality`: errors, warnings, `criticRan`, `coverageGaps`, `untaughtLadderItems`, `withheld`). `server.ts` serves a photo only when `photoMeta.verified` (`src/curriculum/serve.ts`, tested in `tests/smoke/serve.mjs`).

## 10. Operating it

| Task | Command |
|---|---|
| **Regenerate Chapter 1 with the gated generators** (needs `GEMINI_API_KEY`) | `npm run pregen:ch1` (`--chapter "^Chapter 1:" --force`) |
| Generate everything for new concepts | `npm run pregen` (skips concepts already done); `-- --skip-photo` for a cheaper pass |
| Make records generated before the gates safe to serve (offline, no model) | `npm run upgrade:pregen` (`-- --dry-run` first; originals backed up to `backups/upgrade-<time>/`) |
| **Scorecard** for what is stored (lints; exit 1 on any error; `-- --details`, `-- --write`) | `npm run review:pregen` |
| **Add pictures to lessons generated before board pictures** (no lesson text, no photo — cheap) | `npm run pregen -- --visuals-only` |
| Redraw all pictures | `npm run pregen -- --visuals-only --force` |
| One concept first, as a test | `npm run pregen:first -- --visuals-only` |
| Review pictures without opening the app | `npm run preview:visuals -- --concept <conceptId>` → `logs/visual-preview-<id>.html` (every step, the checker's findings, and what the tutor is told) |
| Reference pictures | `npm run preview:visuals -- --samples` (`src/visual/samples.ts` — deliberately never shown to the model, so they cannot become templates) |
| Tests | `npm run test:gates` (quality 33 · lesson-gen 9 · photo-gen 5 · quiz-evidence 5 · ladder-pair 5 · serve 4 · board-visual 33 + render 13 · curriculum) · `npx tsx tests/smoke/board-visual-http.mjs` (against the real server) |

A live cache miss (a topic typed ad hoc, or a focus nothing prepared matched) draws one picture on
the spot (~5–15 s), fact-checked and saved under the lesson's key.

## 11. Limits and known risks

- **The gated generators have not been run against the live model in this environment** (the sandbox
  cannot reach `generativelanguage.googleapis.com`). Prompts, lints, critic plumbing, repair/withhold
  behaviour, storage and renderers are tested with realistic fixtures and a scripted model; the quality of
  what the model actually composes — and how often the critic + repair loop converges within 3 attempts —
  is **unmeasured** until `npm run pregen:ch1` runs, after which `npm run review:pregen` and a human skim of
  `preview:visuals` are the acceptance check. Until then the stored Chapter 1 records are the *upgraded*
  originals (see `docs/CH1_FIX_PLAN.md` §6), not regenerated material.
- The critic is itself a model: it can miss an error or raise a false one. It reduces, not removes, the
  risk that a wrong label reaches a child; the deterministic gates and the human review remain.
- The deterministic fact-checker verifies geometric claims, not free-text truth: a caption can still say something
  false that has no coordinate in it (e.g. a chromosome count). That gap is what the independent critic is for (§5b); it is
  not a proof, so a human skim of `preview:visuals` output before a demo is still wise.
- Layout quality depends on the model leaving room between things; label placement avoids collisions
  but cannot fix a picture where the bricks themselves overlap.
- The hand-built Pythagoras figure is still used for Pythagorean topics (it predates this system and
  works with `set_figure`); it is the one remaining topic-specific visual.
- 3D pictures are rendered with WebGL and can't be server-rendered, so `preview:visuals` lists their
  steps but doesn't draw them.

## 12. Evaluation

- Deterministic: `tests/smoke/board-visual.mjs` (expression compiler, sanitizer, every fact-check,
  strip-on-failure, reveal matching, focus lookup, tutor brief, Firestore encoding) and
  `board-visual-render.mjs` (the real React renderer, per step, plus layout helpers and a regression
  test for the invisible-spotlit-line bug).
- Per generation: the pregen log reports, per picture, calls used and auto-fixes applied; declined 3D
  pictures record the model's reason.
- Suggested before a demo: run `--visuals-only` on one chapter and review every picture with
  `preview:visuals`; count pictures needing a repair call and any labels removed, as a quality measure.
