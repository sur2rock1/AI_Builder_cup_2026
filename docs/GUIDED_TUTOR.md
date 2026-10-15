# Guided Tutor — how Ananta teaches (the default mode)

Status: **default tutor since 2026-10-14** (decision D-2026-10-14-2). The earlier "standard" tutor is still in the code,
hidden from the UI. Source: `src/guided/*`, `scripts/generate-guided.ts`, `server.ts` (guided blocks).

## 1. What it is, in one paragraph

A good teacher at a chalkboard does not answer questions at random. She has a plan: introduce the idea, define it, show an
example, say what it is *not*, give the rule, then work problems with the class. Guided mode gives the AI tutor exactly that
plan. Each concept has a **prepared lesson script** — a list of *beats*, each a handful of *board lines*. The tutor speaks
the lesson in a flowing, warm voice while **one board** fills up line by line, with chalk markings (underlines, circles,
boxes, highlights). Questions are only asked **after** the idea has been taught, in the *apply* and *check* beats, and each
question is **written on the board** first. The learner's answer is then written below it.

The AI is used for two things: **writing** the lesson (once, ahead of time, then checked by code and by a second model) and
**teaching** it live (voice, reacting to what the child says). It does not improvise the curriculum.

## 2. Why this design (what the evidence in the project says)

| Problem seen in testing | Design answer |
|---|---|
| The free-roaming tutor stopped after every sentence ("ok so far?") and waited | Teaching beats contain **no questions**; pace instructions forbid check-ins; a server watchdog un-sticks silences |
| The tutor read the board aloud, then said the same thing again | One rule: **say it once**. The board text is the writing; the speech is the teacher talking. A validator warns when `say` repeats the board |
| The board shrank when it filled up | The board **scrolls** and follows the newest line; chalk size is fixed |
| Questions appeared out of nowhere, with the answer already on screen | A question is written on the board (`ask.board`) **without** its answer; the answer line appears only after the learner answers |
| Generated lessons could contain a number from nowhere | The validator traces every number back to something already shown in the beat |

## 3. The pieces

```
        authoring (offline / upload time)                         live session
 ┌──────────────────────────────────────────┐        ┌────────────────────────────────────────────┐
 │ stored standard lesson + pictures (pregen)│        │ Browser                                    │
 │   └─► generate.ts: Gemini draft           │        │  GuidedBoard.tsx   (chalkboard, scrolls)   │
 │         └─► validate.ts  (errors block)   │        │  useGuidedTutor.ts (board state, pace)     │
 │               └─► critic (2nd model)      │        │  TutorModeSwitch   (Guided label + Pace)   │
 │                     └─► repair loop       │        └───────────────▲────────────────────────────┘
 │               └─► save: bundled OR runtime│                        │ guided_state snapshots (WS)
 └──────────────────────┬───────────────────┘        ┌───────────────┴────────────────────────────┐
                        │  GuidedScript (JSON)       │ Server (server.ts)                         │
                        └───────────────────────────►│  registry.ts  → picks the script           │
                                                     │  session.ts   → GuidedSession holds the    │
                                                     │                 ONE true board             │
                                                     │  prompt.ts / tools.ts → what the Gemini    │
                                                     │                 Live voice model is told   │
                                                     │  watchdog     → nudges a silent tutor      │
                                                     └────────────────────────────────────────────┘
```

| File | Role |
|---|---|
| `types.ts` | `GuidedScript`, `Beat`, `BoardLine`, `LineAsk`, `BoardItem` |
| `registry.ts` | Which concept has a lesson: bundled lessons + runtime lessons (§7) |
| `session.ts`, `board.ts` | `GuidedSession`: the server owns the board; `nextLine`, `advanceBeat`, `fillSlot`, `writeAside`, annotation, asked-line logic |
| `tools.ts` | The tools the voice model may call (§5) |
| `prompt.ts` | The board block of the system prompt, per-beat, per-line and per-question instructions |
| `pace.ts` | Slow / Steady / Quick: wording of the instructions and the speed of the board |
| `marks.ts` | The chalk-mark syntax (§4) |
| `validate.ts` | Checks every script; errors block it from being served |
| `generate.ts` | Gemini draft → validate → critic → repair |
| `store.ts` | Runtime lessons (written at PDF-upload time) |
| `payload.ts`, `GuidedBoard.tsx`, `useGuidedTutor.ts`, `TutorModeSwitch.tsx` | What the browser receives and draws |
| `mode.ts` | Default mode and the one switch (`SHOW_MODE_TOGGLE`) |

