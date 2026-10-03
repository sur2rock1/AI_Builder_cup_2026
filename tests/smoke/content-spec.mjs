// Content spec: derived from curriculum data + ingest decisions only; nothing subject-specific. Run: npx tsx tests/smoke/content-spec.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildConceptSpec } from '../../src/curriculum/contentSpec.ts';
import { specToJobs } from '../../src/visual/specJobs.ts';
import { conceptContext, buildVisualPrompt } from '../../src/visual/prompt.ts';
import { lintVisual } from '../../src/quality/visualLint.ts';
import { sanitizeBoardVisual } from '../../src/visual/sanitize.ts';
import { presentationOf, hintsOf } from '../../src/curriculum/structure.ts';
import { applyBackfill, needsDesign, leaksAnswer } from '../../src/curriculum/designBackfill.ts';
let passed = 0;
const ok = (n, f) => { try { f(); passed++; console.log(`ok ${n}`); } catch (e) { console.error(`FAIL ${n}\n  ${e.message}`); process.exitCode = 1; } };

// A subject the codebase has never heard of.
const concept = (over = {}) => ({
  id: 'h1', label: 'Causes of the Peloponnesian War', chapter: 'Chapter 1: War', conceptType: 'causes-of-war',
  keyFacts: ['Sparta feared the growth of Athenian power.', 'The Delian League made Athens rich.', 'Corcyra asked Athens for help.'],
  misconceptionDetails: [{ id: 'one-cause', belief: 'A single event caused the whole war.', probeQuestion: 'Why did it start?', correctionHint: 'Several causes built up.' }],
  ladderItems: [{ level: 1, id: 'L1', prompt: 'p', lookFor: 'l' }, { level: 3, id: 'L3-A', prompt: 'a', lookFor: 'the alliance system' }, { level: 3, id: 'L3-B', prompt: 'b', lookFor: 'x' }],
  representationIdeas: [{ strategy: 'story_context', idea: 'Two rival neighbours, one growing.' }, { strategy: 'peer_comparison', idea: 'Compare Sparta and Athens side by side.' }],
  prerequisites: [], ...over,
});
const course = { label: 'History', grade: 'Grade 8' };

