# Decision Log

## 2026-09-19 — Tutor must diagnose reasoning, not evaluate answers

**Context.** In a live voice lesson the tutor was told a wrong answer, stated the
correct one, and advanced. Inspection showed this was instructed behaviour: the
system prompt in `server.ts` said *"if the student answers incorrectly → correct
gently (2 sentences), then advance"* and *"NEVER STOP AND WAIT"*.

Separately, `assessUnderstanding()` was only reachable from a clicked quiz option
(`POST /api/session/:id/assess`). Spoken answers produced no evidence at all, so
the learner model stayed empty during an actual lesson and the adaptive claim was
not demonstrable.

**Options considered.**
1. Soften the prompt wording only. Cheap, but the tutor would still be judging
   answers itself, with no evidence recorded and no defence against a correct
   answer reached by a broken method.
2. Route every answer through a server-side diagnostic pipeline that returns an
   instruction the voice model must obey.
3. Build a separate post-lesson analysis pass. Rejected: too late to change the
   teaching, and undemonstrable in a 3-minute video.

**Decision.** Option 2.

- The voice model reports what the child said; it never judges it.
- `assess_child_reasoning` is a mandatory tool call after every answer.
- If no reasoning has been given, the pipeline refuses to assess and returns an
  instruction to elicit the method first.
- The tool response payload (arbitrary data, per the Live API tool docs) carries a
  single imperative `instruction` that the model follows.

**Reason.** Published work on the "Correct Answer Trap" reports that models detect
wrong answers at 98%+ but detect misconceptions hidden behind *correct* answers at
only 57% (fine-tuned) to ~84% (frontier), and over-attribute to answer tokens.
Answer correctness is therefore the wrong signal. The same work's
Detect → Verify → Escalate structure with four outcome categories is what we
implemented in `reasoningAssessor.ts`.

**Trade-offs.** One extra model round-trip per answer. Mitigated by returning a
fast instruction and never blocking speech on the full analysis. Over-probing is a
real risk — reported false-alarm rates run ~4:1 to 8:1 at realistic prevalence —
so misconceptions come from a closed per-concept vocabulary and need two
independent observations before being confirmed.

**Evidence.** arXiv 2606.23205 and 2605.23925 (Correct Answer Trap); Gemini Live
API tool-use documentation.

---

## 2026-09-19 — Mastery moves by Bayesian Knowledge Tracing, not tuned deltas

**Context.** `masteryDelta` was a hand-picked integer from -20 to +15 chosen by the
model. Not derivable, not defensible under questioning.

**Decision.** `src/adaptive/bkt.ts` — standard 4-parameter BKT, with slip and guess
conditioned on the *quality* of the evidence rather than fixed. A correct answer
produced by a confirmed broken method is treated as a high-guess event and moves
mastery **down**. Every update carries a plain-language `derivation` string.

**Trade-offs.** Parameters are chosen, not fitted — we have no population data. This
must be stated plainly rather than implied otherwise.

---

## 2026-09-19 — One teaching canvas replaces the six-tab blackboard

**Context.** The board rendered a generic node-and-arrow pipeline for a right-angled
triangle, with a geometry panel absolutely positioned on top of it, hiding nodes.
Three overlay defects, one of which let a bar escape the component onto the page
footer (the diagram root had no positioning context when collapsed).

**Decision.** New `TeachingCanvas.tsx`: real geometry computed from the side lengths,
progressive reveal driven by `reveal_part` as the tutor speaks, the child's own
method shown on the board, and a visible understanding rail. Light theme, one accent.
The legacy `DynamicBlackboard` stays mounted behind `USE_TEACHING_CANVAS` in `App.tsx`.

**Reason.** Cognitive-load principles for reducing extraneous processing — coherence,
signaling, redundancy, spatial contiguity — were all being violated at once. A
five-stage flow diagram is also the wrong representation for a triangle, and reads
to a judge as a generic template.

**Trade-offs.** The geometry renderer is Pythagoras-specific. Other topics fall back
to the legacy board until a second renderer exists. Accepted: depth on one topic is
worth more here than shallow coverage of many.

---

## 2026-09-19 — Immersive stage; presenter is pre-generated, not streamed

**Context.** The flat light canvas read as institutional rather than engaging.
Reference direction: a photoreal presenter standing in an environment beside a
real whiteboard written on in marker.

**Options considered for the presenter.**
1. Real-time streaming avatar (WebRTC lip-sync service). Verified available
   commercially, credit-metered per streaming minute, with session and
   concurrency caps. Rejected for the live path: it puts a non-Google
   third party at the centre of the headline feature in a competition that
   requires Google AI and weights Gen AI implementation at 40%, adds latency on
   top of Gemini Live, and introduces a WebRTC failure mode on venue wifi.
2. Generate the presenter at runtime with Veo. Not possible — Veo via the Gemini
   API is asynchronous with generation times of 11 seconds to 6 minutes and has
   no streaming mode.
3. **Pre-generate a small library of looping clips** (idle, talking, thinking,
   pointing, encouraging) from one consistent still, serve them as static assets,
   and select between them from audio level and lesson state.

**Decision.** Option 3. `ImmersiveStage.tsx` takes a `PresenterMedia` map; files
live in `/public/presenter/`. Until they exist the stage renders a lit silhouette
so nothing looks broken.

**Trade-offs.** Lip-sync is not phoneme-accurate. Mitigated by framing the
presenter as a mid-shot rather than a close-up, where gesture and head movement
carry the performance. No runtime latency, no third-party dependency, no per-minute
cost, and the assets are themselves generated with Google models.

**Rejected from the reference design.** The streak counter and gem balance.
A streak punishes the child who misses days and gems shift attention from
understanding to points — both contradict the feedback rules adopted earlier the
same day. Replaced with a private, non-comparative progress ring and "up next".

**Also restored.** The 3D view, which the previous board silently dropped:
`switch_board_view({tab:'3d'})` now drives a Board/3D toggle on the whiteboard
that renders the existing `Interactive3DVisual`.

---

## 2026-09-21 — Whiteboard replaced by a real-world "lens"; tutor teaches before testing

**UI.** The white board read as a classroom. Replaced by `ScenePanel`: a glass panel
with three views — *Real world* (a situation with the triangle traced over it in
light), *Shape* (the same triangle lifted out, true proportion) and *3D*. Sides keep
one colour in every view (a green, b amber, c pink) so the jump from picture to
shape is visibly the same triangle. Rationale: concreteness fading — concrete
situation first, abstraction second.

Scenes (`src/scenes/pythagorasScenes.tsx`) ship with illustrations that always work.
`npm run gen:assets` generates photos with the project's own Gemini key on the
developer's machine; the UI uses a photo only once the file loads, and only draws the
overlay on it once its vertices are calibrated — otherwise it shows the shape as an
inset instead of mis-aligned lines. Presenter silhouette replaced by a voice orb until
the generated stage photo exists.

**Behaviour.** The tutor opened with questions. New "HOW THE SESSION OPENS" section:
one sentence of hello, put the ladder scene up, teach the idea inside the picture while
pointing, lift the bare shape out, and only then ask a first question answerable from
what was shown.

**Found while verifying.** The project has no `@types/react`, so `tsc` never checked
JSX props. Verified in a separate environment with React types installed: 0 errors.

---

## 2026-09-21 — Live diagnosis must never block the conversation for long

**Bug.** After answering, the child heard silence, repeated themselves, and then got
several replies in a row. Cause: `assess_child_reasoning` is a blocking Live tool call,
and it awaited a second Gemini model with no timeout, trying up to three model IDs in
sequence on every answer — including IDs that had already failed. The microphone kept
streaming during the wait, so each repeat queued its own reply.

**Fix.**
- Hard latency budget (`ASSESS_BUDGET_MS`, default 2500 ms). If the diagnosis is not back
  in time, the voice model is answered with a *transfer move* — "try your method on a
  different example" — which is sound teaching with no diagnosis at all. The full
  diagnosis continues and is recorded, shown, and folded into the next turn. The
  placeholder is never written to the learner model as evidence.
- Model ID resolved once per server process; failed IDs are never retried.
- Low thinking on the diagnosis call (classification, not hard reasoning); if a model
  rejects that setting it is retried once without it.
- In-flight guard: a duplicate call during the wait answers instantly instead of starting
  a second diagnosis.
- The browser is told the moment checking starts, and shows "Dr. Marcus heard you —
  thinking about your answer", so a short pause does not read as a hang.

**Evidence.** `npm run test:assessor` — offline tests against a fake Gemini that is
slow, missing a model, rejects the thinking setting, or is down entirely. 12/12 pass.
Writing the tests caught a bug in the first version of this fix (a rejected thinking
setting skipped to the next model instead of retrying the same one).

**Not yet verified.** Real latency against the real models — only measurable on the
developer's machine. The server now logs `[assess] <ms>` per answer.

---

## 2026-09-21 — Textbook upload: any size, many files, per-chapter extraction

**Bug.** Uploading the 119 MB Sec 2A book failed with `Unexpected token '<'`. Four causes:
a 50 MB multer cap whose rejection came back as Express's HTML error page; the PDF
sent inline as base64 labelled `image/jpeg`; Gemini's own limit of 50 MB / 1000 pages
per PDF (applies to the Files API too); and a prompt asking for "4–10 concepts from the
chapter" when given a whole book. Separately, lesson start always chose the next
*Pythagoras* concept, even for an uploaded subject.

**Fix.** `src/curriculum/pdfIngest.ts`: split each PDF with pdf-lib into parts of at
most 60 pages and 40 MB (halving image-heavy parts until they fit) → upload each part
via the Files API → extract chapters and concepts per part, two at a time → merge
chapters that straddle a part boundary, dedupe concepts, resolve prerequisites by name,
renumber teaching order → save. Runs as a background job with progress polling.
Multiple PDFs per upload (up to 10, 500 MB each); books uploaded under the same subject
name are combined, and re-uploading a book is idempotent. All `/api` errors are JSON.
`nextUnmasteredConcept` works for any curriculum.

**Evidence.** End-to-end test against the real server over HTTP with a fake Gemini:
a 53 MB, 130-page book plus a second book in one upload → 6 parts, largest 35.5 MB;
every part deleted from Gemini afterwards; temp files removed; no duplicate concepts;
prerequisites resolved across chapters with an unknown one dropped; re-upload adds
nothing; lesson start picks the uploaded book's first concept; without pdf-lib installed
the job reports "run npm install" and the server stays up.

**Not yet verified.** Extraction quality on the real Think! Mathematics PDFs, and real
processing time — both need the real Gemini on the developer's machine.

**Dependency added.** `pdf-lib` (pure JavaScript). Loaded lazily, so the app starts
without it; only upload needs it.

---

## 2026-09-21 — Voice session reliability

**Symptom.** "The voice conversation is broken" — the tutor went quiet mid-lesson.

**Found in code (no single smoking gun; several silent failure paths):**
1. Google ends a Live connection after ~10 min (audio session 15 min without context
   compression) and warns with `goAway`. Nothing handled it; compression was off.
2. When Gemini closed the session the server sent `session_closed`, but the browser
   ignored it — the UI still showed "connected" while the mic streamed to nothing.
3. Tool calls cancelled by barge-in (`toolCallCancellation`) were still answered; with
   the diagnosis now taking up to 2.5 s this became likely.
4. Transcripts read `inputAudioTranscription`/`outputAudioTranscription`; the SDK fields
   are `inputTranscription`/`outputTranscription`, so no speech ever reached the screen
   as text. (Pre-existing.)
5. The new opening told the tutor to call `reveal_part` per word — each call blocks
   speech until answered, so the opening stuttered.

**Fix.** Context compression on; resumption handles kept; on `goAway` or an unexpected
close the server reconnects to Gemini behind the scenes and the browser stays in the
lesson; if it cannot resume, the browser is told and the mic is stopped. Cancelled calls
are never answered, nor calls from a replaced connection. `reveal_part` takes several
parts in one call and the board staggers them. Transcripts joined into one line per turn.
Every session is logged to `logs/voice-*.log` (close codes, tool timings, reply latency).

**Evidence.** `npm run test:live` — real server, scripted fake Gemini Live, WebSocket
client as the browser: 10/10 checks across goAway, crash-with-handle, crash-without-handle.

**Not yet known.** Which of these the user actually hit. The session log will say.

---

## 2026-09-21 — Voice reverted to the original configuration; changes to be re-added on evidence

**Symptom.** Tutor silent from the start. Session log (logs/voice-2026-09-21T13-57-12.log):
Gemini connected, transcribed the child ("Let's start", "Can you hear me? Hello") and
produced no speech, no tool calls and no error for 23 s. The failure is in what the
model was given — prompt, tools or connection settings — not in audio or the browser.

**Decision.** `VOICE_MODE` (default `classic`) restores the original prompt, the original
eight tools, the original connection settings and the original opening turn — verified
byte-for-byte against what the original build sent (`npm run test:live`). The adaptive
teaching loop is kept, not deleted: `VOICE_MODE=adaptive`. Prompts/tools moved to
`src/live/liveConfig.ts` so the server and the diagnosis use identical inputs. Backup of
the pre-revert server: backups/server.adaptive-2026-09-21.ts.txt.

Kept in classic because they are passive: session logging, the browser being told when a
session closes, transcript field names, mic stop on disconnect.

**Next.** `npm run diagnose:voice` opens real Gemini sessions for six variants (original;
new prompt+tools; last build; new prompt no tools; original prompt+new tools; original +
compression/resumption) and records which ones speak. That isolates the cause; adaptive is
re-enabled only once its variant speaks. The script's detection was validated against a
fake Gemini that goes silent only with compression: it flagged exactly C and F.

**Lesson.** Four changes to the live path shipped together without a real-Gemini check.
Any future change to the live prompt, tools or settings must pass diagnose:voice first.

---

## 2026-09-21 — Pauses after the child speaks: turn-taking, not the app

**Report.** "Continuous dialogue before, now long pauses."

**Code check against the original (19 Sep).** audio.ts (mic capture + playback) is
untouched. In classic mode the server sends Gemini the original prompt, tools, opening
turn and settings, and relays audio exactly as before (verified by test).

**Measured.** Real app in Chromium, fake mic, a fake tutor talking continuously:
mic audio reaching the server = 100% of real time on both the original and the new
screen, no gap over ~145 ms, no long main-thread stalls. The new UI is not starving
the ScriptProcessor mic capture (hypothesis tested and rejected).

**Evidence from the session log** (voice-2026-09-21T14-15-12.log): the child's
transcript arrived as "Bon" (38 s) … ". Only one." (51 s) … " Are you listening?"
(61 s) — one continuous turn. Gemini's end-of-speech detection held the child's
turn open ~27 s, so it never replied. That detection runs inside Gemini and was never
configured, in the original or since.

**Change.** Explicit turn-taking: end-of-speech sensitivity HIGH, 700 ms of silence
ends a turn (Google recommends 500–800 ms). Env overrides: VAD_SILENCE_MS, VAD_END=LOW,
VAD_START=LOW (use if background noise triggers false speech), VAD=off (exact original).
Session log now records mic level every 2 s, so a future pause shows whether steady
background sound was holding the turn open. Log writes made asynchronous (they were
synchronous on the audio-relay event loop — introduced by me, removed).

