// Turns a ConceptSpec into the exact list of picture jobs — the generator executes the spec and nothing else.
import type { ConceptSpec } from '../curriculum/contentSpec';
import type { VisualConceptContext } from './prompt';
import type { VisualJob } from './generate';
import { misconceptionKey } from '../curriculum/catalog';

export function specToJobs(spec: ConceptSpec, ctx: VisualConceptContext): VisualJob[] {
  const jobs: VisualJob[] = [];
  let mainDone = false;
  for (const b of spec.boards) {
    if (b.role === 'teach' || b.role === 'alternative') {
      const focus = b.role === 'teach' ? (b.key === 'main' ? ctx.topic : focusOf(ctx, b.keyFacts)) : `${ctx.topic} — a different way to see it`;
      jobs.push({ key: b.key, label: b.role === 'alternative' ? 'alt' : mainDone ? 'focus' : 'main',
        req: { purpose: 'teach', focus, keyFacts: b.keyFacts, form: b.form,
        // the curriculum's idea is written for the concept's first picture; later chunks keep the STYLE only, so they teach their own key facts
        representation: b.role === 'teach' && mainDone && b.representation ? { strategy: b.representation.strategy, idea: '' } : b.representation } });
      if (b.role === 'teach') mainDone = true;
    } else if (b.role === 'contrast') {
      const m = ctx.misconceptions.find((x) => (x.id || misconceptionKey(x.belief)) === b.misconceptionId || `contrast:${x.id || misconceptionKey(x.belief)}` === b.key);
      if (m) jobs.push({ key: b.key, label: 'contrast', req: { purpose: 'contrast', misconception: { ...m, id: m.id || misconceptionKey(m.belief) }, form: b.form } });
    } else if (b.role === 'apply') {
      const item = ctx.ladderItems.find((l) => l.level === 3);
      if (item) jobs.push({ key: b.key, label: 'apply', req: { purpose: 'apply', item, form: b.form } });
    } else if (b.role === 'space') {
      jobs.push({ key: b.key, label: '3d', req: { purpose: 'space' } });
    }
  }
  return jobs;
}

function focusOf(ctx: VisualConceptContext, facts?: number[]): string {
  const f = ctx.keyFacts[(facts?.[0] || 1) - 1] || ctx.topic;
  return f.replace(/[^A-Za-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 5).join(' ');
}
