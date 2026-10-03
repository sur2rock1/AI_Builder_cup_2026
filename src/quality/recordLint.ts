// Lint a whole pregen record (lesson text + every picture) with the same gates the
// generators use. Used by scripts/upgrade-pregen.ts, scripts/review-pregen.ts and
// tests, so "what the generator accepts" and "what the review flags" cannot drift.
import type { VisualConceptContext } from '../visual/prompt';
import type { PregenRecord } from '../curriculum/pregenStore';
import { lintLesson, LessonDraft } from './lessonLint';
import { lintVisual } from './visualLint';
import { lintApplyPicture, lintPictureVsQuiz } from './leakLint';
import { isQuizShape, QuizLike } from './quizTools';
import { QualityIssue, QUALITY_VERSION, RecordQuality, errorsOf, warningsOf } from './types';

export interface RecordIssue extends QualityIssue { artifact: string }

export function lintRecord(record: PregenRecord, ctx: VisualConceptContext): RecordIssue[] {
  const out: RecordIssue[] = [];
  const tag = (artifact: string, issues: QualityIssue[]) => issues.forEach((i) => out.push({ ...i, artifact }));
  const applyItem = ctx.ladderItems.find((l) => l.level === 3) || ctx.ladderItems.find((l) => l.level === 4) || null;
  const lesson = record.lessonData as LessonDraft | null;
  if (lesson) tag('lesson', lintLesson(lesson, { keyFacts: ctx.keyFacts, workedExamples: ctx.workedExamples, applyItem }));
  const quiz: QuizLike | null = lesson?.quiz && isQuizShape(lesson.quiz) ? lesson.quiz : null;
  for (const [key, v] of Object.entries(record.visuals || {})) {
    if (!v || !Array.isArray(v.elements)) continue;
    const issues = [...lintVisual(v, { key })];
    if (key === 'apply' && applyItem) issues.push(...lintApplyPicture(v, applyItem, key));
    else if (quiz) issues.push(...lintPictureVsQuiz(v, quiz, key));
    tag(key, issues);
  }
  return out;
}

export function summarizeRecord(
  issues: QualityIssue[],
  extra: { criticRan: boolean; coverageGaps: number[]; untaughtLadderItems?: RecordQuality['untaughtLadderItems']; withheld: string[]; notes?: string[] },
): RecordQuality {
  return {
    version: QUALITY_VERSION, checkedAt: new Date().toISOString(),
    errors: errorsOf(issues).length, warnings: warningsOf(issues).length,
    criticRan: extra.criticRan, coverageGaps: extra.coverageGaps,
    untaughtLadderItems: extra.untaughtLadderItems ?? [], withheld: extra.withheld, notes: extra.notes,
  };
}
