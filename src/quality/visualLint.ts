// ─────────────────────────────────────────────────────────────────
// Deterministic lints for board pictures (docs/BOARD_VISUALS.md §Quality gates).
//
// The sanitizer (src/visual/sanitize.ts) proves LABELS are TRUE of the geometry.
// These lints prove the picture TEACHES the way the tutor does:
//   • predict first     — step 1 asks, it does not tell (PREDICT_FIRST, age ≥ 8)
//   • one idea per step — a step adds a few bricks, none are on the board before their step
//   • elicit            — every picture ends by asking the learner something
//   • contrast phases   — teach → clash → rule that works → explain (docs/TUTOR_PERSONA.md §8)
//   • apply             — a situation and a question, nothing else (leakLint.ts covers the answer)
//   • language          — never "wrong", no ❌, no "Mistaken Rule:" (language.ts)
//   • layout            — measured with the renderer's own metrics: no colliding labels,
//                         nothing clipped by the board edge, no connector cutting through a box
//   • form              — a picture, not a slide of text; a 3D model that shows something
// ─────────────────────────────────────────────────────────────────
import type { AnyBoardVisual, BoardVisual, BoardVisual3D, VisualElement2D } from '../visual/types';
import { VISUAL_LIMITS } from '../visual/types';
import { layoutFrame, elementRects, Rect } from '../visual/layout';
import { languageIssues } from './language';
import { pictureTexts } from './visualText';
import { QualityIssue, qerr, qwarn } from './types';

export interface VisualLintOptions {
  /** Storage key, for messages: main · focus:<slug> · contrast:<id> · apply · 3d */
  key: string;
  /** Learner age; PREDICT_FIRST applies from 8. Default 13 (Grade 8). */
  ageYears?: number;
  /** 'worked' boards are step-by-step working made of text/equation bricks, so the text-slide check does not apply. */
  form?: 'drawn' | 'worked';
}

const isQuestion = (s: string | undefined) => !!s && /\?\s*$/.test(s.trim());

