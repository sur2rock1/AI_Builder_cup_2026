# 🎬 Ananta — Demo Video Script (Revised)

> **Total Runtime:** 3:30–3:45 | **Format:** Screen recording with voiceover
> **Tools:** OBS/Loom for screen capture | Upload to YouTube (unlisted) or Google Drive
> **Key rule from organizer:** "3 to 4 minutes" — use the full time

> [!IMPORTANT]
> **Audio clarity is the #1 reason strong prototypes lose points.** The organizer said: "Majority of the ideas had very low volume... we were not able to even understand how certain things worked." Record at FULL speaking volume, in a quiet room, with a good microphone. Test playback before finalizing.

---

## 0:00 – 0:15 | OPEN WITH THE LIVE PRODUCT

> The Google DevRel speaker recommends: "Open with a product, ask a question, and before the response comes out, go back to the technical architecture, then come back and show the response."

**[Action: App is already open at https://ananta-ivczdbgbja-as.a.run.app/ — click "Priya (Simulated)" → Mathematics → pick a topic → Start Voice Lesson]**

> **Voiceover:**
> "This is Ananta — an adaptive AI tutor, live on Google Cloud Run. Let's ask it to teach simultaneous equations to a Grade 8 student who we already know has a misconception about parallel lines."

**[Let Ananta greet the student — pause for 3-5 seconds of Ananta speaking]**

---

## 0:15 – 0:40 | THE PROBLEM + WHY THIS MATTERS

**[Cut to: Title card / problem slide — or picture-in-picture over the running session]**

> **Voiceover:**
> "One billion students worldwide cannot access a personal tutor. The difference between a struggling student and a thriving one is often just one person who adapts to HOW they think — not just what they answer. Most AI tutors check if the answer is right. Ananta diagnoses the reasoning BEHIND the answer — even when it's correct. A right answer reached by a wrong method is caught and flagged."

**[Show: Ananta logo / one-liner: "Adaptive AI Tutoring — Diagnoses, Adapts, Proves Its Work"]**

---

## 0:40 – 0:55 | HOW IT'S BUILT (Architecture Flash)

**[Show: Architecture diagram — full-screen for 10 seconds]**

> **Voiceover:**
> "Under the hood, five tiers of Google Gemini power Ananta. Gemini 3.8 Live handles real-time bidirectional voice with thirteen function-calling tools. Gemini Flash runs a 6.5-second diagnostic assessment during conversation. The teaching plan is deliberately deterministic — no AI decides what to teach next. A rule-based compiler ensures every lesson is reproducible and auditable. Every piece of generated content passes an independent critic review. Failures are quarantined — never served."

---

## 0:55 – 2:00 | LIVE VOICE TUTORING SESSION (The Core Demo)

**[Cut back to the running session — Ananta should be mid-teach by now]**

> **Voiceover (brief — then let Ananta talk):**
> "Back to our session. Watch the interactive board updating in real-time as Ananta teaches — diagrams, step-by-step reveals, chalkboard notes, all controlled by Gemini function calling."

**[Show these moments — let them happen naturally, ~15-20 seconds each:]**

1. **Ananta explaining a concept** — board updates with diagram via `reveal_part` tool
2. **Ananta asks a check question** — quiz panel appears via `pose_quiz` tool
3. **Student answers** (speak into mic) — show the diagnostic classification appearing
4. **Mastery updating** — understanding depth indicator changes, BKT mastery ring updates

> **Voiceover (at ~1:30):**
> "Behind every student response, Gemini Flash assesses the reasoning within a 6.5-second budget. Not just right or wrong — it classifies: clear reasoning, partial understanding, or misconception behind a correct answer. Bayesian Knowledge Tracing updates the mastery probability. Mastery requires pKnown above 80 percent AND at least two demonstrated explanations — guessing won't pass."

**[Show: Understanding depth changing to "misconception_behind_correct" or "clear_reasoning"]**

---

## 2:00 – 2:15 | CONFUSION + ADAPTIVE RESPONSE

**[Action: Say "I don't understand this" or click a confusion button]**

> **Voiceover:**
> "When a student signals confusion, Ananta never pauses, never gives up, never says 'ask your teacher.' It immediately switches strategy — from a diagram to a worked example, from abstract to a real-world analogy — based on what's worked for this student before."

**[Show: Ananta responding with a different approach — strategy switch visible]**

---

## 2:15 – 2:50 | PARENT PORTAL — EVIDENCE ACCOUNTABILITY

**[Action: Navigate to Parent Portal → select Priya]**

> **Voiceover:**
> "Every session is accountable. The Parent Portal gives a plain-language report — what Ananta learned about the child, backed by evidence. Parents click 'See why' to see the EXACT question asked, the child's EXACT answer, and HOW Ananta diagnosed it. No black box."

**[Show in sequence — 5-7 seconds each:]**
1. **Overview** — mastery %, sessions completed, study time
2. **Misconception ledger** — show a detected misconception with status (disputed → resolved)
3. **Evidence replay** — click "See why" → actual question-answer exchange appears
4. **Home activity** — the AI-generated suggestion for parents

> **Voiceover:**
> "The misconception ledger tracks every wrong belief detected across sessions — when it was first seen, when the tutor disputed it, and when the student demonstrated they'd overcome it. Every claim is backed by the child's own words."

---

## 2:50 – 3:10 | CONTENT PIPELINE + CURRICULUM INGESTION

**[Show: Admin library screen or a quick flash of the PDF → curriculum flow]**

> **Voiceover:**
> "Ananta doesn't just tutor — it ingests entire textbooks. Upload a PDF via Google's Files API, and Gemini extracts chapters, concepts, prerequisites, and known misconceptions. It then pre-generates quality-reviewed lessons, board pictures, and real-world photos. An independent critic reviews every generated artefact — nothing reaches a student without passing the quality gate."

**[Show: Quick flash of the content library with uploaded courses]**

---

## 3:10 – 3:30 | TECHNICAL ACHIEVEMENTS + IMPACT

**[Show: Quick text overlays or a closing slide with key stats]**

> **Voiceover:**
> "What we solved: sub-seven-second reasoning assessment during live voice conversation. Deterministic lesson planning with zero AI hallucination risk. Evidence-gated mastery — a right answer from guessing doesn't count. Quality-gated content — every lesson, diagram, and photo critic-reviewed before serving."
>
> "Ananta runs on Google Cloud Run, stores learning data in Firestore, and uses five Gemini model tiers. It's not a chatbot wrapper — it's education engineering built on Google Cloud AI."

---

## 3:30 – 3:40 | CLOSING

**[Show: Final slide with live URL, GitHub link, team name]**

> **Voiceover:**
> "Ananta. One adaptive tutor for every child. Diagnoses, adapts, and proves its work. Try it live right now."

**[Hold on live URL for 5 seconds: https://ananta-ivczdbgbja-as.a.run.app/]**

---

## Pre-Flight Checklist

Before recording:

- [ ] **Dry run** — start a voice session with Priya, let Ananta teach for 60 seconds, confirm audio works both ways
- [ ] **Pre-warm the app** — open the URL once so Cloud Run isn't cold during recording
- [ ] **Test Parent Portal** — click through evidence replay to make sure data loads
- [ ] **Prepare architecture diagram** — have it ready as an image or screenshot for the 0:40 cutaway
- [ ] **Check microphone levels** — record 10 seconds, play back, adjust volume
- [ ] **Close notifications** — no pop-ups during screen recording

## Recording Tips

1. **CLEAR, LOUD AUDIO** — the #1 thing judges complained about. Normal speaking voice, not whispering
2. **Record in 1080p** — judges watch on laptops
3. **Use a quiet room** — Gemini Live VAD is sensitive to background noise (700ms threshold)
4. **Keep voiceover energy high** — you're presenting to judges, not reading docs
5. **If Gemini is slow or errors**, pre-record the voice session segment and narrate over it. Have a backup tab with a successful session ready
6. **Upload to YouTube (unlisted) or Google Drive (anyone with link)**
7. **Watch the final cut at 50% volume** — if you can't understand it at half volume, it's too quiet
