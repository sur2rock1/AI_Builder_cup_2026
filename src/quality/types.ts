// ─────────────────────────────────────────────────────────────────
// Quality layer — shared types (docs/BOARD_VISUALS.md §Quality gates,
// docs/CURRICULUM.md §Pregen contract).
//
// Everything a child can see (lesson text, chalk notes, quiz, suggested
// questions, board pictures, photos) passes two gates before it ships:
//   1. deterministic lints  (src/quality/*Lint.ts, language.ts, leakLint.ts)
//   2. an independent critic model call  (src/quality/critic.ts)
// An `error` that survives repair withholds the artefact (fail closed).
// This module is isomorphic: no Node or DOM imports.
// ─────────────────────────────────────────────────────────────────

export type QualitySeverity = 'error' | 'warn';

export interface QualityIssue {
  /** Stable machine code, e.g. "leak.apply-answer", "persona.banned-word". */
  code: string;
  severity: QualitySeverity;
  /** Where: "quiz", "chalk.bullet[2]", "step s3", "element hline"… */
  where: string;
  message: string;
}

export const qerr = (code: string, where: string, message: string): QualityIssue => ({ code, severity: 'error', where, message });
export const qwarn = (code: string, where: string, message: string): QualityIssue => ({ code, severity: 'warn', where, message });

export const errorsOf = (issues: QualityIssue[]) => issues.filter((i) => i.severity === 'error');
export const warningsOf = (issues: QualityIssue[]) => issues.filter((i) => i.severity === 'warn');

/** One line per issue, for repair prompts and logs. */
export function describeIssues(issues: QualityIssue[]): string {
  return issues.map((i) => `  - [${i.severity}] ${i.where}: ${i.message}`).join('\n');
}

/** What a stored record carries about its own checks. Bumped when the gates change. */
export const QUALITY_VERSION = 'quality-v1';

export interface RecordQuality {
  version: string;
  checkedAt: string;
  /** Deterministic lint findings left on the shipped artefacts (errors are 0 for anything served). */
  errors: number;
  warnings: number;
  /** Did the independent critic run for this record? False when generated offline / without a key. */
  criticRan: boolean;
  /** Key facts (1-based) that no shipped teaching picture covers. */
  coverageGaps: number[];
  /** Ladder items that assess something no key fact or picture teaches (never silently invented — D9). */
  untaughtLadderItems: Array<{ level: number; prompt: string }>;
  /** Artefacts withheld because an error survived repair. */
  withheld: string[];
  notes?: string[];
}
