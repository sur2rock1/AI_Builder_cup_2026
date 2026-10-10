# Lumen

**Lumen** is the tutor — an orb that talks, writes on a board, and remembers how the child reasoned. It is not a login.

Parents create a child login; kids sign in themselves. A family can add PDFs, notes, web pages, or just type a topic. Lumen searches and reads in parallel, previews the extract, then builds an age-mapped program the Live lesson can teach.

**Subjects are Firestore programs on `learners/{id}`, not a hard-coded catalogue.** Pythagoras’ Theorem (Think! Mathematics 2B Chapter 9) is a cup **example** seeded for Maya (Secondary 2). Ada (Primary 6) gets subjects only from Add materials — e.g. photosynthesis. Built for the AI Builder Cup 2026.

**Production UI:** https://sceneflow-f9529.web.app  
**Branch:** `feature/lumen-companion`

---

## What it does

- **Household** — parent signs in first, creates a child email + password without leaving their session. Kids sign in on their own. Profiles hang off `learners/{id}` (`ownerUid` = child, `parentUid` = parent). Lumen is never an account.
- **Add materials → program** — topic and/or files and/or links. Firecrawl **parse** (files) and **search + scrape** (topic / URLs) run together. Gemini shapes a preview for that child’s grade. Nothing is saved until **Save and build program**. Confirm writes `learners/{id}/materials`, then an age-mapped program at `learners/{id}/programs` plus the concept graph Live already loads.
- **Live voice lesson** — browser mic → WebSocket → Cloud Run → Gemini Live (Puck). Tutor writes notes, switches board views, poses problems. One Live socket. Firecrawl is studio-only, never a Live tool.
- **Teaching board** — Real world → Shape (2D) → 3D → Chalkboard. The Pythagoras pack is the current example fade; Phase 10 makes the board subject-agnostic.
- **Learner model** — closed misconception catalogue, two-observation ledger, Bayesian Knowledge Tracing (`src/adaptive/`). A confirmed broken method can move mastery *down* after a correct answer.
- **Live observer** — transcripts update the learner panel without blocking speech (`src/adaptive/liveObserver.ts`).
- **Captions** — on `turnComplete`, joined child + tutor text is written to `sessions/{id}/turns`. Parent dashboard can replay after a refresh. Caption text is never sent to analytics.
- **Any-topic board** — `POST /api/generate-lesson` builds a board from Gemini (local fallback if the key/model fails).
- **Parent dashboard** — mastery, standing misconceptions, time on task for linked children.

Screens: parent login → dashboard (add child) · child login → subject list → tutor room.

