# 🏆 Ananta — AI Builder Cup 2026 Final Submission Audit

> **Audit Date:** 2026-10-15
> **Submission Deadline:** October 18, 2026 (23:59 SGT) — **3 days remaining**
> **Theme:** Media, Content & Digital Experiences (education explicitly named in track)
> **Grand Finale:** December 4, 2026, Singapore (in-person pitch)

---

## Executive Summary

Ananta is a **production-grade adaptive AI tutor** with deep Gemini integration across 5 model tiers, real-time voice tutoring, Bayesian Knowledge Tracing, PDF curriculum ingestion, deterministic teaching plans, quality-gated content, and a parent accountability portal. The codebase has been massively rewritten since September — it's now ~30,000+ lines across 100+ source files with a comprehensive test suite.

> [!IMPORTANT]
> **Your project is substantially stronger than a typical hackathon entry.** The depth of pedagogical engineering (BKT, evidence-centered design, anti-hallucination mastery gates, deterministic plan compilation) puts this in a different class from "chatbot wrapper" projects. The key risk is **presentation** — judges need to see all this depth in 3 minutes.

---

## Competition Requirements Checklist

| Requirement | Status | Details |
|---|:---:|---|
| **Working Deployed URL** (Cloud Run/Firebase) | ⚠️ VERIFY | `deploy-cloudrun.sh` exists targeting `sceneflow-f9529`. Need to confirm live URL is accessible. |
| **3-Minute Demo Video** | ❌ NOT DONE | Must create before Oct 18 |
| **Public GitHub Repository** | ⚠️ VERIFY | Need to confirm repo is public with clean README |
| **Solution Deck (PDF, 8-12 slides)** | ❌ NOT DONE | Must create before Oct 18 |
| **Uses Gemini/Gemma models** | ✅ DONE | 5 model tiers: Live, Flash, Flash-Lite, Image, Vision |
| **Deployed on GCP** | ⚠️ VERIFY | Dockerfile + Cloud Run script exist. Verify deployment. |
| **Team of 2-4 members** | ⚠️ VERIFY | Confirm team registration |
| **Age 21+, JAPAC, working professional** | ⚠️ VERIFY | Confirm eligibility |

---

## Judging Criteria vs. Your Strengths

### 1. Technical Merit & Gen AI Implementation (40% weight) — YOUR STRONGEST PILLAR

| Google AI Feature | How You Use It | Depth |
|---|---|---|
| **Gemini 3.8 Live** (voice) | Real-time bidirectional voice tutoring with 13 function-calling tools, VAD, Puck voice | 🟢 Deep |
| **Gemini 3.8 Flash** (strong) | PDF ingestion, lesson generation, profiler, parent reports, critic reviews, visual generation | 🟢 Deep |
| **Gemini 3.6 Flash** (fast) | Real-time diagnostic assessment within 6.5s budget during live voice | 🟢 Deep |
| **Gemini 3.1 Flash Lite** (fallback) | Fallback model for lesson generation and diagnosis | 🟢 Redundancy |
| **Gemini Vision** | Photo review — critic inspects generated images for pedagogical accuracy | 🟢 Novel |
| **Gemini Image Gen** | Real-world photo generation for visual analogies | 🟡 Limited by free-tier quota |
| **Google Files API** | PDF textbook upload (60-page chunks, 40MB limit) | 🟢 Deep |
| **Structured Outputs** | JSON schema enforcement across ALL AI calls | 🟢 Deep |
| **Thinking Budget** | Dynamic reasoning budget with auto-retry fallback | 🟢 Novel |
| **Function Calling** | 13 Live tools for real-time board control | 🟢 Deep |

**Score Estimate: 35-38/40** — This is exceptional. You use more Gemini features more deeply than most entries will.

### 2. Problem Alignment & Impact (25% weight)

| Dimension | Assessment |
|---|---|
| **Problem clarity** | ✅ 1-on-1 personalized tutoring is unaffordable for most families |
| **Real-world relevance** | ✅ Education is explicitly named in the track definition |
| **Measurable impact** | ✅ BKT mastery scores, evidence trails, parent reports |
| **Scale potential** | ✅ Any curriculum, any subject, any language |
| **Social impact** | ✅ Democratizes high-quality tutoring (SDG 4) |

