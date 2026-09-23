# Lumen — Google-native learning companion

**Status:** plan locked on `feature/lumen-companion`. Implementation follows [`lumen-development-phases.md`](lumen-development-phases.md) — each phase has a verify gate.  
**Persona:** Dr. Marcus Vance → **Lumen** (alts: Mira, Sage).  
**Gamma deck:** https://gamma.app/docs/Lumen-pdlxdx2dgtash69 — learner journey (Higgsfield stills in `docs/lumen-journey/`) plus a **tech design** section (stack diagrams in `docs/lumen-tech/`).  
**Stitch UI flows:** [Lumen — kid + parent flows](https://stitch.withgoogle.com/projects/129555699613723228) — new-kid onboarding + first lesson, returning-kid week-5 options, science / exam / writing topics, parent dashboard.  
**Live API doc used:** [Firebase AI Logic · Gemini Live API](https://firebase.google.com/docs/ai-logic/live-api?api=dev) (Preview, updated 2026-09-21).

---

## 1. What we are adding (this revision)

| Ask | Answer |
|---|---|
| Cross-questions like a human tutor | **Yes, in-session.** After an answer, Lumen asks *how*, then one discriminating probe. It does not say the answer. |
| 15–20 min lesson, then a task | **Yes.** Length is chosen at start (default 15). Live audio-only is ~15 min without compression — we treat that as the lesson, then wrap. |
| Next session continues + checks the task | **Yes.** Open tasks live in Firestore. Opening line: “Did you try X?” then cross-check the method, then resume the graph. |
| Save live captions | **Yes.** Input + output transcription already streams from Live. Today it only hits the UI. Persist each finished turn to `sessions/{id}/turns`. |
| AI analytics on those captions | **Yes.** Firebase AI Logic (text, not Live) summarises the stored transcript after the session. GA4 gets anonymised *events* only. |
| Language-agnostic + changeable voice | **Yes.** Live infers language from speech. Voice is a picker (`speechConfig.voiceName`). Today it is hardcoded `Puck`. |
| Homework / exam / writing modes | **Yes.** Before (and after) a session Lumen asks what they need — same family of jobs as [Gemini for Students](https://gemini.google/students/), but Lumen still will not dump answers. |
| Student profile + growing start chips | **Yes.** First meet: age band, language, subjects, interests. “What do you need today?” chips start generic and get specific as sessions, tasks, and exam dates appear. |
| Gemma | **Out.** That was a mix-up with [Gamma](https://gamma.app/). No on-device Gemma in this plan. |

---

## 2. How we use Live today vs the official AI Logic path

We already speak Gemini Live. We do **not** yet use the Firebase AI Logic *client* Live SDK.

| | **Now (`server.ts`)** | **Firebase AI Logic Live (docs)** |
|---|---|---|
| Who holds the socket | Cloud Run, `@google/genai` `ai.live.connect` | Browser `getLiveGenerativeModel` + `connect()` |
| Model | `LIVE_MODEL` default `gemini-3.8-live` | Docs: `gemini-3.1-flash-live-preview` (Dev API) or 2.5 native-audio |
| Audio | PCM in/out via our WS + `audio.ts` | `startAudioConversation` / `sendAudioRealtime` |
| Transcription | `inputAudioTranscription: {}` + `outputAudioTranscription: {}` — forwarded as `input_transcript` / `output_transcript` | Same fields; language **inferred** from audio |
| Voice | Hardcoded `Puck` | `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName` |
| Language | Not set (model follows the child if the prompt allows) | **Cannot set** in AI Logic config; system instruction “RESPOND IN …” |
| Tools / board | Function calls on the server | Tools “coming soon” in the AI Logic Live docs |
| VAD | We can set silence / end-sensitivity (`liveConfig.ts`) | AI Logic: **VAD not configurable yet** |
| Session length | We do not compress/resume on the current classic path | Audio-only ~**15 min** without compression; WS ~**10 min** then `goAway`; resume handle to continue |
| Key | Server `GEMINI_API_KEY` | Client SDK + App Check (**enforced from 2 Nov 2026**) |
| Status | Production path for this app | **Preview** — no SLA |

**Decision: keep Cloud Run as the Live mouth.** Reasons: board tools, VAD, assessor/observer, persist captions without putting the API key in the browser, and we already paid the silent-tutor cost on this path.

**Firebase AI Logic is the analytics + homework brain** (text `getGenerativeModel` / structured JSON), not a second Live socket. `src/firebase/client.ts` already has `getAI` + `getGenerativeModel`. Use that (plus the same models on Cloud Run with Admin) for:

- Post-session digest from stored captions
- Homework task generation
- “Did they do the task?” check on next open
- Parent-readable summary

Do **not** open a client Live session in parallel. Two mouths = two contexts.

App Check is still required before any *client* AI Logic call. Live audio stays server-side.

---

## 3. Tutor behaviour: cross-questions + take-home task

A human tutor does two kinds of check. We implement both.

### A. In-session cross-check (every answer)

```
child answers
  → if no method: “How did you get that?”     (elicit)
  → assess (observer or budgeted tool)
  → if method unclear / suspected: ONE probe that splits two misconceptions
  → never state the answer
  → if confirmed broken: new representation, then a transfer example
```

This is the existing adaptive contract (`reasoningAssessor`, two-observation ledger). It must be **on by default in the spoken prompt**, not only behind `VOICE_MODE=adaptive`. Classic short turns stay; the extra rule is: *after a worked example, ask how, then one check question.*

Probe cap (e.g. 2 per concept per session) so it does not tire the child.

### B. Session clock → wrap → homework

Live audio-only is ~15 minutes before context pressure. That is the product length, not a coincidence.

1. Start screen: **Lesson length** 10 / 15 / 20 min (default 15). Stored on `sessions/{id}.durationMin`.
2. At `durationMin - 2`: Lumen wraps — one sentence recap, then assigns **one short task** (not a worksheet dump).
3. Task is written on the chalk view and saved as `learners/{id}/tasks/{taskId}`.
4. If Live sends `goAway` first, we still write the task from the last concept + ledger (server, not the voice model).

Task shape:

```
{
  taskId, learnerId, conceptId, sessionId,
  prompt,          // "Try a ladder 5 m from a wall, hypot 13 m — find height. Write your steps."
  expectedKind,    // "method" | "numeric" | "explain"
  status: "open" | "done" | "skipped" | "needs_reteach",
  assignedAt, dueSessionHint
}
```

### C. Next session (intelligence from Firestore)

On `POST /api/session/start` (or WS query):

1. Load learner + last session summary + **open tasks**.
2. Inject into Live system instruction (not the raw 15 min transcript — a compact brief):

```
Last time: concept find-leg, mastery 42%, suspected m2 (add instead of subtract).
Open task: ladder 5/13. Ask if they did it. If yes, elicit METHOD first, then assess.
If no / skip: one 60s recap, then continue from find-leg, do not restart the chapter.
```

3. Spoken open: “Did you try the ladder problem?” → cross-check → update task status → BKT → next concept if ready.

Past-session intelligence is **Firestore state**, not Gemini’s 24h resume handle. Live resume is only for a dropped *same* lesson (wifi blip). Homework lives across days.

### D. Session intent — homework, exam, writing (Gemini for Students)

[Gemini for Students](https://gemini.google/students/) is Google’s study-buddy surface: **Live**, notebooks from uploaded class materials, personalised quizzes, a performance tracker, exam-prep prompts, step-by-step walkthroughs, and real-time feedback on calculations / essays / presentations. Lumen should offer the **same jobs**, not clone the Gemini app.

We are not competing with Gemini’s student hub. We are the **voice tutor that remembers how this child thinks** and will not write the homework for them. Gemini’s own FAQ says it is meant to help you study, not just generate answers — Lumen enforces that with the ledger.

**Four intents** (stored on `sessions/{id}.intent`):

| Intent | Child is here to… | Lumen does | Lumen does **not** |
|---|---|---|---|
| `learn` (default) | Continue the course | Teach → elicit → probe → transfer | Restart the chapter |
| `homework` | Get unstuck on *this* problem | Read the problem (typed, spoken, or photo), elicit their attempt, check the method, one hint ladder | Give the final answer on the first ask |
| `exam` | Prepare for a test | Short diagnostic (3–5 items from the graph or notebook), then drill **weak** concepts; wrap with a focus list | A 40-question dump in 15 minutes |
| `writing` | Improve a piece of writing | Rubric: claim, structure, evidence, clarity. Child reads or pastes; Lumen asks them to revise one thing | Write the essay / paragraph for them |

**Before the session (start ritual)**

Order matters:

1. If the learner has **no profile yet** → first-meet (section 3E). Do not show job chips until the four core answers exist.
2. If there is an **open task** → “Did you try X?” (always first).
3. Then Lumen (or start-screen chips the child can tap **or** say) asks **What do you need today?**  
   The chips are **computed from the profile + last digest**, not a fixed four. Seed family is the same as [Gemini for Students](https://gemini.google/students/): Continue · Homework help · Exam prep · Writing help. Labels get specific as learning grows (section 3F).
4. If they say homework / writing and have no artefact: “Show me the question or paste the paragraph.” Photo → Storage → Files API (same path as textbooks).
5. Intent + artefact id go on the session and into the Live system instruction.

**After the session (wrap ritual)**

At `durationMin - 2` the wrap depends on intent:

| Just finished | Wrap says | Offer / assign |
|---|---|---|
| `learn` | One-line recap | One practice task for next time |
| `homework` | “You can finish the last step on your own” | Optional: “Want exam-style questions on this next time?” |
| `exam` | Strengths + 1–2 focus areas (performance tracker) | One weak-spot item as the take-home task |
| `writing` | One revision target | “Bring the next draft next time” |

Lumen **asks** — it does not auto-switch. Example wrap: “We can keep going on the theorem next time, or do exam prep on this chapter. What do you want?” Answer is stored as `learners/{id}.nextIntentHint`.

**How this maps to Gemini for Students (steal the job, keep our loop)**

| Gemini for Students | Lumen equivalent |
|---|---|
| [Gemini Live](https://gemini.google/students/) for hard concepts | Our Cloud Run Live mouth |
| Study notebook from uploads | Our curriculum ingest + session brief |
| Personalised quizzes | `exam` intent: 3–5 items from the graph / notebook |
| Performance tracker / growth areas | BKT + ledger + `aiDigest` focus list |
| “Walk me through this homework” | `homework` + elicit-first, hint ladder |
| “Create a quiz / study guide for my exam” | `exam` wrap → Firestore quiz set (AI Logic text) |
| “Check my calculation / feedback on my essay” | `homework` numeric check / `writing` rubric — still ask *their* method first |
| Image / visualisation of a concept | Existing board + Imagen / photo tool |
| Career prep, 5 TB, 18+ US student plan | **Out of scope** (wrong age, not our product) |

Gemini Student is a **general Gemini app** with study templates. Lumen is a **closed tutoring loop** with memory. Same prompt family, different contract.

### E. Student profile — what Lumen asks (first meet)

Today `LearnerProfile` is only `name` + `grade` + subject progress (`src/adaptive/learnerModel.ts`). That is not enough to pick a voice, an analogy, or the start chips.

**Ask by voice, one question at a time, with chips they can tap or say.** Not a 12-field form. Parent can pre-fill; the child can change any answer later (“I want to talk in Hindi”).

| # | Ask (spoken) | Chip / answer | Stored on `learners/{id}` | Why Lumen needs it |
|---|---|---|---|---|
| 1 | “What should I call you?” | typed / spoken name | `name` | Address them; already exists |
| 2 | “How old are you?” | 8–10 · 11–13 · 14–16 | `ageBand` | Analogies, default voice, default lesson length |
| 3 | “What year / grade are you in?” | chips from locale, or spoken | `grade` | Curriculum pack + board difficulty (already exists) |
| 4 | “Which language shall we talk in?” | English · हिन्दी · 中文 · Español · Other | `preferredLang` | System instruction “RESPOND IN …”; Live still follows speech |
| 5 | “What do you want help with?” | Maths · Science · English · Other (multi) | `wantedSubjects[]` | Which graphs / uploads to offer first |
| 6 | “What do you like? I use this for examples.” | Football · Cooking · Space · Music · Games · Skip | `interests[]` | Concreteness-fading: ladder → football pitch, not a random wall |
| — | (optional, parent or later) | exam date, parent language, voice | `examDate?`, `parentLang`, `voiceName` | Exam chip appears; digest language; default `Puck` until they pick |

**Rules**

- Core four before first lesson: **name, ageBand, grade, preferredLang**. Subjects + interests can wait one session if the child is impatient — Lumen asks at the first wrap instead.
- Never ask for school, address, photos of the child, or “are you struggling?” Shame-free. Age band, not birthday.
- Interests are **examples**, not a personality test. Max 3. Skip is fine.
- Profile is written by Cloud Run / Admin, same as sessions. Child can say “call me Ada” or “talk in Tamil” mid-lesson; that updates the doc and the next system-instruction refresh.

```
learners/{learnerId}
  name, ageBand, grade
  preferredLang, parentLang?
  wantedSubjects[]          // what they said they need
  interests[]               // analogy seeds
  voiceName, defaultDurationMin
  examDate?                 // if set, exam chip becomes specific
  nextIntentHint            // from last wrap
  createdAt, updatedAt
  subjects/{subjectId}/…    // existing BKT + ledger
```

`ageBand` maps to defaults (overridable):

| Band | Default voice | Default length | Analogy register |
|---|---|---|---|
| 8–10 | Leda | 10 min | stories, objects in the room |
| 11–13 | Puck | 15 min | sport / games / school objects |
| 14–16 | Kore | 15 min | exam language, fewer cartoons |

### F. Growing start chips — “What do you need today?”

The four Gemini-for-Students jobs are the **seed family**, not a frozen menu. A resolver builds **at most four chips** from Firestore before the start screen. The child can always say something that is not on a chip.

| When this is true | Chip shown (example) | Intent |
|---|---|---|
| First day, profile exists, **no** sessions | Start a lesson · Homework help · Exam prep · Writing help | `learn` / `homework` / `exam` / `writing` |
| ≥ 1 session on a subject | **Continue Pythagoras** (not “Continue last session”) | `learn` |
| Open task | **Finish the ladder problem** (outranks generic Continue) | `learn` then task-check |
| `aiDigest.examFocus[]` or `examDate` within 14 days | **Exam in 6 days — triangles** | `exam` |
| Last wrap was writing / `writingNextDraft` | **Next draft of your essay** | `writing` |
| New upload, unused | **Try your science book** | `learn` on that subject |
| Confirmed misconception still open | **Practice the method we fixed** | `learn` (transfer item) |
| `wantedSubjects` has a subject with 0 sessions | **Start Science** | `learn` |
| Interests include football + current concept is right triangles | (not a chip) — used *inside* the lesson as the worked example | — |

**Priority (top 4 win):** open task → continue last subject → exam-if-soon → homework → writing-if-draft → new subject → generic seed.

As learning grows, generic labels **narrow**:

```
Day 0     Start a lesson · Homework help · Exam prep · Writing help
Week 2    Continue Pythagoras · Homework help · Exam prep · Writing help
Week 5    Finish the ladder · Exam in 6 days — triangles · Next draft · Try Science
```

Same four jobs. Different words. Lumen speaks the same question every time: “What do you need today?” — then offers the current four.

Resolver input: profile + open tasks + last `aiDigest` + `nextIntentHint` + `examDate`. Output: `{ chips[1..4], spokenPrompt, defaultIntent }`. Stored on `sessions/{id}.offeredChips` so we can see which suggestions they ignored (GA4 `intent_offered` / `intent_chosen` already in the event list).

---

## 4. Captions → Firestore → AI analytics

### What already streams

`server.ts` enables both transcription configs and pushes fragments to the browser. Official note: transcripts stream with the audio; **collect per turn, then persist on `turnComplete`**. Language is inferred. SDK field names are `inputTranscription` / `outputTranscription` on some paths — we currently also read `inputAudioTranscription`. Persist the **joined turn**, not every fragment.

### Write path (Cloud Run Admin SDK)

```
sessions/{sessionId}
  learnerId, subjectId, conceptId
  intent                     // learn | homework | exam | writing
  artefactId?                // Storage photo / pasted text for homework or writing
  startedAt, endedAt, durationMin
  languageInferred?          // e.g. "hi-IN" if we detect it
  voiceName                  // Puck, Kore, …
  status: live | wrapped | abandoned

  turns/{turnId}
    role: child | tutor | board
    text                     // full caption for that turn
    at, seq
    language?

  captions/{turnId}          // optional mirror for parent replay UI

learners/{learnerId}
  name, ageBand, grade, preferredLang, parentLang?
  wantedSubjects[], interests[], voiceName, examDate?
  nextIntentHint
learners/{learnerId}/tasks/{taskId}
learners/{learnerId}/subjects/{subjectId}/concepts/{conceptId}
  pKnown, ledger[], lastSessionId, lastBrief   // compact, not full captions
```

**Do not put raw captions in GA4.** Parent portal reads Firestore. Retention: 30 days default; parent delete.

### AI analytics (Firebase AI Logic text models)

After `endedAt` (Cloud Run, or a Function on Firestore write):

1. Read `turns` (text only).
2. `getGenerativeModel` structured JSON:

```
{
  recap,                 // 3 sentences, child's language
  strengths[],
  suspected[],           // catalogue ids only
  recommendedNext,
  recommendedNextIntent, // learn | homework | exam | writing
  homeworkCheckHint,     // how to open next time
  examFocus[],           // weak concept ids after an exam session
  writingNextDraft,      // one revision target
  parentPlain            // no jargon
}
```

3. Store on `sessions/{id}.aiDigest`.  
4. GA4: `lesson_start` (+ intent), `lesson_wrap`, `intent_offered`, `intent_chosen`, `task_assigned`, `task_reviewed`, `misconception_*`, `mastery_delta`, `voice_silence`, `caption_turn` (count only).

That is the “AI analytics” layer: Gemini on **stored captions**, plus GA4 for product health.

---

## 5. Language-agnostic + voice picker

Official Live behaviour ([configuration](https://firebase.google.com/docs/ai-logic/live-api/configuration)):

- Models **choose language from the audio**. You cannot set `responseLanguage` in AI Logic Live config.
- Vertex/native-audio can take `language_code` on `speech_config`; still often ignored if the child switches.
- Best results: system instruction  
  `RESPOND IN THE CHILD'S LANGUAGE. YOU MUST RESPOND UNMISTAKABLY IN THAT LANGUAGE.`
- Supported set includes en-US, en-IN, hi-IN, ta-IN, te-IN, es-US, zh (3.x), etc. Good for Singapore / India mix.

**Voice** is independent of language. 30 prebuilt names. We ship a short kid-safe list:

| Voice | Character |
|---|---|
| Puck | Upbeat (current default) |
| Kore | Firm |
| Leda | Youthful |
| Sulafat | Warm |
| Charon | Informative |
| Aoede | Breezy |

Client passes `?voice=Kore&langHint=hi-IN` into `/ws/live`. Server sets `speechConfig.voiceName` and the language line in the system instruction. Changing voice mid-lesson = reconnect (config is mostly immutable after setup). Changing language mid-lesson = child just speaks; optional mid-session system-instruction update.

Captions stay in the spoken language. Digest can be parent-language later (`parentLang` on the learner).

---

## 6. Actors, sources, stack (unchanged intent)

**Actors:** learner, parent, teacher (later), Lumen, curriculum upload.

**Sources (priority):** concept graph → this session turns → learner **profile** (ageBand, lang, interests) + open tasks + `nextIntentHint` → last `aiDigest` → homework/writing artefact → uploads → optional Search grounding. Never raw web as the lesson.

**Stack**

| Need | Product |
|---|---|
| Mouth | Gemini Live on Cloud Run (`server.ts`) |
| Captions persist | Firestore `sessions/*/turns` |
| Homework + next-session brief | Firestore `tasks` + compact `lastBrief` |
| AI digest / homework check | Firebase AI Logic **text** (structured JSON) |
| Product metrics | GA4 events (no transcripts) |
| Voice / length / model | Remote Config + start-screen pickers |
| Images / quizzes | Firebase AI Logic / Gemini image (in-lesson). Higgsfield = offline stills only |
| Abuse | App Check before any client AI Logic |

No Gemma. No second Live client.

---

## 7. Session clock vs Live limits

| Limit | What we do |
|---|---|
| ~10 min WS / `goAway` | Resume handle if the *same* lesson should continue; UI already needs this |
| ~15 min audio without compression | Default lesson = 15 min, then wrap + task |
| 20 min option | Enable context compression + one resume; still assign a task at the end |
| Next day | **Not** Live resume. Load Firestore brief + open task |

---

## 8. Phased build

Playbook with **verify gates after every phase:** [`lumen-development-phases.md`](lumen-development-phases.md).  
No phase is done until `npm run lint`, `npm test`, and that phase’s checklist pass. Voice phases also need `npm run diagnose:voice`.

| Phase | Ship | Verify (short) |
|---|---|---|
| **0 Persona** | Lumen copy; orb | No “Dr. Vance” in learner UI or spoken prompt |
| **1 Cross-check prompt** | Elicit + one probe in the *classic* spoken rules | Broken method → “how?” + one probe; `test:live` green |
| **2 Captions in Firestore** | Persist joined turns on `turnComplete` | Turns survive kill/refresh; not sent to GA4 |
| **3 Session clock + task** | 10/15/20 picker; wrap assigns `tasks/*` | Next session asks “Did you try X?” |
| **4 Profile + growing chips** | First-meet; chips computed (max 4) | Day-0 ≠ week-5; interests are not chips |
| **5 AI digest** | AI Logic **text** structured JSON | `aiDigest` after wrap; still one Live socket |
| **6 Voice + language** | Voice picker; langHint | Kore + non-English lesson still speaks |
| **7 Any-topic board** | Generic fallback + pack #2 | Science fade works; no Higgsfield in Live |
| **8 Knobs / App Check** | Remote Config + App Check | Change voice/length without redeploy |
| **9 Teacher** | Class heat on misconception ids | Later; no leaderboard |

---

## 9. Decisions (working locks)

Used as defaults so Phase 0 can start on `feature/lumen-companion`. Change here if the cup review disagrees.

1. **Name:** **Lumen**.  
2. **Course brain:** keep extending `server.ts`.  
3. **Auth:** named profiles for the cup.  
4. **Default length:** **15 min**.  

Gemma is not a decision. Gamma is the slide deck only.

---

## 10. How Lumen’s intelligence is built

Lumen is not a new model. It is **one Live mouth + a compact memory + a small tool set**. The model forgets every night. Firestore does not.

```
                    +-------------------------------------+
   first meet       |  learners/{id}                      |
   + each wrap  --> |  profile, BKT, ledger, tasks        |
                    |  lastBrief, nextIntentHint          |
                    +------------------+------------------+
                                       | compact brief only
                                       v
   Cloud Run WS  -->  Gemini Live  (mouth + board tools)
                                       |
                    captions ----------+-------- assess_child_reasoning
                    LiveObserver       |         (budgeted, or observer)
                    (side channel)     v
                    sessions/{id}/turns  -->  AI Logic text  -->  aiDigest
```

### 10.1 Where the persona lives

There are **two** personas. They are assembled in different places.

| Persona | What it is | Where it is set | Injected how |
|---|---|---|---|
| **Lumen** (tutor) | Voice, rules, fade order, “never dump the answer” | `src/live/liveConfig.ts` — `classicSystemInstruction` / `adaptiveSystemInstruction`. Today it still says “Dr. Marcus Vance”. | Passed as `systemInstruction` on `ai.live.connect` in `server.ts` |
| **This child** | Age band, language, interests, subjects, voice | `learners/{id}` (first-meet, section 3E) | Folded into the same system instruction as a **short block**, not a second Live session |
| **This child’s history** | pKnown, ledger, open task, last digest | `learners/{id}/subjects/…` + `tasks` + `sessions/{last}.aiDigest` | Same block: 8–15 lines. **Never** the raw 15-min transcript |

On `POST /api/session/start` (or WS query) Cloud Run builds one string:

```
You are Lumen. Voice-first tutor. Never state the answer.
Child: Ada, 11–13, prefers Hindi, likes football.
Intent: learn. Length: 15. Voice: Puck.
Subject: Pythagoras. Concept: find-leg. pKnown 42%.
Ledger: m2 suspected (add instead of subtract), 1 observation.
Open task: ladder 5/13 — ask if they tried it. Elicit METHOD first.
Last digest: struggled to name the hypotenuse; next = find-leg.
RESPOND IN THE CHILD'S LANGUAGE.
```

That is the only “intelligence hook” at session start. No extra AI API to “fetch the student”. It is a Firestore read + template.

Change Lumen’s character (warmer, shorter, more Hindi) **in `liveConfig.ts`**, plus Remote Config knobs (`default_voice`, `default_duration_min`). Do not put the child’s history in a prompt file on disk.

### 10.2 How intelligence is collected (three timescales)

| When | What we capture | Who writes | What we do **not** do |
|---|---|---|---|
| **Every turn** | Joined captions (`input` + `output`) | Cloud Run on `turnComplete` → `sessions/*/turns` | Do not send transcripts to GA4 |
| **Every answer** | Method + classification + BKT update | `assess_child_reasoning` (adaptive) **or** LiveObserver (classic, side-channel) → concept `pKnown` + ledger | Do not let Live judge the answer itself |
| **Session end** | Recap, strengths, examFocus, nextIntent | Firebase AI Logic **text** (`getGenerativeModel` structured JSON) → `aiDigest` | Do not open a second Live socket |

LiveObserver (`src/adaptive/liveObserver.ts`) already listens to captions and updates the learner panel **without talking to the voice session**. That stays. The missing piece is **persist** those snapshots to Firestore so the next session can load them.

### 10.3 Do we need more AI APIs or tools?

**No new Live client. No Gemma. No Higgsfield inside the 15-minute mouth.** Extra vendors in the voice loop add latency and a second context.

| Job | API / hook we already have or will use | When it runs |
|---|---|---|
| Speak / hear / captions | Gemini Live on Cloud Run (`server.ts`) | Whole lesson |
| Judge method | Gemini **text** in `reasoningAssessor.ts` (or observer) | After each child answer |
| Mastery number | Local `bkt.ts` — **not** an LLM | After each assessment |
| Next-session memory | Firestore read on start | Before Live connect |
| Post-session digest | Firebase AI Logic text (`src/firebase/client.ts` already has `getGenerativeModel`) | After `endedAt` |
| Topic / lesson pack | `set_topic` tool + `/api/generate-lesson` + curriculum graph | Child changes topic, or first load |
| Textbook → graph | `pdfIngest.ts` — Gemini Files API, already | Upload, minutes, not live |
| Photo on the board | `generate_photo_visual` → `/api/generate-image` (Gemini image models, already) | When Live asks for “real world” |
| 2D diagram | `update_diagram` → `/api/update-diagram` (already) | When focus changes |
| Optional web fact | Gemini Search grounding, **last** in source priority | Only if graph has a hole |
| Deck / marketing stills | Higgsfield (already used for Gamma) | Offline, not in Live |
| Curriculum research | Firecrawl (optional, authoring) | Teacher/dev, not the child |

**Do not add as Live tools:** Higgsfield generate, Firecrawl scrape, Gamma, video models. A 15-min lesson cannot wait 20–40s for a video. If we want a “wow” clip, **pre-generate** it into the subject pack (Higgsfield or Veo) and `switch_board_view` to a stored URL.

`set_topic` is the hook to fetch / switch a topic at runtime. It already exists. The server then loads that subject’s graph (upload or generated lesson) and **re-registers that pack’s tools**.

### 10.4 How the four capabilities are developed

They are not four new products. Three already have code. The work is **wire + persist + generalise**.

#### 1. Method ledger — how the child thinks

**Exists:** closed catalogue from `concept.commonMisconceptions` (`reasoningAssessor.misconceptionCatalog`); two-observation confirm in `learnerStore`; `assess_child_reasoning` + `show_student_thinking`.

**Build:**

1. Phase 1 — put the elicit + one-probe rule in the **classic** spoken prompt (today it is adaptive-only).
2. Phase 2 — write ledger rows on `learners/{id}/subjects/{sid}/concepts/{cid}.misconceptionLedger[]` (not only the in-memory JSON / observer UI).
3. Phase 4 — inject suspected/confirmed ids into the start brief (“m2 suspected, do not restart”).
4. Ingest — PDF extract already asks for 2–4 misconceptions per concept. That **is** the catalogue for an uploaded book. Do not let Live invent free-text labels.

#### 2. Bayesian Knowledge Tracing — mastery that can fall

**Exists:** `src/adaptive/bkt.ts`. `pS`/`pG` scale with `UnderstandingDepth`. Confirmed misconception forces `observedCorrect = false`, so a right answer with a broken method **drops** `pKnown`.

**Build:**

1. Every `ReasoningAssessment` (and observer snapshot) must call `updateMastery`, not `masteryDelta` magic numbers (`assessmentEngine` quiz path still uses deltas — retire that for voice).
2. Persist `pKnown` + `derivation` on the concept doc.
3. Advance only when `pKnown ≥ 0.75` **and** no confirmed open misconception.
4. Parent portal shows the derivation line we already generate. No LLM for the number.

#### 3. Any uploaded textbook — not one library

**Exists:** `pdfIngest.ts` (split → Files API → extract → merge Book 2A+2B). `set_topic` + `/api/generate-lesson` for a spoken topic with no PDF.

**Build:**

1. Keep ingest as the **authoring** path. Not a Live tool.
2. Each extracted concept must carry: label, prereqs, 2–4 misconception ids, `difficultyLevel`, `typicalTeachingOrder`.
3. Phase 7 — generic board pack so a science upload is not stuck on the Pythagoras `set_figure` triangle.
4. If there is no graph yet: `generate-lesson` builds a temporary one; next upload **merges** into the same `subjectId`.

#### 4. Live board that fades — concrete → abstract

**Exists as idea:** `switch_board_view` tabs `photo | 2d | 3d | chalkboard`; adaptive prompt already says start in the picture, then lift to the shape. `set_figure({scene:'ladder'})` + `reveal_part` are the Pythagoras pack.

**Build:** treat fade as a **contract**, not six tabs the child picks.

| Fade step | Mode | Common tool | Who renders |
|---|---|---|---|
| Real world | `real` | `show_real({prompt or assetId})` | Gemini image **or** pack photo |
| Shape | `shape` | `show_shape({kind, params})` | Subject pack (triangle, cell, map…) |
| 3D | `3d` | `switch_board_view({tab:'3d'})` | Pack scene or generic Three.js fallback |
| Chalk | `chalk` | `update_chalkboard_notes` / `write_live_note` | Common |

Rule in the system instruction: **new idea always starts at Real, then Shape, then Chalk.** Child can ask to go back. Tabs stay for the tutor tool, not as a kid menu.

### 10.5 Tools: one common set + subject packs

Declare **one common set on every session**. Add **pack tools** only for the subject that just loaded. Live’s tool list is set at connect time — changing subject mid-lesson (`set_topic`) = reconnect or a mid-session tool refresh (same WS if the API allows; otherwise short reconnect, we already need that for voice change).

**Common (always):**

| Tool | Why |
|---|---|
| `switch_board_view` | Fade between real / shape / 3d / chalk |
| `update_chalkboard_notes` / `write_live_note` | Every subject has writing |
| `show_student_thinking` | Method on the board |
| `assess_child_reasoning` | Ledger + BKT |
| `record_confusion_signal` | Silence / “I don’t get it” |
| `pose_quiz` | Check item |
| `set_topic` | Fetch / switch topic |
| `generate_photo_visual` | Real-world step when the pack has no photo |
| `highlight_concept` | Point at a node |

**Pack tools (examples):**

| Subject | Extra tools | Why not common |
|---|---|---|
| Pythagoras / geometry | `set_figure`, `reveal_part` | Side lengths, ladder/ramp scenes |
| Number / algebra | `set_number_line`, `set_balance` | Different primitive |
| Biology | `set_layer_diagram` (cell, organ) | Layers, not triangles |
| Writing | `set_rubric` (claim / evidence / clarity) | No 3D by default |
| History / geo | `set_map`, `set_timeline` | 3D optional |

If the pack has no `show_shape`, Lumen still has chalk + photo. That is the generic fallback for an uploaded book we have not authored a pack for.

**Runtime generation — what to call when:**

| Need | Call | Not |
|---|---|---|
| Photo of “a ladder against a wall” right now | `generate_photo_visual` → existing Gemini image endpoint | Higgsfield (too slow for Live) |
| 2D schematic for current focus | `update_diagram` | A video model |
| Pack stills / Gamma / hero | Higgsfield **offline** | Live tool |
| Short explainer clip (later) | Pre-render Higgsfield/Veo into the pack; play URL | Generate during the turn |
| Unknown fact | Search grounding, then still teach from the graph | Scraping a webpage into the child’s ear |

Higgsfield stays a **studio** tool (this deck, pack assets). Firebase AI Logic / Gemini image stays the **in-lesson** camera. Two jobs, two places.

### 10.6 Order we actually build this intelligence

The four capabilities are already sketched in code. The tutor becomes “good” when they share one start brief:

1. Persist captions + ledger + `pKnown` (phases 2–3).  
2. First-meet profile + inject brief into `liveConfig` (phase 4).  
3. Digest → growing chips (phase 5).  
4. Generic fade + pack registry (phase 7).  

Until 1–2 ship, Lumen is still a voice demo with a Pythagoras-shaped memory.