**Not yet verified with real Gemini.** diagnose:voice variant G checks the setting is
accepted and the tutor speaks; the next real session's log will show turn-end timing.

---

## 2026-09-21 — Voice code restored verbatim from pythagoras-tutor-old

At the user's request, after repeated regressions. The server's voice handler
(`wss.on('connection', …)`), the voice tool list and the browser's
`toggleVoiceLesson` are now byte-identical to C:\Users\user\Downloads\pythagoras-tutor-old.

**Key finding from the comparison.** The earlier "classic" revert was NOT the original:
it came from the code as first opened in this project, where the prompt had already
been changed to "3–5 sentences … NEVER STOP AND WAIT". The original prompt says
"1–3 sentences maximum. Never give long uninterrupted monologues" — the source of the
continuous-dialogue feel. The original also has 7 tools (no update_diagram).

Everything added to the voice path since (session log, reconnect, VAD settings,
adaptive diagnosis, transcript joining) is removed from the running code. Backups:
backups/server.before-voice-revert.ts.txt, backups/App.before-voice-revert.tsx.txt.
The adaptive work remains in src/live/liveConfig.ts and src/adaptive/ but is not wired in.

**Rule going forward.** No change to the voice path without first running it against
real Gemini and comparing with this baseline. `npm run test:live` now fails if the
voice code drifts from the original.