**Score Estimate: 20-23/25** — Strong. The pitch deck needs to quantify the impact clearly.

### 3. Innovation & Creativity (25% weight)

| Innovation | Why It's Novel |
|---|---|
| **Bayesian Knowledge Tracing in a voice tutor** | No other hackathon entry will have this |
| **Deterministic plan compiler** (no GenAI for planning) | Reproducible, auditable, explainable |
| **Evidence-centered mastery gates** | Bare MCQ answers capped at "recognised" level |
| **Anti-hallucination claim validator** | Profiler claims must pass deterministic validation |
| **Two-click evidence replay** | Parents see exact questions, answers, and diagnostic reasoning |
| **Tutor never gives up** | `PARK_AND_ESCALATE` removed; always pivots to worked examples |
| **Growth-mindset language enforcement** | Never uses deficit labels or fixed-trait descriptions |
| **Quality-gated content pipeline** | Critic review + quarantine for failing content |
| **PDF → structured curriculum** | End-to-end textbook ingestion with prerequisite graphs |

**Score Estimate: 22-25/25** — This is genuinely innovative, not a wrapper.

### 4. User Experience & Solution Design (10% weight)

| UX Element | Status |
|---|---|
| **Voice interaction** | ✅ Natural conversation with Puck voice |
| **Visual blackboard** | ✅ 2D diagrams, 3D Three.js, photos, chalkboard, explorer, quiz |
| **Onboarding** | ✅ 6-tap setup with interests, accessibility, language |
| **Parent portal** | ✅ Evidence replay, misconception ledger, AI insights |
| **Admin library** | ✅ Curriculum management |
| **Responsive design** | ⚠️ Not verified for mobile |
| **Loading states** | ⚠️ Need to verify smooth transitions |
| **Error handling** | ✅ Graceful fallbacks throughout |

**Score Estimate: 7-9/10** — Good, but polish matters for judges' first impression.

---

## 🔴 CRITICAL: Must-Do Before Submission (Oct 18)

### Priority 1: Create the 3-Minute Demo Video
**Impact: MANDATORY — no video = invalid submission**

The video must show:
1. **Hook (0:00-0:20):** Problem statement — "1 billion students can't afford a tutor"
2. **Live Demo (0:20-2:00):** 
   - Student logs in → selects subject → starts voice lesson
   - Show Dr. Marcus (Ananta) teaching with real-time board updates
   - Show the student asking a question and getting an adaptive response
   - Show a quiz being posed and the evidence ladder advancing
3. **Parent Portal (2:00-2:30):** 
   - Show evidence replay — parent sees exact questions/answers
   - Show misconception tracking
4. **Architecture Flash (2:30-2:50):**
   - Show the system architecture diagram
   - Mention: 5 Gemini model tiers, BKT, deterministic planning, quality gates
5. **Closing (2:50-3:00):** Scale potential, social impact

### Priority 2: Create Solution Deck (PDF, 8-12 slides)
**Impact: MANDATORY — required deliverable**

Suggested structure:
1. Cover slide with project name "Ananta"
2. Problem: 1-on-1 tutoring gap
3. Solution overview: AI tutor with real pedagogical science
4. Live demo screenshots (annotated)
5. Architecture diagram (Gemini Live → Flash → BKT → Plan → Board)
6. Innovation highlights (BKT, evidence gates, deterministic planning)
7. Parent accountability portal
8. Content pipeline (PDF → curriculum → visuals → voice)
9. Technical depth (5 Gemini models, 13 tools, quality gates)
10. Impact & scale potential
11. Team background
12. Live URL + GitHub link

### Priority 3: Verify Deployment is Live
**Impact: MANDATORY — working URL required**

```bash
# Test the deployment
curl https://ananta-<hash>-as.a.run.app/api/health
```

Confirm:
- [ ] Cloud Run service `ananta` is running
- [ ] WebSocket `/ws/live` works through Cloud Run (3600s timeout set)
- [ ] Firebase config points to correct project
- [ ] `GEMINI_API_KEY` is set via Secret Manager
- [ ] Firestore indexes are deployed

---

## 🟡 HIGH-IMPACT Improvements (If Time Permits)

### 1. README.md Polish for Judges
Your README is 92 lines — adequate but not judge-optimized. Add:
- **Hero banner** with project logo/screenshot
- **"Why Ananta is Different"** section listing innovations
- **Architecture diagram** (Mermaid or image)
- **Setup instructions** that actually work in 3 commands
- **Links** to live URL, demo video, pitch deck

