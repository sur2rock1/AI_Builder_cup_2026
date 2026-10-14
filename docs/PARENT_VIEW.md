# Parent View — Specification

_Status: v1.0 · 2026-10-14 · Implements: FR-23 (parent portal replay), J4 · Code home: `src/parent/`_

## 1. Why

The original Parent Portal (`src/components/ParentPortal.tsx`, now "Under the hood") showed mastery %, ladder levels,
move ids and strategy ids. A parent cannot read that, and it cannot be explained in a 3-minute demo. The Parent View
answers two questions in plain language:

1. **How is Ananta understanding my child?** (what it noticed, how it checked, what it concluded)
2. **How is Ananta using that to teach my child better?** (what it changed, what it will do next lesson)

## 2. What a parent sees (top to bottom)

| # | Section | Source | AI-written? |
|---|---|---|---|
| 1 | "In a few sentences" letter, each sentence with **See why** (opens the child's real answer) | `narrative.letter` | Yes (Gemini), validated; offline template otherwise |
| 2 | Lessons · minutes · answers checked · mix-ups fixed (+ "I don't get it" count) | learner profile + evidence log | No |
| 3 | Understanding, topic by topic: 5-step journey in words, mix-up chip | `ladder.highestLevel` → `plainLanguage.STAGE_LABELS` | No |
| 4 | **How Ananta figured the child out**: noticed → seen again → changed how it teaches → fixed (or "keeping an eye on it") | misconception ledger + evidence events | No (deterministic; quotes the child's own words) |
| 5 | What seems to help the child | validated profiler claims (`strategy`) + the "changed" step of a fixed story | Reuses existing validated AI output |
| 6 | Ananta's plan for the next lesson | `compileTeachingPlan()` — the same function the live tutor uses | No |
| 7 | Try this at home (3–8 min) | Gemini, validated; template fallback | Yes |

No mastery percentage, ladder level, BKT value, move id or strategy id is ever shown (see §5). "Under the hood" (toggle)
is the unchanged engineering portal for judges/teachers.

## 3. Architecture

```
GET  /api/learners/:id/parent-report            instant: facts + cached-or-template narrative (no model call)
POST /api/learners/:id/parent-report/generate   Gemini writes narrative → validated → cached on profile.parentNarratives
        │
        ▼
src/parent/report.ts      service: load → buildBaseReport → aiNarrative | templateNarrative → cache
src/parent/facts.ts       deterministic: stats, journey, StoryThread steps, evidence cards, next-lesson plan (parent words)
src/parent/plainLanguage.ts   the ONLY place internal terms become parent words; INTERNAL_TERMS / LABEL_PATTERNS
src/parent/types.ts       shared types
src/parent/ParentReport.tsx   UI (light "school report" style; works at 390px)
src/parent/ParentHome.tsx     Parent view ⇄ Under the hood switch (App.tsx renders this instead of ParentPortal)
```

Both routes use `requireAuth` + `requireOwnership` like every other learner route. The cached narrative is stored in
the optional `LearnerProfile.parentNarratives[subjectId]`; it is stale (and regenerated) when the number of recorded
answers changes. Only validated AI narratives are cached; after a failed attempt the model is not retried for 2 minutes.

## 4. GenAI role (GenAI necessity test)

- **Without GenAI:** a translated dashboard that reads the same for every child.
- **With GenAI:** Gemini (`strong` role via `src/ai/gateway.ts`, 25 s deadline) turns one child's verified evidence into a
  short letter, a "what helps" line and a home activity, in language specific to that child's answers and interests.
- **Input:** first name, interests, mix-up stories, last 4 lesson notes, the active strategy claims, the last 60 answers
  with short ids (E1…, C1…). **Output:** JSON `{letter[], worksFor[], homeTip}` with `evidence` ids per sentence.
- **Error handling (all deterministic, outside the model):** a sentence is dropped unless it cites ≥1 real evidence id,
  is 20–260 chars, has no internal term, no label about the child (visual learner, smart, slow, struggling, genius,
  natural…), no percentage/score, no gendered pronoun. Fewer than 2 surviving sentences, a model error or a timeout →
  the offline template is used. The UI states which one is showing and how many sentences were removed.
- **Evaluation:** `npm run test:parent` (25 offline assertions: gate behaviour incl. each rejection reason, fake-model
  paths, jargon-leak check over every parent-visible string, story ordering, disputed mix-ups hidden).

## 5. Rules enforced

1. Evidence, not labels: every AI sentence is traceable to the child's actual answer; "See why" shows it.
2. Strategies, not types of person: "what seems to help" describes what worked on specific topics.
3. A mix-up is "confirmed" only after two independent observations; "fixed" only after a sound answer to a question
   not seen before (existing ledger rules, shown honestly: "Seen once so far" is displayed as such).
4. Disputed mix-ups (learner pressed "That's not right") are never shown.
5. No number a parent could misread: the raw mastery % is deliberately **not** shown (see Known limitations).

## 6. Demo learner — "Maya (Simulated)"

`npm run seed:story` (`scripts/seed-story-learner.ts`) creates `demo_maya`: 5 lessons over 12 days, 13 answers, IGCSE G8
Maths. The child's answers are **scripted** (clearly labelled: name suffix, `demo_` id, "Simulated learner" badge);
everything derived from them is produced by the real code (BKT, ladder, ledger, plan compiler, claim validator). With a
Gemini key, lesson summaries/claims come from the real Profiler and the letter from the real report generator; `--no-ai`
runs fully offline. Story: flat line named "x = c" (noticed, lesson 1) → seen again (lesson 2, confirmed; "I don't get
it") → Ananta switches from explaining to showing points on the line (lesson 3) → fixed on a rectangle question never
seen (lesson 4) → next topic, one sign slip, "keeping an eye on it" (lesson 5). Next-lesson plan then targets that topic.

## 7. Known limitations (logged, not hidden)

- Maya's answers are simulated; the pipeline is real. State this in the video. Real-lesson learner (Student-1) shows the
  same view with messier data: its live lessons record a single teaching style, so no "changed approach" step appears.
- BKT mastery drops sharply when a mix-up is confirmed and recovers slowly (a topic can read ~30% after being fixed);
  that is why the Parent View shows ladder steps in words and not mastery %. Fixing the mastery model is out of scope.
- **Fixed 2026-10-14 (found in review of the live page):** Biology showed a Maths letter. Cause: `LearnerRepository.listEvents({subjectId})` is declared but NOT implemented by either the file or the Firestore repository, so every subject received all of the child's answers. The report now filters strictly in `eventsForSubject()` (regression test in `tests/parent`); a subject with no lessons shows "No lessons in <subject> yet" and never calls Gemini. The repositories still ignore `subjectId` (not changed: a Firestore `where` would need a new composite index) — any other caller relying on it gets all subjects' events.
- `DEMO_MODE` lists all learners to any caller (existing); per-family sign-in is the next step.
- First load after new lessons shows the template letter for a few seconds while Gemini writes the real one.
