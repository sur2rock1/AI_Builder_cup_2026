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

/** Ladder level names per mode (docs/TUTOR_PERSONA.md §5 and §12.2). Used by
 * curriculum ingestion to author ladder items in the same terms the tutor uses. */
export const LADDER_LEVEL_NAMES: Record<SubjectMode, [string, string, string, string]> = {
  well_structured: ['Recall / recognise', 'Explain why in own words', 'Apply to a similar unseen problem (near)', 'Transfer to a new context or representation (far)'],
  interpretive: ['Identify a claim', 'Explain a position', 'Build an argument with evidence', 'Apply it to a new source'],
  skill: ['Recognise', 'Produce with support', 'Produce unaided', 'Use in context'],
};

/** Best-effort classifier from a curriculum subject label — refine per-subject as more are added.
 * Word-boundary matches (fixed 2026-09-26): the old substring test sent
 * "Earth Science" to interpretive because it contains "art". */
export function subjectModeForSubject(subjectId: string, subjectLabel?: string): SubjectMode {
  const s = `${subjectId} ${subjectLabel || ''}`.toLowerCase().replace(/[^a-z]+/g, ' ');
  if (/\b(essay|history|literature|ethics|design|art|arts|social studies|civics|philosophy)\b/.test(s)) return 'interpretive';
  if (/\b(language|languages|spelling|vocabulary|music|french|spanish|german|hindi|mandarin|chinese|malay|tamil)\b/.test(s)) return 'skill';
  return 'well_structured';
}

/** Mode for a curriculum: the mode assigned at ingest when present, else the label heuristic. */
export function subjectModeForCurriculum(c: { id: string; label?: string; subjectMode?: string } | null | undefined): SubjectMode {
  if (c?.subjectMode === 'well_structured' || c?.subjectMode === 'interpretive' || c?.subjectMode === 'skill') return c.subjectMode;
  return subjectModeForSubject(c?.id || '', c?.label);
}

export function renderSubjectModeSurface(mode: SubjectMode): string {
  const spec = SUBJECT_MODE_SPEC[mode];
  return `SUBJECT MODE: ${spec.label}\n  "Correct" means: ${spec.correctnessMeans}\n  ${spec.ladderNote}`;
}
