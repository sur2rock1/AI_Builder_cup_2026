// Applies ONE concept review to a freshly generated concept — without asking the model again.
//   • a quiz the reviewer could not confirm  → quarantined (never served)
//   • a picture with an error finding        → quarantined
//   • a chalk bullet/takeaway with an error  → that line is dropped
//   • any other lesson error                 → recorded as an open error on the record (visible in review:pregen), text kept
//   • warnings                               → recorded only
import type { AnyBoardVisual } from '../visual/types';
import type { QualityIssue } from '../quality/types';
import type { ConceptReview } from '../quality/review';

export interface ReviewApplied {
  lesson: any | null;
  visuals: Record<string, AnyBoardVisual>;
  quarantine: Record<string, { visual: AnyBoardVisual; issues: QualityIssue[] }>;
  lessonQuarantine?: { lesson: unknown; issues: QualityIssue[] };
  /** Lesson-level errors that could not be repaired by dropping a line — surfaced, not hidden. */
  openLessonErrors: QualityIssue[];
  dropped: string[];
  warnings: QualityIssue[];
}

const isErr = (i: QualityIssue) => i.severity === 'error';

export function applyConceptReview(
  lessonIn: any | null,
  visualsIn: Record<string, AnyBoardVisual>,
  review: ConceptReview,
): ReviewApplied {
  const res: ReviewApplied = { lesson: lessonIn ? JSON.parse(JSON.stringify(lessonIn)) : null, visuals: { ...visualsIn }, quarantine: {}, openLessonErrors: [], dropped: [], warnings: [] };
  if (!review.ran) return res;               // not reviewed: nothing changes, the caller records criticRan=false

  for (const [key, issues] of Object.entries(review.pictures)) {
    const errs = issues.filter(isErr);
    res.warnings.push(...issues.filter((i) => !isErr(i)));
    if (errs.length && res.visuals[key]) {
      res.quarantine[key] = { visual: res.visuals[key], issues: errs };
      delete res.visuals[key];
    }
  }

  if (res.lesson) {
    const qErrs = review.quiz.filter(isErr);
    if (qErrs.length && res.lesson.quiz) {
      res.lessonQuarantine = { lesson: { quiz: res.lesson.quiz }, issues: qErrs };
      delete res.lesson.quiz;
    }
    const chalk = res.lesson.chalkNotes || {};
    const dropB = new Set<number>(), dropT = new Set<number>();
    for (const i of review.lesson) {
      if (!isErr(i)) { res.warnings.push(i); continue; }
      const b = /chalk\.bullet\[(\d+)\]/.exec(i.where), t = /chalk\.takeaway\[(\d+)\]/.exec(i.where);
      if (b) dropB.add(Number(b[1])); else if (t) dropT.add(Number(t[1])); else res.openLessonErrors.push(i);
    }
    if (dropB.size && Array.isArray(chalk.bulletPoints)) { res.dropped.push(...[...dropB].map((n) => `chalk.bullet[${n}]`)); chalk.bulletPoints = chalk.bulletPoints.filter((_: unknown, n: number) => !dropB.has(n)); }
    if (dropT.size && Array.isArray(chalk.keyTakeaways)) { res.dropped.push(...[...dropT].map((n) => `chalk.takeaway[${n}]`)); chalk.keyTakeaways = chalk.keyTakeaways.filter((_: unknown, n: number) => !dropT.has(n)); }
  }
  return res;
}
