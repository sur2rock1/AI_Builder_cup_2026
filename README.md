# Ananta — Adaptive AI Tutor

> **AI Builder Cup 2026 · Media, Content & Digital Experiences**

**An AI tutor that diagnoses *how* a child reasons — not just *what* they answer — and adapts in real time.**

Ananta uses Gemini Live for voice-first tutoring, Bayesian Knowledge Tracing for evidence-based mastery, and a deterministic teaching plan compiler to deliver personalised, quality-gated lessons for any curriculum. Parents see every claim backed by the child's own words.

🔗 **[Live Demo](https://ananta-ivczdbgbja-as.a.run.app/)** · 📄 [Architecture](docs/ARCHITECTURE.md) · 📊 [Evaluation](docs/EVALUATION.md) · 🎓 [Teaching Plan Design](docs/TEACHING_PLAN.md)

---

## Why Ananta is Different

| Innovation | What it means |
|---|---|
| **Learns how each child learns** | Every checked answer updates, per type of idea, which ways of explaining work for this child. The next lesson's plan leads with what worked, avoids what didn't and watches for the child's own mix-ups, and the voice tutor is told so. Proof: `npm run test:adaptation` · [how it works](docs/ADAPTIVE_TEACHING.md) |
| **Bayesian Knowledge Tracing (BKT)** | Mastery is a probability, not a score. pKnown ≥ 0.80 *and* ≥ 2 level-3 demonstrations required — a right answer from guessing doesn't count. |
| **Deterministic plan compiler** | Teaching plans use zero GenAI — reproducible, auditable, never hallucinated. |
| **Evidence-centered mastery gates** | Bare MCQ answers are capped at "recognised" level. The child must explain reasoning to advance. |
| **Anti-hallucination claim validator** | Every profiler claim about a child must pass deterministic validation before it reaches a parent. |
| **Quality-gated content pipeline** | Every generated lesson, diagram, and photo passes an independent critic review. Failures are quarantined — never served. |
| **Tutor never gives up** | No "escalate to teacher" fallback. Ananta always pivots to a worked example or a different representation. |
| **Two-click evidence replay** | Parents see the exact question asked, the child's exact answer, and the diagnostic reasoning — not just a grade. |
| **Growth-mindset language** | The tutor never uses deficit labels or fixed-trait descriptions. Enforced by lint rules. |
| **PDF → structured curriculum** | Upload a textbook PDF → Gemini extracts chapters, concepts, prerequisites, misconceptions, and generates quality-reviewed lessons automatically. |

---

## Architecture

```mermaid
flowchart TD
    PDF["📄 Textbook PDF"] -->|"pdfIngest (Gemini 3.8 Flash)"| CUR["📚 Curriculum Store"]
    CUR --> PLAN["📋 Deterministic Plan Compiler"]
    PLAN --> SYS["🧠 Persona Composer → System Prompt"]

    STU["🎤 Student Voice"] -->|"WebSocket /ws/live"| LIVE["⚡ Gemini 3.8 Live<br/>8 function-calling tools"]
    SYS --> LIVE

    LIVE -->|"assess_child_reasoning"| DIAG["🔬 Gemini 3.6 Flash<br/>6.5s reasoning budget"]
    LIVE -->|"set_figure / reveal_part"| BOARD["🖥️ Visual Blackboard<br/>2D · 3D · Photo · Chalk"]

    DIAG --> BKT["📈 BKT Update"]
    BKT --> DELTA["Δ Plan Delta → Next Move"]
    DELTA --> LIVE

    LIVE -->|"Session end"| PROF["📝 Profiler (Gemini 3.8 Flash)"]
    PROF --> PARENT["👨‍👩‍👧 Parent Report<br/>evidence-backed narrative"]
```

---

## Google AI Features Used

| Gemini Feature | How Ananta Uses It | Depth |
|---|---|---|
| **Gemini 3.8 Live** | Real-time bidirectional voice tutoring with 8 function-calling tools in the default guided tutor (13 in the standard tutor), Puck voice, VAD | Deep |
| **Gemini 3.8 Flash** | PDF ingestion, lesson generation, profiler, parent reports, critic reviews, photo generation | Deep |
| **Gemini 3.6 Flash** | Real-time reasoning assessment within a 6.5-second budget during live voice sessions | Deep |
| **Gemini 3.1 Flash Lite** | Fallback model for diagnosis and lesson generation (resilience) | Redundancy |
| **Gemini Vision** | Critic inspects AI-generated photos for pedagogical accuracy before serving | Novel |
| **Gemini Image Generation** | Real-world photo generation for visual analogies tied to student interests | Novel |
| **Google Files API** | PDF textbook upload (60-page chunks, 40 MB limit) for curriculum ingestion | Deep |
| **Structured Outputs** | JSON schema enforcement across all AI calls — no unstructured responses | Deep |
| **Thinking Budget** | Dynamic reasoning budget with auto-retry and model fallback | Novel |
| **Function Calling** | 13 real-time tools: board control, quizzes, reasoning assessment, confusion signals | Deep |

---

## Quickstart

```bash
npm install
echo "GEMINI_API_KEY=your-key" > .env.local
npm run dev                    # opens http://localhost:5173
```

### Load curriculum content

1. On the login screen, click **Content library (admin)**
2. Pick board + grade + subject, upload the textbook PDF
3. Gemini reads, structures, reviews, and publishes content automatically

### Seed demo learners

```bash
npm run seed:g4 -- --reset     # creates Maya and Leo (Grade 4, simulated) with contrasting learning histories
```

---

## Production (Cloud Run + Firestore + Cloud Storage)

One Google Cloud project. Cloud Run runs the Node server (REST API + Gemini Live WebSocket proxy + built SPA). Firestore stores curricula, lessons, and learner data. Cloud Storage holds pre-generated photos.

```bash
export PROJECT_ID=<your-project> REGION=<region> BUCKET=<your-bucket>
npm run deploy:live                                          # Cloud Run + Firestore rules/indexes
npm run migrate:cloud -- --dry-run && npm run verify:migration  # local → Firestore + Storage
```

Full setup guide: [docs/ANANTA_CLOUD_RUN_PLAN.md](docs/ANANTA_CLOUD_RUN_PLAN.md)

---

## Real-Time Voice Tools

The default **guided chalkboard tutor** gives Gemini Live 8 function-calling tools:

| Tool | Purpose |
|---|---|
| `advance_beat` | Start the next part of the prepared lesson |
| `next_line` | Write the next chalk line (or hold back an answer until the child replies) |
| `fill_slot` | Write the child's own answer into a blank on the board |
| `write_aside` | Answer the child's question on the board as a side note |
| `show_picture` | Put a prepared picture on the board when the child asks to see something |
| `resume_lesson` | Go back to exactly where the lesson stopped |
| `assess_child_reasoning` | Send the child's answer, their reasoning and how the idea was explained (`representationUsed`) to the 6.5 s reasoning assessment |
| `record_confusion_signal` | Log when the child signals confusion |

The standard tutor (`?tutor=standard`) uses 13 tools instead (`set_figure`, `reveal_part`, `update_diagram`, `switch_board_view`,
`update_chalkboard_notes`, `pose_quiz`, `generate_photo_visual`, …).

---

## Parent Portal

Parents see a plain-language report: what Ananta learned about their child, how it worked it out (with a *See why* link to the child's real answer behind every claim), the plan for the next lesson, and a home activity. An **Under the hood** toggle reveals the full engineering view with BKT curves, misconception ledgers, and strategy effectiveness data.

```bash
npm run seed:g4 -- --reset      # creates Maya and Leo (Grade 4, simulated): same lesson, two different plans
npm run test:parent             # offline tests: sentence/evidence gates, jargon-leak check, story logic
```

---

## Test Suite

```bash
npm test                        # core assessor + live + plan-delta tests (tests/live has 7 known stale baseline checks)
npm run test:adaptation         # proof that a child's answers change the plan and the tutor's next move (10 checks)
npm run test:quality            # quality gates, lesson gen, photo gen, quiz evidence, ladder, content spec
npm run test:gates              # quality + visuals + curriculum ingest
npm run test:parent             # parent report tests
npm run eval:diagnosis          # 45-case evaluation: catches right-answer-wrong-method errors
npm run verify                  # tsc + all gates + scorecard
```

---

## Key Documentation

| Document | Content |
|---|---|
| [ADAPTIVE_TEACHING.md](docs/ADAPTIVE_TEACHING.md) | How Ananta learns each child and changes how it teaches, with proof |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System map — what IS, not what was planned |
| [CURRICULUM.md](docs/CURRICULUM.md) | Content pipeline: PDF → structured curriculum → pre-generated visuals |
| [LEARNER_MODEL.md](docs/LEARNER_MODEL.md) | BKT parameters, evidence ladder, mastery gates |
| [BOARD_VISUALS.md](docs/BOARD_VISUALS.md) | Visual generation: 2D diagrams, 3D models, photos, step-by-step reveals |
| [GUIDED_TUTOR.md](docs/GUIDED_TUTOR.md) | The default chalkboard tutor: lesson scripts, conversational delivery, pictures |
| [PARENT_VIEW.md](docs/PARENT_VIEW.md) | Parent portal design and evidence-backed narratives |
| [TEACHING_PLAN.md](docs/TEACHING_PLAN.md) | Deterministic plan compiler design |
| [TUTOR_PERSONA.md](docs/TUTOR_PERSONA.md) | Persona composition and age-band adaptation |
| [EVALUATION.md](docs/EVALUATION.md) | Diagnosis accuracy evaluation methodology |
| [AGENT_GUIDE.md](docs/AGENT_GUIDE.md) | Developer guide — landmine patterns to avoid |

---

## For Evaluators / Judges

### Quick Start (No Account Required)

1. Open **[https://ananta-ivczdbgbja-as.a.run.app/](https://ananta-ivczdbgbja-as.a.run.app/)**
2. Click **"Maya (Simulated)"** or **"Leo (Simulated)"** — two Grade 4 learners with contrasting histories (pictures helped Maya; worked examples helped Leo, who still mixes up negative numbers)
3. Select **Mathematics** → **Money and decimal place value** → **Start Lesson** — the tutor opens differently for each child
   (compare their Parent Portal pages: "Ananta's plan for the next lesson" is at the top)
4. Allow microphone access → speak naturally to the tutor

> No sign-in or credentials needed. DEMO_MODE is enabled for evaluation access.

### Sample Questions to Ask the Tutor

- "Why is minus five smaller than minus one?" (as Leo: his plan says to watch for exactly this mix-up)
- "Can you show me a picture?" (puts a prepared picture on the board)
- "Wait, why?" in the middle of a sentence (the tutor stops, answers, then carries on where it left off)
- "I don't understand this" (confusion signal: the tutor explains it a different way)
- "How many 10-cent coins make a dollar?" (an answer the tutor checks and records)

### Parent Portal

From the login screen, click **"Parent Portal"** → select **Maya**, then **Leo**, to see:
- **Ananta's plan for the next lesson** at the top: different for each child, built from their own answers
- Plain-language learning report with *"See why"* evidence links
- Misconception ledger with detection/resolution timeline
- Home activity suggestions

### Google Cloud Services Used

| Service | Usage |
|---|---|
| **Gemini** | 5 model tiers — Live (voice), Flash (content gen), Flash fast (6.5s diagnosis), Flash Lite (fallback), Vision+Image (photo review/gen). Structured outputs, function calling (8 tools in the default guided tutor), thinking budget. |
| **Cloud Run** | Full-stack deployment: REST API + Gemini Live WebSocket proxy + built SPA. Session affinity, 3600s timeout, scale-to-zero. |
| **Firestore** | Learner profiles, evidence events, teaching plans, session data, curricula, pre-generated content cache. Security rules lock all learner data to server-only access. |
| **Firebase Auth** | User authentication framework (bypassed in demo mode for evaluation access). |
| **Cloud Storage** | Pre-generated photo storage with public URLs. |
| **Google Files API** | PDF textbook upload for curriculum ingestion (60-page chunks, 40MB limit). |

### Known Limitations

- **Microphone required** for voice tutoring — use Chrome or Firefox with mic access
- **First load may take 10-20 seconds** if the Cloud Run instance is cold (scale-to-zero)
- **Free-tier Gemini API** has rate limits — if responses are slow, wait a few seconds between interactions
- **Photo generation** may be limited by image quota — diagrams and chalkboard always work
- **Voice Activity Detection** threshold is 700ms — pause briefly between sentences for best results
- **Recommended browser:** Chrome (latest) or Firefox on desktop

---

## License

Built for the [Google Cloud AI Builder Cup 2026](https://aibuildercup.com/).
