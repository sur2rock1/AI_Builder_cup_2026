# 📊 Ananta — Solution Deck Outline (10 Slides)

> **Format:** PDF, 16:9 landscape
> **Tool:** Google Slides, Canva, or PowerPoint → export to PDF
> **Colour palette:** Dark green (#041009), Emerald (#10b981), Amber (#fbbf24), White

---

## Slide 1: Cover

**Title:** Ananta — Adaptive AI Tutoring That Diagnoses, Adapts & Proves Its Work

**Subtitle:** AI Builder Cup 2026 | Media, Content & Digital Experiences

**Visual:** App screenshot or logo + team name + GitHub link + live URL

---

## Slide 2: The Problem

**Title:** The \$1-Trillion Tutoring Gap

**Key message:** Quality 1-on-1 tutoring transforms outcomes but is inaccessible to most

**Bullets:**
- 1.5 billion school-age children worldwide; <5% can afford a personal tutor
- The best tutors don't just check answers — they diagnose HOW a child thinks
- Existing AI tutors are chatbot wrappers: they respond to questions but don't teach, diagnose, or adapt
- A correct answer from a wrong method goes undetected → false mastery → exam failure

**Visual:** Statistic infographic or simple comparison table (Human tutor vs. Chatbot vs. Ananta)

---

## Slide 3: Ananta — Solution Overview

**Title:** An AI Tutor That Teaches Like the Best Human Tutors

**Key message:** Three capabilities no chatbot has

**Bullets:**
1. **Diagnoses reasoning** — Not just right/wrong, but WHY (catches right answers from wrong methods)
2. **Adapts in real-time** — Switches teaching strategy, representation, and difficulty mid-session
3. **Proves its work** — Every mastery score is backed by auditable evidence that parents can inspect

**Visual:** 3-panel screenshot (Voice session | Board visual | Parent evidence replay)

---

## Slide 4: Live Demo Screenshots

**Title:** The Learning Experience

**Visual:** Annotated screenshots showing:
- Left: Animated tutor avatar with "Speaking" indicator
- Center: Interactive chalkboard with step-by-step diagram build
- Right: Understanding depth meter + mastery ring
- Bottom: Live transcript + confusion signal buttons

**Callouts:**
- "Real-time voice via Gemini 3.8 Live"
- "Board updates as tutor speaks (13 function-calling tools)"
- "Student can signal confusion at any time"
- "Diagnostic classification shown in real-time"

---

## Slide 5: System Architecture

**Title:** Five Tiers of Gemini Working Together

**Visual:** Architecture diagram:

```
┌─────────────────┐    ┌──────────────────────┐    ┌───────────────────┐
│  PDF Textbook    │───▶│  Gemini 3.8 Flash    │───▶│ Structured        │
│  (Google Files   │    │  (Extract, Review,    │    │ Curriculum with   │
│   API upload)    │    │   Quality Gate)       │    │ Prerequisites &   │
└─────────────────┘    └──────────────────────┘    │ Misconceptions    │
                                                    └────────┬──────────┘
                                                             │
┌─────────────────┐    ┌──────────────────────┐              │
│  Student Voice   │◀──▶│  Gemini 3.8 Live    │◀─────────────┘
│  (16kHz PCM)     │    │  (Puck voice, 13    │
└─────────────────┘    │   tools, VAD)        │
                        └──────────┬───────────┘
                                   │ assess_child_reasoning
                        ┌──────────▼───────────┐
                        │  Gemini 3.6 Flash    │
                        │  (6.5s budget,       │
                        │   JSON diagnosis)    │
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │  Bayesian Knowledge  │
                        │  Tracing (BKT)       │──▶ Deterministic
                        │  pKnown update       │    Teaching Plan
                        └──────────────────────┘
```

---

## Slide 6: What Makes This Different (Innovation)

**Title:** Education Engineering, Not a Chatbot Wrapper

**Bullets:**
| Feature | Why It Matters |
|---|---|
| **Bayesian Knowledge Tracing** | Probabilistic mastery — not a percentage counter |
| **Evidence-Centered Design** | Bare MCQ answers capped at "recognised"; reasoning required for mastery |
| **Deterministic Plan Compiler** | No AI decides what to teach — reproducible, auditable rules |
| **Anti-Hallucination Claim Validator** | AI profiler claims must pass deterministic evidence check |
| **Tutor Never Gives Up** | Always pivots to worked example; never tells student "ask your teacher" |
| **Growth-Mindset Language** | Never uses deficit labels ("you're a visual learner") |
| **Quality-Gated Content** | Critic review + quarantine — failing content never served |

---

## Slide 7: Parent & Teacher Accountability

**Title:** Two-Click Evidence Replay — No Black Box

**Visual:** Parent portal screenshots showing:
1. Mastery overview per concept
2. Misconception ledger (confirmed → teaching changed → resolved)
3. Evidence replay: exact question → child's exact answer → diagnostic reasoning
4. AI-generated plain-language parent letter with home activity tips

**Key message:** "Parents don't have to trust the AI score — they can SEE the evidence behind every single claim"

---

## Slide 8: Content Pipeline

**Title:** From PDF Textbook to Adaptive Lesson in One Upload

**Visual:** Pipeline flow:
1. **Upload** PDF textbook + syllabus
2. **Extract** chapters, objectives, worked examples, prerequisite graph (Gemini 3.8 Flash)
3. **Generate** lesson text, chalkboard diagrams, 3D visuals, real-world photos
4. **Review** every asset through independent critic (Gemini Vision for photos)
5. **Quarantine** anything that fails — never serve fallback content
6. **Deliver** pre-generated assets instantly during live tutoring

**Supported boards:** IGCSE, Cambridge Lower Secondary, CBSE, US Common Core

---

## Slide 9: Impact & Scale

**Title:** Democratising Quality Tutoring (SDG 4: Quality Education)

**Bullets:**
- **Any curriculum:** Upload a textbook PDF → ready to teach
- **Any subject:** Mathematics, Biology, more coming (Physics, Chemistry, History)
- **Any language:** Onboarding captures preferred language; Gemini adapts
- **Any device:** Voice-first design works on phone, tablet, or laptop
- **Measurable outcomes:** Every session produces auditable evidence events
- **Cost:** Runs on a single Cloud Run instance at <\$5/day for hundreds of concurrent students

**Key metric:** "The quality of a \$100/hour human tutor at the cost of a mobile data plan"

---

## Slide 10: Team & Links

**Title:** Team [Your Team Name]

**Content:**
- Team member photos, names, roles, backgrounds
- 🌐 **Live App:** [Cloud Run URL]
- 💻 **GitHub:** https://github.com/sur2rock1/AI_Builder_cup_2026
- 🎥 **Demo Video:** [YouTube/Drive link]
- 📧 **Contact:** [email]

**Closing line:** "Ananta — adaptive AI tutoring that diagnoses, adapts, and proves its work"