export function lintVisual(visual: AnyBoardVisual, opts: VisualLintOptions): QualityIssue[] {
  const out: QualityIssue[] = [];
  const key = opts.key;
  const age = opts.ageYears ?? 13;
  const purpose = visual.purpose;
  const at = (w: string) => `${key}: ${w}`;

  // language ─────────────────────────────────────────────
  for (const t of pictureTexts(visual)) languageIssues(t.text, at(t.where)).forEach((i) => out.push(i));

  // step structure ────────────────────────────────────────
  const steps = visual.steps;
  const first = steps[0];
  if (purpose === 'teach' && age >= 8 && first && !isQuestion(first.caption)) {
    out.push(qerr('predict.no-hook-question', at(`step ${first.id}`), `step 1 tells instead of asks ("${first.caption.slice(0, 60)}") — open with a question the learner can predict or notice`));
  }
  if (purpose !== 'apply' && !isQuestion(visual.checkQuestion)) {
    out.push(qerr('elicit.no-check-question', at('checkQuestion'), 'every teaching picture needs a checkQuestion (a question, ending in "?") pointing at the finished picture'));
  }
  const last = steps[steps.length - 1];
  if (purpose === 'contrast') {
    if (!steps.some((s) => s.phase === 'contrast')) out.push(qerr('contrast.no-clash-step', at('steps'), 'no step with phase "contrast" — apply the learner\'s rule and let it visibly break'));
    if (!((last?.phase === 'check' || last?.phase === 'contrast') && isQuestion(last.caption))) out.push(qerr('contrast.no-check', at('last step'), 'a contrast picture ends on a "check" step whose caption asks the learner to explain the difference'));
    const hasWorking = [...pictureTexts(visual)].some((t) => t.kind !== 'title' && /[0-9=]/.test(t.text));
    if (!hasWorking && visual.dim === '2d') out.push(qwarn('contrast.no-working', at('elements'), 'no numbers or equations anywhere — the clash should be SHOWN with the rule\'s own working, not asserted'));
  } else if (purpose === 'apply') {
    if (!(last?.phase === 'apply' && isQuestion(last.caption))) out.push(qerr('apply.no-question', at('last step'), 'the application picture must end on an "apply" step whose caption asks the question'));
    if (steps.some((s) => s.phase === 'contrast')) out.push(qerr('apply.has-contrast', at('steps'), 'an application picture shows the situation only — no contrast step'));
  } else if (purpose === 'teach') {
    if (steps.length >= 3 && last && last.phase !== 'check') out.push(qwarn('steps.no-final-check', at(`step ${last.id}`), 'a teaching picture ends by checking understanding (phase "check")'));
    if (steps.length < 3) out.push(qwarn('steps.too-few', at('steps'), `${steps.length} step(s) — build the idea in at least 3`));
  }
  if (steps.length > VISUAL_LIMITS.maxSteps - 1) out.push(qwarn('steps.too-many', at('steps'), `${steps.length} steps — one idea per picture`));
  steps.forEach((s) => {
    if (!s.show.length && !(s.focus && s.focus.length)) out.push(qwarn('steps.empty', at(`step ${s.id}`), 'step adds and highlights nothing'));
    if (s.show.length > 6) out.push(qwarn('steps.crowded', at(`step ${s.id}`), `${s.show.length} bricks appear at once — one idea per step`));
  });

  // bricks outside every step are on the board from the start ────────────
  const shown = new Set(steps.flatMap((s) => s.show));
  const always = (visual.elements as Array<{ id: string; kind: string; label?: string }>).filter((e) => !shown.has(e.id));
  const loud = always.filter((e) => e.label || ['text', 'box', 'label'].includes(e.kind));
  if (steps.length > 1 && loud.length) {
    out.push(qerr('steps.always-visible', at(`element ${loud[0].id}`), `${loud.length} labelled/text brick(s) (${loud.slice(0, 3).map((e) => e.id).join(', ')}) are in no step, so they are on the board before their idea is taught`));
  } else if (steps.length > 1 && always.length > 2) {
    out.push(qwarn('steps.always-visible', at('elements'), `${always.length} bricks are in no step`));
  }

  if (visual.dim === '2d') lint2D(visual as BoardVisual, at, out, opts.form === 'worked');
  else lint3D(visual as BoardVisual3D, at, out);
  return out;
}

// ─── 2D: layout and form ─────────────────────────────────────────