## 4. The lesson script

```
GuidedScript { conceptId, title, beats[] }
Beat         { id, kind, lines[] }
               kind ∈ orient · define · show · analogy · contrast · rule · exception · method · apply · check
BoardLine    { id, text, say, style, ask?, annotates?, picture? }
```

* `text` — what is **written** on the board. May carry chalk marks.
* `say` — what the teacher **says** while writing it: conversational, never a re-reading of `text`.
* `ask` (only in `apply` / `check` beats) — `{ prompt, board, lookFor, onMiss }`. `board` is the question as written (no
  answer in it); `lookFor` is what a right answer contains; `onMiss` says how to help if it is wrong. The line's own
  `text`/`say` are the **answer**, written after the learner replies.
* `annotates` — marks up a row already on the board, in place (underline the 3 in 34 *where it is written*).
* `picture` — an optional reference to a stored board picture.

**Chalk marks** inside `text`: `{{text|style|label}}`. Styles `ul` (underline), `circle`, `box`, `hl` (highlight); colours
`y` yellow, `p` pink, `b` blue, `g` green (e.g. `{{30|ul.p}}`). Convention in the pilot lesson: pink = tens part, yellow =
ones part. Marks animate in as the line is written.

**Pace** (learner's choice): *slow* = smaller steps and more words per line, but never waiting; *steady* = the default
teacher flow; *quick* = straight to the point. Pace changes the instructions and the board's writing speed, never the content.

## 5. A live session, step by step

1. The page opens the voice WebSocket. The server resolves the mode (§6), loads the lesson with `getGuidedScript(conceptId)`
   and creates a `GuidedSession`. No lesson for this concept → it quietly runs the standard tutor.
2. The system prompt is the normal tutor prompt with its board block swapped for the guided one, and the tool list is swapped
   for the guided tools: `advance_beat`, `next_line`, `ask`/answer handling, `fill_slot`, `write_aside`, `resume_lesson`.
3. The tutor opens a beat; for each line the server writes it to the board and tells the tutor what to say
   (`"SPEAK NOW"` + the line's `say`). The browser receives `guided_state` snapshots and reveals items one at a time, **after**
   the audio already received has finished playing, so words and chalk stay in sync.
4. In `apply`/`check` beats an asked line first writes the **question** on the board (`Q.` in yellow) and tells the tutor to
   ask it aloud. The learner answers by voice; the tutor compares it with `lookFor`, then either writes the answer line or uses
   `onMiss` to help, and moves on.
5. If the learner asks something off the script, `write_aside` puts a short side-note on the board and `resume_lesson`
   returns to the exact line, so the lesson does not lose its place.
6. **Watchdog** (`server.ts`): the live model sometimes goes silent after a tool result. If nothing is heard for
   `GUIDED_STALL_MS` (9 s) the server sends a short "speak now" nudge (up to 3, spaced 7 s apart). Logged as
   `[guided] STALLED ... -> nudge n/3`.
7. As in standard mode, the observer, assessor and profiler still run on the conversation, so the learner model keeps
   learning from guided sessions.

## 6. Which mode runs

Order (first valid wins): `?tutor=` in the page URL (developer escape hatch) → `TUTOR_MODE` on the server → **guided**.
The Standard/Guided toggle is hidden (`SHOW_MODE_TOGGLE = false` in `mode.ts`); the screen shows a fixed **Mode: Guided** label
and the Pace buttons. `?tutor=standard` or `TUTOR_MODE=standard` restores the standard tutor for review.

## 7. Where lessons come from

| Source | How it is made | Where it lives | Served |
|---|---|---|---|
| Hand-written | by a person, e.g. the Grade-4 two-digit × single-digit pilot | `src/guided/scripts/*.json`, listed in `registry.ts` | bundled in the build |
| Generated, by command | `npm run guided:first-chapter` / `npx tsx scripts/generate-guided.ts …` | `src/guided/generated/*.json` + auto-written `index.ts` | bundled in the build (restart/rebuild) |
| **Generated at PDF upload** | automatic, see below | Firestore `guidedScripts` + `data/guided/runtime/*.json` | picked up by the running server within ~10 s, **no rebuild** |

Precedence for one concept: runtime > generated > hand-written.

### PDF upload → guided lesson (automatic)

After a curriculum PDF is published (`src/curriculum/pdfIngest.ts` → `afterPublish`):

1. `scripts/pregenerate-assets.ts` writes the standard lesson + board pictures per concept (unchanged).
2. When that finishes, `scripts/generate-guided.ts --curricula-file <snapshot> --subject <id> --runtime --skip-existing` runs
   in the background. For each concept **without** a guided lesson it builds the source from the stored record
   (`sourceFromCurriculum`), runs draft → validate → critic → repair (up to 4 drafts) and saves a lesson that passes to the
   runtime store. A lesson that fails is **withheld** (`data/guided/withheld/<conceptId>.json`, with the reasons) and that
   concept keeps the standard tutor — a bad lesson is never served.
3. `server.ts` re-reads the runtime store at most every 10 s (`refreshRuntimeGuided`), on `/api/tutor-mode`,
   `/api/guided-script` and each new voice session.

Switches: `DISABLE_PREGEN=true` skips both steps; `DISABLE_GUIDED_GENERATION=true` skips only step 2.
Cost: one guided generation is several Gemini calls (draft, critic, repairs) per concept, so a long PDF is a long, paid
background job. It needs Gemini credits; if every model is out of quota the run stops cleanly, keeps what it finished, and
the same command (or the next upload) resumes — finished concepts are skipped.

Manual runs: `npx tsx scripts/generate-guided.ts --concepts <id>,<id> [--force] [--runtime] [--dry-run]`.

## 8. The checks every lesson passes (`validate.ts`)

Errors (lesson not served): unknown beat kind or missing parts; board too long; a `say` that is too long; an `ask` outside
`apply`/`check` in generated lessons; an `ask.board` that contains the answer; a number that appears from nowhere in a beat;
a bad chalk mark or `annotates` target. Warnings (served, reported): questions in teaching beats of older hand-written
lessons, `say` that repeats the board, crowded beats. Generated lessons use the stricter `generatedRules`.

## 9. Testing

* `node tests/guided/generate.mjs` — generator, prompts, rules (all must pass).
* `npx tsx tests/guided/runtime.mts` — runtime store and registry merge.
* Validate one lesson by running `validateScript` (src/guided/validate.ts) on its JSON.
* `tests/guided/run.mjs` — older registry/validator checks; its "5 scripts (expected 4)" assertion and a later crash are
  stale (known, not caused by the mode change).
* Live behaviour (voice, stalls) can only be checked by running a session and reading `server-*.log` for `[guided]` lines.

## 10. Known limits

* The live voice model can stall or skip a spoken question; the watchdog reduces but does not eliminate this.
* Older hand-written lessons (mass/weight, 4-digit numbers, the Grade-8 ones) still ask questions inside teaching beats.
* A concept with no guided lesson runs standard, so "Guided" is the label only where a lesson exists.
* Guided generation depends on the stored standard lesson for its source; no record → no pictures, lower quality.
* Not yet evaluated against learning outcomes; evidence so far is validator results and live-session logs.

## Authored lesson library (2026-10-14)

30 guided lessons ship in `src/guided/scripts/` (`meta.source: "authored"`), all passing `validate.ts` with 0 errors:
all 15 Grade-4 Number/Measure concepts, 9 Grade-8 Mathematics concepts (ch1 linear graphs and simultaneous equations,
ch2 linear inequalities) and 6 Grade-8 Biology concepts (ch1; the course has one chapter). They follow the pilot's rules:
teach with no questions, ask only in apply/check beats, questions written on the board, no repetition. Where an existing
board picture matches the lesson's example it is referenced; otherwise the lesson is chalk-only. The old generated
horizontal/vertical-lines lesson was retired (`generated/index.ts` is empty) so the authored one is served. Not yet
exercised in live voice; uploaded PDFs still get Gemini-generated lessons (runtime store).

## Delivery rules (added after live test, 2026-10-14)
* A beat starts with `next_line`, never a spoken set-up sentence: the beat summary is background only. (The old set-up sentence made the tutor say the opening idea twice.)
* Each line is spoken from its scripted `say`, almost word for word, in one steady voice; no openers ("Great!"), recaps or second versions. Guided Live sessions use `GUIDED_TEMPERATURE` (default 0.3) to keep wording and tone the same line to line.
* Labelled chalk marks are given a minimum width so neighbouring labels (thousands / hundreds / tens / ones) cannot overlap.
* Regression test: `npx tsx tests/guided/voice.mts`.