### 2. System Architecture Diagram
Create a clean visual showing:
```
PDF Textbook → pdfIngest (Gemini 3.8 Flash) → curricula.json
                                                    ↓
Student Voice → Gemini 3.8 Live ←→ 13 Tools → Board Updates
                    ↓                              ↓
            assessChildReasoning          reveal_part / set_figure
                    ↓
            Gemini 3.6 Flash (6.5s budget)
                    ↓
            BKT Update → Plan Delta → Next Teaching Move
                    ↓
            Session End → Profiler (Gemini 3.8 Flash)
                    ↓
            Parent Report (deterministic + AI narrative)
```

### 3. Landing Page / First Impression
When a judge opens the URL, they should immediately see:
- Clear branding ("Ananta — Adaptive AI Tutor")
- Quick-start path (no confusion about what to click)
- A "Demo Mode" that works without creating an account

### 4. Firestore Composite Indexes
The `firestore.indexes.json` has no composite indexes defined, but event queries need them. Deploy indexes or queries will fail in production.

### 5. Clean Up Repository
Before making GitHub public:
- [ ] Remove `ananta-update-*.zip` files (4 zip files in root)
- [ ] Remove `Claude outputs/` folder
- [ ] Remove `manifest-before.txt`
- [ ] Ensure `.env` is in `.gitignore` (contains real API key)
- [ ] Remove `backups/` folder or move to `.gitignore`
- [ ] Verify no secrets in committed files

### 6. Mobile Responsiveness
Judges may open on a phone. Quick check:
- Does the login screen work on mobile?
- Does the voice lesson layout adapt?

---

## 🟢 Nice-to-Have (Only if Everything Else is Done)

| Improvement | Why | Effort |
|---|---|---|
| **Add Google Analytics / Firebase Analytics** | Shows you think about metrics | 30 min |
| **Add a "Watch Demo" button** on the login page linking to the video | Judges who don't want to set up audio can still see it | 15 min |
| **Add error boundary UI** | Graceful crash recovery instead of white screen | 1 hour |
| **Rate limiting display** | Show "API quota reached" gracefully | 30 min |

---

## Category Awards to Target

Beyond the main prize, you're eligible for these **\$2,000 category awards**:

| Award | Your Chance | Why |
|---|:---:|---|
| **Best Use of Google Cloud AI Tools** | 🟢 HIGH | 5 Gemini model tiers, Live voice, Files API, Vision, Structured Outputs, Function Calling |
| **Most Impactful Solution** | 🟢 HIGH | Education equity, SDG 4, parent accountability |
| **Best UI/UX** | 🟡 MEDIUM | Good but may not beat purpose-built design projects |
| **Social Choice Award** | 🟡 MEDIUM | Depends on public voting mechanism |

---

## Known Technical Risks

| Risk | Severity | Mitigation |
|---|:---:|---|
| **Free-tier API quota exhaustion** during judge demo | 🔴 HIGH | Pre-generate all demo content; use `DEMO_MODE` fallback |
| **WebSocket disconnection** on Cloud Run | 🟡 MEDIUM | Session affinity enabled; 3600s timeout set |
| **Firestore missing indexes** in production | 🟡 MEDIUM | Deploy indexes before submission |
| **Dev auth bypass** leaking to production | 🟡 MEDIUM | Set `ALLOW_DEV_AUTH_BYPASS=false` in Cloud Run |
| **Firebase config with hardcoded keys** in repo | 🟡 MEDIUM | Firebase web API keys are designed to be public; security rules protect data |

---

## Final Verdict

**Your technical implementation is in the top tier.** The codebase demonstrates genuine mastery of Gemini's capabilities — not surface-level integration but deep architectural decisions (BKT, deterministic planning, fail-closed quality gates, evidence-centered design).

**The gap is presentation, not engineering.** You need:
1. ✅ A compelling 3-minute video that shows the "wow" moments
2. ✅ A polished slide deck that explains the depth without overwhelming
3. ✅ A live URL that works when a judge clicks it
4. ✅ A clean GitHub repo with a judge-optimized README

**If you nail the presentation, this project competes for the Grand Winner (\$10,000).**
