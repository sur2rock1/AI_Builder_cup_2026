// ─────────────────────────────────────────────────────────────────
// Deterministic upgrade of a record generated BEFORE the quality gates existed.
//
// It never invents or rewrites content and never claims quality it has not
// checked. It only (a) removes what the persona / review rules forbid outright
// and (b) fails closed on what the lints reject:
//   • legacy fields (scene3d / photoVisual / diagram / diagrams) are dropped (D7)
//   • the quiz is put in seeded order (the key was in slot A) and its option order marked
//   • a quiz with lint ERRORS is quarantined, not served (duplicate options, verdict words, …)
//   • suggested questions that carry a tutor label ("Misconception Probe: …") are MOVED to
//     tutor-only `diagnostics`; the rest stay
//   • pictures with lint ERRORS are moved to `visualsQuarantine` (never served)
//   • the photo is marked unverified (it was never looked at) — the server will not serve it
// Everything else that still has errors is left as-is and reported in `quality`; the record
// then needs `npm run pregen:ch1` (a real regeneration) to reach the standard.
// ─────────────────────────────────────────────────────────────────
import type { VisualConceptContext } from '../visual/prompt';
import type { PregenRecord } from '../curriculum/pregenStore';
import { lintVisual } from './visualLint';
import { lintApplyPicture, lintPictureVsQuiz } from './leakLint';
import { lintQuiz, shuffleQuiz, isQuizShape } from './quizTools';
import { hasLabelPrefix } from './language';
import { QualityIssue, errorsOf } from './types';
import { lintRecord, summarizeRecord } from './recordLint';

export interface UpgradeReport {
  slug: string;
  droppedLegacy: string[];
  quizShuffled: boolean;
  quizQuarantined: boolean;
  movedToDiagnostics: number;
  picturesQuarantined: string[];
  photoMarkedUnverified: boolean;
  remainingErrors: number;
  remainingWarnings: number;
}

const stripLabel = (q: string) => q.replace(/^\s*[A-Za-z][A-Za-z '\-]{2,40}:\s*/, '').trim();

export function upgradeRecord(record: PregenRecord, ctx: VisualConceptContext): { record: PregenRecord; report: UpgradeReport } {
  const out: PregenRecord = JSON.parse(JSON.stringify(record));
  const report: UpgradeReport = {
    slug: record.slug, droppedLegacy: [], quizShuffled: false, quizQuarantined: false, movedToDiagnostics: 0,
    picturesQuarantined: [], photoMarkedUnverified: false, remainingErrors: 0, remainingWarnings: 0,
  };

  // lesson text ───────────────────────────────────────────
  const lesson: any = out.lessonData;
  if (lesson) {
    for (const f of ['scene3d', 'photoVisual', 'diagram']) if (f in lesson) { delete lesson[f]; report.droppedLegacy.push(f); }
    if (out.diagrams) { delete out.diagrams; report.droppedLegacy.push('diagrams'); }

    if (lesson.quiz && isQuizShape(lesson.quiz)) {
      const shuffled = shuffleQuiz(lesson.quiz, `${record.slug}|${record.topic}`);
      report.quizShuffled = shuffled !== lesson.quiz;
      lesson.quiz = shuffled;
      const errs = errorsOf(lintQuiz(lesson.quiz));
      if (errs.length) {
        out.lessonQuarantine = { lesson: { quiz: lesson.quiz }, issues: errs };
        delete lesson.quiz;
        report.quizQuarantined = true;
      }
    } else if (lesson.quiz) {
      out.lessonQuarantine = { lesson: { quiz: lesson.quiz }, issues: [{ code: 'quiz.shape', severity: 'error', where: 'quiz', message: 'unusable quiz shape' }] };
      delete lesson.quiz; report.quizQuarantined = true;
    }

    const keep: string[] = [];
    const diags: any[] = Array.isArray(lesson.diagnostics) ? lesson.diagnostics : [];
    for (const q of Array.isArray(lesson.suggestedQuestions) ? lesson.suggestedQuestions : []) {
      if (typeof q === 'string' && hasLabelPrefix(q)) {
        diags.push({ purpose: /prereq/i.test(q) ? 'prerequisite' : 'misconception', question: stripLabel(q) });
        report.movedToDiagnostics++;
      } else keep.push(q);
    }
    lesson.suggestedQuestions = keep;
    if (diags.length) lesson.diagnostics = diags;
  }

  // pictures ──────────────────────────────────────────────
  const applyItem = ctx.ladderItems.find((l) => l.level === 3) || ctx.ladderItems.find((l) => l.level === 4) || null;
  const quiz = lesson?.quiz && isQuizShape(lesson.quiz) ? lesson.quiz : null;
  const quarantine = { ...(out.visualsQuarantine || {}) };
  for (const [key, v] of Object.entries(out.visuals || {})) {
    if (!v || !Array.isArray((v as any).elements)) { delete out.visuals![key]; continue; }
    const issues: QualityIssue[] = [...lintVisual(v, { key })];
    if (key === 'apply' && applyItem) issues.push(...lintApplyPicture(v, applyItem, key));
    else if (quiz) issues.push(...lintPictureVsQuiz(v, quiz, key));
    const errs = errorsOf(issues);
    if (errs.length) { quarantine[key] = { visual: v, issues: errs }; delete out.visuals![key]; report.picturesQuarantined.push(key); }
  }
  if (Object.keys(quarantine).length) out.visualsQuarantine = quarantine;

  // photo ─────────────────────────────────────────────────
  if (out.photoUrl && !out.photoMeta) {
    out.photoMeta = { verified: false, caption: '', intent: '', source: 'ai-generated', reviewedAt: new Date().toISOString(), issues: [{ code: 'photo.legacy', severity: 'warn', where: 'photo', message: 'generated before photo review existed — never looked at; not served' }] };
    report.photoMarkedUnverified = true;
  }

  // quality ───────────────────────────────────────────────
  const issues = lintRecord(out, ctx);
  out.quality = summarizeRecord(issues, {
    criticRan: false, coverageGaps: [], withheld: [...report.picturesQuarantined, ...(report.quizQuarantined ? ['quiz'] : [])],
    notes: ['deterministic upgrade only — no critic review; regenerate with `npm run pregen:ch1` to reach the full standard'],
  });
  report.remainingErrors = out.quality.errors; report.remainingWarnings = out.quality.warnings;
  return { record: out, report };
}
