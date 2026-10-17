# 🎬 Ananta — Demo Video Script & Visual Production Cue Sheet

> **Total Target Runtime:** 3:35 (Official requirement: 3 to 4 minutes)  
> **Format:** 1080p Screen Recording with Clear Voiceover  
> **Recommended Tools:** OBS Studio, Loom, or Camtasia  
> **Audio Imperative:** Speak loudly and clearly. Normal speaking volume (no whispering). Judges highlighted low volume as the #1 failure mode in previous hackathons.

---

## ⏱️ Video Timeline Overview

```
[0:00 - 0:20] Hook: Open directly with the live product & problem statement
[0:20 - 0:50] Architecture & The 5-Tier Gemini Engine
[0:50 - 1:55] Live Tutoring Session: Interactive Chalkboard & Real-Time Diagnosis
[1:55 - 2:25] Adaptive Teaching Proof: Maya vs. Leo Contrasting Profiles
[2:25 - 2:55] Parent Portal: Two-Click Evidence Replay & Misconception Ledger
[2:55 - 3:15] Empirical Validation (EV-01) & Automated Curriculum Pipeline
[3:15 - 3:35] Impact, Production Deployment & Conclusion
```

---

## Detailed Step-by-Step Production Script

### Part 1: Open on Live Product & The Core Problem (0:00 – 0:20)

- **On Screen:**
  - Browser already open at `https://ananta-ivczdbgbja-as.a.run.app/`
  - Cursor clicks on **"Leo (Simulated)"** (Grade 4 Cambridge Mathematics).
  - Screen transitions into the lesson view: **"Money and decimal place value"**.
- **Visual Action:**
  - Click **"Start Voice Lesson"**.
  - Show Ananta's greeting and the chalkboard initializing.
- **Voiceover Track:**
  > "This is Ananta — an adaptive AI tutor live on Google Cloud Run. 1.5 billion students worldwide cannot access personalized tutoring. But when edtech uses standard chatbots, they fall into the 'Correct Answer Trap' — they only check if an answer is right or wrong, missing forty-three percent of misconceptions hidden behind lucky guesses. Ananta is fundamentally different: it diagnoses *how* a child reasons, adapts in real time, and proves every claim with evidence."

---

### Part 2: System Architecture & Google AI Stack (0:20 – 0:50)

- **On Screen:**
  - Cut to full-screen architecture diagram (Slide 5 of `docs/Ananta_Submission_Deck.pdf`).
  - Highlight the 5 Gemini model tiers and deterministic plan compiler.
- **Visual Action:**
  - Zoom in slightly on:
    1. Gemini 3.8 Live (Voice WebSocket)
    2. Gemini 3.6 Flash (6.5s diagnostic reasoning loop)
    3. Deterministic Teaching Plan Compiler & BKT module.
- **Voiceover Track:**
  > "Under the hood, Ananta is powered by five tiers of Google Gemini models. Real-time bidirectional voice runs on Gemini 3.8 Live with ten specialized function-calling tools. Every student answer is diagnosed by Gemini 3.6 Flash within a strict six-point-five-second budget. Bayesian Knowledge Tracing computes true probabilistic mastery, and an entirely deterministic compiler builds reproducible lesson plans without AI hallucinations. All deployed on Google Cloud Run, backed by Firestore and Cloud Storage."

---

### Part 3: Live Tutoring Session & Real-Time Diagnosis (0:50 – 1:55)

- **On Screen:**
  - Cut back to the live interactive lesson with Leo.
- **Visual Action:**
  - Ananta speaks using the Puck voice.
  - Chalkboard writes the first lines progressively (`next_line`).
  - A prepared decimal place-value diagram renders on the board (`show_picture`).
  - The tutor presents a check question: *"How many 10-cent coins make up one dollar?"*
  - **Speaker (Demonstrator):** Speaks into the mic: *"Ten coins, because ten times ten cents is one hundred cents."*
  - **On Screen:** Show the diagnostic pill update: `clear_reasoning`, understanding depth advancing to `applied`, and the mastery ring updating via Bayesian Knowledge Tracing.
  - **Interruption Demo:** Speaker interrupts: *"Wait, can you show me that in dollars and cents on the board?"*
  - **On Screen:** Ananta immediately stops, writes a side note (`write_aside`), explains the decimal notation `$0.10`, and smoothly resumes the lesson.
- **Voiceover Track:**
  > "Watch the interactive chalkboard synchronize with Ananta's speech. Lines appear as the tutor speaks, diagrams build up step by step, and when the student asks a question, Ananta pauses, addresses the query with a chalkboard side note, and seamlessly resumes. When the student answers, Ananta doesn't just evaluate the result — Gemini Flash diagnoses the underlying reasoning, updating Bayesian Knowledge Tracing in real time."

