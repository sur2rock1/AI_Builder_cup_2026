# Ask the Expert Session — Gap Analysis for Ananta

> **Session Date:** Oct 15, 2026 | **Speaker:** Abrami Sukumaran (Staff Developer Advocate, Google Cloud)
> **Analysis Date:** Oct 15, 2026 (3 days to deadline)

---

## 🔴 CRITICAL FINDINGS — Action Required

### 1. TEAM FORMATION CLOSES OCTOBER 16 (TOMORROW)

**What she said:** "Team formation is open till 16th of October... once the team formation will be closed then you will not be able to access the submission section if you have not formed your team."

**Your status:** ⚠️ **UNVERIFIED** — We haven't confirmed whether your team is formed on the Hack2skill dashboard.

**Action:** Log into the Hack2skill dashboard **RIGHT NOW** and confirm your team is formed. Without this, you literally cannot submit. Nothing else matters if this isn't done.

---

### 2. VIDEO IS 3-4 MINUTES (Not Just 3)

**What she said:** "You have to build a video of at least 3 to four minutes demonstrating your solution."

**Your status:** ❌ Current script targets 3:00. You have **an extra minute** — this is a gift.

**Action:** Expand the video script to ~3:30-3:45. Use the extra time for:
- A **live product opening** (she personally recommends opening with the live product running, not slides)
- More breathing room on the voice tutoring demo
- Briefly mention technical solutions (6.5s reasoning budget, latency management)

---

### 3. SUBMISSION MUST EXPLICITLY DESCRIBE HOW YOU USE: Firebase, Firestore, Cloud Run, AND Gemini

**What she said:** "You have to make sure that you are including how you're leveraging all the Google AI tech that is Firebase, Firestore, Cloud Run and Gemini in your submission."

**Your status:** ⚠️ README mentions these but the **submission description field** (on the portal) hasn't been written yet.

**Action:** Write a dedicated paragraph for the submission description that explicitly names each:
- **Gemini** — 5 model tiers (3.8 Live, 3.8 Flash, 3.6 Flash, 3.1 Flash Lite, Vision/Image Gen), function calling with 13 tools, structured outputs, thinking budget
- **Firebase** — Firebase Auth for user authentication, Firebase Hosting (optional)
- **Firestore** — Learner profiles, evidence events, teaching plans, session data, curricula, pre-generated content
- **Cloud Run** — Full-stack deployment (REST API + WebSocket proxy + SPA), 3600s timeout for voice sessions, session affinity, scale-to-zero

---

### 4. PROTOTYPE MUST REMAIN FUNCTIONAL THROUGHOUT EVALUATION

**What she said:** "The prototype must remain functional throughout the evaluation process because if the application, APIs, integrations or any other deployment related components are unavailable or non-functional during the evaluation round then... your solution gets disqualified."

**AND:** "During the judgment or evaluation period your app can be tested any day. Judges WILL interact with the deployed prototype directly — that's why we ask your deployed link, not just the demo video."

**Your status:** ⚠️ Several risks:
- Cloud Run is set to `--min-instances=0` → cold start on first request (~20-60s)
- Gemini API free-tier quota could be exhausted
- DEMO_MODE=true (auth bypass) — actually this is GOOD, per speaker's advice

