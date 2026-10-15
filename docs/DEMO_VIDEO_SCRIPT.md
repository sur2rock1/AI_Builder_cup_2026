# 🎬 Ananta — 3-Minute Demo Video Script

> **Total Runtime:** 3:00 | **Format:** Screen recording with voiceover
> **Tools:** OBS/Loom for screen capture, or just a phone recording your screen

---

## 0:00 – 0:20 | THE HOOK (Problem Statement)

**[Show: Full-screen text slide or title card]**

> **Voiceover:**
> "One billion students worldwide cannot access a personal tutor. The difference between a struggling student and a thriving one is often just one adult who adapts to HOW they think — not just WHAT they answer. Meet Ananta — an AI tutor built on Google Gemini that doesn't just teach. It diagnoses, adapts, and proves its work."

**[Show: Ananta logo / landing page]**

---

## 0:20 – 0:40 | STUDENT LOGIN + CURRICULUM SELECTION

**[Action: Open the app at the deployed URL]**

> **Voiceover:**
> "A student logs in, picks their educational board — we support IGCSE, Cambridge, and more — selects their grade and subject. The entire curriculum was ingested from the actual textbook PDF using Gemini's Files API and structured into a prerequisite graph with known misconceptions."

**[Action: Click through login → select board → grade → subject → topic]**

---

## 0:40 – 1:30 | LIVE VOICE TUTORING SESSION (The Core Demo)

**[Action: Click "Start Voice Lesson" — let Ananta speak]**

> **Voiceover (brief, then let Ananta talk):**
> "Ananta teaches through real-time voice powered by Gemini 3.8 Live. Watch — as it explains each concept, the interactive chalkboard updates in real-time with diagrams, geometry, and step-by-step notes."

**[Show these moments — let them happen naturally:]**
1. **Ananta explaining a concept** — board updates with diagram (reveal_part tool)
2. **Ananta asking a check question** — quiz panel appears
3. **Student answers** (speak into mic) — show the diagnostic classification appearing
4. **If student gets it wrong** — show Ananta switching strategy (e.g., from diagram to worked example)

> **Voiceover (at ~1:15):**
> "Behind every response, Gemini Flash runs a 6.5-second diagnostic — not just checking if the answer is right, but HOW the student reasoned. A correct answer from a wrong method is caught and flagged. Bayesian Knowledge Tracing updates the mastery score in real-time."

**[Show: The understanding depth indicator changing, mastery ring updating]**

---

## 1:30 – 1:50 | CONFUSION SIGNALS + ADAPTIVE RESPONSE

**[Action: Click one of the confusion buttons ("I don't understand" / "Too fast")]**

> **Voiceover:**
> "Students can signal confusion at any time. The tutor immediately pivots — switches teaching strategy, tries a different representation, uses an analogy. It never gives up, never pauses, never tells a child to ask their teacher instead."

**[Show: Ananta responding to the confusion signal with a different approach]**

---

## 1:50 – 2:20 | PARENT & TEACHER PORTAL

**[Action: Navigate to Parent Portal → select a student]**

> **Voiceover:**
> "Every session is accountable. The Parent Portal shows mastery scores, active misconceptions, and — critically — two-click evidence replay. Parents and teachers can see the EXACT question asked, the child's EXACT answer, and HOW Ananta diagnosed it. No black box."

**[Show in sequence:]**
1. **Overview** — mastery %, sessions, study time
2. **Misconception ledger** — confirmed/suspected/resolved
3. **Evidence replay** — click into a concept → see the actual question-answer exchange
4. **AI Parent Letter** — the plain-language summary with home activity suggestions

---

## 2:20 – 2:45 | ARCHITECTURE & TECHNICAL DEPTH

**[Show: Architecture diagram (full-screen)]**

> **Voiceover:**
> "Under the hood, Ananta uses five tiers of Gemini models. Gemini 3.8 Live for real-time voice. Gemini Flash for sub-7-second diagnostic assessment. Gemini 3.8 Flash for curriculum ingestion, content generation, and quality review. Every piece of generated content passes through an independent critic review — failing content is quarantined, never served."
>
> "The teaching plan is deliberately deterministic — no AI decides what to teach next. A rule-based compiler ensures reproducibility and auditability: spaced repetition, prerequisite checking, strategy ranking based on empirical gain. This is education engineering, not a chatbot wrapper."

**[Show: Quick flash of key code / decision log / test output to establish credibility]**

---

## 2:45 – 3:00 | IMPACT & CLOSING

**[Show: Full-screen closing slide]**

> **Voiceover:**
> "Ananta isn't a demonstration — it's a working adaptive tutoring system deployed on Google Cloud Run, ingesting real textbooks, teaching real curricula, and proving every learning claim with evidence. One tutor that adapts to every child, built entirely on Google Gemini."
>
> "Ananta. Adaptive AI tutoring that diagnoses, adapts, and proves its work."

**[Show: Live URL + GitHub link + team name]**

---

## Recording Tips

1. **Do a dry run first** — start a voice session, make sure audio works, let Ananta teach for 30 seconds
2. **Use a quiet room** — Gemini Live VAD is sensitive to background noise
3. **Pre-seed a demo student** with some history so the parent portal has data: `npm run seed:demo -- --reset`
4. **Record in 1080p** — judges watch on laptops
5. **Keep voiceover energy high** — you're presenting to judges, not reading docs
6. **If the API is slow**, pre-record the voice session segment and narrate over it
7. **Upload to YouTube (unlisted) or Google Drive (anyone with link)**