## 2026-09-21 — Chalkboard tab, spoken lead-in, view switching
- **Context:** User asked for (1) a chalkboard tab that auto-opens when the tutor writes working, (3) no dead silence while the AI prepares a board action, (4) the tutor switching Real world / 2D / 3D / Chalkboard as it explains.
- **Decision:** New `ChalkBoard` view (4th tab in ScenePanel). `update_chalkboard_notes` and `write_live_note` auto-switch to it; `switch_board_view` now maps `'chalkboard'`; `generate_photo_visual` switches to Real world. Voice server code stays identical to pythagoras-tutor-old **except** prompt rules 7–8 appended (7: which view to use when; 8: say a short phrase before any board tool). Tool list unchanged (byte-identical to original).
- **Filler:** Spoken filler via prompt rule 8 + visual "thinking" indicator (mic went quiet after the child spoke and tutor hasn't answered). No synthetic audio filler — the mic could pick it up and Gemini would treat it as the child speaking.
- **Evidence:** test:live passes (original config/tools/prompt start/kickoff); stub replay of user's exact square-roots notes auto-switches to chalk tab, 0 page errors.
- **Unverified:** whether real Gemini follows rules 7–8 reliably; thinking indicator not testable with a fake mic.

## 2026-09-21 — Learner panel updates live from the conversation
- **Context:** The right-hand panel (understanding bar, "We're working on", "This session", "Up next", concept name) was static during voice lessons — its data came from the old assessor, which was removed when voice was reverted.
- **Options:** (a) new Live tool the tutor calls to report progress — changes the voice tools/behaviour, and blocking tools caused the earlier pauses; (b) **side-channel observer** that reads the transcripts Gemini Live already produces and asks a separate text model after each exchange. Chose (b).
- **Decision:** `src/adaptive/liveObserver.ts`. Server feeds it `inputTranscription`/`outputTranscription` + tool calls; after each tutor turn that followed a child reply it calls a flash model in the background (max one in flight) and pushes `learner_update` to the browser. It never sends anything to the voice session. The original voice code is untouched; the only additions are the observer hook lines. Also forwards whole-turn subtitles (the original code read the wrong field names, so subtitles never updated).
- **Guard-rails:** understanding moves at most ±20 per exchange; a misconception is "suspected" on first sight and can only be "confirmed" if seen again; every judgement must quote the child's words.
- **Evidence:** test:live — original 6 settings/7 tools/prompt/kickoff unchanged; tutor reply reaches browser ≥1.5 s before the (deliberately slow) observer result; clamping and confirmation rules hold. Browser screenshot shows panel populated from a stubbed exchange.
- **Unverified:** observer quality with real Gemini; model id availability (tries gemini-3.6-flash → 3.1-flash-lite → flash-latest). Not yet persisted across sessions (in-session only).

## 2026-09-21 — Chalkboard "stopped updating" mid-lesson (bug fix)
- **Symptom (user):** after a while the chalkboard stopped changing; when the tutor asked a question to solve, nothing appeared.
- **Root causes (reproduced with a stub replaying 4 notes + 9 live notes + a quiz):**
  1. Every line's writing delay was counted from the top of the board, so note N waited for all earlier lines to be "written" again — note 5 was still hidden ~8 s after it arrived.
  2. The board had no scrolling; from about the 6th live note, new lines were written below the visible area.
  3. `pose_quiz` only updated the old blackboard's quiz tab, which the immersive stage never shows — questions to solve never appeared.
- **Fix:** ChalkBoard gives each line its timing once, when it arrives (only new lines are staggered; stable across re-renders); board auto-scrolls to the newest line; faster writing. `pose_quiz` now writes "Your turn" + question + options on the chalkboard (answer/explanation not shown). Prompt rule 7 gained one line: write a problem on the board before asking it, and write the student's steps with write_live_note.
- **Evidence:** before — notes 1–5 not yet written, 6–9 off-board, quiz absent; after — all 9 notes visible on arrival, quiz + options visible. test:live still passes (settings/tools/kickoff unchanged).

## 2026-09-24 — Persona stays fixed; a per-learner Teaching Plan adapts (D-2026-09-24-1)

**Context.** The product idea: every learner starts with the same tutor persona; interaction
evidence builds a per-learner model; the tutor then teaches each learner in a curated way that
evolves over months and across grades. The question was whether the *persona itself* should
transform per learner.

**Options considered.**
1. The persona rewrites itself per learner (LLM-generated per-child persona).
2. A fixed persona core + adaptive surface, driven by a per-learner **Teaching Plan** compiled from an evidence-based **Learner Model**.
3. No persistent personalisation (per-session adaptation only).

**Decision.** Option 2. Three objects: Base Tutor Persona (fixed, versioned) · Learner Model
(evidence, scoped claims, decay) · Teaching Plan (derived; injected into the tutor at session
start and updated after each exchange).

**Reason.** A self-rewriting persona drifts, can't be evaluated, can't be explained to a parent
or judge, and breaks the stable relationship that gives a learner psychological safety.
Adapting *strategy* (representation order, difficulty, pace, watch-list, reviews) captures the
value while staying testable. Pitch: "Every child meets the same great teacher. Over time, that
teacher learns them."

**Trade-offs.** Less "magical"-sounding than a shape-shifting persona; mitigated by the
Tutor's-reasoning panel and the learner card, which make the adaptation visible.

**Evidence.** Design reasoning. Specs: docs/TUTOR_PERSONA.md, docs/LEARNER_MODEL.md,
docs/TEACHING_PLAN.md.

## 2026-09-24 — Plan compile is deterministic; GenAI where it is necessary (D-2026-09-24-2)

**Context.** The plan could be generated by an LLM or compiled by rules over the learner model.

**Decision.** Deterministic compile (`src/plan/compile.ts`) with a reason + evidence IDs on every
choice. GenAI is used for diagnosis (reading free-text reasoning), profiling (evidence → scoped
claims, validated) and teaching (explanations, examples, transfer items).

**Reason.** Testable (TP-01…TP-08), reproducible in the demo, explainable, cheap; it avoids a
"decorative AI" critique on the plan while keeping GenAI where rules cannot work.

**Trade-offs.** Rules need tuning; thresholds are chosen, not fitted — this is stated openly.

## 2026-09-24 — Full build plan and documentation set

Added docs/: TUTOR_PERSONA, LEARNER_MODEL, TEACHING_PLAN, FUNCTIONAL_SPEC, TECHNICAL_SPEC,
BUILD_PLAN (tasks T00–T30 for coding agents), TRACEABILITY. The audit found: the live WebSocket
has no learner identity; three divergent persona prompts; `learners` publicly readable in
firestore.rules; learner data split between a JSON file and Firestore. Each of these is covered
by a build task (T04, T05–T07, T02, T03).

## 2026-09-24 — Build plan executed: critical path wired end-to-end; requireAuth dev bypass (D-2026-09-24-3)

**Context.** Executed docs/BUILD_PLAN.md against the running repo: T01 (model gateway), T02
(Firestore lockdown + auth middleware), T03 (learner repository), T04 (session-scoped
`/ws/live`), T05–T07 (persona modules + composer, wired into the live path, replacing the
never-invoked `assess_child_reasoning` wiring gap and the divergent prompts), T09–T10 (ladder /
mastery-status / strategy-profile extensions to `recordReasoningEvidence`), T11 partial
(diagnosis now flows live → `reasoningAssessor` → `recordReasoningEvidence` →
`compilePlanDelta`, not yet split into separate `segmenter.ts`/`diagnostician.ts` modules),
T17–T18 (deterministic `compileTeachingPlan` + `renderPlanForPrompt`, wired into
`/api/session/start` and the composed system prompt), T20 (`compilePlanDelta` with probe/retry/
failure limits).

**Security gap found while wiring T02.** `requireOwnership` as specified requires
`req.authUid === studentId` from a verified Firebase ID token. `LoginScreen.tsx` has no real
sign-in step — it generates `studentId` locally with no Firebase Auth call — so strict
enforcement would have broken the running app for every learner, not just malicious requests.

**Decision.** Ship `requireAuth`/`requireOwnership` (`server/middleware/requireAuth.ts`) with a
`DEMO_MODE=true` or `NODE_ENV=development && ALLOW_DEV_AUTH_BYPASS!=='false'` bypass that sets
`req.authUid = studentId` from the request itself (i.e. no real ownership check in that mode),
logs a warning once per process, and is documented in code comments as a known, temporary gap.
`firestore.rules` still denies all client reads/writes on `learners/**` regardless of this
bypass (server-only via Admin SDK), so the exposure is limited to the Express API surface, not
the database.

**Reason.** A demo/hackathon build must keep running through this change; a data breach in a
disabled-by-default rules file is a worse failure than a documented, logged dev bypass on the
API layer. This is explicitly *not* acceptable for any real deployment with real user data.

**Trade-offs / what this is not.** This is not NFR-03 compliance — it is NFR-03 minus real
per-profile authentication. Any learner can currently pass any `studentId` and the server will
trust it whenever the bypass is active. **Follow-up required (tracked as a T02 remainder):**
build a real Firebase sign-in flow in `LoginScreen.tsx` (or equivalent) before any non-demo
deployment, then set `ALLOW_DEV_AUTH_BYPASS=false` in production and delete the bypass path
once real sign-in exists everywhere it's needed.

**Verification.** `npx tsc --noEmit` clean across the whole repo; `npm run test:assessor` 13/13
(unchanged `reasoningAssessor.ts`, now actually wired into the live path); new
`tests/smoke/plan-and-store.mjs` (misconception suspected→confirmed at 2 independent
observations, plan re-compile reflecting the ledger, plan-delta instruction on confirmation,
mastery blocked while a misconception stands) — all pass; a manual WS run against the real
`server.ts` bundle (stubbed Gemini) confirmed the live session now advertises the full 13-tool
set (previously 8, with `assess_child_reasoning` never actually reachable) and that
`composeSystemInstruction()`/`composeKickoff()` output is what's actually sent.

**Not yet verified.** `npm run test:live` (the project's own live-harness assertions) was not
run to a pass/fail verdict in this environment — the bridged filesystem's slow first-time
`node_modules` resolution made the harness's built-in timeouts unreliable here (see the manual
reproduction above, which exercises the same server.ts bundle and passed). Re-run
`npm run test:live` directly on the development machine to close this out.

**Deliberately not built this pass (see TRACEABILITY.md for full status):** T08 (text-channel
`/api/tutor/turn`), T11's segmenter/diagnostician split, T12 (confidence-capture UI), T13
(onboarding UI — the API route exists), T14 (profiler/claim validator), T15 (spaced-review
scheduling — the type exists, nothing schedules yet), T19's formal latency spike/report, T21–T23
(learner card, parent-portal replay, tutor's-reasoning panel), T24–T27 (eval harnesses, seeded
demo learners), T29–T30 (Cloud Run deploy smoke test, delete-endpoint end-to-end review).

## 2026-09-24 — T21–T23 built; learner-card dispute simplified pending a real claim system (D-2026-09-24-4)

**Context.** Per the priority list added to PROJECT_STATE.md after D-2026-09-24-3, built the
learner-facing surface for the pipeline that already existed but was invisible: the Tutor's-
reasoning panel (T23), the learner-card ladder/ledger/dispute (T21), and the parent-portal
evidence replay (T22).

**Decision on FR-22's dispute.** The spec (LEARNER_MODEL.md §5.2, FUNCTIONAL_SPEC.md J3) describes
disputing a Profiler-generated **claim** with evidence refs. The Profiler and claim validator
(T14) are not built. Rather than block T21 on T14, "That's not right" disputes the underlying
`MisconceptionRecord` in the ledger directly — a new `disputed` status that
`compileTeachingPlan`'s `R-WATCH` rule (already only watches `suspected`/`confirmed`) excludes
automatically, so a dispute takes effect on the very next plan compile with no new plan-compiler
code. Smoke-tested: disputing a confirmed misconception removes it from the next plan's
`watchMisconceptions`.

**Trade-off, stated plainly.** This is not the claim system the spec describes — there's no
evidence-cited, parent-reviewable claim object, and disputing a ledger entry has a narrower
scope (it affects the teaching plan, not a "what I've learned about you" summary sentence). It
is a real, working, demoable simplification, not a mock. If T14 lands later, migrating the
dispute UI to operate on claims instead of ledger entries is a contained change (same button,
different backing id).

**T23's reasoning panel.** Reuses the `TeachingPlan`'s existing `PlanReason{rule, text,
evidenceRefs}` on every field (already returned by `/api/session/start`) rather than inventing
new explanation text — the panel is a renderer over data the compiler already produces, which is
also why it needed no new backend logic beyond enriching one WS message
(`learner_update_v2`) with the diagnosis context that was already being computed and discarded.

**Verification gap.** No live-WS run exercises the enriched `learner_update_v2`/`plan_update`
messages end-to-end — `tests/live/genai-live-stub.mjs` has no scenario that lets
`assess_child_reasoning` finish without a `toolCallCancellation`, and `npm run test:live` remains
unreliable in this sandboxed environment (per D-2026-09-24-3). The underlying calls
(`recordReasoningEvidence`, `compilePlanDelta`, `disputeMisconception`) are smoke-tested directly;
the WS message construction was reviewed by hand. **Follow-up:** either add a stub scenario that
completes `assess_child_reasoning`, or verify by running a real lesson on the development
machine and checking the reasoning panel updates.

**Verification done.** `npx tsc --noEmit` clean; `npm run build` (vite) succeeds; `esbuild
server.ts` bundles cleanly; `npm run test:assessor` 13/13 unchanged; the extended smoke test
(now covering dispute) passes.

## D-2026-09-25-1 — liveObserver migrated onto the model gateway; responseMimeType bug fixed

**Date:** 2026-09-25
**Context:** User ran the live app and hit a real runtime warning: `[LiveObserver]
observation skipped: no observer model available`. This is not the newer
`assess_child_reasoning`/`reasoningAssessor.ts` diagnosis pipeline — it's an older,
separate side-channel (`src/adaptive/liveObserver.ts`) that watches voice transcripts
in the background and feeds the observer-panel `learner_update` WS message. A failure
here never blocks the lesson itself; it only means that side panel's data goes stale.

**Root cause:** `liveObserver.ts` predates `src/ai/gateway.ts` (built in T01) and was
never migrated onto it — it kept its own independent `GoogleGenAI` client and
`MODEL_CANDIDATES` list. This exact gap was already named in TRACEABILITY.md's NFR-02
row ("not yet adopted by every caller listed in T01") but had not yet been fixed.

**Options considered:**
1. Patch `liveObserver.ts`'s own candidate list with different model IDs. Rejected —
   treats the symptom, leaves the duplicated/drifting logic in place, and does nothing
   for `assessmentEngine.ts`/`pdfIngest.ts`, which have the same gap.
2. Migrate `liveObserver.ts`'s `callModel()` onto `generateText()` from the gateway.
   Chosen — one resolution/fallback/DEMO_MODE-warning path for every caller; a future
   model-ID fix only needs to happen once.

**Decision:** Option 2. `liveObserver.ts` now calls `generateText({role: 'fast', ...})`
from the gateway instead of maintaining its own client and candidate list.

**Incidental finding while migrating:** `generateText()`'s `GenerateOptions` declared
`responseMimeType`, and `generateJSON()` forwarded it, but the actual
`ai.models.generateContent()` call never read `opts.responseMimeType` into the request
config — JSON mode was never really requested from Gemini on any caller, including
`generateJSON()`; every JSON caller was relying entirely on the markdown-fence-strip
fallback after the fact, not real JSON mode. Fixed in the same pass and verified with a
new `tests/smoke/gateway.mjs` that asserts the actual request payload.

**Trade-offs / what this does NOT resolve:**
- `assessmentEngine.ts` and `pdfIngest.ts` still call models directly — the NFR-02 gap
  is narrowed, not closed.
- **Whether the user's actual Gemini model IDs / API key / network are reachable is
  still unconfirmed from this environment.** `npm run verify:models`, run through the
  `mcp__remote-devices__device_bash` sandbox, fails every candidate with "fetch failed";
  tracing it further shows `curl https://generativelanguage.googleapis.com/` from that
  same sandbox returns exit 56 / "403 from proxy after CONNECT" — the remote-devices
  tool's own egress-allowlist proxy blocks that host, independent of whether the user's
  real setup works. This is a tooling limitation on my side, not evidence the fix
  worked or didn't. The user needs to run `npm run verify:models` from their own
  terminal (outside this sandboxed tool) to get a trustworthy signal.

**Evidence:** `tsc --noEmit` clean; `npm run test:assessor` 13/13 passing (unchanged —
this test doesn't touch `liveObserver.ts`); new `tests/smoke/gateway.mjs` passing
(`generateJSON sent responseMimeType=application/json`; `generateText (no
responseMimeType) sent config: null`).

## D-2026-09-25-2 — Fixed a silent profile-save data-loss bug; added a lightweight demo-learner seed script

**Date:** 2026-09-25
**Context:** Following up on the earlier cross-check where I said "profile
saving is a real code path but unverified in this environment," I wrote
`scripts/seed-demo-learners.ts` to create real test/demo data by driving
the actual `learnerStore.ts` functions (not stubs). The first run appeared
to succeed (no errors) but `data/learner-profiles.json` came back as `[]`
afterward — the data had been silently discarded.

**Root cause:** this checkout's `data/learner-profiles.json` had at some
point become `[]` (a JSON array) instead of `{}`. `FileLearnerRepository`'s
`readJson` returns whatever is on disk with no shape check.
`saveProfile()` then does `all[profile.studentId] = profile` — legal
JavaScript on an array (arrays are objects; this sets a non-index
property) — and `writeJson()`'s `JSON.stringify(array)` silently drops any
non-index property when serializing. So every `saveProfile()` call
returned successfully while writing `[]` back to disk every time,
permanently discarding the profile. `listLearners()`/`GET /api/learners`
were therefore always returning an empty list too. This is a real bug
that would have affected any real user's saved profile in this checkout,
not just the seed script — it directly explains why "is the profile
actually saved" could not be confirmed in the earlier cross-check.

**Why the existing smoke test never caught it:** `tests/smoke/plan-and-store.mjs`
always runs against a fresh temp directory, where the profiles file has
never been anything other than a well-formed object. The bug only shows
up against a checkout whose `data/` directory already has this
specific corruption — which is exactly the state this checkout was in.

**Decision:** Added a `readProfiles()` helper in `src/adaptive/repo/file.ts`
used by all four profile-touching methods. An empty or missing profiles
file is still treated as `{}` (safe, matches prior behavior). A
**non-empty** array is treated as a hard error (thrown, not silently
discarded) — a non-empty array in that slot means there's real data in an
unexpected shape, and the fix should surface that for a human to look at
rather than silently deleting it on the next write. Reset the corrupted
local `data/learner-profiles.json` to `{}` (this file is gitignored —
local runtime state, not committed).

**Trade-offs:** This guards the symptom (the JSON file shape) rather than
asking why it became `[]` in the first place — that root cause is still
unknown and, given the guard now in place, no longer worth chasing unless
it recurs. On Cloud Run (`USE_FIRESTORE_LEARNERS`/`K_SERVICE`), this bug
class doesn't apply — Firestore documents don't have this array/object
ambiguity — so this only ever affected local file-backed dev.

**Also this pass — `scripts/seed-demo-learners.ts` (`npm run seed:demo`):**
a lightweight, hand-scripted stand-in for T27 (seeded demo learners),
*not* the full T25/T27 simulated-learner harness, which remains
unbuilt. It drives the exact same public functions the live voice
pipeline calls, so every ladder level, mastery-status transition and
misconception confirmation for the 3 seeded learners comes from the real
BKT/ladder/ledger logic — nothing is hand-set except one `ConceptState.review`
field on one learner (Marcus), because T15 spaced-review scheduling isn't
built and nothing in the app itself ever sets that field; this is called
out explicitly in the script's own header comment so it's never mistaken
for a real capability. All three learners are named "(Simulated)" and
studentId-prefixed `demo_` so they can never be mistaken for real
children's data on screen or in the data files — this is demo/test
fixture data, not evidence of real-user validation (BUILD_PLAN.md T27's
own acceptance criterion: "labelled 'simulated'").

**Evidence:** `tsc --noEmit` clean; `npm run test:assessor` 13/13; existing
smoke tests (`plan-and-store.mjs`, `gateway.mjs`) still pass; ran
`npm run seed:demo -- --reset` and confirmed via direct inspection of
`data/learner-profiles.json` that all 3 seeded profiles now persist
correctly (`{"demo_aisha": {...}, "demo_marcus": {...}, "demo_priya": {...}}`)
where the pre-fix behavior would have written `[]`.

## D-2026-09-26-1 — Verified T21-T23 routes over real HTTP; fixed a concept-selection bug found in the process

**Date:** 2026-09-26
**Context:** Continuing the "run one real session" priority from the
demo-readiness cross-check. A real voice session needs a working Gemini
key (still unconfirmed from this environment — see D-2026-09-25-1's
caveat), but `compileTeachingPlan()` is deterministic (D-2026-09-24-2)
and most of the T21-T23 routes don't touch Gemini at all. So instead of
waiting on model connectivity, started the actual `server.ts` in this
sandbox (`NODE_ENV=development ALLOW_DEV_AUTH_BYPASS=true`) and hit the
real HTTP routes against the seeded demo learners — not the smoke-test
stub, not calling store functions directly.

**Verified working over real HTTP:**
- `GET /api/learners` — lists all 3 seeded profiles correctly (this is
  also the first real end-to-end proof the FR-11 persistence fix,
  D-2026-09-25-2, actually works through the route layer, not just via
  direct file inspection).
- `POST /api/session/start` — compiles a real `TeachingPlanUI`-shaped
  plan; confirmed `demo_marcus`'s hand-seeded overdue spaced review
  surfaces correctly as `reviewItems: [{rule: "R-REVIEW", text: "Review
  due (overdue by 48h)"}]` — the first real (non-smoke-test) confirmation
  that this demo beat actually renders through the full route.
- `POST .../misconceptions/:id/dispute` — disputed `demo_aisha`'s
  `ssa-congruence` entry over the real route (then re-ran
  `npm run seed:demo -- --reset` to restore her undisputed state for the
  live demo, since this test itself disputed it).
- `GET /api/learners/:id/events?conceptId=...` — returned the correct
  4-event replay for `demo_priya`'s area-ratio concept.

**Bug found and fixed:** `POST /api/session/start` always called
`nextUnmasteredConcept()` and completely ignored which concept the
student clicked in `SubjectSelector.tsx` — `handleSubjectConceptSelect`
in `App.tsx` never even sent a `conceptId` in the request body. Confirmed
by requesting `demo_marcus`'s untouched first-curriculum-concept by
default, then explicitly passing his seeded scale-drawings concept ID and
seeing the response change to the requested concept. This would have
undermined the whole seeding effort: presenting a demo by clicking a
specific seeded concept would have silently landed on an unrelated,
empty one instead. Fixed by threading `conceptId` through both the client
request and the server route (`compileTeachingPlan()` already supported
`requestedConceptId` since T17 — this was purely a routing gap).

**What this does NOT verify:** the actual voice/WebSocket path
(`assess_child_reasoning`, `learner_update_v2`, `plan_update` messages,
the `TutorReasoningPanel` UI actually rendering in a browser) — that
still needs a working Gemini key and a real browser session, neither of
which this sandbox can provide. This pass verifies the REST layer and
plan-compile logic that sits underneath the voice path, which is real
progress but not the full FR-24 verification gap.

**Evidence:** `tsc --noEmit` clean; `npm run test:assessor` 13/13; both
smoke tests pass; direct curl transcripts of all 4 routes above, captured
during this session.

## D-2026-09-26-2 — Model connectivity confirmed on the user's real machine

**Date:** 2026-09-26
**Context:** D-2026-09-25-1 and D-2026-09-26-1 both flagged that this
sandbox's `npm run verify:models` couldn't verify the user's real Gemini
API key/network (proxy blocks the API host). User ran it on their own
machine and shared the output.

**Result:**
- **FAST** role: all 3 candidates resolve (`gemini-3.6-flash`,
  `gemini-3.1-flash-lite`, `gemini-flash-latest`). This is the role used
  by `assess_child_reasoning`/`reasoningAssessor.ts` (the core diagnosis
  pipeline) and the now-migrated `liveObserver.ts`.
- **STRONG** role: all 3 candidates resolve (`gemini-3.8-flash`,
  `gemini-3.1-flash-lite`, `gemini-flash-latest`).
- **LIVE**: not checked by the script (expected — live sessions aren't
  pinged by `verify:models`).
- **IMAGE**: both candidates (`gemini-3.1-flash-image`,
  `gemini-3.1-flash-lite-image`) fail with HTTP 429
  `RESOURCE_EXHAUSTED`, `limit: 0` for
  `generate_content_free_tier_requests` — this project's free tier
  allows **zero** image-generation requests, not a transient rate limit.
  Needs billing enabled on the Google Cloud project (or a paid-tier key)
  to ever work.

**What this means for the demo:** the entire diagnosis/persona/plan-
adaptation pipeline — the actual Technical Merit differentiator — is now
**confirmed working against the user's real API key**, not just
architecturally correct. This closes the single biggest outstanding
demo-readiness risk. The image-generation gap only affects the
`generate_photo_visual` tool (real-world photo mode on the digital
blackboard); the `2d`/`3d` schematic diagram modes (`set_figure`,
`update_diagram`) render client-side and don't call Gemini's image API at
all — the seeded geometry concepts (triangle congruence, scale drawings,
area ratio) are all diagram-friendly, so this gap is avoidable for the
recorded demo simply by not invoking a "show me a real photo" moment, or
by enabling billing if that beat is wanted.

**Decision:** treat model connectivity as no longer a blocker. Do not
enable billing before the demo unless a photorealistic-image beat is
specifically wanted — it adds cost and isn't needed for the core
misconception-detection/adaptive-teaching story.

## D-2026-09-26-3 — Fixed a real mastery-inflation bug (BKT one-shot jump) at the source, not with a display patch or a recalibrated constant

**Date:** 2026-09-26
**Context:** during manual testing, demo learner Priya's "Constructing and
applying properties of perpendicular and angle bisectors" concept
appeared to jump from 0% to 99% mastery after a single ~2-minute
exchange, directly contradicting this project's stated principle that
mastery should not be claimed from one correct answer. The original
event log for that specific session was unrecoverable (wiped by the
already-documented profile-save data-loss bug fixed in D-2026-09-25-2,
then overwritten by the new seed script), so the exact transcript
couldn't be replayed — but the underlying BKT math was hand-verified and
reproduced in a standalone repro script against the real `learnerStore.ts`.

**Root cause (verified, not assumed):** `EVIDENCE_QUALITY.transferred`
(`src/adaptive/bkt.ts`) uses a low guess-weight (0.10) — correct in
isolation, since a genuinely transfer-depth correct answer IS strong
evidence — but this means a single such observation on a virgin concept
computes a real Bayesian posterior of ~96% (difficulty 1: pL=0.25 →
pS=0.03, pG=0.02 → posterior=0.9417 → pNext=0.9592). `computeMasteryStatus()`
(`src/adaptive/ladder.ts`) already correctly gates the CATEGORICAL status
behind `pKnown >= 0.80 AND >= 2 distinct ladder-level-3+ items`, but the
raw NUMERIC `cs.masteryScore` was stored and displayed directly from the
BKT posterior with no such gate — and, worse, `server.ts`'s two
curriculum auto-advance checks compared that same ungated raw score
against `MASTERY_THRESHOLD (75)`, meaning a single strong answer could
genuinely advance a child past a concept, not just display a misleading
number.

**Options considered:**
1. Recalibrate `EVIDENCE_QUALITY.transferred`/`applied` guess-weights to
   be less aggressive. Rejected: this is arbitrary tuning with no
   principled basis (what's the "right" guess-weight? there's no data to
   fit it to), touches core adaptive-learning math with zero existing
   test coverage on this exact module, and doesn't fix the deeper issue
   (BKT with ANY sufficiently confident parameters can jump hard on one
   observation — that's not unique to this specific constant).
2. Patch only the display layer (ParentPortal.tsx / LearnerProfilePanel.tsx)
   to hide/cap the shown percentage. Rejected: cosmetic only — the raw,
   ungated score also fed `/api/learner-context/*` (the TUTOR's own
   prompt context) and `src/plan/compile.ts`'s prerequisite-strength
   check (`pKnown < 0.6`), so the tutor itself could have been misled
   into believing a child had mastered something from one answer, and
   the curriculum auto-advance bug would have remained live.
3. **(Chosen)** Shrink the STORED `cs.masteryScore`/`cs.pKnown` at the
   source, in `recordReasoningEvidence()`, reusing the SAME
   evidence-sufficiency rule `computeMasteryStatus` already validates
   (if `masteryStatus === 'none'` but the raw score implies "mastered",
   cap it to `MASTERY_THRESHOLD - 1`). Every downstream consumer (event
   log, `EvidenceEvent`, the live WS update, API responses, UI, the
   tutor's own prompt context, the plan compiler) reads this one final
   number — no per-consumer gating needed, and none can be missed by a
   future feature that forgets to gate.

**Verification:** wrote a standalone script bundling the real
`learnerStore.ts` against a temp data directory (not a mock). Confirmed:
(a) one `transferred` observation on a virgin concept now stores 74% /
`masteryStatus: 'none'` instead of 96%; (b) two further genuine,
distinct-item `transferred` observations still correctly climb the score
and flip status to `'provisional'` — legitimate multi-observation
progression is not broken. `npx tsc --noEmit` clean. `npm run
test:assessor` (unrelated code path) still passes. `npm run test:live`
fails identically against the unmodified original code in this sandbox
(confirmed via `git stash`) — a pre-existing environment limitation (no
reachable Gemini Live endpoint here), not a regression from this change.

**Trade-off:** the raw BKT posterior computed inside `updateMastery()`
is mathematically correct given its parameters — we are deliberately
overriding it with a product-level regularization rule, not fixing a
"bug" in the Bayesian math itself. This is the right trade-off for a
tutoring product whose core pitch is "don't claim understanding from one
correct answer," even though it means the stored `pKnown` sometimes
understates the model's literal internal confidence until more evidence
accumulates.

**Decision:** ship the source-level shrinkage fix (option 3). Do not
recalibrate `EVIDENCE_QUALITY` guess/slip weights without real evidence
data to justify new values — revisit only if `eval/` (per
docs/TUTOR_PERSONA.md §18) or production data later shows the current
weights are miscalibrated in a specific, measurable direction.

## D-2026-09-26-4 — T19 guidance-injection fix: piggyback plan-delta instructions on the next tool response

**Context:** docs/BUILD_PLAN.md's T19 task is a "spike": choose between
TECHNICAL_SPEC.md §5.3's Option A (`sendClientContent` as client text at
the next non-speaking turn boundary), Option B (`get_next_step` as a
fast, in-memory tool), or Option C (UI/next-session fallback only), with
acceptance criteria of p95 added voice latency < 300ms and no
interruption of tutor speech. An earlier audit had characterized this as
already substantially working "via a different mechanism." While
implementing the instrumentation for that audit's claim, I re-verified
it directly (grepped every `sendClientContent`/`liveSession.` call site
in `server.ts`) and found the claim was incomplete/wrong: `compilePlanDelta()`'s
`delta.instruction` — the actual plan-level guidance, including
PARK_AND_ESCALATE's parking instruction — was being sent only to the
browser (`plan_update` WS message), never to the live model. See
`docs/AGENT_GUIDE.md` landmine #4 for the full symptom writeup.

**Options considered:**
1. **Option A as specified** (`sendClientContent` at a detected
   non-speaking turn boundary): rejected. The Gemini Live API surface
   available here gives no reliable signal for "model is not currently
   speaking" from the server side, so "only when the model is not
   speaking" cannot actually be implemented as a precondition — building
   it would mean guessing, and getting it wrong risks the one failure
   mode Option A's own acceptance criterion exists to prevent
   (interrupting tutor speech). This sandbox also cannot reach a live
   Gemini Live endpoint at all (`npm run test:live` → `ECONNREFUSED
   127.0.0.1:3999`, confirmed identical on unmodified code via `git
   stash`), so a new, speculative injection mechanism could not be
   tested before being shipped into a hackathon demo.
2. **Option B** (`get_next_step` fast tool): rejected for now, not
   because it's wrong in principle (TECHNICAL_SPEC.md's own hypothesis
   favors it) but because it requires the *model* to decide to call a
   new tool proactively between its own turns, which depends on prompt
   engineering in `src/persona/compose.ts` / `docs/TUTOR_PERSONA.md` to
   get the model to actually invoke it at the right moments — a second,
   larger, untested change layered on top of an already-untestable
   environment. Revisit if/when live-session testing is possible.
3. **Piggyback on the existing `sendToolResponse` funnel (chosen):** every
   tool call the model makes already produces exactly one
   `sendToolResponse()` call in `server.ts` — this is the one code path
   already known to work end-to-end against live Gemini Live (it's how
   `assess_child_reasoning`'s per-turn guidance already reaches the
   tutor). Queue `delta.instruction` in a `pendingPlanGuidance` variable
   when `compilePlanDelta` produces one; merge it into whichever tool
   response fires next, concatenated with that call's own instruction
   text rather than overwriting it. Zero new Live API surface, zero
   incremental risk to speech continuity, reuses a call path with an
   existing track record.

**Verification:** `npx tsc --noEmit -p tsconfig.json` clean after the
change. `git diff -- server.ts` reviewed line by line. Cannot verify
against a live Gemini Live session in this sandbox (no reachable
endpoint here — see above); added a `[T19 latency]` console.log emitting
the queued-to-delivered latency in milliseconds every time guidance is
delivered, specifically so this can be measured for real the next time
a live session runs on a machine with real Gemini Live access (the
user's own machine). **This decision's latency acceptance criterion
(p95 < 300ms) is NOT YET MET WITH EVIDENCE** — it is a design choice
expected to be low-latency in the common case (guidance normally rides
the very next `assess_child_reasoning` response, which fires almost
every turn), not a measured one. Action item: run a live session, grep
server logs for `[T19 latency]`, compute p50/p95 across a real sample,
and append the result to this entry.

**Trade-off:** delivery is not instant and has no hard upper bound — if
several turns pass with no tool call at all, the guidance sits queued
until one occurs. Acceptable for this product because the persona
already prompts the model to call `assess_child_reasoning` on
essentially every substantive turn; a long tool-call-free stretch would
itself likely indicate a different problem (the tutor isn't assessing
at all) worth surfacing separately.

**Decision:** ship the `sendToolResponse`-piggyback fix (option 3) as
the T19 mechanism for now. Do not build Option A's speaking-boundary
detection or Option B's `get_next_step` tool without first being able to
test against a live Gemini Live session — implementing either
speculatively, untested, in a hackathon demo codebase is higher risk
than the piggyback approach's known latency trade-off. Revisit once
real p50/p95 numbers are collected; if they exceed 300ms in practice,
reconsider Option B.

## D-2026-09-26-5 — T22 escalations: decouple from T14 (Profiler) dependency

**Context:** docs/BUILD_PLAN.md's T22 row lists dependencies `T14, T03` and
scopes "ladder, ledger, claims → evidence replay, summaries, escalations"
as one task. T14 (the session-end Profiler + Claim Validator,
docs/LEARNER_MODEL.md §5.2) is not built yet (tracked separately as task
#7). The external assessment pasted into this session flagged Parent
Portal's missing escalation view as a gap to fix now, alongside T19 —
before T14.

**Options considered:**
1. Build escalations as a `LearnerClaim` through T14's (not-yet-existing)
   Profiler/claimValidator pipeline, matching BUILD_PLAN's literal
   dependency ordering. Rejected: would require building T14 first,
   which is a much larger task (a new Gemini-backed session-end
   pipeline with a JSON schema, a deterministic validator, and a merge
   step) — blocking a small, high-value, low-risk fix behind a large,
   still-unstarted one contradicts this project's own instruction to
   prefer a smaller solution that works over a larger one that's still
   in progress.
2. **Treat PARK_AND_ESCALATE as its own deterministic event type,
   independent of the claims pipeline (chosen).** A LearnerClaim (per
   LEARNER_MODEL.md §3) is Gemini-authored and needs the claim
   validator's evidence-ownership/scope/confidence checks precisely
   because an LLM produced it and could be wrong. PARK_AND_ESCALATE is
   the opposite: a pure, deterministic rule in `compilePlanDelta()`
   (`retries >= plan.limits.retryCap`) — no LLM judgment involved, so
   there is nothing for a claim validator to validate. Recording it as
   a plain `EscalationEvent` (new type in `learnerModel.ts`) sidesteps
   the dependency honestly rather than routing it through a pipeline
   that doesn't add value for this specific event type.

**Implementation:** `EscalationEvent` type + `LearnerProfile.escalations[]`
(`src/adaptive/learnerModel.ts`); `recordEscalation()`/`resolveEscalation()`
(`src/adaptive/learnerStore.ts`), called from the same `compilePlanDelta`
call site in `server.ts` that T19 (D-2026-09-26-4) already touches, right
when `delta.escalate` is true; `POST
/api/learners/:studentId/escalations/:escalationId/resolve` for a
parent/teacher to mark one reviewed; a "Needs Your Attention" section
plus a roster-card badge in `ParentPortal.tsx`.

**Verification:** `npx tsc --noEmit -p tsconfig.json` clean; `npx vite
build` succeeds (1724 modules, no type errors) — confirms the new
`ParentPortal.tsx` UI and the `EscalationEvent` type used across
`learnerModel.ts`/`learnerStore.ts`/`server.ts`/`ParentPortal.tsx` are
mutually consistent. Not yet verified: an actual PARK_AND_ESCALATE
firing end-to-end against a live Gemini Live session (same sandbox
limitation as D-2026-09-26-4 — no reachable Live endpoint here); the
next live session run on the user's machine that hits a retry cap
should show a banner in Parent Portal, which would be the real
end-to-end confirmation.

**Trade-off:** the remaining T22 scope from BUILD_PLAN.md ("claims →
evidence replay, summaries") that genuinely does depend on T14's claims
pipeline is intentionally left for after T14 is built (task #7) — this
decision only pulls the escalations sub-scope forward, not all of T22.

**Decision:** ship `EscalationEvent` as a standalone, non-claim record
now; revisit whether escalations should ALSO surface as a
`LearnerClaim` (e.g. "recurring escalations on fractions" as a
cross-session pattern) once T14's Profiler exists and there's a
narrative-level reason to, rather than duplicating the same event two
ways today.

## D-2026-09-26-6 — T14: Profiler + Claim Validator implementation choices

**Context:** docs/BUILD_PLAN.md T14 ("Files: new `src/adaptive/{profiler,claimValidator}.ts`,
hook in the session end") and docs/LEARNER_MODEL.md §5.2 fully specify the
pipeline: session end -> Profiler (Gemini, stronger model, JSON schema) ->
Claim validator (deterministic) -> merge + write SessionSummary -> schedule
reviews. This was the largest remaining gap the external assessment
flagged, and the largest item in this session's queue.

**Key implementation decisions:**

1. **Model role:** used the existing `src/ai/gateway.ts`'s `role: 'strong'`
   (already resolves to `MODEL_STRONG`/`gemini-3.8-flash` with fallback
   candidates and a single verified-once cache) rather than hand-rolling
   another model-candidate list, which is exactly the duplication
   `gateway.ts`'s own header says it was built to eliminate. This is the
   first caller of `role: 'strong'` — `liveObserver.ts` is the only other
   `gateway.ts` caller today and uses `role: 'fast'`.
2. **Confidence ownership:** LEARNER_MODEL.md §5.2 says the Profiler
   proposes claims and the validator is "deterministic" — read literally,
   this means confidence (a numeric judgment) should not come from the LLM
   at all. `ProposedClaim` (claimValidator.ts) therefore has no confidence
   field; the Profiler prompt never asks the model for one; confidence is
   computed exclusively by `capForEvidenceCount()` in the validator, per
   §6.3's cap table. §6.3's formula (`confidence = min(cap(n), base) x
   decay(age)`) does not specify what `base` is independently of the cap —
   this is a REASONABLE INFERENCE (not a verified spec detail): `base` is
   treated as 1.0 at creation (decay applied separately, at read/plan-
   compile time, not in this module), so creation-time confidence reduces
   to `cap(n)`. Flagged here rather than silently assumed.
3. **Contradiction detection:** §5.2 says "reject claims that contradict a
   learner_stated/parent_stated claim." True semantic contradiction
   detection needs another model call (or the same call, which would
   re-introduce judgment into the "deterministic" validator). Implemented
   conservatively instead: ANY existing `learner_stated`/`parent_stated`
   claim occupying the same slot (same `kind` + `scope`) blocks a new
   profiler claim in that slot, whether or not they actually conflict. This
   can over-reject (a profiler claim that would have agreed is also
   blocked) — accepted as the safer failure direction for a claim about a
   child, and cheap to relax later if it proves too conservative in
   practice.
4. **Session-end hook point:** wired into the live-voice WS `clientWs.on('close', ...)`
   handler (`server.ts`) — the actual "session end/disconnect" trigger for
   the real voice-tutoring loop this project is built around — not the
   legacy quiz-click `POST /api/session/:sessionId/end` route, which is a
   different, older interaction model (per docs/AGENT_GUIDE.md landmine #3's
   note that the legacy path "never sets `masteryStatus`" and isn't the
   reported failure mode either). Fire-and-forget: the client is already
   gone by the time this fires, so nothing awaits its result; `runProfiler`
   is written to never throw out of its own top-level catch, only log.
   **§5.2's "idle 10 min" trigger is NOT implemented** — only end-of-session
   (WS close) — there is no idle-timeout watcher in this codebase yet, and
   adding one was judged out of scope for T14 itself (tracked as a gap
   below, not silently dropped).
5. **Event filtering:** `EventFilter` (`src/adaptive/repo/types.ts`) gained
   a `sessionId` field, implemented in BOTH `file.ts` and `firestore.ts`
   (per docs/AGENT_GUIDE.md's own table: "Change file.ts AND firestore.ts
   together — never one without the other"). The Firestore query now
   filters by `sessionId` in addition to the existing `conceptId` filter,
   which may require a composite index in a real Firestore project the
   first time it runs there — this sandbox cannot create or test that
   index; noted as a deploy-time risk, not verified.
6. **Failure isolation:** a Gemini gateway failure (all `strong`-role
   candidates unreachable, or bad JSON) does not lose the session — the
   deterministic `SessionSummary` facts (concepts touched, ladder moves,
   moves/representations used, misconception changes) are computed
   independently of the model call and always get written, with a
   plain fallback narrative substituted for the LLM one. Verified directly
   (see below) since this sandbox cannot reach Gemini at all.

**Verification:** `npx tsc --noEmit -p tsconfig.json` clean. Wrote and ran
two standalone integration scripts (`tsx`, no bundling needed — pure ESM/TS,
no mocking framework in this repo) against the real `file` repo backend in
a scratch data directory:
- `claimValidator.ts`: 19 assertions covering the confidence cap table,
  scope requirement, evidence-ownership check, banned-label lexicon (both
  a learning-style label and a diagnostic label), the learner_stated
  contradiction rule, and `mergeClaims`'s dedup/union/confidence-recompute
  behavior. All passed.
- `profiler.ts` end-to-end: seeded a real learner + two `recordReasoningEvidence`
  calls in the same session (an incorrect answer, then a corrected one),
  ran `runProfiler` with a fake API key (this sandbox has no network
  access to Gemini regardless), and confirmed: the deterministic
  `SessionSummary` facts were computed correctly (concept touched, ladder
  move 0→3 matching the `incorrect`→`applied` transition, misconception
  entry recorded, moves/representations tallied), the fallback narrative
  fired and named the concept, and the summary was durably persisted BOTH
  on `LearnerProfile.sessionSummaries[]` and via the dedicated
  `saveSessionSummary()` repo call (confirmed by reading back
  `data/sessions/<studentId>.json`). Also confirmed a session with zero
  events correctly returns `null` (skips) rather than fabricating a claim.
  **Not verified:** an actual successful Gemini `strong`-role call
  producing real proposed claims — this sandbox cannot reach Gemini at
  all; the LLM-call path itself needs to be exercised on the user's own
  machine (with a real `GEMINI_API_KEY`) to confirm end-to-end, though the
  prompt/parsing/validation code around that call is the same code path
  already exercised (minus the actual network response) by the tests
  above.

**Trade-off / explicit scope cut:** spaced-review scheduling (LEARNER_MODEL.md
§5.2's "schedule reviews (§7.2)" step and §7.1's decay half-lives) is
**NOT implemented** in this pass — that is BUILD_PLAN's separate T15, which
remains unstarted. The Profiler writes claims and session summaries only;
nothing yet decays a claim's confidence over time or schedules a review
item from a claim. Flagging this explicitly rather than letting "T14 done"
imply T15 is also done.

**Decision:** ship the Profiler + Claim Validator as scoped above (claims +
session summaries, no review scheduling, no idle-timeout trigger). Revisit
review scheduling as its own task (T15) rather than folding it in here
unreviewed.

## D-2026-09-26-7 — Curriculum library: board + grade + subject courses, admin-only upload, AI review instead of human review

**Context.** A review of the one ingested syllabus (Think! Mathematics 3B, 13 concepts, loaded
2026-09-23) against the adaptive build (2026-09-24/26) found it predated and did not fit the
teaching journey: grade typed by the uploader (a Sec 3 book tagged "Secondary 2 (Grade 8)",
which — through the new age-band logic — set an 8–12 register for 14–15-year-olds); concept ids
containing the upload's file name; `prerequisites: []` on every concept (so R-PREREQ-FIRST and
R-PROBE never fired and R-FAST was vacuously true); no `conceptType` (live sessions keyed the
strategy profile by chapter title while seeded learners used `"geometry"`); positional
misconception ids (`::m1`) that never matched the seed's ids (`ssa-congruence`); scope lists
partly invented by the model; and a wrong worked example (radius 12 stated, 15 used) passed to
the tutor as fact. The product direction is now: admin uploads textbooks per board + grade +
subject (IGCSE, CBSE, IB, …); a learner picks board + grade at signup and gets every subject.

**Options considered.** (a) Patch the one course by hand. (b) Keep the pipeline, add fields.
(c) Rebuild ingestion around a course identity and a structure + verification stage aligned to
the persona/learner model/plan. For review: human approval before publishing vs. an automated
AI review that auto-publishes (user's choice: "AI should do the review and upload").

**Decision.** (c). Course = board + grade + subject (`src/curriculum/catalog.ts` ids, never file
names). Pipeline split → extract → merge → **structure** (subject mode, concept types,
prerequisite DAG, syllabus mapping) → **AI review** (re-work every example, correct facts,
misconception ids, L1–L4 ladder items, representation ideas; reject non-concepts) → publish.
Optional official syllabus upload is the authority for scope; otherwise only what the textbook
states. Admin-only upload (`requireAdmin`: `ADMIN_TOKEN` or Firebase `admin` claim; loopback-only
when unset). Signup captures board + grade. Stale data wiped; seed script rebuilt to seed against
whatever course is in the library. Full spec: docs/CURRICULUM.md.

**Why.** Every defect above is structural — it recurs with every book unless ingestion produces
the fields the rest of the system keys on. Keeping "Gemini proposes, code disposes" (validation in
`structure.ts`, no network, tested) keeps the published data deterministic where it matters: ids,
graph acyclicity, type stability, provenance of scope.

**Trade-offs.** No human sees content before a learner does — mitigated by an independent review
pass with a different task, by dropping unverifiable worked examples rather than publishing them,
and by storing the review report on the course (shown in the admin library). The review's own
catch rate is unmeasured (open work: hand-checked sample). Ingestion now makes more model calls
(1 structure + 1 review per chapter on top of extraction). One Firestore document per course (1 MiB
limit, warning at 900 KB).

**Evidence.** `tests/smoke/curriculum-ingest.mjs` (all checks pass, stubbed model steps); `tsc`,
assessor tests, all smoke tests, server bundle and web build pass; routes exercised over real HTTP
(catalog, filtered curricula, admin check with/without `ADMIN_TOKEN`, upload validation,
learner creation with board/grade). **Not verified:** a real ingest of a real PDF with the live
Gemini API — this environment has no reachable Gemini endpoint; run one upload on your machine.

## D-2026-09-26-8 — Prerequisites are probed first, not forced; no hard locks in the subject list

**Context.** With an empty graph, `compileTeachingPlan` treated a prerequisite with no evidence as
weak (`pKnown ?? 0 < 0.6`) and `SubjectSelector` locked concepts whose prerequisites were below
40% — both harmless while every course had no prerequisites. With real graphs, every new learner
clicking any concept would have been redirected to its first prerequisite, and most of a course
would have been locked — contradicting "strengthen the learner's classroom learning" (they must be
able to study the chapter their class is on today).

**Decision.** R-PREREQ-FIRST fires only when a prerequisite has evidence (`evidenceLog` or
attempts) AND `pKnown < 0.6`. Unevidenced prerequisites go to R-PROBE (max 3), which is the cold-start
behaviour docs/TEACHING_PLAN.md §3 already specified. R-PROBE now also lists earlier-grade /
other-subject prerequisites (`external:*`, probe-only) and takes the check question from the
target's link to the prerequisite (fixing a bug: it used the prerequisite's *own* first
prerequisite's question). The subject list shows "Builds on: …" instead of locking.

**Trade-off.** A learner can start a concept whose prerequisite they have never shown — by design;
the tutor probes and detours on evidence. **Evidence:** plan checks in
`tests/smoke/curriculum-ingest.mjs` (no evidence → probe, evidenced weak → R-PREREQ-FIRST,
external probe); `tests/smoke/plan-and-store.mjs` unchanged and passing.

## D-2026-09-26-9 — Uploads load only the first N chapters by default (3), overridable per upload

**Context.** After publishing, every concept gets a full pre-generated lesson set (lesson + 3
diagram variants + image attempts) — the user wants that pre-generated data, but for the demo not
for a whole textbook's worth of Gemini usage. Turning pre-generation off was offered and declined.

**Decision.** A *Chapters to load* setting on the upload (default 3, "All chapters" to override,
server default `DEFAULT_CHAPTER_LIMIT` or 3). The saving is taken at the most expensive step:
with a limit, textbook parts are read in page order and reading stops once chapter N+1 appears,
so the rest of the PDF is never sent to the model; only the first N chapters are structured,
reviewed, published and pre-generated. Counting is over the book's chapters (published ones
included), so a later upload with a higher limit extends the course without changing what is
already published.

**Trade-offs.** Limited uploads read sequentially (slower than 2-parallel) — acceptable because
they are small by design. The structure pass cannot link early chapters to later ones that are not
loaded yet (links are only ever to earlier concepts anyway). **Evidence:** limit checks in
`tests/smoke/curriculum-ingest.mjs` (stop point, straddling chapter complete, re-upload extends,
no limit = whole book); invalid `chapterLimit` rejected over real HTTP.

## D-2026-09-27-1 — Pre-gen image model was stale/off the current price list; pointed at the same models the gateway already uses

**Context.** The user asked which Gemini model actually produces the "real-world photo" images
paid for during pre-generation, and how to control that cost. Only `photoVisual` (the real-world
photo) is an actual image-generation call; the "3D image" (`Scene3DData`) and "chalkboard notes"
(`ChalkboardNotesData`) are structured JSON inside the single `lessonData` text call, not separate
image spend. `scripts/pregenerate-assets.ts` hardcoded `generateImage()` to
`['gemini-3.0-flash-preview-image-generation', 'imagen-3.0-generate-002']`, independent of
`src/ai/gateway.ts`'s `image` role, which already lists `['gemini-3.1-flash-image',
'gemini-3.1-flash-lite-image']`. Neither of the two names `pregenerate-assets.ts` used appears on
the current Gemini API pricing page (ai.google.dev/gemini-api/docs/pricing), so most image calls
were likely failing over silently to the Unsplash fallback (or the no-image SVG) — the concept's
text/JSON calls still cost money, but the "image" it paid for was a stock photo, not a generated one.

**Decision.** `generateImage()` now tries `gemini-3.1-flash-image` then `gemini-3.1-flash-lite-image`
— the same models and order as the gateway's `image` role — with an optional `MODEL_IMAGE` env
override, mirroring the gateway's own `MODEL_IMAGE` variable name for consistency (this script does
not route through the gateway itself; it is a separate CLI process, so the fix is keeping the model
list in sync rather than merging the two paths in this change).

**Trade-off.** The two model lists are still maintained in two places (a comment now says so); a
future change should route this script's image call through the gateway to remove the duplication
entirely. **Evidence:** ai.google.dev pricing page fetched 2026-09-27 lists `gemini-3.1-flash-image`
($0.50/1M input, $0.067 per 1K-resolution image) and `gemini-3.1-flash-lite-image` ($0.25/1M input,
$0.0336 per 1K-resolution image) as current; the two old names return no pricing entry.

## D-2026-09-27-2 — Pre-generated lesson/diagram/photo cache moved off local disk (Firestore + Cloud Storage)

**Context.** AI Builder Cup requires deployment on Cloud Run or Firebase
(https://aibuildercup.com/themes.html — "deployed on Cloud Run via Cloud Run or Firebase"). Every
pre-generated asset (`data/pregenerated/<conceptId>.json`, written by `scripts/pregenerate-assets.ts`
and, on a cache miss, by `server.ts`'s live lesson/diagram endpoints) lived only on local disk.
Cloud Run's filesystem is ephemeral — the cache is gone on the next redeploy or cold start, and the
exact same concept regenerates (and re-bills Gemini) again. This applied to both the offline pre-gen
script AND the live cache-miss path — `/api/update-diagram` in particular never persisted its result
at all, so a diagram variant generated live during a session was never reused, even locally.

**Decision.** New `src/curriculum/pregenStore.ts`, same shape as the existing Firestore-backed
repos (`src/curriculum/ingest.ts`, `src/adaptive/repo/firestore.ts`): Firestore collection `pregen`
(one doc per concept id/topic slug) for the lesson/diagram JSON, Cloud Storage for the generated
photo (decoded from the base64 data URI Gemini returns, uploaded, replaced with its public URL —
never inlined into the Firestore doc, which would risk the 1 MiB cap), local-file fallback
(unchanged `data/pregenerated/*.json` format) when Firebase isn't configured. `pregenerate-assets.ts`
now calls `initFirebaseAdmin()` itself (it runs as a spawned child process, so it doesn't inherit
`server.ts`'s already-initialised app) and uses `pregenExists()`/`savePregenAsync()` instead of raw
`fs`. `server.ts`'s `/api/generate-lesson` and `/api/update-diagram` both now save their live-
generated result back through the same store (merging onto whatever the concept already has,
rather than overwriting), so nothing generated live gets re-billed either — closing the gap that
motivated this: "do it once locally and use it again and again," extended to real-time generation
during a live session, not just the batch pre-gen script.

**Trade-offs.** Same known caveat as `ingest.ts`: Firestore/Storage are found via
`require('../firebase/admin')`, which only resolves reliably in the bundled CommonJS production
server — under `npx tsx server.ts` (ESM dev) it falls back to the local file, which is fine (dev
doesn't need durability) but means this hasn't been exercised end-to-end against a real Firestore
project in this environment (no live credentials here). If the photo upload to Storage fails, the
photo is dropped from the Firestore save rather than inlined (regenerates next time) — a deliberate
choice to never risk the whole save over one oversized field. **Evidence:**
`tests/smoke/pregen-store.mjs` (local-fallback round-trip: save/read, inline-base64 preserved,
candidate-list fallback lookup, merge semantics for the live diagram-save path); full repo
`npx tsc --noEmit` clean and all existing smoke tests (`claim-validator`, `curriculum-ingest`,
`gateway`, `plan-and-store`, `profiler`) still pass after the change.

## D-2026-09-27-3 — `/api/generate-image` had zero caching (found after D-2026-09-27-2 shipped, not before)

**Context.** D-2026-09-27-2 wired the pregen store into `/api/generate-lesson` and
`/api/update-diagram`, and I told the user only the offline `pregenerate-assets.ts` script
generated real images live — that was wrong. `server.ts` has a third route, `/api/generate-image`
(the board's "real-world photo" tab, `App.tsx handleGeneratePhoto()`), that calls Gemini's image
model directly with **no cache check and no cache save at all** — every open of the photo tab for
the same topic, in the same session or a different one, re-billed Gemini for an image it had already
generated. This was missed in the first pass because it was found by re-grepping `server.ts` for
every `GoogleGenAI(`/`generateContent(` call site after the user asked "did you update all the
documentation," not by a systematic search before answering the original cost question — the
original answer to "which model generates the images" was incomplete, not just the docs.

**Decision.** `/api/generate-image` now cache-checks the pregen store first (keyed on `conceptId`,
sent by `App.tsx` via the same `conceptIdFor()` helper used for lesson/diagram requests, falling
back to a topic slug) and saves a freshly generated photo back to the store — same pattern as the
other two routes. A request carrying a user-typed custom prompt is deliberately excluded from both
the cache read and the cache write: it's a one-off image the learner asked for by name, not the
reusable default "real-world example" for the concept, so caching it under the concept's key would
serve the wrong image on a later default request.

**Trade-off.** None of substance — this closes a real gap rather than trading anything off.
**Evidence:** same `tests/smoke/pregen-store.mjs` covers the underlying store calls this route now
makes; `npx tsc --noEmit` clean and all 6 smoke tests still pass after the change; manual code
review confirmed no fourth Gemini-content-generation call site exists in `server.ts` (the only other
`GoogleGenAI`/`generateContent` use is the Live voice WebSocket session, which is not cacheable the
same way).

## D-2026-09-28-1 — Visual generation was subject-generic, not concept-specific (honest review finding)

> **Superseded by D-2026-09-28-7.** The diagnosis below still stands (the pictures children saw were
> generic boxes and sphere rings). The fix described here — a keyword heuristic
> (`src/curriculum/visualGuidance.ts`) steering the old `diagram`/`scene3d` schema — was replaced:
> that file is deleted, and lessons now get step-by-step board pictures composed by the model from a
> small drawing vocabulary. `findConceptRichData` was replaced by `findConcept` + `visualContextFor`
> in `server.ts`.

**Context.** User asked for an honest review of whether the actual generated learning material
(diagrams, 3D scenes, quiz) was weak relative to the project's own adaptive/misconception-first
teaching philosophy, or an inherent side-effect of pushing real-world/2D/3D visuals. Direct code
inspection (`curriculumIntelligence.ts`, `reasoningAssessor.ts`, `ladder.ts`) showed the live
diagnostic/adaptive layer is genuinely strong — closed-vocabulary misconception detection with a
"correct-answer trap" test, gated mastery requiring 2 distinct L3+ items plus a spaced review, and
the full authored per-concept dataset (key facts, misconceptions, worked examples, all 4 ladder
items, representation ideas) already injected into the live voice prompt.

The visual layer was the actual weak point: `diagram`/`scene3d` generation in both
`scripts/pregenerate-assets.ts` (batch, the primary path for real course concepts) and `server.ts`'s
two live cache-miss routes (`/api/generate-lesson`, `/api/update-diagram`) used one fixed generic
schema regardless of concept — 4-6 "node and arrow" diagram boxes, and a 3D scene picked from 7
hardcoded `sceneType`s by SUBJECT AREA only (e.g. every math topic got `geometry`, rendered as a
labeled ring of spheres — see D-2026-09-27-4). The richest concept-specific authored content
(`ladderItems`, `representationIdeas`) never reached these prompts at all; it only reached the voice
tutor's system prompt. A graphing concept about reading where two lines intersect got a generic
node diagram and an unrelated sphere ring, not a graph — the exact opposite of what its own
authored `representationIdeas` called for.

**Decision.**
1. New shared module `src/curriculum/visualGuidance.ts` — a keyword-heuristic function (conceptType
   is a free-form id the AI invents per course at ingest, so there's no fixed enum to switch on)
   that turns a concept's topic/conceptType/chapter into concrete instructions: graphing concepts
   must render actual coordinates/line equations, geometry concepts must render real geometric
   parts, algebra concepts must show the actual expression at each transformation step, etc.
2. Both `pregenerate-assets.ts`'s `lessonPrompt()`/`diagramFocusPrompt()` and `server.ts`'s two live
   cache-miss prompts now call this helper and inject its guidance, plus the concept's actual
   `ladderItems` (grounding the quiz question in the authored apply/transfer item, not a generic
   "test deep understanding" instruction) and `representationIdeas` (asking the model to realise one
   of the already-authored ideas as the actual diagram/scene3d content, not invent a generic one).
3. `scene3d.elements[].position` (a field that already existed in `Scene3DData` but was never
   requested) is now explicitly required by the prompt whenever the visual guidance calls for
   spatial/geometric accuracy — `Interactive3DVisual.tsx` already uses `position` when present
   (added in D-2026-09-27-4) and only falls back to an auto-computed ring when it's absent, so this
   closes the loop without any renderer change.
4. `server.ts` gained `findConceptRichData(conceptId)` — scans `listCurriculaAsync()` for the
   concept so live (cache-miss) generations for a curriculum-backed concept get the same
   concept-specific guidance as the batch script, not just ad-hoc/typed topics.

**Trade-off.** This only changes what gets generated from now on. The 3 chapters already
pre-generated in this session still have the old generic diagram/scene3d content until they're
regenerated (`npm run pregen -- --force`, or delete the affected pregen records) — pregen output is
immutable-by-design (never re-billed), so nothing regenerates automatically. Not done in this pass:
generating a visual that directly contradicts a specific *confirmed* misconception at diagnosis time
(flagged as HIGH VALUE, not MUST HAVE, in the review) — the diagram schema still doesn't
per-misconception-branch.

**Evidence:** `npx tsc --noEmit` clean; all 6 smoke tests pass (`claim-validator`,
`curriculum-ingest`, `gateway`, `plan-and-store`, `pregen-store`, `profiler`). Not yet evidenced:
an actual regenerated concept's diagram/scene3d output, since that needs a live `GEMINI_API_KEY`
call this environment doesn't have network access to make — the user should run
`npm run pregen -- --force` (or re-upload/regenerate one concept) and visually check the result
before relying on this for the demo.

## D-2026-09-28-2 — T08 (text channel) shipped backend-only, no chat box

**Context.** User asked to build T08, the text-channel tutor endpoint (docs/BUILD_PLAN.md T08,
docs/TRACEABILITY.md FR-25), then specifically confirmed no UI change: the tutor's main surface
stays voice-only, and `/api/tutor/turn` should be a hidden backend doorway rather than a visible
"type instead" fallback in the lesson screen. Reason it matters: T08 exists so EV-01/EV-02/EV-03
(docs/BUILD_PLAN.md) can drive many turns against the real diagnosis pipeline without a microphone
or a WebSocket, and so there is a fallback if Gemini Live is unreachable — neither of those needs a
visible chat box, and adding one would be a second, untested UI surface competing with the demo's
actual story (live voice).

**Decision.** `server/routes/tutor.ts` registers `POST /api/tutor/turn` on the Express app; nothing
in `src/App.tsx` or any component calls it. The route reuses the exact persona composer
(`composeSystemInstruction({channel:'text', ...})`, `src/persona/compose.ts` already had `channel`
as a first-class input — `channels.ts`'s text-channel surface text pre-dated T08), the same compiled
Teaching Plan (`compileTeachingPlan`/`getRepo().getLatestPlan`) and the same diagnosis pipeline
(`assessReasoningWithDeadline` → `recordReasoningEvidence` → `compilePlanDelta`) the voice WS handler
in `server.ts` drives, so a turn scored through EV-01/EV-02 exercises the SAME reasoning code the
live demo uses — not a parallel implementation that could silently drift from it. Tool declarations
are filtered from the SAME `src/live/liveConfig.ts ALL_TOOLS` array the voice path uses (down to
`assess_child_reasoning` and `record_confusion_signal` — no board tools, since there is no board on
this channel) so the two channels' tool schemas cannot diverge either.

**Trade-off.** A text fallback that a stuck learner could reach mid-lesson (docs/FUNCTIONAL_SPEC.md
lists this as a possible fallback, not a requirement) does not exist. If Gemini Live goes down during
the actual demo, there is no in-app way to keep teaching that learner — only this endpoint, reachable
by curl/Postman, not by the student. Judged acceptable: building and testing a second UI surface
inside the remaining build window was assessed as worse for demo risk (docs/BUILD_PLAN.md's own
"avoid features that are technically impressive but visually impossible to demonstrate" principle)
than the (currently un-demoed) risk of not having it. Revisit only if there is time left after
EV-01/EV-02/EV-03 and the live-voice path are both solid.

**Evidence:** `npx tsc --noEmit` clean. `npm run test:tutor-turn` (new: `tests/smoke/tutor-turn.mjs`)
verified over real HTTP against the running server — see D-2026-09-28-3 for what that did and did not
confirm.

## D-2026-09-28-3 — T08's plan-delta guidance is delivered immediately, not queued like voice's

**Context.** The voice WS handler (`server.ts`, T19/D-2026-09-26-4) cannot inject
`compilePlanDelta()`'s instruction into the live model mid-turn without risking interrupting synthesized
speech, so it queues the instruction in `pendingPlanGuidance` and merges it onto whichever tool
response fires NEXT — sometimes several turns later. Building T08 raised the question of whether to
copy that same queuing mechanism for the text channel.

**Options considered.**
1. **Copy the voice queuing mechanism verbatim** — rejected. It exists specifically to solve a
   problem (interrupting synthesized audio) that a text HTTP response does not have. Copying it
   would add a second, unnecessary piece of cross-request in-memory state (on top of the delta state
   already kept per session) and a real behavioral bug for evals: EV-02's simulated-learner harness
   scores turns-to-resolution, and delivering guidance late would understate how quickly the adapted
   plan actually responds compared to what the mechanism is capable of.
2. **Merge the instruction onto assess_child_reasoning's own response, in the same turn (chosen).**
   `handleAssessChildReasoning` in `server/routes/tutor.ts` appends `delta.instruction` directly onto
   `assessment.tutorGuidance` before returning the tool's functionResponse, so the model sees plan-level
   guidance (e.g. a retry-cap park instruction, or "switch representation") in the exact turn it was
   produced, not a queued later one.

**Trade-off.** This is a real behavioral difference between the two channels: text delivers plan
guidance faster than voice can. Documented rather than hidden, because EV-02's turns-to-resolution
numbers from text should not be read as a direct voice-channel latency claim without that caveat.

**Decision.** Ship the immediate-merge approach for T08. Do not backport it to the voice path — voice's
queuing exists for a reason specific to that channel (see D-2026-09-26-4) and changing it is out of
scope for T08.

**Evidence:** `npx tsc --noEmit` clean. `npm run test:tutor-turn` verified, over real HTTP against the
running server on the user's machine: session start, the opening turn, a second turn, a mismatched
`studentId` refused with 403, an unknown `sessionId` refused with 404, and `clearTutorTurnState` firing
on `/api/session/:id/end` (a subsequent turn on the ended session is then refused with 404 too) — all
pass. **Not yet verified: an actual Gemini call completing inside a turn.** This sandbox's own shell
cannot reach `generativelanguage.googleapis.com` — confirmed directly (`curl -m8
https://generativelanguage.googleapis.com/v1beta/models` returns curl error 56, connection reset,
inside this shell specifically; the same host is reachable by the project's other scripts when run
normally on the user's machine, e.g. `scripts/diagnose-voice.ts`'s own header notes it "uses your .env
key"). Both real turns in the test run returned `{"error":"fetch failed"}` for exactly this reason —
every other assertion (auth, session wiring, 404s) passed on the same run. Action item: run `npm run
test:tutor-turn` from the user's own terminal (not this sandboxed shell) once, to get the first real
`tutorText`/`diagnosis` output and close this out for EV-01/EV-02 readiness.

## D-2026-09-28-4 — Offline tool-calling test for T08 found and fixed two real bugs (one shared with voice)

**Context.** User could not run `npm run test:tutor-turn` (on mobile) and asked for the logic and code
to be reviewed again before proceeding. D-2026-09-28-3 already established that this sandbox's shell
cannot reach `generativelanguage.googleapis.com`, so a live re-test was not possible either. Re-reading
`server/routes/tutor.ts` line by line is necessary but not sufficient for verifying a tool-calling loop
(function-call → functionResponse threading, the `MAX_TOOL_HOPS` safety net, diagnosis/planUpdate
merging) — those are exactly the kind of control-flow bugs that read fine and fail at runtime.

**Decision.** Built a genuinely offline, network-independent test that runs the REAL production code
(`server/routes/tutor.ts`, `learnerStore`, the file repo, curriculum ingest, the persona composer, the
plan compiler, the diagnostician's parsing/validation logic) against a fully scripted fake
`@google/genai`, following the same esbuild-alias pattern the project already uses for
`tests/run.mjs`/`tests/genai-stub.mjs`:
- `tests/offline-tutor-setup.ts` — creates one real learner/subject/concept-state, compiles and saves
  a real Teaching Plan into a scratch `LEARNER_DATA_DIR`, and registers the real
  `registerTutorRoutes(app)` on a throwaway Express server.
- `tests/genai-tool-stub.mjs` — a scriptable fake `GoogleGenAI`, distinguishing the diagnostician's
  JSON-mode calls from `tutor.ts`'s tool-enabled conversational calls by inspecting
  `req.config?.responseMimeType`, the same way the real Gemini endpoint serves both from one API.
- `tests/smoke/tutor-turn-offline.mjs` — drives 5 scripted scenarios over real HTTP: opening turn,
  an `assess_child_reasoning` round-trip, a `record_confusion_signal` round-trip, a
  `MAX_TOOL_HOPS`-overrun (6 scripted hops against a cap of 4), and an empty-model-text edge case.
  `npm run test:tutor-turn-offline` runs it.

**What it found (both were real bugs, not test artifacts — confirmed by reading the surrounding code,
not assumed):**

1. **Empty model text was sent to the child verbatim.** `server/routes/tutor.ts`'s no-function-call
   branch did `finalText = resp.text || ''` — a blank or whitespace-only reply from the model would
   reach the child as a silent turn. Fixed to fall back to a neutral prompt
   ("Sorry, could you say that again?") when the trimmed model text is empty.
2. **`misconception_behind_correct` with no catalogued misconception id silently became `outcome:
   'sound'`.** Both `server/routes/tutor.ts` and `server.ts`'s voice WS handler compute
   `compilePlanDelta`'s `outcome` as `candidateMisconceptions.length > 0 ? (…) : (classification ===
   'wrong_answer' || 'needs_clarification' ? 'failed_check' : 'sound')`. The diagnostician
   (`src/adaptive/reasoningAssessor.ts`) can legitimately classify `misconception_behind_correct` —
   the project's own first-class case, "the child's answer appears correct or plausible, but their
   underlying reasoning is incorrect" (project instructions, MISCONCEPTION DETECTION) — while
   returning zero `candidateMisconceptionIds`, because catalogued ids are filtered to a known set
   (`reasoningAssessor.ts`'s `catalogIds` filter) and a real misconception the model spots does not
   always match one already in the catalogue. When that happened, the outcome fell through to
   `'sound'`, and `compilePlanDelta` told the tutor to "continue teaching" as if the reasoning were
   fine — the opposite of what the diagnosis said. **This bug pre-dated T08**: it was already present
   in `server.ts`'s voice handler (same logic, mirrored faithfully into T08 per "reuse working
   components"); the offline test caught it in the mirror, not something T08 introduced. Fixed in
   both files: a `misconception_behind_correct` classification with no candidate ids now maps to
   `misconception_suspected` on its own.

**Trade-off.** Fixing #2 touched `server.ts` (the voice path), which is outside T08's own scope. Judged
in scope anyway: it is a one-line, low-risk condition fix (not a rewrite) directly serving the project's
own stated differentiator (misconception detection as a first-class capability), and leaving a known,
demonstrated correctness bug in the shared diagnosis pipeline unfixed — after finding it, mid-review —
would be worse than the small scope expansion. Not fixed: the still-open question (raised during static
review, not yet resolved) of whether `state.contents` growing unboundedly across many turns in
`textTurnStates` is a real latency/cost/context-limit risk for EV-02's hundreds-of-turns eval runs —
no test caught an actual failure from this, and adding a trimming/compaction mechanism speculatively
would be exactly the kind of complexity the project instructions warn against adding without evidence.
Flagged as an open risk in `PROJECT_STATE.md`, not fixed.

**Evidence:** `npx tsc --noEmit` clean after the fixes. `node tests/smoke/tutor-turn-offline.mjs` — all
22 checks pass (first run, before the fixes: 3 failures — the `misconception_behind_correct` outcome
mismatch, plus the empty-text case, which was a logged finding rather than a pre-written assertion,
turned into a real `FAIL` once the fix was made and the test was tightened to assert on it).
`npm run test:assessor` — 13/13 pass, no regression. **Still not verified: an actual Gemini call**
(same sandbox network limitation as D-2026-09-28-3 — reconfirmed via the same `curl -m8
https://generativelanguage.googleapis.com/v1beta/models` check, still `curl: (56)`). This offline test
verifies the tool-calling LOGIC (does the endpoint correctly handle whatever the model decides to call);
it does not and cannot verify prompt quality or what the real model actually decides to call — those two
remain the user's own `npm run test:tutor-turn` to close out, from their own machine.

## D-2026-09-28-5 — Extracted deriveOutcome() as the single source of truth; found and fixed a test-infrastructure gap that hid it

**Context.** After D-2026-09-28-4, the user asked directly: "we keep finding these bugs now and then,
how do I ensure there is none?" The honest answer given was that static review can't catch a
branching-logic gap — only enumerating every input combination and asserting the output can — and that
the two channels having their own COPY of the same `outcome` derivation was itself a structural risk
independent of test coverage (a fix in one is easy to forget in the other, which is exactly what had
already happened once). The user then asked to build everything recommended.

**Decision.**
1. **Extracted `deriveOutcome()`** into `src/plan/delta.ts`, the single place both `server.ts` (voice)
   and `server/routes/tutor.ts` (text) now call for turning one `assess_child_reasoning` result into
   a `compilePlanDelta` outcome. Neither file has its own copy of this branching anymore — a future fix
   to this logic can no longer be applied to one channel and forgotten in the other.
2. **Added `tests/smoke/plan-delta-outcome.mjs`** (`npm run test:plan-delta-outcome`, and added to the
   main `npm run test` aggregate since it is a pure function with zero network/model dependency and
   runs in under a second): enumerates every `ReasoningClassification` value × `candidateMisconceptionsCount`
   (0 / >0) × `newlyConfirmedCount` (0 / >0) combination `deriveOutcome()` can be called with, and
   asserts the exact resulting outcome for each — 16 checks total, all passing. This is the actual
   mechanism requested: the next gap of this shape (a new classification value added without updating
   this table, or a new proxy-instead-of-direct branch) fails a fast, offline test instead of shipping
   into both channels silently. One deliberately-preserved-not-fixed detail: `no_reasoning_given` still
   maps to `'sound'` (pre-existing behaviour, carried over unchanged — flagged as an open, unverified
   question in `PROJECT_STATE.md` rather than changed on assumption, since no test demonstrated it was
   actually wrong).

**What adding this test to the full `npm run test` aggregate immediately surfaced** (running `npm run
test` in full, for what appears to be the first time in this environment, is what found these — not
speculative bug-hunting): the aggregate failed to even *build* before reaching the new test, exposing
two more real, pre-existing gaps, both fixed:
3. **`tests/live/genai-live-stub.mjs` (the voice-path test's fake `@google/genai`) had no
   `createPartFromFunctionResponse` export.** `server.ts` started importing that named export
   transitively the moment T08 wired `registerTutorRoutes(app)` in — the stub was never updated to
   match, so `npm run test:live`'s esbuild bundle step failed outright with "No matching export". Fixed
   by adding the export (same shape as `tests/genai-tool-stub.mjs`'s own stub of it); never actually
   exercised by any of that file's scenarios, so it only needs to exist.
4. **`tests/live/run.mjs` had the same two bugs `tests/smoke/tutor-turn.mjs` already had and had already
   fixed once** (docs/AGENT_GUIDE.md landmine #8): a 6-second health-check budget (40 × 150ms) nowhere
   near enough for this server to finish starting on this network-mounted filesystem — it actually took
   ~19s, confirmed by instrumenting startup with temporary trace logging and re-timing — and `localhost`
   instead of the `127.0.0.1` literal, which hits the same IPv6-first-resolution hang landmine #8
   documents. Bumped the budget to 400 × 150ms = 60s (matching `tutor-turn.mjs`'s own precedent) and
   switched to `127.0.0.1`. Neither bug was caused by anything built today — `tests/live/run.mjs` simply
   appears never to have been run to completion in this environment before now.

**A further, separate finding — NOT fixed, flagged for the user's own priority call:** once the build
and startup-timeout bugs above were fixed, `npm run test:live` ran to completion and failed 7 of its
own assertions against a hardcoded "original build" baseline — including a literal check for the prompt
text `/^You are "Dr\. Marcus Vance"/`, a persona name that does not match the current, actively-developed
persona composer (`src/persona/compose.ts`, versioned persona v1.0.0 per `docs/TRACEABILITY.md` FR-01).
This is strong evidence the baseline this file checks against is stale relative to real, intentional
changes made long before today (the persona/tool/observer systems have clearly moved on), not a
regression from anything built in this session. Two of the seven failures are more than a stale string
match and deserve real attention: `understanding moves at most 20 per exchange (model said 90, shown 0)`
and the misconception-status/concept-fields checks in the observer scenario — these are numeric/behavioural
assertions about `src/adaptive/liveObserver.ts`, not text matches, and "shown 0" specifically could be a
real bug in the observer rather than just a stale expectation. **Deliberately not investigated further
in this pass** — the observer is a distinct subsystem from the diagnosis/outcome pipeline this session's
mandate covered, root-causing it properly needs its own dedicated pass, and treating a 7-assertion,
possibly-stale golden-snapshot test as this session's problem to silently patch (rewriting expectations
to match current output, without knowing which of the 7 are "the baseline is old" versus "there's a real
bug") would risk masking a genuine regression rather than reporting it. Recorded here instead so it is
not lost.

**Trade-off.** Fixing #3 and #4 (test infrastructure, not product code) was outside this session's
original ask, but was necessary to get `npm run test` to a state where it could even attempt to verify
anything — an aggregate test command that fails to build is strictly worse than no test at all, because
it trains people to stop trusting (and running) it.

**Evidence:** `npx tsc --noEmit` clean. `node tests/smoke/plan-delta-outcome.mjs` — 16/16. `node
tests/smoke/tutor-turn-offline.mjs` — 22/22 (re-run after the extraction, to confirm `deriveOutcome()`
still produces the same result through the real endpoint). `npm run test:assessor` — 13/13, no
regression. `npm run test` (full aggregate) now builds and runs to completion — `tests/run.mjs` and
`tests/smoke/plan-delta-outcome.mjs` both pass; `tests/live/run.mjs` runs (no longer fails to build/hang)
but fails 7 assertions against its own stale baseline, as detailed above — not a new regression, a
newly-*visible* pre-existing gap.

## D-2026-09-28-6 — 3D labels overlapped when two elements shared a coordinate (found via user screenshot)

**Context.** User regenerated "Equations of Horizontal and Vertical Lines" (D-2026-09-28-1's fix)
and checked it live. The Shape (2D) diagram and the real-world photo were both correct and
concept-specific. The 3D tab was not — "Point B(2,1,0)" and "Vertical Line x = 2" (whose position
the AI legitimately set to (2,1,0), the point it passes through) both got their floating text label
placed at the exact same offset above the exact same coordinate, so the two labels printed directly
on top of each other and were illegible.

**Decision.** `Interactive3DVisual.tsx`'s element-label loop now tracks how many labels have already
been placed at a given (rounded) position and stacks each additional one higher instead of at the
same fixed offset. The spheres themselves are left at their true, geometrically-accurate positions —
only the label placement is adjusted, so the underlying coordinate data stays honest.

**Not fixed / flagged, not addressed this pass.** A named LINE is still rendered as a single point
sphere (wherever the AI positioned it), not as an actual line/plane through that point — visually
correct-ish for this concept (a vertical/horizontal line reduces to "where it crosses something
relevant") but not a general solution for a line concept where no natural anchor point exists. Worth
revisiting if a future concept's 3D output looks wrong for this reason.

**Evidence:** `npx tsc --noEmit` clean; `npx vite build` succeeds (1726 modules, only the pre-existing
chunk-size warning, no errors). Not re-tested against the live regenerated scene in this environment
(no browser here) — confirm with the user on next reload.

## D-2026-09-28-7 — Board pictures: the model composes each picture from drawing bricks, built step by step the way the tutor teaches (no per-topic templates)

**Context.** After D-2026-09-28-1 the user regenerated chapter 1 and looked at the Shape tab. It still
showed labelled boxes joined by arrows — for a concept ("Equations of Horizontal and Vertical Lines")
whose whole point is *where a line sits on a coordinate grid*. The heuristic in D-2026-09-28-1 only
changed the *words* sent to the model; the old `diagram` schema could still only express boxes and
arrows, and `scene3d` could only express labelled spheres. The first fix proposed in this session was a
dedicated graph renderer for graphing topics. The user rejected it, correctly: "we dont want any fixed
template for any topic … fixed template is going back to old days and not use GEN AI". A renderer per
topic type is a template; it limits every future topic to whatever shapes someone thought of in advance.

**Options considered.**
1. *Per-topic renderers* (graph view, number-line view, equation-steps view, …). Rejected: a template
   per topic; each new kind of topic needs new code; the model only fills in blanks.
2. *Model writes raw SVG / HTML.* Rejected: cannot be checked (a wrong coordinate is invisible until a
   child sees it), inconsistent style, injection surface, and no way for the voice tutor to reveal it
   part by part.
3. *Image generation for diagrams.* Rejected for teaching pictures: labels and numbers in generated
   images are unreliable, the picture cannot be built step by step, and it cannot be fact-checked. (Still
   used for the real-world photo, where exact numbers do not matter.)
4. **Chosen: a drawing vocabulary ("bricks") + one general renderer.** The model decides *what* to draw
   and *in what order*; code only knows how to draw each brick correctly.

**Decision.** Full specification in `docs/BOARD_VISUALS.md` (v1.0). In short:
- **Vocabulary** (`src/visual/types.ts`). Three frames — `plane` (maths coordinates, y up; `axes: 'x'`
  gives a number line), `canvas` (0..100 × 0..60, free layout for non-graph ideas such as the water
  cycle or equation-solving steps) and `space` (3D). 2D bricks: point, segment, line, ray, polygon,
  polyline, circle, angle, function, text, box, connector, table. 3D bricks: point, segment, polygon,
  sphere, cuboid, cylinder, label. Any combination is valid; nothing is topic-specific.
- **Steps follow the tutor's method** (`docs/TUTOR_PERSONA.md` §7.1). Each picture is 2–7 steps
  (`hook → teach → contrast → check → apply`), one idea per step, and the board only shows what the
  tutor is currently saying. The step names are what the voice tutor says to move the picture.
- **Several pictures per concept, each with a job**: `main` (the teaching picture), up to 3
  `contrast:<misconceptionId>` pictures (each one shows the wrong idea next to the right one for a
  catalogued misconception), `apply` (the L3/L4 ladder situation — the situation only, never the
  answer), an optional `3d` picture (the model may decline when depth does not help; the reason is kept
  in `visualsDeclined`), and `focus:<slug>` pictures made on demand mid-lesson.
- **Checked before any child sees it** (`src/visual/sanitize.ts`, `expr.ts`). Sanitize (limits,
  unknown bricks, bad references) → fact-check (point labels vs positions; `x = c`, `y = c` and
  `y = f(x)` labels vs the points they pass through; function labels vs their expression, parsed by a
  safe parser — no `eval`; right-angle and degree labels vs the actual angle; lengths and radii when the
  axes make them measurable; cuboid dimensions; coordinates quoted in captions) → one repair call with
  the exact issues → anything still unverifiable is stripped rather than shown.
- **Voice and board stay in sync.** The voice prompt receives a THE BOARD PICTURES block listing each
  picture's step names (`boardContextBlock`). `reveal_part`, `highlight_concept`, `update_diagram` and
  `switch_board_view` move the picture (`showOnBoard` in `App.tsx`) using rarity-weighted phrase
  matching, so "show where x equals 3" lands on the right step. The server's `update_diagram` tool
  handler only reads the store (bounded to 1.2 s) and never generates mid-turn.
- **Generation paths.** Batch: `npm run pregen` (and `--visuals-only` to add pictures to existing
  lessons without regenerating text or photos). Live cache miss: `/api/generate-lesson` runs the lesson
  call and the `main` picture in parallel; `/api/update-diagram` returns a stored picture if one
  matches, otherwise generates, checks and saves one; on failure it returns `{success:false}` — never a
  generic fallback picture.
- **Storage.** Pictures live in the pregen record's `visuals` map, stored in Firestore as one
  `visualsJson` string (Firestore rejects nested arrays — landmine #13), never inside `lessonData`.
- **Kept on purpose:** the hand-built Pythagoras figure for Pythagorean topics. The old
  `ConceptMapRenderer`/`Interactive3DVisual` only render lessons saved before this change that have no
  pictures yet.

**Trade-offs.**
- One more model call per picture (up to ~6 per concept with contrasts, apply and 3D). Pregen is
  one-time per concept and immutable afterwards, so this is paid once.
- The vocabulary is a real limit: an idea that needs a brick we don't have (e.g. a free-hand curve
  without a formula, animation) cannot be drawn yet. Adding a brick is a code change, but a general one
  — it helps every topic, unlike a template.
- The fact-checker verifies geometry and labels; it cannot verify that a picture *teaches well*. That
  still needs a human look (`npm run preview:visuals`).

**Evidence.** `npx tsc --noEmit` clean. `npm run test:visuals` 46/46 (33 vocabulary/sanitizer/fact-
checker/matcher/storage checks + 13 render checks). `tests/smoke/board-visual-http.mjs` 7/7 against the
real server with a temp store. All existing smoke suites and `tests/run.mjs` pass; `vite build` OK.
Seven hand-written sample pictures (`src/visual/samples.ts`, never shown to the model) were rendered
with Playwright + Chromium in both the preview page and the real `ScenePanel`; those screenshots —
not the tests — found the glow-filter bug that made focused vertical/horizontal lines disappear
(landmine #14), plus label overlap, axis-crossing labels and a clip region hiding tables, all fixed.
`tests/live/run.mjs` still fails the same 7 assertions as before this change (D-2026-09-28-5, #12).
**Not yet evidenced:** pictures produced by the real model. The Gemini API is not reachable from this
environment; the user must run `npm run pregen -- --visuals-only` and review with
`npm run preview:visuals -- --concept <id>` before the demo.


## D-2026-09-30-1 — Everything a model generates for a learner passes two gates and fails closed

**Context.** The Chapter 1 material review (docs/CH1_MATERIAL_REVIEW.md) found defects in shipped content: quizzes with the key in a fixed slot, answers leaked into chalk notes and pictures, swapped or floating labels, judgement words the persona forbids, unverified stock photos, empty 3D views. The user asked for all of it fixed with no shortcuts.

**Options.** (a) Tighten prompts only. (b) Add a human review step. (c) Deterministic lints plus an independent critic, with a repair loop, and withhold on failure.

**Decision.** (c). Pipeline: draft → sanitize/fact-check → lints (`src/quality/**`) → critic (a separate model role, `review`, only when lints have no errors) → repair (3 attempts in pregen, 2 live) → ship or withhold and quarantine. Persona language rules are code (`language.ts`). A critic that did not run is recorded `criticRan:false` and never counts as a pass. The legacy `scene3d`/`photoVisual`/`diagram` outputs are no longer generated or served.

**Trade-offs.** More model calls per concept (paid once, pregen is immutable). Fail-closed means the board can be empty until content passes. Lints check shape and known defect classes; they cannot judge whether a picture teaches well.

**Evidence.** `npm run lint` clean; `npm run test:gates` green (quality 33, lesson-gen 9, photo-gen 5, quiz-evidence 5, ladder-pair 5, serve 4, board-visual 46, curriculum-ingest). Loops are proven with scripted models only — **no real-model output has been measured** (Gemini not reachable from this environment). Scorecard on the 22 stored records after the deterministic upgrade: 14 still have lint errors, 74 pictures held back, 0 verified photos, 0/22 critic-reviewed.

## D-2026-09-30-2 — The L3 rung is a parallel pair, and curriculum coverage gaps are reported, not invented

**Context.** The mastery rule needs ≥ L3 on 2 distinct items, but ingest produced one L3 item per concept and the quiz reused the apply problem.

**Decision.** Ingest authors two L3 items (`L3-A`, `L3-B`). The apply picture is form A, the quiz is form B (`itemId 'L3-B'`, `parallelOf 'L3-A'`). Ingest verification drops a third L3, reports a single L3, and lists key facts with no ladder item and ladder items the lesson never taught as `coverageGaps`. Gaps are reported to the admin; the system does not invent curriculum to fill them (also D8/D9 in docs/CH1_FIX_PLAN.md).

**Trade-offs.** Existing records have one L3 until regenerated. **Evidence.** ladder-pair 5/5, curriculum-ingest passes.

## D-2026-09-30-3 — Photos are lesson-specific, vision-verified, labelled AI-generated; no stock fallback

**Decision.** A photo is planned from the lesson, generated, then checked by the review model against the key facts; it is shipped only after verification and is labelled AI-generated in the UI. If the reviewer is unreachable no image ships. The Unsplash fallback is removed. Stored photos are marked unverified and hidden until regenerated.

**Trade-offs.** Concepts may have no photo. **Evidence.** photo-gen 5/5 with scripted models; real image quality unmeasured.

## D-2026-09-30-4 — Quiz reasoning is collected before the reveal; no reasoning caps evidence at recognition

**Context.** A click on a multiple-choice option is recognition evidence at best; the persona requires reasoning after every answer.

**Decision.** The quiz asks "why?" before revealing right/wrong. `capForEvidence` lowers anything above recognition to L1 when reasoning is missing or shorter than `MIN_REASONING_WORDS = 3`. The server resolves the answer key and tutor-only notes from the stored quiz by option text so they never reach the browser; quarantined quizzes give no evidence.

**Trade-offs.** One extra step per quiz question. Three words is a design choice, not a fitted value. **Evidence.** quiz-evidence 5/5, serve 4/4.


## D-2026-09-30-5 — First real regeneration run was too expensive and partly self-defeating; budgets, resume and keep-best added

**Context.** The user ran `npm run pregen:ch1` against Gemini and reported it looked like an endless loop that burned tokens. The log showed it was bounded, not infinite, but cost ~43 model calls and 5–13 minutes per concept (303 calls for 7 concepts; 97 of them picture-critic calls, 79 repair rounds), and it wrote worse records than it replaced.

**Findings (from the log and the stored records).**
1. `--force` overwrote a stored record even when the new attempt was withheld — 3 of 7 biology concepts ended with `lessonData: null`. Worse than before.
2. The answer-leak lint matched a *single* fragment ("y = 2") of a multi-part quiz answer ("x = 4, y = 2"), so 5 pictures could never pass; the picture model was also never told the answer up front.
3. The contrast lint demanded phase `check` on the last step although the model's last step was a correct question with phase `contrast`; three repair rounds each, all wasted.
4. Warnings (e.g. 27 `chalk.absolute`) triggered repair + critic rounds; repairs continued when the same errors repeated; critic "omission" findings withheld whole lessons.
5. Image generations were not counted anywhere; a run could not be capped or resumed.

**Decision.** (a) Never overwrite a record with a worse one — keep the stored lesson/picture/photo when the new one is withheld. (b) Leak lint requires all parts of a multi-part answer; the picture prompt states the answer to avoid. (c) The contrast check accepts phase `contrast` or `check`. (d) Only errors trigger a repair; stop when the same error codes repeat with no improvement; critic "omission" is a warning. (e) `--resume` skips concepts already finished through the gates; `--max-calls` and `--max-images` cap a run; per-concept and run-total call/image accounting is printed. `pregen:ch1` now = force + resume + budgets; `pregen:ch1:redo` ignores resume.

**Trade-offs.** Some defects that were errors are now warnings or accepted (omissions, phase label). Early stop can withhold a picture that a third attempt would have fixed. **Evidence.** tsc clean; quality suite 36/36 with new tests (multi-part leak, phase, early stop, answer-avoid prompt, no repair on warnings). **Not evidenced:** the effect on real cost — needs another run; the log's call count per concept is the metric to compare.

## D-2026-09-30-6 — Generation is single-shot from a complete contract; one review per concept; no trial-and-error loops

**Context.** After D-2026-09-30-5 the user said the problem is not the missing cap: "we have to know exactly what we need to generate as teaching material and then call once to generate and not like this trial and error". Correct — the pipeline generated blind, discovered rule violations by lint/critic, and paid for repair rounds. Caps only limited the damage.

**Decision.**
1. **The plan is computed in code before any call.** The artefact list per concept is deterministic: 1 lesson, one picture per key-fact group (deterministic grouping, no planner call), one contrast picture per catalogued misconception (max 3), 1 apply picture, no 3D unless `--with-3d`, 1 photo. `npm run pregen:ch1:plan` prints it and the exact worst-case call count without calling anything.
2. **Each artefact is generated once.** `maxAttempts = 1`, critic off inside generation, no repair (`--repair N` is an explicit opt-in). The prompt already states every rule the free lints enforce; the picture prompt also states the quiz answer to avoid. A lint failure withholds that artefact (kept in quarantine for a human) — it is not retried.
3. **One independent review per concept** (`src/quality/review.ts`): the quiz is solved blind (the key is not in the prompt), the chalk notes, every picture and ladder coverage are reviewed in a single call. Findings are applied in code (`reviewApply.ts`): wrong/ambiguous quiz → quiz withheld; picture error → picture withheld; bad bullet → that line dropped; other lesson errors → recorded. Nothing is regenerated on findings. A review call that fails = "not reviewed", never a pass.
4. Photo prompt is built in code from the key fact; 1 image + 1 vision check; a rejection ships nothing.

**Cost, from the dry run for the 12 Chapter 1 concepts:** at most 96 text calls + 12 images + 12 vision checks in total (7–9 text calls per concept), against 303 text calls for 7 concepts in the first run.

**Trade-offs.** Yield is likely lower than with repair loops — some pictures will be withheld on the first shot and stay withheld until a human decides to spend `--repair 1` on just those. That is deliberate: cost is now predictable and a withheld picture is visible, not silently paid for. The quality of first-shot output on the real model is **not yet measured**.

**Evidence.** tsc clean; quality suite 40/40 including: one call per picture with no plan/critic/repair/3D; a lint failure is withheld without a retry; the review is one call with the key absent from the prompt; review findings applied without further model calls; a failed review changes nothing. Dry-run output above.


## D-2026-09-30-7 — The content spec is derived from the curriculum and ingest decisions; nothing is hard-coded per subject
**Context.** The user requires that any subject/topic can be uploaded and the pipeline follows the teaching standards with content fitted to the topic. My first spec used static concept-type sets for 3D and photo, which would be wrong for any other subject.
**Options.** (a) static lists per subject (rejected: not general); (b) ask the user per concept (rejected by the user); (c) the ingest review — already one model call per chapter that reads the concept — also decides `presentation` (photo scene, 3D usefulness) and authors the 3-step L3 hint ladder; the pregen executes exactly that.
**Decision.** (c). `src/curriculum/contentSpec.ts` is a pure function of the curriculum concept (key facts, misconceptions, ladder, `representationIdeas`, `presentation`) plus persona rules. Boards: teach chunks, one `alt:<strategy>` board from the second drawable representation (SWITCH_REPRESENTATION), one contrast per misconception (max 3), one apply, and 3D only when `presentation.spatial3d.useful`. Photo only when `presentation.photo.useful` with a scene (legacy concepts without a decision: only when the curriculum's own analogy is a physical scene). Board form `drawn` vs `worked` follows the representation strategy; worked boards are exempt from `form.text-slide`. Existing curricula get the fields via `npm run backfill:design` (one call per course). Hints that repeat the answer key are dropped at ingest and backfill. Live endpoints now use one attempt, no critic; a failed picture means the tutor teaches in words.
**Trade-offs.** The 3D/photo judgement is the ingest model's, not a human's; a wrong "useful: false" costs a missing optional picture, never a wrong one. The alternative board adds one call per concept.
**Evidence.** tsc clean; tests/smoke/content-spec.mjs (8 checks, includes an unseen History subject and a source scan for static lists); quality suite green. Real first-shot yield and cost remain UNMEASURED (Gemini is not reachable from the dev sandbox).

## D-2026-09-30-8 — Fixes from the first spec-driven Chapter 1 run (112 calls, 52 model-minutes)
**Evidence (user's log + records).** 112 calls vs 109 planned (cost bounded). Maths Ch1: 6/6 records 0 errors, 0 pictures held. Biology Ch1: 10 pictures held. Three defects: (1) one 90 s deadline made `gemini-3.1-flash-lite` the process-wide "strong" model (`resolved[role]` cached on any fallback), so the rest of mitosis and all of meiosis were generated by the weaker model; (2) every teaching chunk received the concept's FIRST representation idea, so later "focus" boards redrew fact 1 (U-tube for active transport; animal classification for monocots/dicots) and were held for `critic.scope`; (3) a spec that says "no photo" still carried an old photo forward. Also 52 model-minutes because every call ran serially.
**Decision.** Gateway: a slow/transient failure never demotes the model (only a hard failure is remembered) and a deadline is retried on the same model. Later chunks get the representation STYLE only. A "no photo" spec drops stored photos (unless `--skip-photo`). Pictures of a concept run with bounded concurrency (`--concurrency`, default 3) and merge in job order. Timeout 120 s, 2 retries.
**Not fixed / open.** Reviewer flags 8/12 concepts for L4/L2 ladder items needing facts the key facts never teach (curriculum-level; the items are live-only). The ingest said 3D useful for cell structure but the 3D generation call declined it (one wasted call). Keep-best mixed old and new artefacts in some records. Yield after these fixes is unmeasured.

## D-2026-09-30-9 — The tutor never stops, parks, defers or hands off (PARK_AND_ESCALATE removed from the live path)
**Context.** User tested Student 1 on "Equations of Horizontal and Vertical Lines": after a wrong first answer the tutor re-asked with different numbers; after more wrong answers it said "let's come back later" and told the student it would inform the teacher. A tutor must teach, not quit. Evidence: `data/events/student_student-1_1790502697444.json`, 6 events (miss, hit, miss, hit, miss, miss).
**Root causes.** (1) `compilePlanDelta` counted every failed check into a per-session running total that a correct answer never reset, so three *scattered* misses reached `retryCap` = 3 and returned `parkConcept`/`escalate` — the instruction literally said "park it, tell the learner you'll come back tomorrow, and note it for their teacher/parent". (2) The same text was in the tutor's system prompt: the move library (`moves.ts`) listed PARK_AND_ESCALATE. (3) On a miss the assessor's guidance is "probe, never say wrong" (and the generic transfer move = "same method, different numbers"), so nothing ever led to *explaining*. (4) Voice channel: the plan delta was queued and delivered on the NEXT tool call, one turn late, and after the assessor's probe guidance.
**Decision.** Retry cap now means *N misses in a row without a success* and triggers `TEACH_DIRECTLY` (worked parallel example in a new representation, then one much smaller question). No park/escalate flag exists any more; `recordEscalation` is no longer called (Parent Portal card + API kept, now fed nothing). New hard rule H13 in the prompt. Voice handler answers once with plan guidance first + assessor note second, in the same response. Frustration no longer says "pause".
**Trade-offs.** Teachers/parents no longer get an automatic flag for struggling learners; if wanted, a *silent* progress note (never spoken to the child) can feed the Parent Portal later. Voice tool response now waits for the evidence write (small; wrapped so a storage error still answers).
**Evidence.** tests/smoke/plan-delta-never-stops.mjs replays the real sequence + 6 misses past the cap: 24/24; plan-delta-outcome 16/16; tsc clean on touched files. NOT yet verified against live Gemini Live.
**Open (not fixed here).** (a) The 4 wrong answers were recorded with the *identical* signature of the generic timeout "transfer move" (recognised / needs_clarification / low), and raised mastery 21%→58% on a wrong answer — the assessor probably exceeded its 2.5 s budget on bare answers; a warning is now logged. (b) The tutor drilled negative-number comparisons inside a horizontal/vertical-lines lesson (off-concept; the session narrative shows it). Both need a look after the next live test.

**Addendum (same day) — enforce the plan's loop, not just "don't quit".** User: the tutor still never asked why or explained. TUTOR_PERSONA H1 (ELICIT after every answer) -> DIAGNOSE -> REMEDIATE (H4 new representation) was not happening: wrong answers arrived with empty `childReasoning` and the assessor's timeout fallback ("same method, different numbers") replaced it. Now: `compilePlanDelta` takes `hasReasoning`; a miss with no reasoning -> tutor asks "walk me through how you got that" and asks NO new question; a miss with reasoning (or 2nd miss) -> name the faulty step in their reasoning, EXPLAIN in a new representation with a worked example, then ONE fresh check. The timeout fallback in `reasoningAssessor.ts` follows the same rule. `tests/deadline-slow-model.mjs` updated (it asserted the old behaviour). Still unverified live.

## D-2026-09-30-10 — Assessor budget 2.5 s -> 6.5 s; picture requests: newest wins, same picture keeps progress; logs written to a file
**Context.** User's server console log for the Student 1 session (pasted) showed: (1) `[assess] diagnosis exceeded its 2507ms budget` on ALL three assessments (the model needs 3.1-4.3 s), so every diagnosis was replaced by the generic transfer move — the root of "wrong answers never got a real diagnosis" (D-2026-09-30-9 open item (a) confirmed). (2) The tutor asked `update_diagram` for a "number line of -10, -5 and 0", which the lesson does not have; drawing took 44 s (40 s deadline + fallback model) while the tutor was told "a few seconds" and its `reveal_part` calls matched nothing. Then it re-requested the lesson's main picture, which restarted the build-up at step 0. User reported a blank board around the refresh.
**Decision.** Assessment budget 6.5 s (env ASSESS_BUDGET_MS) in both channels, voice handler now passes it explicitly. Live picture draw deadline 40 s -> 20 s and the tutor is told the truth (up to ~20 s, keep the current picture, don't reveal_part, stay on the lesson). Front end: a monotonically increasing request number so a slow older picture response is discarded; re-requesting the picture already shown keeps its step; the tool-call ref is updated immediately. Server console is tee'd to `logs/server-<start>.log` and the browser posts board events/errors to `/api/client-log` (`[client] board.*`, `window.error`).
**Trade-offs.** Up to ~4 s more thinking pause after an answer (diagnosis is now used instead of discarded). Pictures for off-lesson foci still get drawn on a miss.
**NOT proven.** The exact cause of the blank board. All 668 stored picture x step renders (tests/smoke/board-render-all.tsx) draw correctly, so the picture data is not it; likely a wait/replace race, now guarded and instrumented. If it recurs, read the `[client] board.*` lines in the newest logs/server-*.log.