**Actions:**
1. Consider setting `--min-instances=1` during evaluation period (Oct 18 → results announcement) to avoid cold starts
2. Monitor API quota usage
3. Add a note about limitations in your submission (see point #8 below)

---

### 5. NO SECRETS IN SUBMISSION — STRICT DISQUALIFICATION

**What she said:** "You'll be disqualified if your secrets are out in any of your submissions. That's a strict code hygiene we want you all to follow. Please do not put your credentials... even accidentally."

**Your status:** ✅ **CLEAN** — Verified:
- `.env` is gitignored
- No `serviceAccount.json` in git history
- No committed `.env` files
- `firebase-config.json` contains only the **web API key** (this is designed to be public — Google's own docs say so)
- `GEMINI_API_KEY` is passed via env vars / Secret Manager in Cloud Run
- `.env.example` has placeholder values only

**One concern:** `firebase-config.json` has the Firebase web API key `AIzaSy...` committed. While Firebase explicitly says web API keys are safe to commit (security rules protect data), a paranoid judge might flag it. **LOW RISK** — no action needed, but mention in submission that Firestore security rules are locked down.

---

### 6. PROVIDE TEST CREDENTIALS / SAMPLE QUESTIONS FOR JUDGES

**What she said:** "If we need to use a specific login for validation those details need to be mentioned... If your video covers sample user data, user questions that we can use as a guideline for us to be able to test, that will also be really helpful."

**AND:** "When you're giving those samples for us to test with make sure you give the ones that you know will deliver the right response."

**Your status:** ❌ No testing guide for judges exists.

**Action:** Add a **"For Judges / Evaluators"** section to README with:
- Direct link to deployed app
- Step-by-step: "Click 'Leo (Simulated)' → Select Mathematics → Start a lesson"
- Sample questions to ask the tutor: "What is the Pythagorean theorem?", "Can two parallel lines intersect?"
- How to access Parent Portal
- Note: No sign-in required (DEMO_MODE enabled)

---

### 7. CONSIDER REDUCING AUTH FRICTION FOR JUDGES

**What she said:** "If it's a demo app, get past all that, keep it open. I would recommend just get rid of the sign in... I would want the guest or the evaluator judge to just get to the crux essence of my application rather than sit through a bunch of gateways."

**BUT also:** "Unless it's mandatory to get some personalization — in one evaluation test how is personalization customization going to work anyway."

**Your status:** ✅ DEMO_MODE=true means no Firebase Auth tokens are required. Judges can just click a profile and go. The login screen is really a "profile picker" — no password needed. This is exactly what the speaker recommends.

**No action needed** — but mention in your submission: "No account required — just pick a student profile and start learning."

---

### 8. DISCLOSE LIMITATIONS

**What she said:** "If there are limitations, say you can't ask more than five questions, mention that. Tell us what is possible, what is allowed and what is not because that helps us understand your application better. It will not work against you."

**Your status:** ❌ No limitations disclosed anywhere.

**Action:** Add to README and/or submission:
- Voice tutoring requires microphone access and a quiet environment
- VAD threshold is 700ms — pause briefly between sentences
- Free-tier Gemini API has rate limits — if you see slow responses, wait a few seconds
- Photo generation may be unavailable if image quota is exhausted (falls back to diagrams)
- Recommended browser: Chrome (latest), Firefox — WebSocket for voice needs modern browser

---

## 🟡 HIGH-IMPACT INSIGHTS — Improvements to Consider

### 9. SPEAKER'S RECOMMENDED VIDEO OPENING: Start with Live Product

**What she said:** "I would like to open with a product, ask a question, and before the response comes out, I'll go back to the technical architecture and walk through the entire journey and then come back and show the response."

**Your current script:** Opens with a text slide / problem statement hook.

**Recommendation:** Consider restructuring:
1. **0:00-0:10** — Open the live app, click Leo, start a voice session, ask a question
2. **0:10-0:30** — While Ananta is "thinking" / teaching, cut to: problem statement + architecture diagram
3. **0:30-2:30** — Return to live demo, show the full teaching loop (voice → board → quiz → BKT update)
4. **2:30-3:10** — Parent portal + evidence replay
5. **3:10-3:40** — Technical depth (5 Gemini models, quality gates, deterministic planning), close with impact

This matches her recommended approach and gives you 3:40 total.

---

### 10. MENTION TECHNICAL ACHIEVEMENTS IN VIDEO/SUBMISSION

**What she said:** "If you manage to solve [latency], talk about it in your submission because it will really elevate your level of technical expertise... The greater detail you add with technical competence in your submission is going to work in your favor."

**Your strengths to mention:**
- 6.5-second reasoning assessment budget with fallback model cascade
- Deterministic plan compilation (zero GenAI for reproducibility)
- Quality-gated content pipeline with independent critic and quarantine
- BKT mastery threshold (pKnown ≥ 0.80 AND ≥ 2 demonstrations)
- Sub-100ms page load (verified: 102ms)

---

### 11. AGENT PLATFORM / ADK IS RECOMMENDED BUT NOT MANDATORY

**What she said:** "I'm hoping you would deploy your agent using the agent runtime or use the memory bank or use something else in agent platform... It doesn't matter where you're calling Gemini from. It matters whether or not you're using the required services."

**AND:** "If you don't use ADK and you choose to use some other framework for building but you still manage to map all the other requirements then you're good to go. There's no favorable solution here."

**Your status:** Ananta uses `@google/genai` SDK directly, not ADK or Agent Platform. This is **explicitly allowed** per her answer.

**Risk:** LOW — she says there's "no favorable solution" between ADK and direct SDK. But using ADK 2.0 would let you "demonstrate a lot more technical competence." 

**Recommendation:** Do NOT rewrite to use ADK with 3 days left. Instead, in your submission, frame your architecture as an **agentic system by design**: 13 function-calling tools, state management via Firestore, multi-model orchestration, reasoning pipeline. The substance is agentic — the SDK choice doesn't change that.

---

### 12. PRESENTATION CLARITY IS CRITICAL

**What she said:** "Even if it is slightly on a lower edge compared to your idea, it will be rated higher only because it has more clarity... If you have greatness built, show that greatness in presentation."

**AND:** "Majority of the ideas had very low volume and videos with less clarity. So we were not able to even understand how certain things worked. That will work against you."

**Actions for video recording:**
- ✅ Record in a quiet room with good microphone
- ✅ Speak clearly, at normal volume — NOT whispering
- ✅ Test audio playback before finalizing
- ✅ Use AI to help polish voiceover script if needed
- ✅ Keep text on screen readable (large font, high contrast)

---

### 13. TOP REASONS STRONG PROTOTYPES LOSE POINTS

**What she said:**
1. **Feasibility** — judges think "this won't work in the real world"
2. **Too basic** — "they could have done more to elevate it"
3. **Clarity** — strength not translated to the judge

**Your mitigation:**
1. ✅ Feasibility is STRONG — real curriculum (IGCSE textbooks), real pedagogical science (BKT), real Gemini integration
2. ✅ Depth is STRONG — 30,000+ lines, 5 model tiers, quality gates, parent portal
3. ⚠️ Clarity is the MAIN RISK — video + deck must convey all this in 3-4 minutes

---

## ✅ THINGS YOU'RE ALREADY DOING RIGHT

| Requirement | Status | Evidence |
|---|---|---|
| Cloud Run deployment | ✅ | `https://ananta-ivczdbgbja-as.a.run.app/` |
| Firebase usage | ✅ | Auth, Firestore, Storage |
| Gemini usage | ✅ | 5 model tiers, Live voice, structured outputs, function calling |
| Public GitHub repo | ✅ | `github.com/sur2rock1/AI_Builder_cup_2026` |
| No secrets in repo | ✅ | Verified — clean git history |
| DEMO_MODE (no auth friction) | ✅ | Judges just click and go |
| Simulated data labeled | ✅ | Demo learners labeled "(Simulated)" |
| Cloud Run scale-to-zero | ✅ | `--min-instances=0` (cost efficient) |
| Can push fixes after deadline | ✅ | Speaker confirmed bug-fix commits are OK |

---

## 📋 PRIORITY ACTION LIST

### 🔴 DO TODAY (Oct 15)
1. **FORM YOUR TEAM** on Hack2skill dashboard (deadline Oct 16)

### 🔴 DO BEFORE SUBMISSION (Oct 18)
2. **Add "For Judges" section to README** — test login path, sample questions, limitations
3. **Expand video script to 3:30-3:45** — use speaker's recommended opening structure
4. **Write submission description** — explicitly name Firebase, Firestore, Cloud Run, Gemini with usage details
5. **Record video** with clear audio, normal volume
6. **Create pitch deck** using official submission template (you have the PPTX)

### 🟡 IF TIME PERMITS
7. Set `--min-instances=1` on Cloud Run during evaluation period
8. Add "How We Solved Latency" callout in deck/video (6.5s budget, model cascade)
9. Pre-warm the app before submission (make a few requests to ensure content is cached)

### ❌ DO NOT DO
- Do NOT rewrite to use ADK/Agent Platform — too risky with 3 days left
- Do NOT add Google Search grounding — your curriculum data is self-contained
- Do NOT change the deployed URL — keep the same endpoint
