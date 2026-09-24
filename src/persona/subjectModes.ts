// docs/TUTOR_PERSONA.md §12.2 — subject modes and how "correct" is judged.
export type SubjectMode = 'well_structured' | 'interpretive' | 'skill';

export interface SubjectModeSpec {
  label: string;
  correctnessMeans: string;
  ladderNote: string;
}

export const SUBJECT_MODE_SPEC: Record<SubjectMode, SubjectModeSpec> = {
  well_structured: {
    label: 'Well-structured (maths, physics, chemistry, programming, grammar)',
    correctnessMeans: 'A verifiable answer plus a sound method.',
    ladderNote: 'The standard evidence ladder (recall -> explain -> apply -> transfer -> teach-back) applies directly.',
  },
  interpretive: {
    label: 'Interpretive (essays, history, literature, ethics, design)',
    correctnessMeans: 'The quality of a claim -> evidence -> reasoning chain, judged against a rubric, not a single right answer.',
    ladderNote: 'L1 identify a claim -> L2 explain a position -> L3 build an argument -> L4 apply it to a new source -> L5 critique their own work. Use CONTRAST_CASE as "what would someone who disagrees say?"',
  },
  skill: {
    label: 'Skill / language (foreign languages, spelling, music theory)',
    correctnessMeans: 'Accurate production, not just recognition.',
    ladderNote: 'L1 recognise -> L2 produce with support -> L3 produce unaided -> L4 use in context. Review is spaced-recall-heavy.',
  },
};

/** Best-effort classifier from a curriculum subject label — refine per-subject as more are added. */
export function subjectModeForSubject(subjectId: string, subjectLabel?: string): SubjectMode {
  const s = `${subjectId} ${subjectLabel || ''}`.toLowerCase();
  if (/(essay|history|literature|ethics|design|art|social studies)/.test(s)) return 'interpretive';
  if (/(language|spelling|vocabulary|music)/.test(s)) return 'skill';
  return 'well_structured';
}

export function renderSubjectModeSurface(mode: SubjectMode): string {
  const spec = SUBJECT_MODE_SPEC[mode];
  return `SUBJECT MODE: ${spec.label}\n  "Correct" means: ${spec.correctnessMeans}\n  ${spec.ladderNote}`;
}
