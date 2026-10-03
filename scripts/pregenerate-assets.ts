/**
 * Pre-generation script for curriculum topic assets.
 *
 * Usage:
 *   npm run pregen:ch1          → Chapter 1 of every loaded course, --force (the review's regeneration run)
 *   npm run pregen:first        → generates assets for the first topic only (test)
 *   npm run pregen              → generates assets for ALL curriculum topics
 *   npx tsx scripts/pregenerate-assets.ts --curricula-file <path>
 *                               → only the course(s) in that JSON snapshot. This is
 *                                 how the ingest pipeline calls it after publishing
 *                                 (src/curriculum/pdfIngest.ts), so it works when
 *                                 Firestore — not data/curricula.json — is the store.
 *
 *   npm run pregen -- --skip-photo
 *                               → everything except the photo (cheap iteration on text + pictures)
 *
 *   npm run pregen -- --visuals-only
 *                               → only (re)draw the BOARD PICTURES for concepts that already
 *                                 have a lesson. Cheap: no lesson text, no photo. Existing
 *                                 pictures are kept unless --force is also given. This is how
 *                                 lessons generated before board pictures are upgraded.
 *
 *   npm run pregen -- --concept <id-or-slug>
 *                               → scope to ONE concept, matched against its curriculum concept
 *                                 id or its derived slug (exact match first, then substring —
 *                                 so a short unique fragment like "cell-division-by-mitosis"
 *                                 works without typing the full id). --first-only picks
 *                                 "whatever concept sorts first across every loaded course",
 *                                 which is rarely the concept you actually mean when you have
 *                                 more than one course loaded — --concept is exact.
 *                                 Combine with --visuals-only and/or --force as usual.
 *
 * Every artefact goes through the quality gates (docs/BOARD_VISUALS.md §Quality gates): deterministic
 * lints + an independent critic + a repair loop. An error that survives repair WITHHOLDS the artefact
 * (quarantined in the record, never served). Run `npm run review:pregen` afterwards for the scorecard.
 *
 * What it generates per concept:
 *   - Lesson text (lessonData) — tagline, overview, chalk notes, a quiz that is a PARALLEL problem to the
 *     application picture (form B), child-voice suggested questions, tutor-only diagnostics
 *   - Coverage check — ladder items no key fact teaches are REPORTED, never invented
 *
 *   - Board pictures (docs/BOARD_VISUALS.md) — composed by the model from a small drawing
 *     vocabulary and fact-checked before saving:
 *       main            the teaching picture the tutor builds step by step
 *       contrast:<id>   one per known misconception (the tutor's contrast case)
 *       apply           the application item's situation — never its answer
 *       3d              only if the model judges depth genuinely helps this idea
 *   - A lesson-specific photo, verified by a vision review and labelled AI-generated; none if unverified
 *     (no stock-photo fallback)
 *
 * Output: the pregen store (Firestore + Storage, or data/pregenerated/{conceptId}.json
 * locally) — keyed by curriculum concept id (two courses can share a concept label, e.g.
 * "Photosynthesis" in Grade 7 and Grade 9, so the label is not a safe key). server.ts
 * loadPregen() looks up by concept id first, then by topic slug for ad-hoc topics.
 *
 * Cache contract: a record is never regenerated (never re-billed) unless --force is given;
 * --visuals-only adds missing pictures to an existing record without touching the rest.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initFirebaseAdmin } from '../src/firebase/admin';
import { getPregenAsync, savePregenAsync, PregenRecord } from '../src/curriculum/pregenStore';
import { conceptContext } from '../src/visual/prompt';
import { generateLessonVisuals, LessonVisualsReport } from '../src/visual/generate';
import { buildConceptSpec } from '../src/curriculum/contentSpec';
import { specToJobs } from '../src/visual/specJobs';
import { gatewayModel } from '../src/quality/model';
import { reviewConceptOnce, ConceptReview } from '../src/quality/review';
import { applyConceptReview } from '../src/curriculum/reviewApply';
import { gatewayStats, setCallBudget, assertCallBudget, CallBudgetExceeded } from '../src/ai/gateway';
import { generateLessonText } from '../src/curriculum/lessonGen';
import { generateVerifiedPhoto, geminiImageGenerator } from '../src/curriculum/photoGen';
import { lintRecord, summarizeRecord } from '../src/quality/recordLint';

dotenv.config({ path: '.env' });

// This runs as a spawned child process (src/curriculum/pdfIngest.ts triggerPregenerationBackground()),
// not inside server.ts, so it needs its own Firebase Admin init — otherwise pregenStore falls back to the
// local data/pregenerated/ file even in production (the "regenerate on every cold start" problem).
initFirebaseAdmin();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const DATA_DIR   = path.join(ROOT, 'data');
const PREGEN_DIR = path.join(DATA_DIR, 'pregenerated');
const CURRICULA  = path.join(DATA_DIR, 'curricula.json');

const argVal = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null; };
const FIRST_ONLY = process.argv.includes('--first-only');
const CURRICULA_SOURCE = argVal('--curricula-file') ? path.resolve(argVal('--curricula-file')!) : CURRICULA;
const CONCEPT_FILTER = argVal('--concept');
const CHAPTER_FILTER = argVal('--chapter');
const FORCE      = process.argv.includes('--force');
const VISUALS_ONLY = process.argv.includes('--visuals-only');
const SKIP_PHOTO = process.argv.includes('--skip-photo');
// --resume: with --force, a concept that a previous run already finished through the quality gates
// (quality.criticRan) is left alone, so an interrupted or repeated run does not pay for it again.
const RESUME = process.argv.includes('--resume');
const MAX_CALLS = Number(argVal('--max-calls') || 0);   // 0 = no cap; counts text/critic calls, not images
const CONCURRENCY = Math.max(1, Number(argVal('--concurrency') || 3));  // pictures of one concept are independent
const MAX_IMAGES = Number(argVal('--max-images') || 0);
// Single-shot by default (decision D-2026-09-30-6): each artefact is generated ONCE from a complete contract,
// checked by free deterministic lints, and the whole concept gets ONE independent review. --repair N allows N
// paid repair rounds per artefact (default 0); --no-review skips the review call.
const REPAIR = Math.max(0, Number(argVal('--repair') || 0));
const NO_REVIEW = process.argv.includes('--no-review');
const DRY_RUN = process.argv.includes('--dry-run');   // print the exact paid calls per concept and stop — spends nothing
let imageCalls = 0;

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function logVisualReport(report: LessonVisualsReport[]) {
  for (const r of report) {
    const what = r.skipped ? `skipped — ${r.skipped}`
      : r.withheld ? `WITHHELD after ${r.attempts} call(s) — ${(r.quality || []).filter((q) => q.severity === 'error').map((q) => q.message).join('; ').slice(0, 200)}`
        : r.ok ? `ok (${r.attempts} call${r.attempts === 1 ? '' : 's'}${r.fixes ? `, ${r.fixes} auto-fix${r.fixes === 1 ? '' : 'es'}` : ''})` : `FAILED — ${r.error}`;
    console.log(`    ${r.ok ? '🖼' : '⚠'}  ${r.key}: ${what}`);
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error('❌  GEMINI_API_KEY not set — cannot pre-generate assets.'); process.exit(1); }
  if (!fs.existsSync(CURRICULA_SOURCE)) { console.error(`❌  Curriculum file not found: ${CURRICULA_SOURCE}`); process.exit(1); }
  fs.mkdirSync(PREGEN_DIR, { recursive: true });

  const raw = JSON.parse(fs.readFileSync(CURRICULA_SOURCE, 'utf8'));
  const curricula: any[] = Array.isArray(raw) ? raw : Object.values(raw);
  const model = gatewayModel(apiKey, 2, 120_000);
  const rawImageGen = geminiImageGenerator(apiKey);
  const imageGen: typeof rawImageGen = async (p: string) => {
    if (MAX_IMAGES && imageCalls >= MAX_IMAGES) throw new Error(`image budget of ${MAX_IMAGES} reached`);
    imageCalls++;
    return rawImageGen(p);
  };
  if (MAX_CALLS) setCallBudget(MAX_CALLS);

  const allConcepts: Array<{ concept: any; course: any; grade: string }> = [];
  for (const curr of curricula) {
    const sorted = [...(curr.concepts || [])].sort((a, b) => (a.typicalTeachingOrder ?? 99) - (b.typicalTeachingOrder ?? 99));
    for (const concept of sorted) allConcepts.push({ concept, course: curr, grade: curr.grade || 'Grade 8' });
  }
  let targets = FIRST_ONLY ? allConcepts.slice(0, 1) : allConcepts;
  if (CHAPTER_FILTER) targets = targets.filter((t) => new RegExp(CHAPTER_FILTER, 'i').test(String(t.concept.chapter || '')));
  const mode = VISUALS_ONLY ? 'board pictures only' : `lessons, board pictures${SKIP_PHOTO ? '' : ' and photos'}`;
  console.log(`\n🎓 Pre-generating ${mode} for ${targets.length} topic(s)${FORCE ? ' — FORCE: existing items are regenerated' : ''}...\n`);
  const tally = { done: 0, skipped: 0, failed: 0, withheld: 0 };
  const dry = { text: 0, images: 0, concepts: 0 };

  for (const { concept, course, grade } of targets) {
    const topic  = concept.label as string;
    const slug   = /^[a-z0-9-]+$/.test(String(concept.id || '')) ? String(concept.id) : slugify(topic);
    if (CONCEPT_FILTER && !(slug === CONCEPT_FILTER || String(concept.id) === CONCEPT_FILTER || slug.includes(CONCEPT_FILTER))) continue;
    try { assertCallBudget(); } catch { console.error('  ■ call budget reached — stopping the run (saved concepts are kept; rerun with --resume)'); break; }
    const existing = await getPregenAsync([slug]);
    const ctx = conceptContext(concept, course, grade);
    const visualOpts = { model, transientRetries: 2, pauseMs: 1_500, timeoutMs: 120_000 };

    // ── Board pictures only: upgrade an existing lesson in place ─────────────
    if (VISUALS_ONLY) {
      if (!existing) { console.log(`⏭  "${topic}" has no lesson yet — run without --visuals-only to generate everything.`); tally.skipped++; continue; }
      console.log(`\n🖼  Board pictures: "${topic}"`);
      try {
        const out = await generateLessonVisuals(ctx, {
          ...visualOpts, quiz: existing.lessonData?.quiz,
          existing: FORCE ? undefined : existing.visuals, declined: FORCE ? undefined : existing.visualsDeclined,
        });
        logVisualReport(out.report);
        if (!out.report.some((r) => r.attempts > 0)) { console.log('    (nothing new to draw)'); tally.skipped++; continue; }
        const record: PregenRecord = { ...existing, visuals: out.visuals, visualsDeclined: out.declined, visualsQuarantine: out.quarantine };
        record.quality = summarizeRecord(lintRecord(record, ctx), {
          criticRan: out.criticRan, coverageGaps: out.coverageGaps, untaughtLadderItems: existing.quality?.untaughtLadderItems,
          withheld: Object.keys(out.quarantine),
        });
        await savePregenAsync(slug, record);
        tally.done++; tally.withheld += Object.keys(out.quarantine).length;
      } catch (e: any) {
      console.error(`  ❌ Failed: ${e.message}`); tally.failed++;
      if (e instanceof CallBudgetExceeded) { console.error('  ■ call budget reached — stopping the run (already-saved concepts are kept; rerun with --resume)'); break; }
    }
      continue;
    }

    if (!FORCE && existing?.lessonData) {
      const hint = existing.visuals?.main ? '' : ' — it has no board pictures yet: npm run pregen -- --visuals-only';
      console.log(`⏭  Skipping "${topic}" — already pre-generated (use --force to regenerate)${hint}`);
      tally.skipped++;
      continue;
    }

    if (FORCE && RESUME && existing?.quality?.criticRan && !existing.quality.withheld?.includes('lesson')) {
      console.log(`⏭  Resuming past "${topic}" — already generated through the quality gates (${existing.quality.errors} error(s); rerun it alone with --concept ${slug} without --resume)`);
      tally.skipped++;
      continue;
    }
    if (DRY_RUN) {
      const spec = buildConceptSpec(concept, course, grade);
      const jobs = specToJobs(spec, ctx);
      const text = (1 + REPAIR) + jobs.length * (1 + REPAIR) + (NO_REVIEW ? 0 : 1);
      const images = SKIP_PHOTO || !spec.photo.yes ? 0 : 1;
      dry.text += text; dry.images += images; dry.concepts++;
      console.log(`• ${topic}\n    lesson ×1, pictures ×${jobs.length} [${jobs.map((j) => j.key).join(', ')}], review ×${NO_REVIEW ? 0 : 1}; photo: ${spec.photo.yes ? 'yes' : 'no'} (${images} image + ${images} vision check)  → ${text} text calls + ${images} image + ${images} vision (worst case with --repair ${REPAIR})`);
      continue;
    }
    console.log(`\n📚 Topic: "${topic}" (${grade})`);
    const startMs = Date.now();
    const statsBefore = gatewayStats(); const imagesBefore = imageCalls;
    try {
      // 1. Lesson text: draft → lint → independent critic → repair
      console.log('  Writing lesson text...');
      const lesson = await generateLessonText(ctx, { model, prerequisiteDetails: concept.prerequisiteDetails, seed: slug, transientRetries: 4, maxAttempts: 1 + REPAIR, critic: false });
      if (lesson.withheld) tally.withheld++;

      // 2. Board pictures (fact-checked; the quiz is passed so no picture states its answer)
      console.log('  Drawing board pictures...');
      const vis = await generateLessonVisuals(ctx, { ...visualOpts, maxAttempts: 1 + REPAIR, critic: false, jobs: specToJobs(buildConceptSpec(concept, course, grade), ctx), concurrency: CONCURRENCY, quiz: lesson.lesson?.quiz ?? lesson.quarantined?.quiz });
      logVisualReport(vis.report);
      tally.withheld += Object.keys(vis.quarantine).length;

      // 3. ONE independent review of the whole concept (quiz solved blind, notes, every picture, ladder coverage).
      //    Findings withhold artefacts; nothing is regenerated on them.
      let review: ConceptReview = { ran: false, quiz: [], lesson: [], pictures: {}, untaught: [] };
      if (!NO_REVIEW) {
        console.log('  Reviewing the concept (one call)...');
        review = await reviewConceptOnce(model, ctx, lesson.lesson, vis.visuals);
        if (!review.ran) console.log(`  ⚠ review did not run (${review.error}) — the concept is recorded as NOT independently reviewed`);
      }
      const applied = applyConceptReview(lesson.lesson, vis.visuals, review);
      if (applied.dropped.length || Object.keys(applied.quarantine).length || applied.lessonQuarantine) {
        console.log(`  ⚠ review withheld: ${[...applied.dropped, ...Object.keys(applied.quarantine), ...(applied.lessonQuarantine ? ['quiz'] : [])].join(', ')}`);
      }
      const cov = { ran: review.ran, untaught: review.untaught };
      if (cov.untaught.length) console.log(`  ⚠ ${cov.untaught.length} ladder item(s) test something the key facts never teach — see quality.untaughtLadderItems`);

      // 4. Photo: lesson-specific, vision-verified, or none
      let photoUrl: string | null = null;
      let photoMeta: PregenRecord['photoMeta'];
      if (!SKIP_PHOTO && buildConceptSpec(concept, course, grade).photo.yes) {
        console.log('  Generating a lesson-specific photo...');
        const ph = await generateVerifiedPhoto(ctx, { model, imageGen, maxAttempts: 1, deterministicPlan: true });
        photoUrl = ph.photoUrl;
        photoMeta = ph.meta ?? undefined;
        console.log(ph.photoUrl ? `  ✓ photo verified: "${ph.meta?.caption}"` : `  ⚠ no photo shipped (${ph.error || 'unverified'}) — the tab stays hidden`);
      } else if (SKIP_PHOTO && existing?.photoUrl && existing.photoMeta?.verified) { photoUrl = existing.photoUrl; photoMeta = existing.photoMeta; }
      // (spec says no photo → none is carried over: the stored record must match the plan)

      // Never make a record worse: if the new attempt was withheld but the stored one has that artefact, keep the stored one.
      let lessonData = applied.lesson ?? null;
      const kept: string[] = [];
      if (!lessonData && existing?.lessonData) { lessonData = existing.lessonData; kept.push('lesson'); }
      const visuals = { ...applied.visuals };
      const quarantine = { ...vis.quarantine, ...applied.quarantine };
      for (const k of Object.keys(quarantine)) {
        if (!visuals[k] && existing?.visuals?.[k]) { visuals[k] = existing.visuals[k]; delete quarantine[k]; kept.push(k); }
      }
      if (!photoUrl && (SKIP_PHOTO || buildConceptSpec(concept, course, grade).photo.yes) && existing?.photoUrl && existing.photoMeta?.verified) { photoUrl = existing.photoUrl; photoMeta = existing.photoMeta; kept.push('photo'); }
      if (kept.length) console.log(`  ↩ kept the previously stored ${kept.join(', ')} (the new attempt was withheld)`);

      const record: PregenRecord = {
        topic, grade, conceptId: concept.id, slug, generatedAt: new Date().toISOString(),
        lessonData,
        ...(lesson.withheld && lesson.quarantined && !kept.includes('lesson') ? { lessonQuarantine: { lesson: lesson.quarantined, issues: lesson.quality } } : applied.lessonQuarantine ? { lessonQuarantine: applied.lessonQuarantine } : {}),
        visuals, visualsDeclined: vis.declined, visualsQuarantine: quarantine,
        photoUrl, photoMeta,
      };
      record.quality = summarizeRecord(lintRecord(record, ctx), {
        criticRan: review.ran,
        coverageGaps: vis.coverageGaps,
        untaughtLadderItems: cov.untaught.map((u) => ({ level: u.level, prompt: u.prompt })),
        withheld: [...(lesson.withheld && !kept.includes('lesson') ? ['lesson'] : []), ...Object.keys(quarantine)],
        notes: [
          ...(cov.ran ? [] : ['ladder coverage review did not run']),
          ...applied.openLessonErrors.map((e) => `review: ${e.where}: ${e.message.slice(0, 120)}`),
          ...cov.untaught.map((u) => `L${u.level} "${u.prompt.slice(0, 60)}" needs: ${u.missing}`),
        ],
      });
      await savePregenAsync(slug, record);
      console.log(`  ${lesson.withheld ? '⚠' : '✅'} Saved "${slug}" (${((Date.now() - startMs) / 1000).toFixed(1)}s) — ${record.quality.errors} error(s), ${record.quality.warnings} warning(s), withheld: ${record.quality.withheld.join(', ') || 'none'}\n`);
      const st = gatewayStats();
      console.log(`  💸 this concept: ${st.calls - statsBefore.calls} text/critic calls (${st.failed - statsBefore.failed} failed), ${imageCalls - imagesBefore} image call(s) — run total ${st.calls} calls, ${imageCalls} images`);
      tally.done++;
    } catch (e: any) { console.error(`  ❌ Failed: ${e.message}`); tally.failed++; }
  }

  if (DRY_RUN) { console.log(`\nDRY RUN — nothing was called. ${dry.concepts} concept(s): at most ${dry.text} text calls + ${dry.images} image + ${dry.images} vision checks. Compare with the 303 calls the first run spent on 7 concepts.`); return; }
  { const st = gatewayStats(); console.log(`\n💸 Run total: ${st.calls} text/critic calls (${st.failed} failed, ${st.fallback} on a fallback model), ${imageCalls} image calls, ${(st.ms / 60000).toFixed(1)} model-minutes\n   by call: ${Object.entries(st.byCall).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join('  ')}`); }
  console.log(`\n✨ Pre-generation complete — ${tally.done} generated, ${tally.skipped} skipped, ${tally.failed} failed, ${tally.withheld} artefact(s) withheld by the quality gates.`);
  if (tally.done) console.log('   Scorecard: npm run review:pregen     Pictures: npm run preview:visuals -- --concept <conceptId>');
}

main().catch(e => { console.error(e); process.exit(1); });
