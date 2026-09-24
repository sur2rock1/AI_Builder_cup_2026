// docs/TUTOR_PERSONA.md §12.1 — surface parameters per age band.
// The numeric values themselves live in config.ts; this module derives
// an AgeBand from a grade string (for the many learners who don't set
// one explicitly during onboarding).
import { AgeBand } from '../adaptive/learnerModel';
import { AGE_BAND_CONFIG } from './config';

export { AGE_BAND_CONFIG };

export function ageBandFromGrade(grade: string | undefined): AgeBand {
  const g = (grade || '').toLowerCase();
  if (/(kindergarten|grade\s*[1-2]\b|elementary \(grade 3-5\)|grade\s*[3-4]\b)/.test(g)) return '5-7';
  if (/(grade\s*[5-8]\b|middle school|secondary [1-2])/.test(g)) return '8-12';
  if (/(grade\s*(9|1[0-2])\b|high school|secondary [3-5]|junior college)/.test(g)) return '13-17';
  if (/(college|undergraduate|adult|self-learner)/.test(g)) return 'adult';
  return '8-12'; // reasonable default for the demo curriculum (Secondary 2)
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