---

### Part 4: Adaptive Teaching Proof — Maya vs. Leo (1:55 – 2:25)

- **On Screen:**
  - Cut to `docs/ADAPTIVE_TEACHING.md` / Parent Portal comparison showing Maya and Leo.
- **Visual Action:**
  - Show the side-by-side teaching plans for Maya vs. Leo on the exact same lesson ("Money and decimal place value").
  - Point to Maya's Plan: **Lead with Visual Diagram (Score 0.91)**; examples themed on drawing and football.
  - Point to Leo's Plan: **Lead with Worked Example (Score 0.80)**; explicitly marks **"Avoid: Visual Diagram (Score 0.17)"** and watches for confirmed misconception: **"-5 > -1"**.
- **Voiceover Track:**
  > "Ananta does not label children with static categories like 'visual learner.' It tracks Beta distributions for each explanation method per concept type. Here are two Grade 4 learners opening the exact same money lesson. For Maya, visual diagrams worked, so Ananta opens by drawing out a place-value chart. For Leo, diagrams failed four times, so his plan leads with a worked example, explicitly avoids diagrams, and actively probes his known mix-up with negative numbers."

---

### Part 5: Parent Portal & Two-Click Evidence Replay (2:25 – 2:55)

- **On Screen:**
  - Navigate to the **Parent Portal** at `/parent`.
  - Select **Leo (Simulated)**.
- **Visual Action:**
  - Highlight the top card: **"Ananta's plan for Leo's next lesson"**.
  - Scroll down to the **Misconception Ledger**: highlight *"−5 is greater than −1"* (status: confirmed).
  - Click the **"See Leo's answer"** button.
  - Expand modal showing the exact student utterance, tutor prompt, timestamp, and diagnostic classification.
  - Highlight the personalized home activity for parents.
- **Voiceover Track:**
  > "Every session is transparent. The Parent Portal opens with Ananta's customized plan for the next lesson. Parents can review the misconception ledger tracking beliefs over time. With two clicks, parents can click 'See Leo's answer' to inspect the child's exact spoken words, the question asked, and the AI's diagnostic rationale. No black boxes. Pure accountability."

---

### Part 6: Empirical Evaluation (EV-01) & Curriculum Ingestion (2:55 – 3:15)

- **On Screen:**
  - Show the EV-01 Evaluation Report (`evals/diagnosis/results/latest/report.html`) and the Content Library admin view.
- **Visual Action:**
  - Highlight the benchmark table:
    - **100% (10/10)** catch rate on misconceptions hidden behind right answers.
    - **0%** false alarms on sound reasoning.
    - Automated adaptation tests: **10/10 passing**.
  - Quick flash of the PDF upload interface: textbook PDF → curriculum graph.
- **Voiceover Track:**
  > "We backed our claims with hard empirical validation. In our EV-01 evaluation across forty-five labeled cases, Ananta caught ten of ten misconceptions hidden behind correct answers, with no false alarms on sound reasoning — where a quiz that only checks answers catches none. In the admin library, any official textbook PDF can be uploaded through Google's Files API, automatically extracting prerequisites, misconceptions, and pre-generating quality-reviewed lessons."

---

### Part 7: Conclusion & Live Evaluation Call to Action (3:15 – 3:35)

- **On Screen:**
  - Closing Title Card:
    - **Ananta — Adaptive AI Tutor**
    - Live URL: `https://ananta-ivczdbgbja-as.a.run.app/`
    - GitHub: `github.com/sur2rock1/AI_Builder_cup_2026`
    - Google Cloud Stack: Gemini 3.8 Live · Gemini 3.6 Flash · Gemini 3.8 Flash · Cloud Run · Firestore · Cloud Storage · Google Files API
- **Voiceover Track:**
  > "Ananta brings world-class, 1-on-1 adaptive tutoring to every child, powered entirely by Google Cloud AI. It diagnoses reasoning, adapts dynamically, and proves its work. Try our live prototype on Cloud Run right now. Thank you!"

---

## 📋 Recording Day Checklist

1. [ ] **Pre-warm Cloud Run:** Open `https://ananta-ivczdbgbja-as.a.run.app/` 2 minutes prior to eliminate cold start latency.
2. [ ] **Check Microphone:** Speak at normal conversational volume; ensure input gain is at least 75-80%.
3. [ ] **Screen Resolution:** Set monitor or window capture to 1920x1080 (16:9).
4. [ ] **Browser Settings:** Close background tabs and mute all desktop notifications.
5. [ ] **Post-Recording Quality Check:** Play back the video at 50% system volume. If dialogue is not crisp and effortlessly audible, adjust gain and re-record voiceover.
