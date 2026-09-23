# Dr. Marcus Vance

Voice-first adaptive tutor for a Secondary 2 (Grade 8) student. The child talks; **Gemini Live** speaks back and writes on a digital board. The product diagnoses *how* the child is reasoning — including a correct answer reached by a broken method — then re-teaches with a different representation.

Flagship curriculum: **Pythagoras’ Theorem**, Think! Mathematics 2B Chapter 9 (Singapore MOE). Built for the AI Builder Cup 2026.

**Production UI:** https://sceneflow-f9529.web.app

---

## What it does

- **Live voice lesson** — browser mic → WebSocket → Cloud Run → Gemini Live (Puck). Tutor writes notes, switches board views, poses problems.
- **Teaching board** — Real world (scene with triangle overlay) → Shape (2D) → 3D → Chalkboard. Same side colours in every view.
- **Learner model** — closed misconception catalogue, two-observation ledger, Bayesian Knowledge Tracing (`src/adaptive/`). A confirmed broken method can move mastery *down* after a correct answer.
- **Live observer** — transcripts update the learner panel without blocking speech (`src/adaptive/liveObserver.ts`).
- **Any-topic lessons** — `POST /api/generate-lesson` builds a board from Gemini (local fallback if the key/model fails).
- **Textbook upload** — split large PDFs, extract chapters/concepts via the Files API, merge into a subject (`src/curriculum/pdfIngest.ts`).
- **Parent portal** — mastery, standing misconceptions, time on task (same learner records).

Screens: login (named student profile) → subject → tutor room, plus parent portal.

---

## Architecture

```
Browser (React 19 + Vite + Tailwind)
  HTTPS  /api/**    → Firebase Hosting rewrite → Cloud Run
  WSS    /ws/live   → Cloud Run directly
                     (Hosting does not reliably upgrade WebSockets)

Cloud Run  dr-marcus-live  (Express + ws, server.ts)
  Gemini Live       audio + board tools
  LiveObserver      non-blocking learner_update
  reasoningAssessor + BKT + learnerStore
  pdfIngest
  Firebase Admin    learners in Firestore when USE_FIRESTORE_LEARNERS / K_SERVICE
```

| Piece | Where |
|---|---|
| UI | Firebase Hosting — `sceneflow-f9529.web.app` |
| API + Live WS | Cloud Run `dr-marcus-live`, `us-central1` |
| Learners (prod) | Cloud Firestore `learners` |
| Learners (local) | `data/learner-profiles.json` |
| Gemini key | Secret Manager `GEMINI_API_KEY` |

Firebase Auth / Storage helpers exist (`src/firebase/`). The student loop uses named profiles via `/api/learners`, not verified parent/child accounts. `functions/` is an earlier HTTP API; Hosting now sends `/api/**` to Cloud Run.

Design history: [`DECISIONS.md`](DECISIONS.md). Snapshot (partly stale): [`PROJECT_STATE.md`](PROJECT_STATE.md).

**Lumen (next platform)** — plan + phases on `feature/lumen-companion`:

