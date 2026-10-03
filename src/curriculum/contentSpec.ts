// ─────────────────────────────────────────────────────────────────
// The CONTENT SPEC: exactly what is generated for a concept, and why.
//
// Derived — never guessed — from three sources:
//   1. the curriculum concept  (key facts, misconceptions, ladder, prerequisites,
//      worked examples, and the `representationIdeas` the ingest review chose for it),
//   2. the tutor persona       (docs/TUTOR_PERSONA.md §4 arc, §6 moves, §7 representations),
//   3. the ingest review's per-concept `presentation` decision (photo, 3D) — nothing subject-specific is hard-coded.
//
// It is pure (no model, no network). `npm run spec:ch1` prints it as a document so it can be
// REVIEWED BEFORE ANY MODEL CALL; the generator must execute this spec and nothing else.
// ─────────────────────────────────────────────────────────────────
import { conceptContext, VisualConceptContext } from '../visual/prompt';
import { chunkPlan } from '../visual/generate';

import type { BoardForm } from '../visual/prompt';
export type { BoardForm };

const FORM_OF: Record<string, BoardForm | 'none'> = {
  visual_diagram: 'drawn',
  interactive_simulation: 'drawn',
  real_world_analogy: 'drawn',
  story_context: 'drawn',
  worked_example: 'worked',
  step_by_step: 'worked',
  direct_explanation: 'drawn',   // a definition is illustrated, not worked through; text-only boards stay caught by the slide lint
  peer_comparison: 'worked',
  prerequisite_review: 'worked',
  socratic_questioning: 'none',   // a way of talking, not a board
};

export interface BoardSpec {
  key: string;
  role: 'teach' | 'alternative' | 'contrast' | 'apply' | 'space';
  /** persona move this material serves (TUTOR_PERSONA §6) */
  move: string;
  form: BoardForm;
  /** strategy + the curriculum's own idea for it (what the board must realise) */
  representation?: { strategy: string; idea: string };
  keyFacts?: number[];
  misconceptionId?: string;
  why: string;
}

