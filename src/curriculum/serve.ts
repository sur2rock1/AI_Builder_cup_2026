// What the server lets a browser see of a stored record — pure functions, tested offline
// (tests/smoke/serve.mjs), so the fail-closed rules cannot silently regress inside a route handler.
import type { PregenRecord } from './pregenStore';
import type { QuizReasoning } from '../adaptive/assessmentEngine';

/** No tutor-only probes / quiz notes, and none of the legacy generated fields (decision D7). */
export function publicLesson(lessonData: any): any {
  const { diagnostics: _tutorOnly, scene3d: _s, photoVisual: _p, diagram: _d, ...rest } = lessonData || {};
  if (rest.quiz) { const { optionNotes: _n, lookFor: _l, ...quiz } = rest.quiz; rest.quiz = quiz; }
  return rest;
}

/** A stored photo is served only when a vision review verified it (decision D6). */
export function verifiedPhoto(record: PregenRecord | null | undefined): { photoUrl: string | null; photoCaption: string | null } {
  return record?.photoUrl && record.photoMeta?.verified
    ? { photoUrl: record.photoUrl, photoCaption: record.photoMeta.caption || null }
    : { photoUrl: null, photoCaption: null };
}

const REASON_HOW = new Set(['worked_out', 'remembered', 'guessed', 'unsure']);
export function cleanReasoning(raw: any): QuizReasoning | null {
  if (!raw || typeof raw !== 'object') return null;
  const how = REASON_HOW.has(raw.how) ? raw.how : undefined;
  const text = typeof raw.text === 'string' ? raw.text.replace(/\s+/g, ' ').trim().slice(0, 500) : undefined;
  return how || text ? { how, text: text || undefined } : null;
}