ok('no decision, no photo/3D from a subject list: 3D never, photo only from a physical analogy', () => {
  const s = buildConceptSpec(concept(), course, 'Grade 8');
  assert.ok(!s.boards.some((b) => b.key === '3d')); assert.equal(s.photo.yes, false);
});
ok('the ingest decision alone drives photo and 3D (any concept type)', () => {
  const s = buildConceptSpec(concept({ presentation: { photo: { useful: true, scene: 'A ruined stone harbour wall at dawn', why: 'observable' }, spatial3d: { useful: true, why: 'layered' } } }), course, 'Grade 8');
  assert.ok(s.boards.some((b) => b.key === '3d')); assert.equal(s.photo.yes, true); assert.match(s.photo.intent, /harbour wall/);
  const off = buildConceptSpec(concept({ presentation: { photo: { useful: false }, spatial3d: { useful: false } } }), course, 'Grade 8');
  assert.ok(!off.boards.some((b) => b.key === '3d')); assert.equal(off.photo.yes, false);
});
ok('boards: chunks, an alternative from the second idea, one contrast per misconception, apply', () => {
  const s = buildConceptSpec(concept(), course, 'Grade 8');
  const roles = s.boards.map((b) => b.role);
  assert.ok(roles.includes('teach') && roles.includes('alternative') && roles.includes('contrast') && roles.includes('apply'));
  const alt = s.boards.find((b) => b.role === 'alternative');
  assert.equal(alt.representation.strategy, 'peer_comparison'); assert.equal(alt.form, 'worked');
  assert.equal(s.boards.find((b) => b.role === 'teach').form, 'drawn');
});
ok('spec → jobs is 1:1 and carries form + representation to the request', () => {
  const c = concept(); const ctx = conceptContext(c, course, 'Grade 8'); const s = buildConceptSpec(c, course, 'Grade 8');
  const jobs = specToJobs(s, ctx);
  assert.deepEqual(jobs.map((j) => j.key), s.boards.map((b) => b.key));
  const alt = jobs.find((j) => j.key.startsWith('alt:'));
  assert.equal(alt.req.form, 'worked'); assert.equal(alt.req.representation.strategy, 'peer_comparison');
  assert.match(buildVisualPrompt(ctx, alt.req), /Realise EXACTLY this representation \(peer_comparison\)/);
  assert.match(buildVisualPrompt(ctx, alt.req), /WORKED board/);
  assert.doesNotMatch(buildVisualPrompt(ctx, jobs[0].req), /WORKED board/);
});
ok('later teaching chunks keep the representation style but not the first picture idea (they teach their own key fact)', () => {
  const c = concept({ keyFacts: ['f1 one', 'f2 two', 'f3 three', 'f4 four', 'f5 five'], representationIdeas: [{ strategy: 'visual_diagram', idea: 'A U-tube with a membrane' }, { strategy: 'real_world_analogy', idea: 'x' }] });
  const ctx = conceptContext(c, course, 'Grade 8'); const jobs = specToJobs(buildConceptSpec(c, course, 'Grade 8'), ctx);
  const teach = jobs.filter((j) => j.req.purpose === 'teach' && !j.key.startsWith('alt:'));
  assert.ok(teach.length >= 2); assert.equal(teach[0].req.representation.idea, 'A U-tube with a membrane'); assert.equal(teach[1].req.representation.idea, '');
  assert.doesNotMatch(buildVisualPrompt(ctx, teach[1].req), /Realise EXACTLY this representation/);
  assert.match(buildVisualPrompt(ctx, teach[1].req), /draw ONLY the key fact/);
});
ok('worked boards are exempt from the text-slide lint; drawn boards are not', () => {
  const slide = { dim: '2d', title: 't', purpose: 'teach', frame: { kind: 'canvas' },
    elements: [1, 2, 3, 4].map((n) => ({ id: `t${n}`, kind: 'text', at: [30 + n * 10, 10 + n * 10], text: `Step ${n} of the working` })),
    steps: [{ id: 's1', name: 'a', caption: 'What?', show: ['t1', 't2', 't3', 't4'], phase: 'hook' }], checkQuestion: 'Why?' };
  const codes = (form) => lintVisual(sanitizeBoardVisual(slide).visual, { key: 'main', form }).map((i) => i.code);
  assert.ok(codes('drawn').includes('form.text-slide')); assert.ok(!codes('worked').includes('form.text-slide'));
});
ok('presentationOf / hintsOf keep only explicit, well-formed decisions', () => {
  assert.equal(presentationOf(undefined), undefined); assert.equal(presentationOf({}), undefined);
  assert.equal(presentationOf({ photo: { useful: true, scene: '' } }).photo.useful, false, 'no scene → not useful');
  assert.equal(hintsOf(['a', ' ', 'b', 'c', 'd']).length, 3); assert.equal(hintsOf([]), undefined);
});
ok('backfill fills only what is missing and drops hints that leak the answer key', () => {
  const c = concept(); const cs = { concepts: [c] };
  assert.ok(needsDesign(c));
  const r = applyBackfill(cs, { concepts: [{ conceptId: 'h1', presentation: { photo: { useful: false }, spatial3d: { useful: false } },
    ladderHints: { 'L3-A': ['look at who allied with whom', 'name the alliance system', 'a parallel case: the alliance system explains it'], 'L3-B': ['h1', 'h2', 'h3'] } }] });
  assert.equal(r.presentation, 1);
  assert.equal(c.ladderItems.find((l) => l.id === 'L3-B').hints.length, 3);
  assert.equal(leaksAnswer('it was the alliance system that decided everything today ok', 'the alliance system that decided everything today ok fine'), true);
  assert.equal(applyBackfill(cs, { concepts: [{ conceptId: 'h1', presentation: { photo: { useful: true, scene: 'x' } } }] }).presentation, 0, 'existing decision is never overwritten');
});
ok('backfill accepts object, list and lowercase-id shapes, and reports why hints were dropped', () => {
  const mk = () => ({ concepts: [concept({ presentation: { photo: { useful: false } } })] });
  const a = mk(); const ra = applyBackfill(a, { concepts: [{ conceptId: 'h1', ladderHints: [{ id: 'l3-a', hints: ['a', 'b', 'c'] }, { id: 'L3-B', hints: ['a', 'b'] }] }] });
  assert.equal(ra.hints, 1); assert.equal(ra.notThree, 1); assert.equal(ra.hintCandidates, 2);
  const b = mk(); const rb = applyBackfill(b, { concepts: [{ conceptId: 'h1', ladderHints: { 'L3-A': ['a', 'b', 'c'], 'L3-Z': ['a', 'b', 'c'] } }] });
  assert.equal(rb.hints, 1); assert.equal(rb.unmatchedIds.length, 1);
});
ok('legacy ladder items without ids are matched by order and get their ids written back', () => {
  const c = concept(); c.ladderItems.forEach((l) => delete l.id); c.presentation = { photo: { useful: false } };
  const r = applyBackfill({ concepts: [c] }, { concepts: [{ conceptId: 'h1', ladderHints: { 'L3-A': ['a', 'b', 'c'], 'L3-B': ['d', 'e', 'f'] } }] });
  assert.equal(r.hints, 2); assert.deepEqual(c.ladderItems.filter((l) => l.level === 3).map((l) => l.id), ['L3-A', 'L3-B']);
});
ok('contentSpec has no subject/type lists left in source', () => {
  const src = fs.readFileSync(new URL('../../src/curriculum/contentSpec.ts', import.meta.url), 'utf8');
  assert.ok(!/SPATIAL_CONCEPT_TYPES|OBSERVABLE_CONCEPT_TYPES|cellular|organism/.test(src));
});
console.log(`\n${passed} content-spec checks passed`);