export interface ConceptSpec {
  conceptId: string;
  topic: string;
  conceptType: string;
  counts: { keyFacts: number; misconceptions: number; ladderLevels: number[]; representationIdeas: string[] };
  lesson: { chalkBulletsAtLeast: number; quizForm: 'L3-B'; hintsFromIngest: boolean; why: string };
  boards: BoardSpec[];
  photo: { yes: boolean; intent?: string; why: string };
  liveOnly: Array<{ move: string; material: string }>;
  calls: { text: number; images: number; vision: number };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export function buildConceptSpec(concept: any, course: any, grade: string): ConceptSpec {
  const ctx: VisualConceptContext = conceptContext(concept, course, grade);
  const reps = (ctx.representationIdeas || []).filter((r) => r && FORM_OF[r.strategy] !== undefined);
  const drawable = reps.filter((r) => FORM_OF[r.strategy] !== 'none');
  const primary = drawable[0];
  const alt = drawable.find((r, i) => i > 0 && r.strategy !== primary?.strategy);

  const boards: BoardSpec[] = [];
  const chunks = chunkPlan(ctx);
  chunks.forEach((c, i) => {
    boards.push({
      key: i === 0 ? 'main' : `focus:${slug(c.focus)}`,
      role: 'teach', move: 'TEACH_CHUNK + PREDICT_FIRST',
      form: primary ? (FORM_OF[primary.strategy] as BoardForm) : 'drawn',
      representation: primary,
      keyFacts: c.keyFacts,
      why: `key fact${c.keyFacts.length > 1 ? 's' : ''} ${c.keyFacts.join(' & ')}: one idea per chunk, asked-before-told (persona §4, H12)`,
    });
  });
  if (alt) {
    boards.push({
      key: `alt:${alt.strategy}`, role: 'alternative', move: 'SWITCH_REPRESENTATION',
      form: FORM_OF[alt.strategy] as BoardForm, representation: alt,
      keyFacts: chunks.flatMap((c) => c.keyFacts).slice(0, 2),
      why: 'the tutor must have a genuinely different second representation ready when a check fails after the first (persona §6, §7: never repeat a failed explanation)',
    });
  }
  for (const m of ctx.misconceptions.slice(0, 3)) {
    boards.push({
      key: `contrast:${m.id || slug(m.belief)}`, role: 'contrast', move: 'CONTRAST_CASE',
      // a procedural concept's misconception is shown as side-by-side working; a spatial one as a drawing
      form: primary && FORM_OF[primary.strategy] === 'worked' ? 'worked' : 'drawn', misconceptionId: m.id,
      why: `catalogued misconception: "${m.belief.slice(0, 90)}" — apply the learner's rule, let it visibly break, show the rule that works`,
    });
  }
  const l3 = ctx.ladderItems.find((l) => l.level === 3);
  if (l3) boards.push({ key: 'apply', role: 'apply', move: 'APPLY_NEAR (L3-A)', form: 'drawn', why: 'situation only, never the answer; the quiz is the parallel item L3-B, so 2 distinct L3 items exist (mastery rule §5)' });
  const pres = ctx.presentation;
  if (pres?.spatial3d?.useful) {
    boards.push({ key: '3d', role: 'space', move: 'TEACH_CHUNK (spatial)', form: 'drawn', why: `ingest review judged a 3D view useful: ${pres.spatial3d.why || 'a flat picture flattens the arrangement'}` });
  }

  const analogy = reps.find((r) => r.strategy === 'real_world_analogy');
  const photoDecision = pres?.photo;
  const photo = photoDecision?.useful && photoDecision.scene
    ? { yes: true, intent: photoDecision.scene.slice(0, 200), why: `ingest review judged a real-world image useful: ${photoDecision.why || 'observable scene'}` }
    : !pres && analogy
      ? { yes: true, intent: analogy.idea.slice(0, 160), why: 'legacy curriculum (no ingest presentation decision): the concept\'s own analogy is a physical scene' }
      : { yes: false, why: pres ? 'ingest review judged a real-world image not useful for this concept' : 'no presentation decision and no physical analogy in the curriculum data' };

  const text = 1 /* lesson */ + boards.length + 1 /* review */;
  return {
    conceptId: concept.id, topic: concept.label, conceptType: concept.conceptType,
    counts: {
      keyFacts: ctx.keyFacts.length, misconceptions: ctx.misconceptions.length,
      ladderLevels: ctx.ladderItems.map((l) => l.level), representationIdeas: reps.map((r) => r.strategy),
    },
    lesson: {
      chalkBulletsAtLeast: ctx.keyFacts.length, quizForm: 'L3-B',
      hintsFromIngest: ctx.ladderItems.filter((l) => l.level === 3).every((l) => (l.hints || []).length === 3),
      why: 'chalk notes cover every key fact; quiz is the parallel L3 item; the 3-step hint ladder for each L3 item is authored at ingest (persona P-10)',
    },
    boards, photo,
    liveOnly: [
      { move: 'PROBE_PREREQ / PREREQ_DETOUR', material: `${(concept.prerequisiteDetails || concept.prerequisites || []).length} prerequisite(s) from the curriculum, taught/probed live` },
      { move: 'TRANSFER_FAR (L4)', material: 'the curriculum\'s L4 ladder item, asked by the tutor; no stored picture' },
      { move: 'TEACH_BACK (L5)', material: 'no stored material — the learner explains, the tutor asks "why?"' },
      { move: 'ELICIT_REASONING / DISCRIMINATING_PROBE', material: 'the catalogued probeQuestions, used live' },
      { move: 'SWITCH_REPRESENTATION beyond the alternative board', material: 'generated live from the learner\'s evidence' },
    ],
    calls: { text, images: photo.yes ? 1 : 0, vision: photo.yes ? 1 : 0 },
  };
}

export function specToMarkdown(specs: ConceptSpec[]): string {
  const L: string[] = [];
  L.push('# Chapter 1 content spec — what is generated, and why\n');
  L.push('_Generated by `npm run spec:ch1` from `data/curricula.json` + the persona rules in `src/curriculum/contentSpec.ts`. No model was called. The generator must execute exactly this._\n');
  const tot = specs.reduce((a, s) => ({ t: a.t + s.calls.text, i: a.i + s.calls.images, v: a.v + s.calls.vision }), { t: 0, i: 0, v: 0 });
  L.push(`**Totals for ${specs.length} concepts: ${tot.t} text calls + ${tot.i} image + ${tot.v} vision checks**, one attempt each (a board that fails the free checks is withheld and listed, never retried).\n`);
  for (const s of specs) {
    L.push(`## ${s.topic}`);
    L.push(`type \`${s.conceptType}\` · ${s.counts.keyFacts} key facts · ${s.counts.misconceptions} misconceptions · ladder L${s.counts.ladderLevels.join(',L')} · curriculum representations: ${s.counts.representationIdeas.join(', ') || 'none'}\n`);
    L.push(`- **Lesson (1 call):** chalk notes covering all ${s.lesson.chalkBulletsAtLeast} key facts, quiz = L3-B, suggested questions, hint ladder is authored at ingest (${s.lesson.hintsFromIngest ? 'present' : 'MISSING — run npm run backfill:design'}).`);
    L.push('- **Boards:**');
    for (const b of s.boards) L.push(`  - \`${b.key}\` — ${b.role}, **${b.form}**, serves ${b.move}${b.representation ? `; realises ${b.representation.strategy}: “${b.representation.idea.slice(0, 110)}”` : ''}. _${b.why}_`);
    L.push(`- **Photo:** ${s.photo.yes ? `yes — ${s.photo.intent}` : 'no'} _(${s.photo.why})_`);
    L.push(`- **Review:** 1 call (quiz solved blind, notes, every board, ladder coverage).`);
    L.push(`- **Not pre-generated (live by design):** ${s.liveOnly.map((x) => x.move).join('; ')}.`);
    L.push(`- **Cost:** ${s.calls.text} text + ${s.calls.images} image + ${s.calls.vision} vision.\n`);
  }
  return L.join('\n');
}