**Shipped on this branch:** Phase 0 (Lumen persona) through Phase 3 (hybrid extract, confirm, generate program). Voice cross-check, captions, chips, and fading boards are later — see [docs](#docs).

---

## Architecture

```
Browser (React 19 + Vite + Tailwind)
  HTTPS  /api/**    → Firebase Hosting rewrite → Cloud Run
  WSS    /ws/live   → Cloud Run directly
                     (Hosting does not reliably upgrade WebSockets)

Cloud Run  dr-marcus-live  (Express + ws, server.ts)
  Gemini Live       audio + board tools  (the only mouth)
  Firebase AI Logic text only — not a second Live socket
  Firecrawl         studio extract (parse / search / scrape) — never a Live tool
  LiveObserver      non-blocking learner_update
  reasoningAssessor + BKT + learnerStore
  sourceIngest → preview → confirmAndGenerate
  Firebase Admin    learners, materials, programs
```

| Piece | Where |
|---|---|
| UI | Firebase Hosting — `sceneflow-f9529.web.app` |
| API + Live WS | Cloud Run `dr-marcus-live`, `us-central1` |
| Learners / materials / programs | Cloud Firestore `learners/{id}` (+ subcollections). **This is the source of truth for subjects.** Clients can **read** materials/programs; only Admin writes them. |
| Learners (local fallback) | `data/learner-profiles.json` |
| Graph cache | `data/curricula.json` (copy of a program graph after confirm — not a global catalogue) |
| Gemini key | Secret Manager `GEMINI_API_KEY` |
| Firecrawl key | Secret Manager `FIRECRAWL_API_KEY` (studio extract) |

Firebase Auth (email/password) is the login. A parent account (`users/{uid}.role = parent`) creates child Auth users through Admin (`POST /api/household/children`). `functions/` is an earlier HTTP API; Hosting now sends `/api/**` to Cloud Run.

Design history: [`DECISIONS.md`](DECISIONS.md). Snapshot (partly stale): [`PROJECT_STATE.md`](PROJECT_STATE.md).

---

## Docs

| Doc / artifact | What |
|---|---|
| [`docs/lumen-development-phases.md`](docs/lumen-development-phases.md) | Phases 0–12 with a verify gate after each. **Start here for what to build next.** |
| [`docs/lumen-learning-companion.md`](docs/lumen-learning-companion.md) | Product + household / materials / programs schema |
| [`docs/lumen-tech/`](docs/lumen-tech/) | Stack / runtime / two Gemini jobs / chips diagrams |
| [`docs/lumen-journey/`](docs/lumen-journey/) | Higgsfield journey stills |
| [Gamma deck](https://gamma.app/docs/Lumen-pdlxdx2dgtash69) | Journey + tech-design slides |
| [Stitch flows](https://stitch.withgoogle.com/projects/129555699613723228) | Kid onboarding, week-5, parent dashboard, confirm / program-ready |

Phase status (this branch):

| Phase | Status |
|---|---|
| 0 Persona (orb, Lumen copy) | Shipped |
| 1 Hybrid extract + preview | Shipped |
| 2 Confirm → Firestore material | Shipped |
| 3 Age-mapped program + Live graph | Shipped (restart `npm run dev` after the quiz-`undefined` persist fix) |
| 4–9 Voice cross-check, captions, clock, chips, digest, voice picker | Not started |
| 10–12 Fading board, knobs, teacher | Later |

Locks that still hold: one Live mouth, no captions in GA4, no Higgsfield / Firecrawl in the 15-min loop, adult / 18+ bands documented only.

---

## Repo map

```
server.ts                      Express + Gemini Live WS + curriculum jobs
src/App.tsx                    screens, board state, voice client
src/live/liveConfig.ts         classic / adaptive prompts, tools, VAD
src/adaptive/                  BKT, assessor, observer, learner store
src/curriculum/
  pythagoras.ts                example seed graph (Secondary 2 cup demo)
  firecrawl.ts                 scrape / parse / search (studio)
  sourceIngest.ts              parallel file + internet rails → preview
  programGenerate.ts           confirm → material + age-mapped program
  programStore.ts              Admin write + memory + household list
src/components/                LoginScreen, CurriculumUpload, ImmersiveStage, …
src/utils/audio.ts             mic capture + playback
src/utils/liveWs.ts            prod WS URL (Cloud Run origin)
src/firebase/                  client + Admin bootstrap
scripts/seed-auth.ts           cup demo accounts
scripts/deploy-cloudrun.sh     Cloud Run + Hosting
tests/                         assessor + live protocol
```

Board surface flag in `App.tsx`: `BOARD_SURFACE = 'immersive'` (`canvas` / `legacy` kept as fallbacks).

Default live path is **classic** conversational voice (short turns, board tools). Adaptive diagnosis (`assess_child_reasoning`, BKT ledger) lives in `src/adaptive/` and `VOICE_MODE=adaptive`. The running demo updates the panel via `LiveObserver`. Cross-check in classic is Phase 4.

---

## Prerequisites

- Node.js 22
- A Gemini API key (AI Studio / Gemini Developer API). Live needs a model that supports the Live API (`LIVE_MODEL`, default `gemini-3.8-live`).
- `FIRECRAWL_API_KEY` (`fc-…`) for Add materials (web, YouTube transcript, Google Docs, topic search).
- For Firebase/Cloud Run: `gcloud` + Firebase CLI, project `sceneflow-f9529`, and `serviceAccount.json` locally (gitignored).

Copy env:

```bash
cp .env.example .env
```

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Required for Live, diagnosis, lessons, extract |
| `FIRECRAWL_API_KEY` | Firecrawl scrape / parse / search for Add materials |
| `LIVE_MODEL` | Live model id (default `gemini-3.8-live`) |
| `GOOGLE_GENAI_USE_ENTERPRISE` | Keep **false / unset** for AI Studio keys. Vertex routing closes Live with “Invalid resource”. |
| `GOOGLE_CLOUD_PROJECT` | `sceneflow-f9529` |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Local Admin SDK (`./serviceAccount.json`) |
| `USE_FIRESTORE_LEARNERS` | `true` on Cloud Run (also implied by `K_SERVICE`) |
| `VITE_LIVE_WS_BASE` | Optional override for the browser WS origin |
| `VOICE_MODE` | `classic` (default) or `adaptive` |
| `ASSESS_BUDGET_MS` | Max wait for a blocking diagnosis (default `2500`) |
| `VAD_SILENCE_MS` / `VAD_END` / `VAD=off` | Turn-taking. Default 700 ms silence, HIGH end-sensitivity |
| `PORT` | Server port. Unset: `3000`, or `3100` if something else already owns `127.0.0.1:3000`. Cloud Run uses `8080`. |

Do not commit `.env` or `serviceAccount.json`.

---

## Run locally

```bash
npm install
npm run dev
```

The server prints the URL to open:

```
[Server] Lumen UI → http://localhost:3000
[Server] On this machine’s network → http://192.168.x.x:3000
```

If another app already bound `127.0.0.1:3000` (a WhatsApp bridge on this machine does), Lumen moves to **3100** and says so. Use the printed localhost URL — `localhost:3000` in that case is the other app (often a blank page).

Voice uses same-origin `ws://…/ws/live`. Mic permission required.

Parents sign in first and create a login for each child. Kids sign in with their own email. Cup demo:

```
parent@lumen.app  LumenCup2026!   parent dashboard
maya@lumen.app    LumenCup2026!   Secondary 2 (Grade 8)
ada@lumen.app     LumenCup2026!   Primary 6 (Grade 6)
```

Seed or reset with `npx --yes tsx scripts/seed-auth.ts`.

```bash
PORT=3001 npm run dev          # force a port (skips the 3000→3100 fallback)
npm run lint                   # tsc --noEmit
npm run gen:assets             # optional presenter / scene stills (uses GEMINI_API_KEY)
```

In production the lesson endpoint falls back to a **local generator** if Gemini fails — a bad model id can look like a working UI. Check `[Server]` / `[Ingest]` / `[Program]` / `[assess]` / `[voice]` logs.

---

## Scripts

| Script | What |
|---|---|
| `npm run dev` | `tsx server.ts` (API + WS + Vite middleware in non-prod) |
| `npm run build` | Vite SPA + esbuild `dist/server.cjs` |
| `npm start` | `node dist/server.cjs` |
| `npm test` | Assessor + live protocol |
| `npm run test:assessor` | Deadline / model-id / thinking-config |
| `npm run test:live` | Fake Gemini Live + real WS server |
| `npm run diagnose:voice` | Real Gemini: which prompt/tool/settings actually speak |
| `npm run deploy:live` | Cloud Run + Hosting (`scripts/deploy-cloudrun.sh`) |
| `npm run deploy:hosting` | SPA only |
| `npm run firebase:deploy:rules` | Firestore / Storage / Auth rules |

Do not change the live prompt, tools, or connection settings without `npm run diagnose:voice` against real Gemini. Silence is a config failure, not an HTTP error. `test:live` is also a lock so the voice handler does not drift from the known-good baseline.

---

## Production

```bash
# one-time: store the keys
npx -y firebase-tools@latest functions:secrets:set GEMINI_API_KEY --project sceneflow-f9529
npx -y firebase-tools@latest functions:secrets:set FIRECRAWL_API_KEY --project sceneflow-f9529

npm run deploy:live
```

That script enables required GCP APIs, binds the runtime SA to the secret, deploys Cloud Run (`session-affinity`, 3600s timeout, no CPU throttle, `LIVE_MODEL=gemini-3.8-live`, `GOOGLE_GENAI_USE_ENTERPRISE=false`, `USE_FIRESTORE_LEARNERS=true`), then deploys Hosting.

- **Hosting:** https://sceneflow-f9529.web.app
- **API:** `/api/**` → Cloud Run
- **Voice:** browser uses `wss://dr-marcus-live-….run.app/ws/live` (see `src/utils/liveWs.ts`)

Health: `GET /api/health`.

---

## API (same process as Live)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/health` | Key present + time |
| `POST` | `/api/generate-lesson` | Topic + grade → board JSON |
| `GET` | `/api/me` | Signed-in uid, email, `parent` or `learner` |
| `GET` / `POST` | `/api/learners` | Kid: own profile. Parent: linked children. Kids can POST their own profile; parents cannot. |
| `GET` | `/api/learners/:id` | One profile (owner or parent) |
| `POST` | `/api/household/children` | Parent creates a child Auth user + learner (`ownerUid` = child, `parentUid` = parent) |
| `POST` | `/api/session/start` | Adaptive session + next unmastered concept |
| `POST` | `/api/session/:id/assess` | Clicked-quiz assessor |
| `GET` | `/api/curricula` | Signed-in household’s Firestore programs only (example Pythagoras seeded for Secondary 2) |
| `POST` | `/api/curriculum/upload` | Signed-in. Multipart files + `urls` + `topic` + `studentId`. Background extract; **stops at preview** |
| `GET` | `/api/curriculum/jobs/:id` | Dual-rail progress + preview / program (no raw extract) |
| `POST` | `/api/curriculum/confirm` | After preview: write material, generate program |
| `POST` | `/api/curriculum/rename` | Rename a saved graph |
| `GET` | `/api/sessions?studentId=` | Household list of Live caption sessions |
| `GET` | `/api/sessions/:id/turns` | Joined captions (`role`, `text`, `at`, `seq`) |
| `GET` | `/ws/live?topic=&grade=&studentId=` | Gemini Live proxy; persists captions when `studentId` is set |

`/api` errors are JSON (oversized uploads used to return HTML).

---

## Curriculum

**Every teachable subject is a Firestore program** on `learners/{id}/programs/{programId}` (the `curriculum` field is the concept graph). The picker and Live `curriculumFor(subjectId)` read that — they do not keep a global built-in list.

`src/curriculum/pythagoras.ts` is **one example** used as a seed for the Secondary 2 cup demo (Maya). It is not the product, and Ada does not inherit it.

Example graph (seven concepts, prerequisites, closed misconception lists):

1. Right-angled triangle & parts
2. Statement \(a^2 + b^2 = c^2\)
3. Find the hypotenuse
4. Find a leg
5. Pythagorean triples
6. Converse
7. Applications

`nextUnmasteredConcept` walks teaching order on **whatever graph** the program stored — science, language, or maths.

**Add materials** (Phases 1–3):

1. Type a topic (e.g. photosynthesis) and/or drop files and/or paste YouTube / article / Google Doc URLs.
2. Cloud Run runs file parse and internet search+scrape in `Promise.all`. Dual progress in the modal.
3. Preview: suggested title, topics, sources, estimated minutes, age-band line (Primary 6 → preteen ~18 min). Confirm is disabled until `stage === preview`.
4. **Save and build program** — Admin writes `learners/{id}/materials/{materialId}`, then Gemini builds lessons / quizzes / multimedia *outlines*, writes `learners/{id}/programs/{programId}`, and saves the concept graph.
5. Subject appears in the picker. First unlocked chapter starts the Live room.

Age bands map from the child’s existing grade. Adult / 18+ stay documented only — they are not offered in the UI. EPUB uses `jszip`. Images / audio / video use Gemini Files. Same subject name merges new sources after confirm.

---

## Known limits

- BKT parameters are chosen from difficulty, not fitted on population data.
- Two assessors still exist: clicked quiz (`assessmentEngine`) vs voice (`reasoningAssessor` / observer).
- Adaptive Live tools are not the default; observer drives the panel in classic mode. Cross-check in classic is Phase 4.
- Evidence log / in-memory sessions are not fully on Firestore — Cloud Run is stateless. Captions persist in Phase 5.
- Geometry renderer is still the Pythagoras example pack; other topics use the generated / legacy board until Phase 10.
- Voice WS is unauthenticated at the upgrade. Learner and curriculum APIs require a Firebase ID token.
- Lesson generation can silently use the local fallback.
- A program write used to skip Firestore when a quiz item had `options: undefined` (true/false / open). Restart the local server after that fix so the next confirm persists.

---

## License

Private competition entry. All rights reserved unless otherwise noted.