| Doc / artifact | What |
|---|---|
| [`docs/lumen-learning-companion.md`](docs/lumen-learning-companion.md) | Product + architecture plan |
| [`docs/lumen-development-phases.md`](docs/lumen-development-phases.md) | Phases 0–9 with a verify gate after each |
| [Gamma deck](https://gamma.app/docs/Lumen-pdlxdx2dgtash69) | Journey + tech-design slides |
| [Stitch flows](https://stitch.withgoogle.com/projects/129555699613723228) | Kid onboarding, week-5, parent dashboard |
| [`docs/lumen-journey/`](docs/lumen-journey/) | Higgsfield journey stills |
| [`docs/lumen-tech/`](docs/lumen-tech/) | Stack / runtime / chips diagrams |

---

## Repo map

```
server.ts                      Express + Gemini Live WebSocket
src/App.tsx                    screens, board state, voice client
src/live/liveConfig.ts         classic / adaptive prompts, tools, VAD
src/adaptive/                  BKT, assessor, observer, learner store
src/curriculum/                Pythagoras graph + PDF ingest
src/components/                ImmersiveStage, ScenePanel, ChalkBoard, …
src/utils/audio.ts             mic capture + playback
src/utils/liveWs.ts            prod WS URL (Cloud Run origin)
src/firebase/                  client + Admin bootstrap
functions/                     leftover Functions API
scripts/deploy-cloudrun.sh     Cloud Run + Hosting
tests/                         assessor + live protocol
```

Board surface flag in `App.tsx`: `BOARD_SURFACE = 'immersive'` (`canvas` / `legacy` kept as fallbacks).

Default live path is **classic** conversational voice (short turns, board tools). Adaptive diagnosis (`assess_child_reasoning`, BKT ledger) lives in `src/adaptive/` and `VOICE_MODE=adaptive`. The running demo updates the panel via `LiveObserver`.

---

## Prerequisites

- Node.js 22
- A Gemini API key (AI Studio / Gemini Developer API). Live needs a model that supports the Live API (`LIVE_MODEL`, default `gemini-3.8-live`).
- For Firebase/Cloud Run: `gcloud` + Firebase CLI, project `sceneflow-f9529`, and `serviceAccount.json` locally (gitignored).

Copy env:

```bash
cp .env.example .env
```

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Required for Live, diagnosis, lessons, PDF extract |
| `LIVE_MODEL` | Live model id (default `gemini-3.8-live`) |
| `GOOGLE_GENAI_USE_ENTERPRISE` | Keep **false / unset** for AI Studio keys. Vertex routing closes Live with “Invalid resource”. |
| `GOOGLE_CLOUD_PROJECT` | `sceneflow-f9529` |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Local Admin SDK (`./serviceAccount.json`) |
| `USE_FIRESTORE_LEARNERS` | `true` on Cloud Run (also implied by `K_SERVICE`) |
| `VITE_LIVE_WS_BASE` | Optional override for the browser WS origin |
| `VOICE_MODE` | `classic` (default) or `adaptive` |
| `ASSESS_BUDGET_MS` | Max wait for a blocking diagnosis (default `2500`) |
| `VAD_SILENCE_MS` / `VAD_END` / `VAD=off` | Turn-taking. Default 700 ms silence, HIGH end-sensitivity |
| `PORT` | Server port (default `3000`; Cloud Run uses `8080`) |

Do not commit `.env` or `serviceAccount.json`.

---

## Run locally

```bash
npm install
npm run dev
```

Open the printed local URL. Voice uses same-origin `ws://…/ws/live`. Mic permission required.

```bash
PORT=3001 npm run dev          # fixed port
npm run lint                   # tsc --noEmit
npm run gen:assets             # optional presenter / scene stills (uses GEMINI_API_KEY)
```

In production the lesson endpoint falls back to a **local generator** if Gemini fails — a bad model id can look like a working UI. Check `[Server]` / `[assess]` / `[voice]` logs.

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
# one-time: store the key
npx -y firebase-tools@latest functions:secrets:set GEMINI_API_KEY --project sceneflow-f9529

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
| `GET` / `POST` | `/api/learners` | List / create profile |
| `GET` | `/api/learners/:id` | One profile |
| `POST` | `/api/session/start` | Adaptive session + next unmastered concept |
| `POST` | `/api/session/:id/assess` | Clicked-quiz assessor |
| `POST` | `/api/curriculum/ingest` | PDF job (multipart) |
| `GET` | `/api/curriculum/jobs/:id` | Ingest progress |
| `GET` | `/ws/live?topic=&grade=` | Gemini Live proxy |

`/api` errors are JSON (oversized uploads used to return HTML).

---

## Curriculum

Built-in graph: `src/curriculum/pythagoras.ts` — seven concepts, prerequisites, closed misconception lists.

1. Right-angled triangle & parts  
2. Statement \(a^2 + b^2 = c^2\)  
3. Find the hypotenuse  
4. Find a leg  
5. Pythagorean triples  
6. Converse  
7. Applications  

`nextUnmasteredConcept` walks teaching order only when prerequisites are mastered, for Pythagoras **and** uploaded subjects.

PDF ingest splits each file to ≤60 pages and ≤40 MB (Gemini’s cap is 50 MB / 1000 pages), extracts two parts at a time, merges chapters across splits. Up to 10 PDFs, 500 MB each; re-upload is idempotent. Needs `pdf-lib` (`npm install`); it is loaded lazily.

---

## Known limits

- BKT parameters are chosen from difficulty, not fitted on population data.
- Two assessors still exist: clicked quiz (`assessmentEngine`) vs voice (`reasoningAssessor` / observer).
- Adaptive Live tools are not the default; observer drives the panel in classic mode.
- Evidence log / in-memory sessions are not fully on Firestore — Cloud Run is stateless.
- Geometry renderer is Pythagoras-specific; other topics use the generated/legacy board.
- Student profiles are not strongly authenticated. Voice WS is unauthenticated at the upgrade.
- Lesson generation can silently use the local fallback.

---

## License

Private competition entry. All rights reserved unless otherwise noted.
