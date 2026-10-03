// docs/TUTOR_PERSONA.md §12.1 — surface parameters per age band.
// The numeric values themselves live in config.ts; this module derives
// an AgeBand from a grade string (for the many learners who don't set
// one explicitly during onboarding).
import { AgeBand } from '../adaptive/learnerModel';
import { AGE_BAND_CONFIG } from './config';
import { gradeLevelFromLabel } from '../curriculum/catalog';

export { AGE_BAND_CONFIG };

/** Age band for a numeric grade. A learner in Grade N is typically N+5 at the
 * start of the year: Grades 1–2 → 5–7, Grades 3–7 → 8–12, Grades 8–12 → 13–17. */
export function ageBandFromGradeLevel(level: number): AgeBand {
  if (level <= 2) return '5-7';
  if (level <= 7) return '8-12';
  return '13-17';
}

// Fixed 2026-09-26 (D-2026-09-26-7): the previous regex table mapped
// "Grade 8" / "Secondary 2" to the 8–12 register and "Grade 3–4" to 5–7, so a
// 13–14-year-old was spoken to like a primary pupil. The grade is now parsed to
// a number once (src/curriculum/catalog.ts, which understands Grade/Class/Year/
// Secondary/Primary/MYP/JC labels) and mapped by ageBandFromGradeLevel().
export function ageBandFromGrade(grade: string | number | undefined): AgeBand {
  const level = gradeLevelFromLabel(grade as any);
  if (level !== undefined) return ageBandFromGradeLevel(level);
  const g = String(grade || '').toLowerCase();
  if (/(kindergarten|elementary)/.test(g)) return '5-7';
  if (/middle school/.test(g)) return '8-12';
  if (/(high school|junior college)/.test(g)) return '13-17';
  if (/(college|undergraduate|adult|self-learner)/.test(g)) return 'adult';
  return '13-17'; // unknown grade: default to the secondary register the product targets
}

export function renderAgeBandSurface(band: AgeBand): string {
  const c = AGE_BAND_CONFIG[band];
  return [
    `AGE BAND: ${c.label}`,
    `  Register: ${c.register}. Sentences under ~${c.sentenceMaxWords} words.`,
    `  Teach in chunks of ${c.chunkSentences[0]}-${c.chunkSentences[1]} sentences; check every ${c.checkEvery} chunk(s).`,
    `  Praise style: ${c.praiseStyle}. Humour: ${c.humour}.`,
    `  Target session length: ~${c.sessionMinutes} minutes.`,
  ].join('\n');
}
