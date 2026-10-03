// Every string of a board picture a learner can read, with a locator.
import type { AnyBoardVisual } from '../visual/types';

export interface PictureText { where: string; text: string; kind: 'title' | 'caption' | 'label' | 'text' | 'box' | 'table' | 'check' }

export function pictureTexts(v: AnyBoardVisual): PictureText[] {
  const out: PictureText[] = [];
  const push = (where: string, text: string | undefined, kind: PictureText['kind']) => { if (text && text.trim()) out.push({ where, text, kind }); };
  push('title', v.title, 'title');
  push('checkQuestion', v.checkQuestion, 'check');
  v.steps.forEach((s) => { push(`step ${s.id} caption`, s.caption, 'caption'); });
  for (const e of v.elements as any[]) {
    push(`element ${e.id} label`, e.label, 'label');
    if (e.kind === 'text') push(`element ${e.id}`, e.text, 'text');
    if (e.kind === 'label') push(`element ${e.id}`, e.text, 'text');
    if (e.kind === 'box') { push(`element ${e.id}`, e.text, 'box'); push(`element ${e.id} sub`, e.sub, 'box'); }
    if (e.kind === 'table') (e.rows as string[][]).forEach((r, i) => r.forEach((c, j) => push(`element ${e.id} cell[${i}][${j}]`, c, 'table')));
  }
  return out;
}