function overlapArea(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function segmentHitsRect(p: [number, number], q: [number, number], r: Rect): boolean {
  // Liang–Barsky against the rect
  const dx = q[0] - p[0], dy = q[1] - p[1];
  let t0 = 0, t1 = 1;
  const edges: Array<[number, number]> = [[-dx, p[0] - r.x], [dx, r.x + r.w - p[0]], [-dy, p[1] - r.y], [dy, r.y + r.h - p[1]]];
  for (const [pp, qq] of edges) {
    if (Math.abs(pp) < 1e-12) { if (qq < 0) return false; continue; }
    const t = qq / pp;
    if (pp < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

function lint2D(v: BoardVisual, at: (w: string) => string, out: QualityIssue[], worked = false) {
  const L = layoutFrame(v);
  const rects = elementRects(v, L);
  const byId = new Map<string, VisualElement2D>(v.elements.map((e) => [e.id, e] as [string, VisualElement2D]));
  const stepOf = new Map<string, number>();
  v.steps.forEach((s, i) => s.show.forEach((id) => stepOf.set(id, i)));
  const reported = new Set<string>();

  for (let i = 0; i < v.steps.length; i++) {
    const visible = v.elements.filter((e) => !stepOf.has(e.id) || stepOf.get(e.id)! <= i);
    const boxes = visible.filter((e) => e.kind === 'text' || e.kind === 'box');
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const ra = rects.get(boxes[a].id), rb = rects.get(boxes[b].id);
        if (!ra || !rb) continue;
        const area = overlapArea(ra, rb);
        const small = Math.min(ra.w * ra.h, rb.w * rb.h);
        const pair = [boxes[a].id, boxes[b].id].sort().join('|');
        if (area > 0 && area / small > 0.12 && !reported.has(pair)) {
          reported.add(pair);
          out.push(qerr('layout.overlap', at(`step ${v.steps[i].id}`), `"${describe(boxes[a])}" and "${describe(boxes[b])}" overlap on the board (${Math.round((area / small) * 100)}% of the smaller)`));
        }
      }
    }
    // connectors must not cut through a third brick
    for (const c of visible.filter((e) => e.kind === 'connector')) {
      const ca = byId.get((c as any).from), cb = byId.get((c as any).to);
      const ra = ca && rects.get(ca.id), rb = cb && rects.get(cb.id);
      if (!ra || !rb) continue;
      const pa: [number, number] = [ra.x + ra.w / 2, ra.y + ra.h / 2], pb: [number, number] = [rb.x + rb.w / 2, rb.y + rb.h / 2];
      if (Math.abs((c as any).bend ?? 0) > 0.05) continue; // curved: the renderer routes around
      for (const other of visible) {
        if (other.id === ca!.id || other.id === cb!.id || !['box', 'text'].includes(other.kind)) continue;
        const ro = rects.get(other.id);
        const key = `conn|${c.id}|${other.id}`;
        if (ro && segmentHitsRect(pa, pb, ro) && !reported.has(key)) {
          reported.add(key);
          out.push(qwarn('layout.connector-crosses', at(`element ${c.id}`), `connector ${ca!.id} → ${cb!.id} passes through "${describe(other)}"`));
        }
      }
    }
  }

  // nothing clipped by the board edge (canvas is the whole board; a plane's labels may hang over its axes)
  if (v.frame.kind === 'canvas') {
    const plot = L.plot;
    for (const e of v.elements) {
      const r = rects.get(e.id);
      if (!r || !['text', 'box'].includes(e.kind)) continue;
      const over = Math.max(0, plot.x - r.x, r.x + r.w - (plot.x + plot.w), plot.y - r.y, r.y + r.h - (plot.y + plot.h));
      if (over > 2) out.push(qerr('layout.off-board', at(`element ${e.id}`), `"${describe(e)}" runs ${Math.round(over)}px past the board edge — keep bricks 4 to 56 units from the top and inside 4–96 across`));
    }
  }

  // a picture, not a slide of text ─────────────────────────────
  const kinds = v.elements.map((e) => e.kind);
  const texty = kinds.filter((k) => k === 'text' || k === 'table').length;
  const drawn = kinds.filter((k) => !['text', 'table', 'box', 'connector'].includes(k)).length;
  const connectors = kinds.filter((k) => k === 'connector').length;
  if (worked) {
    // a worked board is working written out step by step; only an empty-of-structure wall of text is a defect, and layout lints already cover that
  } else if (v.elements.length >= 4 && texty === v.elements.length) {
    out.push(qerr('form.text-slide', at('elements'), 'every brick is text — draw the thing (shapes, points, lines, arrows), do not write about it'));
  } else if (v.elements.length >= 5 && drawn === 0 && connectors === 0 && texty / v.elements.length >= 0.6) {
    out.push(qwarn('form.text-slide', at('elements'), `${texty} of ${v.elements.length} bricks are text and nothing is drawn — this reads as a slide, not a picture`));
  }
}

function describe(e: VisualElement2D): string {
  return (('text' in e && (e as any).text) || e.label || e.name || e.id) as string;
}

// ─── 3D ──────────────────────────────────────────────────────────

function lint3D(v: BoardVisual3D, at: (w: string) => string, out: QualityIssue[]) {
  const solids = v.elements.filter((e) => ['sphere', 'cuboid', 'cylinder'].includes(e.kind));
  if (v.elements.length < 4 || solids.length < 2) {
    out.push(qerr('3d.decorative', at('elements'), `only ${solids.length} solid(s) among ${v.elements.length} bricks — a 3D model must show a structure, not one object`));
  }
  v.steps.forEach((s) => {
    if (!s.show.length) out.push(qerr('3d.empty-step', at(`step ${s.id}`), 'a 3D step that reveals nothing — every step must add a part'));
  });
  const labelled = v.elements.filter((e) => e.label || (e.kind === 'label' && (e as any).text)).length;
  if (labelled < 2) out.push(qwarn('3d.unlabelled', at('elements'), 'fewer than 2 labelled parts — the learner cannot tell what they are looking at'));
}
