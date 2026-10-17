# Submission Description — Paste into Hack2skill Portal

> Copy the text below into the "Brief description" field on the submission form.
> Adjust team name / member details as needed.

---

## Ananta — Adaptive AI Tutor

Ananta is a voice-first adaptive AI tutor that diagnoses HOW a child reasons — not just whether their answer is right — and adapts its teaching in real time. A correct answer reached by a wrong method is caught and flagged. Mastery requires genuine understanding backed by evidence, not just passing a quiz.

Built entirely on Google Cloud AI, Ananta ingests real textbook PDFs, builds structured curricula with prerequisite graphs and known misconceptions, pre-generates quality-reviewed lessons and visual materials, and delivers them through real-time voice tutoring. Parents see every learning claim backed by the child's own words.

### Google Cloud Services Used

**Gemini (5 model tiers):**
- Gemini 3.8 Live — Real-time bidirectional voice tutoring on a chalkboard with function calling (writes the board line by line, shows prepared pictures on request, answers the child's questions on the board, sends every answer for reasoning assessment), structured outputs, Puck voice
- Gemini 3.8 Flash — PDF textbook ingestion via Google Files API (60-page chunks), lesson generation, learner profiling, parent report narrative, independent content critic review, photo generation
- Gemini 3.6 Flash — Real-time reasoning assessment within a 6.5-second budget during live voice sessions, with model fallback cascade
- Gemini 3.1 Flash Lite — Fallback model for diagnosis and lesson generation (resilience)
- Gemini Vision — AI-generated photos are reviewed by the critic for pedagogical accuracy before serving

**Cloud Run:** Full-stack deployment — REST API (20+ endpoints), Gemini Live WebSocket proxy (/ws/live), and built SPA all on one service. Session affinity enabled, 3600s timeout for voice sessions, scale-to-zero for cost efficiency.

**Firestore:** Learner profiles, evidence events (every diagnostic assessment), teaching plans, session data, curricula, and pre-generated lesson cache. Security rules lock all learner data to server-only access via Admin SDK. Composite indexes for event and plan queries.

**Firebase Auth:** User authentication framework (bypassed in demo mode for evaluation access).

**Cloud Storage:** Pre-generated photo storage with public URLs for real-world visual analogies.

**Google Files API:** PDF textbook upload for automated curriculum ingestion (40MB limit, 60-page chunk processing).

### Key Technical Innovations

- **Learns how each child learns:** every checked answer updates, per type of idea, which ways of explaining work for this child (older evidence fades). The next lesson's plan leads with what worked, avoids what didn't and watches for the child's own mix-ups; the voice tutor is told so and changes approach mid-lesson after a miss. Provable offline: `npm run test:adaptation` (docs/ADAPTIVE_TEACHING.md).
- **Bayesian Knowledge Tracing (BKT):** Mastery is a probability (pKnown ≥ 0.80 AND ≥ 2 level-3 demonstrations). Guessing doesn't count.
- **Deterministic Teaching Plan Compiler:** Zero GenAI for planning — reproducible, auditable, never hallucinated. Prerequisite checking, mix-up watch-lists and strategy ranking by measured gain.
- **Evidence-Centered Mastery Gates:** Bare MCQ answers capped at "recognised" level. Students must explain reasoning to advance.
- **Quality-Gated Content Pipeline:** Every generated lesson, diagram, and photo passes an independent Gemini critic review. Failures are quarantined — never served to students.
- **Anti-Hallucination Claim Validator:** Profiler claims about a child must pass deterministic validation before reaching parents.
- **6.5-Second Reasoning Assessment:** Real-time diagnostic during live voice with model fallback cascade.
- **Growth-Mindset Language Enforcement:** Tutor never uses deficit labels — enforced by lint rules.
- **Parent Evidence Replay:** Two-click access to exact questions, answers, and diagnostic reasoning.

### For Evaluators

- **Live URL:** https://ananta-ivczdbgbja-as.a.run.app/
- **No sign-in required** — DEMO_MODE is enabled for evaluation
- **Quick test:** Click "Maya (Simulated)" or "Leo (Simulated)" (Grade 4) → Mathematics → "Money and decimal place value" → Start Lesson → allow microphone
- **Parent Portal:** Available from login screen — open Maya, then Leo: "Ananta's plan for the next lesson" (top of the page) is different for each child, built from their own answers (Maya: lead with a picture; Leo: a worked example, and watch for his "−5 is greater than −1" mix-up)
- **GitHub:** https://github.com/sur2rock1/AI_Builder_cup_2026

**Limitations:** First load may take 10-20s (Cloud Run cold start). Voice requires Chrome/Firefox with microphone. Free-tier Gemini API has rate limits — wait a few seconds between interactions if responses are slow.
