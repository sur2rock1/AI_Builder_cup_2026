# Lumen — phased development

**Branch:** `feature/lumen-companion`  
**Plan source:** [`lumen-learning-companion.md`](lumen-learning-companion.md)  
**Status:** Phase 0 shipped. Next is Phase 1 (hybrid extract + preview). Voice cross-check is now Phase 4.  
**Do not open a second Live socket.** Cloud Run stays the mouth. Firebase AI Logic is text only. Firecrawl is studio only.

---

## What we locked (from the planning pass)

| Topic | Lock |
|---|---|
| Name | **Lumen** (alts Mira / Sage stay in the doc only) |
| Course brain | Keep extending `server.ts` + `liveConfig.ts` |
| Auth for the cup | Parent creates child logins; kids sign in themselves (`parentUid` / `ownerUid`) |
| Default lesson | **15 min** (Live audio-only limit) |
| Cross-questions | In-session: elicit → one probe. Never dump the answer |
| Homework across days | Firestore `tasks/*`, not Live resume |
| Captions | Persist joined turns on `turnComplete` |
| Analytics | AI Logic **text** → `aiDigest`. GA4 events only, no transcripts |
| Start chips | Computed (max 4). Seed family: learn / homework / exam / writing |
| Week-5 chips | Open task → continue last subject → exam-if-soon → homework → writing draft |
| AI Logic Live in the browser | **Out** (Preview, no VAD, tools coming soon) |
| Gemma | **Out** (that was [Gamma](https://gamma.app/docs/Lumen-pdlxdx2dgtash69)) |
| Higgsfield / Firecrawl | Studio only, never a Live tool |
| Subjects | **Firestore programs on `learners/{id}`.** Pythagoras is a cup **example** seed, not the product. No global built-in catalogue. Adult / 18+ documented only. |

**Artifacts already made (not product code):**

| Artifact | URL / path |
|---|---|
| Gamma deck | https://gamma.app/docs/Lumen-pdlxdx2dgtash69 |
| Stitch flows | https://stitch.withgoogle.com/projects/129555699613723228 |
| Journey stills | `docs/lumen-journey/` |
| Stack diagrams | `docs/lumen-tech/` |

---

## How each phase ends

No phase is “done” until **all four** pass:

1. `npm run lint`
2. `npm test` (assessor + live protocol)
3. The **Verify** checklist for that phase (below)
4. Architecture guards still hold: one Live mouth, no captions in GA4, no Higgsfield in the 15-min loop

If a check fails, fix on this branch before starting the next phase. Do not ship a phase that only “looks right” in isolation.

After a phase that touches voice (`4`, `9`): also run `npm run diagnose:voice` against real Gemini.

After a phase that touches UI: exercise the flow in the browser (start → speak → board → wrap), not a single screenshot.

---

## Phase 0 — Persona

**Ship.** Learner-facing copy says Lumen. Orb, not a human avatar. `liveConfig.ts` system instruction renamed. No “Dr. Marcus Vance” / “Dr. Vance” in the kid UI.

**Verify**

- [x] Grep learner UI + spoken prompt: no Vance / Dr. Marcus
- [x] Local `npm run dev` → first screen / spoken hello uses Lumen
- [x] Parent portal title can still mention the product name; no leaderboard added
- [x] `npm run lint` and `npm test`

**Not this phase.** Chip resolver, captions persist, digest.

---

## Phase 1 — Hybrid extract + preview

**Ship.** Parent or kid types a topic and/or adds files. Cloud Run runs Firecrawl **parse** (files) and Firecrawl **search + scrape** (topic / links) in `Promise.all`. Gemini shapes a concept preview for the learner’s grade. **Nothing is written to Firestore or `curricula.json` until confirm.**

**Verify**

- [ ] Topic-only (no file) still previews internet sources with attribution
- [ ] File-only still previews if search fails; one rail failing does not empty the other
- [ ] Dual progress (Files / Internet) updates while the job runs
- [ ] Confirm is disabled until `stage === preview`
- [ ] `npm run lint` and `npm test`

**Not this phase.** Firestore write. Program generation. Voice.

---

## Phase 2 — Confirm → Firestore material

**Ship.** Confirm screen: suggested title, topics, key concepts, sources, estimated minutes, age-band line. On **Save and build program**, Admin writes `learners/{id}/materials/{materialId}`. Client rules: parent or owner can **read**; clients cannot write.

**Verify**

- [ ] Refresh after confirm: parent and child can read the material
- [ ] Unauthenticated write is rejected
- [ ] Parent cannot write to another family’s learner
- [ ] Extract without confirm leaves no material doc
- [ ] `npm run lint` && `npm test`

**Not this phase.** Live captions. Voice picker.

---

## Phase 3 — Generate program

**Ship.** After the material write, Gemini builds an age-mapped program (lessons, quizzes, multimedia *outlines*) using difficulty / pacing / presentation for the child’s mapped band. Admin writes `learners/{id}/programs/{programId}` and the concept graph so SubjectSelector / Live can start.

**Verify**

- [ ] Maya (Primary 6) gets preteen pacing (~15–20 min lessons), not teen essays
- [ ] Program survives reload and appears in the subject list
- [ ] Live still one socket; Firecrawl is not in `liveConfig` tools
- [ ] Adult / 18+ bands are not offered in the UI
- [ ] Browser: compose → preview → confirm → program ready → start a lesson
- [ ] `npm run lint` && `npm test`

**Not this phase.** Cross-check prompt. Growing chips.

---

## Phase 4 — Cross-check in classic

**Ship.** Elicit + one probe live in the **classic** spoken rules (not only `VOICE_MODE=adaptive`). Probe cap (~2 per concept). Tutor still does not state the answer.

**Verify**

- [ ] `npm run test:live` still green (handler did not drift)
- [ ] `npm run diagnose:voice` — model still speaks
- [ ] Manual: give a correct number with a broken method (“I add 13 and 5”) → Lumen asks *how*, then **one** probe, does not say “12”
- [ ] Classic short turns still feel short (no essay replies)

**Not this phase.** New Firestore collections.

---

## Phase 5 — Captions in Firestore

**Ship.** On `turnComplete`, write the joined child + tutor caption to `sessions/{id}/turns/{turnId}`. Session doc has `learnerId`, `intent`, `startedAt`, `status`.

**Verify**

- [ ] Start a live lesson, speak two turns, refresh / kill the tab
- [ ] Firestore shows those turns (text, `role`, `at`, `seq`)
- [ ] Parent replay (or a debug panel) can read them after restart
- [ ] GA4 / analytics calls do **not** include caption text
- [ ] `npm test`

**Not this phase.** Digest model. Chip UI.

---

## Phase 6 — Session clock + take-home task

**Ship.** Start picker 10 / 15 / 20 (default 15) on `sessions/{id}.durationMin`. At `durationMin - 2` (or `goAway`), wrap and write **one** task to `learners/{id}/tasks/{taskId}`. Next open: “Did you try X?” then elicit method.

**Verify**

- [ ] New session stores `durationMin`
- [ ] Forced wrap (shorten the clock in a test / Remote Config later) writes exactly one open task
- [ ] Next `POST /api/session/start` injects the open task into the Live brief
- [ ] Spoken open asks about the task before restarting the chapter
- [ ] Task statuses: `open` / `done` / `skipped` / `needs_reteach`
- [ ] `npm run lint` && `npm test`

**Not this phase.** Growing chips. Exam / writing intents can be stored but the start screen can stay simple.

---

## Phase 7 — Profile + growing chips

**Ship.** First-meet: name, ageBand, grade, preferredLang; subjects + interests can wait one session. Chip resolver returns **at most four** chips from profile + open tasks + last digest + `examDate` + `nextIntentHint`. Store `sessions/{id}.offeredChips` and `intent`.

**Verify**

- [ ] New learner: generic chips only (Learn / Homework / Exam / Writing). No “Continue Pythagoras”
- [ ] Learner with an open ladder task: first chip is the task / Continue Pythagoras
- [ ] `examDate` within 14 days (or `aiDigest.examFocus`) makes the exam chip specific
- [ ] Interests (football, space) do **not** become a fifth chip — they only change the board example
- [ ] Child can say something that is not on a chip; session still starts
- [ ] Day-0 screen ≠ week-5 screen; spoken question is still “What do you need today?”
- [ ] Browser: first-meet → day-0 chips → lesson still connects Live

**Not this phase.** AI Logic wording (chips can use raw Firestore strings until Phase 8).

---

## Phase 8 — AI digest (Firebase AI Logic text)

**Ship.** After `endedAt`, `getGenerativeModel` structured JSON → `sessions/{id}.aiDigest` (`recap`, `strengths`, `examFocus`, `nextIntent`). Cloud Run or a Function. Same models already wired in `src/firebase/client.ts`.

**Verify**

- [ ] One session with stored turns produces an `aiDigest` after wrap
- [ ] Next start: chip labels can use digest wording (“Exam in 6 days — triangles”)
- [ ] Parent home / exam-focus can read the digest (no rank, word is “method” not “wrong”)
- [ ] **No** `getLiveGenerativeModel` in the browser; one Live socket only
- [ ] Failure of the digest does not break the next lesson (brief falls back to `lastBrief` + tasks)
- [ ] App Check path noted if any digest call is client-side (enforced 2 Nov 2026)

**Not this phase.** Voice picker.

---

## Phase 9 — Voice + language

**Ship.** `speechConfig.voiceName` picker (today hardcoded `Puck`). `langHint` in the system instruction. Mid-lesson voice change = reconnect.

**Verify**

- [ ] Pick Kore (or Leda) on start; audio uses that voice
- [ ] Speak Hindi (or another language): captions + replies follow speech
- [ ] `npm run diagnose:voice` still speaks after the config change
- [ ] Changing voice mid-lesson reconnects without losing the compact brief

---

## Phase 10 — Any-topic fading board

**Ship.** Common tools always on. Pack tools for the loaded subject. Generic fallback: chalk + photo if the pack has no `show_shape`. Science (photosynthesis) is the second demo topic.

**Verify**

- [ ] Pythagoras still: Real → Shape → 3D → Chalk, same as today
- [ ] Science topic: Real leaf / kitchen metaphor, no formula first
- [ ] Upload / `set_topic` does not register Higgsfield as a Live tool
- [ ] In-lesson still is Gemini image (`generate_photo_visual`), not Higgsfield
- [ ] Browser: one maths lesson and one science lesson both fade

---

## Phase 11 — Knobs + App Check

**Ship.** Remote Config: `LIVE_MODEL`, `default_voice`, `default_duration_min`. App Check before any **client** AI Logic call.

**Verify**

- [ ] Change `default_duration_min` or voice in Remote Config without redeploy; next session picks it up
- [ ] Client AI Logic without App Check fails closed (when enforcement is on)
- [ ] Live audio still server-side (no API key in the browser)
- [ ] `npm run deploy:live` health: `GET /api/health`

---

## Phase 12 — Teacher (later)

**Ship.** Class heat on misconception ids. Third actor.

**Verify**

- [ ] Two learners, same confirmed misconception → class view shows the id, not names as a leaderboard
- [ ] Out of cup scope unless time remains

---

## Suggested build order vs intelligence

| Capability | Lands in |
|---|---|
| Hybrid Firecrawl extract + preview | Phase 1 |
| Confirm → `learners/…/materials` | Phase 2 |
| Age-mapped program + Live graph | Phase 3 |
| Method ledger (already sketched) | Phase 4 on by default; persist in Phase 5 |
| BKT | Already in `bkt.ts`; persist snapshots in Phase 5–6 |
| Captions + next-session brief | Phases 5–6 |
| Growing chips | Phase 7, labels from Phase 8 |
| Any uploaded textbook + fade | Phase 10 (program graph from Phase 3) |

Until Phase 10, the board pack is still Pythagoras-shaped in code. The **subject list and concept graph** already come from `learners/{id}/programs` in Firestore. `src/curriculum/pythagoras.ts` is a seed example for the Secondary 2 cup demo, not a special runtime path.

---

## Out of scope on this branch

- Browser Firebase AI Logic Live
- Gemma / on-device observer
- Higgsfield, Firecrawl, Gamma, Veo as Live tools
- Career-prep / 18+ Gemini for Students features
- Rewriting homework or essays for the child
