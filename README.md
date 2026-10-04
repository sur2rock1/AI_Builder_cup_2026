<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e4c5c0b9-f2e3-4bc2-9d82-d7b1e2c73301

# Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Loading content (curriculum library)

Learners pick their **board + grade** at signup and see every subject loaded for it. Content is
added by the admin only — full design in [docs/CURRICULUM.md](docs/CURRICULUM.md):

1. (Optional locally, required when deployed) set `ADMIN_TOKEN` in `.env`.
2. `npm run dev`, then on the login screen click **Content library (admin)**.
3. Pick board, grade and subject, add the textbook PDF(s) and, if you have it, the official
   syllabus PDF, and choose **Chapters to load** (default 3 — only those chapters are read and
   pre-generated, to save Gemini usage; tick "All chapters" for the whole book, or re-upload later
   with a higher number to add more). Gemini reads, structures and **reviews** the content (re-works worked examples,
   checks facts, writes ladder items) and publishes it automatically; the review report is shown.
4. `npm run seed:demo -- --reset` recreates the three simulated demo learners on that course
   (`--list` shows courses, `--course <id>` picks one).

Tests for this: `npm run test:curriculum`.

## Lesson material and board pictures

Lessons, board pictures and real-world photos are pre-generated once per concept and cached
(never re-billed). Board pictures are composed by Gemini from a small drawing vocabulary and built
step by step the way the tutor teaches — full design in [docs/BOARD_VISUALS.md](docs/BOARD_VISUALS.md).

| Command | What it does |
|---|---|
| `npm run pregen` | Generate everything missing (lesson text, board pictures, photo) for loaded concepts |
| `npm run pregen:first` | Same, first concept only — a cheap test |
| `npm run pregen -- --visuals-only` | Only add board pictures to concepts that already have a lesson (no text or photo calls). Add `--force` to redraw existing pictures |
| `npm run preview:visuals -- --concept <id>` | Write `logs/visual-preview-<id>.html` showing every picture and step for that concept — review before a demo |
| `npm run preview:visuals -- --samples` | The same preview for the built-in reference pictures (no API key needed) |
| `npm run test:visuals` | Vocabulary, fact-checker, phrase matching, storage and render tests (no network) |

### Quality gates and the Chapter 1 runbook

Everything a model generates for a learner is linted and independently reviewed before it is served,
and withheld (never replaced by a generic fallback) if it fails — see
[docs/CH1_FIX_PLAN.md](docs/CH1_FIX_PLAN.md).

| Command | What it does |
|---|---|
| `npm run backfill:design` | Once per already-ingested curriculum: one call per course adds L3 hints and the photo/3D decision (`-- --dry-run` first). Needs `GEMINI_API_KEY` |
| `npm run spec:ch1` | Prints the content spec (no calls): what will be generated per concept and why |
| `npm run pregen:ch1:plan` | **Run this first.** Prints exactly which calls Chapter 1 needs (nothing is called): about 10 text calls (lesson, ≈8 boards incl. the alternative board, 1 review) + 1 image + 1 vision check only where the concept's photo decision says yes |
| `npm run pregen:ch1` | Regenerate Chapter 1, single-shot: each artefact generated once, one review per concept, no retries (needs `GEMINI_API_KEY`). Resumes past finished concepts; hard-capped at 120 text calls / 15 images; prints call totals. `-- --repair 1` opts into one paid repair round |
| `npm run pregen:ch1:redo` | Same without resume (keeps the stored artefact when the new one is withheld) |
| `npm run review:pregen` | Scorecard over stored records (no model calls; exit 1 on served errors). `-- --details --write` for the full report |
| `npm run upgrade:pregen` | Deterministic in-place upgrade of stored records (writes a backup first) |
| `npm run test:quality` / `test:gates` / `verify` | Gate tests / + picture and ingest tests / + tsc and scorecard |

## Production (Cloud Run + Firebase)

Ananta runs on one Google Cloud project: **Cloud Run** hosts the Node server (REST API + the Gemini Live voice
WebSocket proxy), **Firebase Hosting** serves the static UI and forwards `/api/**` to Cloud Run, and
**Firestore** + **Cloud Storage** hold curricula, lessons, photos and learner data. The voice WebSocket connects
straight to Cloud Run (Hosting rewrites have a 60-second request limit).

Full from-scratch setup, data migration and verification: [docs/ANANTA_MIGRATION_PLAN.md](docs/ANANTA_MIGRATION_PLAN.md).

```bash
export PROJECT_ID=<your-project-id> BUCKET=<your-storage-bucket>
npm run deploy:live          # Cloud Run, then the web build (with the Cloud Run URL baked in), then Hosting
npm run migrate:cloud -- --dry-run && npm run verify:migration   # local data/ -> Firestore + Storage
```

Local voice still works with `PORT=3001 npm run dev`.
