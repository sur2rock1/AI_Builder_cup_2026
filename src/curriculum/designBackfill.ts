// Backfill of the ingest "design" fields (L3 hints, presentation) for curricula ingested before they existed.
// Pure functions: the prompt, and the merge that never overwrites anything already decided.
import type { CurriculumSubject, CurriculumConcept } from '../adaptive/learnerModel';
import { hintsOf, presentationOf } from './structure';
import { HINT_RULE, PRESENTATION_RULE, leaksAnswer } from './designRules';
export { leaksAnswer };

/** Legacy ladder items may carry no id; the ingest convention is L3-A then L3-B, by order. */
export const l3Id = (l: { id?: string }, index: number): string => (l.id && String(l.id).trim()) || (index === 0 ? 'L3-A' : 'L3-B');

export const needsDesign = (c: CurriculumConcept): boolean =>
  !c.presentation || (c.ladderItems || []).some((l) => l.level === 3 && !(l.hints || []).length);

export function backfillPrompt(course: CurriculumSubject, concepts: CurriculumConcept[]): string {
  const brief = concepts.map((c) => ({
    conceptId: c.id, label: c.label, conceptType: c.conceptType, keyFacts: c.keyFacts,
    l3Items: (c.ladderItems || []).filter((l) => l.level === 3).map((l, i) => ({ l, i })).filter(({ l }) => !(l.hints || []).length).map(({ l, i }) => ({ id: l3Id(l, i), prompt: l.prompt, lookFor: l.lookFor })),
    hasPresentation: !!c.presentation,
  }));
  return `You are completing teaching-design decisions for existing concepts of "${course.subject}" (${course.board}, Grade ${course.gradeLevel ?? ''}). Do not change facts.
For EACH concept below return:
1. "hints" per L3 item: ${HINT_RULE}
2. Only where "hasPresentation" is false: ${PRESENTATION_RULE}
CONCEPTS:
${JSON.stringify(brief, null, 1)}

Return ONLY JSON: {"concepts": [{"conceptId": "...", "ladderHints": {"L3-A": ["nudge","bigger hint","one worked step of a parallel problem"], "L3-B": ["...","...","..."]}, "presentation": {"photo": {"useful","scene","why"}, "spatial3d": {"useful","why"}}}]}`;
}

export interface BackfillResponse {
  concepts?: Array<{ conceptId: string; ladderHints?: unknown; hints?: unknown; presentation?: unknown }>;
}

export interface BackfillReport { hints: number; presentation: number; hintCandidates: number; notThree: number; leaked: number; unmatchedIds: string[] }

/** The model may key hints by item id (object), list them as [{id, hints}], or give a bare array for a single item. Accept all; never guess between items. */
function hintsById(raw: unknown, l3: Array<{ id?: string }>): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const key = (id: unknown) => String(id ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (Array.isArray(raw)) {
    if (raw.length && raw.every((x) => x && typeof x === 'object' && !Array.isArray(x))) for (const r of raw as any[]) out.set(key(r.id ?? r.itemId), r.hints ?? r.ladder);
    else if (l3.length === 1) out.set(key(l3[0].id), raw);
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out.set(key(k), v);
  }
  return out;
}

/** Adds hints/presentation where missing. Hints that are not exactly three, or that repeat the answer key, are dropped and counted. */
export function applyBackfill(course: CurriculumSubject, res: BackfillResponse): BackfillReport {
  const out: BackfillReport = { hints: 0, presentation: 0, hintCandidates: 0, notThree: 0, leaked: 0, unmatchedIds: [] };
  const by = new Map((res?.concepts || []).map((r) => [r.conceptId, r]));
  for (const c of course.concepts) {
    const r = by.get(c.id);
    if (!r) continue;
    if (!c.presentation) { const p = presentationOf(r.presentation); if (p) { c.presentation = p; out.presentation++; } }
    const l3 = (c.ladderItems || []).filter((l) => l.level === 3);
    l3.forEach((l, i) => { if (!l.id) l.id = l3Id(l, i) as any; });
    const found = hintsById(r.ladderHints ?? r.hints, l3);
    const used = new Set<string>();
    for (const l of l3) {
      if ((l.hints || []).length) continue;
      const k = String(l.id ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!found.has(k)) continue;
      used.add(k); out.hintCandidates++;
      const h = hintsOf(found.get(k));
      if (!h || h.length !== 3) { out.notThree++; continue; }
      if (h.some((x) => leaksAnswer(x, l.lookFor))) { out.leaked++; continue; }
      l.hints = h; out.hints++;
    }
    for (const k of found.keys()) if (!used.has(k) && !l3.some((l) => String(l.id ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') === k)) out.unmatchedIds.push(`${c.id}:${k}`);
  }
  return out;
}
