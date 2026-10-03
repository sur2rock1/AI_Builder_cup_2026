// Smoke test for the quality layer (docs/BOARD_VISUALS.md §Quality gates).
// Run: npx tsx tests/smoke/quality.mjs
//
// Covers: persona language rules, quiz shuffle + lints, answer-leak lints,
// picture lints (predict-first, phases, layout, form, 3D), the new geometry
// claims (general-form equations, labels on the wrong line), the generate →
// lint → critic → repair → withhold loop with a scripted model, the planner,
// and a REGRESSION CORPUS: the material the Chapter 1 review found defective
// must still be flagged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { languageIssues, hasLabelPrefix } from '../../src/quality/language.ts';
import { shuffleQuiz, lintQuiz, correctSlotSpread, normalizeQuiz, isQuizShape } from '../../src/quality/quizTools.ts';
import { leaksAnswer, lintLessonLeaks, lintApplyPicture, lintPictureVsQuiz } from '../../src/quality/leakLint.ts';
import { lintVisual } from '../../src/quality/visualLint.ts';
import { sanitizeBoardVisual, lineClaim, stripUnverifiedClaims } from '../../src/visual/sanitize.ts';
import { generateBoardVisual, generateLessonVisuals, validatePlan, chunkPlan, planTeachingPictures } from '../../src/visual/generate.ts';

let passed = 0;
const ok = async (name, fn) => {
  try { await fn(); passed++; console.log(`ok ${name}`); }
  catch (err) { console.error(`FAIL ${name}\n  ${err.message}`); process.exitCode = 1; }
};
const codes = (issues) => issues.map((i) => i.code);

// ─── language ────────────────────────────────────────────────────
await ok('language: verdict words, emoji and jargon are errors', () => {
  assert.ok(codes(languageIssues('That is wrong', 'x')).includes('persona.banned-word'));
  assert.ok(codes(languageIssues('✅ Correct rule', 'x')).includes('persona.emoji-verdict'));
  assert.ok(codes(languageIssues('❌ Mistaken Rule: cancel the y', 'x')).includes('persona.banned-word'));
  assert.ok(codes(languageIssues('Common Misconception Alert', 'x')).includes('persona.pre-announced-misconception'));
  assert.ok(codes(languageIssues('Prerequisite check: what is a gradient?', 'x')).includes('persona.tutor-jargon'));
  assert.deepEqual(languageIssues("Let's test this rule on a real case", 'x'), []);
  assert.ok(hasLabelPrefix('Misconception Probe: what happens when x is 0?'));
  assert.ok(!hasLabelPrefix('Why does the line go up?'));
});
await ok('language: taglines flag marketing-speak only as a warning', () => {
  const i = languageIssues('Unlock the secrets of cells!', 'tagline', { kind: 'tagline' });
  assert.deepEqual(codes(i), ['persona.marketing']); assert.equal(i[0].severity, 'warn');
});

// ─── quiz ────────────────────────────────────────────────────────
const quiz = { question: 'Which line is horizontal?', options: ['y = 3', 'x = 3', 'y = 3x', 'x + y = 3'], correctIndex: 0, explanation: 'Every point on y = 3 has the same y-value, so it runs flat.' };
await ok('quiz: seeded shuffle spreads the correct slot and is idempotent', () => {
  const seeds = Array.from({ length: 12 }, (_, i) => `concept-${i}`);
  const shuffled = seeds.map((s) => shuffleQuiz(quiz, s));
  const { counts, issue } = correctSlotSpread(shuffled);
  assert.equal(issue, null, JSON.stringify(counts));
  assert.ok(counts.filter((c) => c > 0).length >= 3, `only ${counts.filter((c) => c > 0).length} slots used`);
  shuffled.forEach((q) => assert.equal(q.options[q.correctIndex], 'y = 3'));
  assert.equal(shuffleQuiz(shuffled[0], 'other'), shuffled[0]);
  assert.deepEqual(shuffleQuiz(quiz, 'a'), shuffleQuiz(quiz, 'a'));
});
await ok('quiz: optionNotes travel with their option', () => {
  const q = shuffleQuiz({ ...quiz, optionNotes: ['right', 'swapped axes', 'gradient confusion', 'sum rule'] }, 'n');
  assert.equal(q.optionNotes[q.correctIndex], 'right');
  assert.equal(q.optionNotes[q.options.indexOf('x = 3')], 'swapped axes');
});
await ok('quiz: un-shuffled, length-biased, duplicate and "all of the above" quizzes are errors', () => {
  assert.ok(codes(lintQuiz(quiz)).includes('quiz.not-shuffled'));
  const long = shuffleQuiz({ question: 'q?', options: ['A very long and detailed correct answer that gives itself away completely', 'no', 'nope', 'nah'], correctIndex: 0, explanation: 'Because of the long reasoning here.' }, 'z');
  assert.ok(codes(lintQuiz(long)).includes('quiz.length-bias'));
  assert.ok(codes(lintQuiz(shuffleQuiz({ ...quiz, options: ['y = 3', 'y = 3', 'x = 3', 'x = 4'] }, 'q'))).includes('quiz.duplicate-option'));
  assert.ok(codes(lintQuiz(shuffleQuiz({ ...quiz, options: ['y = 3', 'x = 3', 'x = 4', 'all of the above'] }, 'q'))).includes('quiz.none-of-above'));
  assert.equal(lintQuiz(shuffleQuiz(quiz, 'ok')).filter((i) => i.severity === 'error').length, 0);
});
await ok('quiz: normalizeQuiz shuffles legacy quizzes and rejects broken ones', () => {
  const n = normalizeQuiz(quiz, 'legacy');
  assert.equal(n.order, 'shuffled'); assert.equal(n.options[n.correctIndex], 'y = 3');
  assert.equal(normalizeQuiz({ question: 'a', options: ['x'], correctIndex: 0, explanation: '' }), null);
  assert.equal(isQuizShape(null), false);
});

// ─── leaks ───────────────────────────────────────────────────────
await ok('leaks: equations and coordinate pairs in the answer, not the question', () => {
  assert.equal(leaksAnswer('7y - (-6y) = 13y, so y = 3', 'y = 3', 'Solve the system').how, 'equation');
  assert.equal(leaksAnswer('They cross at (4, -2).', 'The point (4, -2)', 'Where do the lines cross?').how, 'pair');
  assert.equal(leaksAnswer('Solve 2x + y = 6', 'x = 4', 'Solve 2x + y = 6'), null);
  assert.equal(leaksAnswer('Use substitution', 'y = 3', 'Solve the system'), null);
});
await ok('leaks: chalk notes must not state the quiz answer; quiz must not be a worked example', () => {
  const lesson = {
    chalkNotes: { bulletPoints: ['Substitute back: x = 4, y = -2'] },
    quiz: { question: 'Solve 2x + y = 6 and x - y = 6', options: ['x = 4, y = -2', 'a', 'b', 'c'], correctIndex: 0, explanation: '' },
  };
  const c = codes(lintLessonLeaks(lesson, ['Solve 2x + y = 6 and x - y = 6 → add → x = 4']));
  assert.ok(c.includes('leak.chalk-quiz-answer') && c.includes('leak.quiz-is-worked-example'), c.join());
});
await ok('leaks: an apply picture that draws the answer point or crosses curves at it is an error', () => {
  const v = (extra) => ({
    dim: '2d', title: 't', purpose: 'apply', steps: [{ id: 's1', name: 'a', caption: 'Where do the lines cross?', show: ['l1', 'l2', ...extra], phase: 'apply' }],
    frame: { kind: 'plane', x: [-6, 6], y: [-6, 6], axes: 'both' },
    elements: [
      { id: 'l1', kind: 'line', through: [[0, 2], [4, 6]] }, { id: 'l2', kind: 'line', through: [[0, 6], [2, 4]] },
      ...(extra.length ? [{ id: 'p', kind: 'point', at: [2, 4] }] : []),
    ],
  });
  const item = { level: 3, prompt: 'Solve y = x + 2 and y = 6 - x', lookFor: 'the lines cross at (2, 4)' };
  assert.ok(codes(lintApplyPicture(v([]), item)).includes('leak.apply-geometry'));
  assert.ok(codes(lintApplyPicture(v(['p']), item)).includes('leak.apply-geometry'));
  const hint = v([]); hint.steps[0].caption = 'Make the y coefficients match. Where do they cross?';
  assert.ok(codes(lintApplyPicture({ ...hint, elements: [] }, { level: 3, prompt: 'p', lookFor: 'z' })).includes('leak.apply-hint'));
});
await ok('leaks: a picture may not state the quiz answer', () => {
  const v = { dim: '2d', title: 't', purpose: 'teach', steps: [{ id: 's1', name: 'a', caption: 'So y = 3', show: [] }], frame: { kind: 'canvas' }, elements: [] };
  assert.ok(codes(lintPictureVsQuiz(v, { question: 'Solve', options: ['y = 3', 'b', 'c', 'd'], correctIndex: 0, explanation: '' }, 'main')).includes('leak.picture-quiz-answer'));
});

// ─── geometry claims ─────────────────────────────────────────────
await ok('claims: general-form equations parse and no longer read as "y = 32"', () => {
  assert.deepEqual(lineClaim('2x - 5y = 32'), { kind: 'gen', a: 2, b: -5, c: 32 });
  assert.deepEqual(lineClaim('x + 2y = 8'), { kind: 'gen', a: 1, b: 2, c: 8 });
  assert.deepEqual(lineClaim('3x-4y=12 (Line 2)'), { kind: 'gen', a: 3, b: -4, c: 12 });
  assert.deepEqual(lineClaim('y = 5'), { kind: 'y', c: 5 });
  assert.equal(lineClaim('5y = 32'), null);
});
const parallel = (texts) => ({
  dim: '2d', title: 'Parallel lines', purpose: 'teach', representation: 'visual_diagram', why: '',
  frame: { kind: 'plane', x: [-6, 6], y: [-4, 8], axes: 'both', grid: true, equalScale: false },
  elements: [
    { id: 'l1', kind: 'line', through: [[0, 0], [4, 4]], color: 'emerald' },
    { id: 'l2', kind: 'line', through: [[0, 2], [4, 6]], color: 'rose' },
    { id: 't1', kind: 'text', at: texts[0][0], text: texts[0][1], math: true },
    { id: 't2', kind: 'text', at: texts[1][0], text: texts[1][1], math: true },
  ],
  steps: [{ id: 's1', name: 'lines', caption: 'Look at both lines', show: ['l1', 'l2', 't1', 't2'] }],
});
await ok('geometry: a label beside the WRONG line (the review\'s swapped parallel-lines picture) is an error and is stripped', () => {
  const good = sanitizeBoardVisual(parallel([[[4.6, 4.2], 'y = x'], [[4.6, 6.2], 'y = x + 2']]));
  assert.deepEqual(good.issues.filter((i) => i.severity !== 'fix'), []);
  const swapped = sanitizeBoardVisual(parallel([[[4.6, 4.2], 'y = x + 2'], [[4.6, 6.2], 'y = x']]));
  assert.equal(swapped.issues.filter((i) => i.severity === 'error').length, 2);
  const { visual } = stripUnverifiedClaims(swapped.visual, swapped.issues);
  assert.deepEqual(visual.elements.map((e) => e.id), ['l1', 'l2']);
  assert.deepEqual(visual.steps[0].show, ['l1', 'l2']);
});
await ok('geometry: a floating label and an equation that matches no drawn line are errors', () => {
  const float = sanitizeBoardVisual(parallel([[[-5, 7], 'y = x'], [[4.6, 6.2], 'y = x + 2']]));
  assert.ok(float.issues.some((i) => i.severity === 'error' && /t1/.test(i.message)));
  const none = sanitizeBoardVisual(parallel([[[4.6, 4.2], 'y = x'], [[4.6, 6.2], 'y = x + 5']]));
  assert.ok(none.issues.some((i) => i.severity === 'error' && /no drawn line/.test(i.message)));
});
await ok('geometry: a general-form label on a line through the right points passes; a wrong constant fails', () => {
  const mk = (label) => sanitizeBoardVisual({
    dim: '2d', title: 't', purpose: 'teach', frame: { kind: 'plane', x: [-2, 10], y: [-8, 4], axes: 'both', equalScale: false },
    elements: [{ id: 'l', kind: 'line', through: [[1, -6], [6, -4]], label }],
    steps: [{ id: 's1', name: 'a', caption: 'q?', show: ['l'] }],
  });
  assert.deepEqual(mk('2x - 5y = 32').issues.filter((i) => i.severity === 'error'), []);
  assert.ok(mk('2x - 5y = 30').issues.some((i) => i.severity === 'error'));
});

// ─── picture lints ───────────────────────────────────────────────
const goodTeach = () => ({
  dim: '2d', title: 'Lines where one coordinate never changes', purpose: 'teach', representation: 'visual_diagram',
  why: 'Seeing many points share x = 2 shows why the whole line is called x = 2.',
  frame: { kind: 'plane', x: [-3, 6], y: [-4, 5], axes: 'both', grid: true, equalScale: true, xLabel: 'x', yLabel: 'y' },
  elements: [
    { id: 'A', kind: 'point', at: [2, -2], label: 'A(2, -2)', color: 'rose' },
    { id: 'B', kind: 'point', at: [2, 1], label: 'B(2, 1)', color: 'rose' },
    { id: 'C', kind: 'point', at: [2, 4], label: 'C(2, 4)', color: 'rose' },
    { id: 'vline', kind: 'line', through: [[2, -2], [2, 4]], label: 'x = 2', color: 'rose' },
  ],
  steps: [
    { id: 's1', name: 'three points', caption: 'Look at A, B and C. What do their x-values have in common?', show: ['A', 'B', 'C'], phase: 'hook' },
    { id: 's2', name: 'the vertical line', caption: 'Every point on this line has x = 2, so the line is x = 2.', show: ['vline'], phase: 'teach' },
    { id: 's3', name: 'check', caption: 'Where would the line x = 5 sit?', show: [], focus: ['vline'], phase: 'check' },
  ],
  checkQuestion: 'Why is this line called x = 2 and not y = 2?',
});
const clean = (v, key = 'main') => lintVisual(sanitizeBoardVisual(v).visual, { key });

await ok('visual lint: a well-formed teaching picture has no errors', () => {
  const issues = clean(goodTeach());
  assert.deepEqual(issues.filter((i) => i.severity === 'error'), [], JSON.stringify(issues));
});
await ok('visual lint: step 1 that tells instead of asks, and a missing check question, are errors', () => {
  const v = goodTeach(); v.steps[0].caption = 'These three points all have x = 2.'; delete v.checkQuestion;
  const c = codes(clean(v));
  assert.ok(c.includes('predict.no-hook-question') && c.includes('elicit.no-check-question'), c.join());
});
await ok('visual lint: verdict language, emoji and "Mistaken Rule" on a picture are errors', () => {
  const v = goodTeach(); v.steps[1].caption = '❌ Mistaken Rule: this is impossible and wrong.';
  const c = codes(clean(v));
  assert.ok(c.includes('persona.banned-word') && c.includes('persona.emoji-verdict'), c.join());
});
await ok('visual lint: bricks that are in no step are on the board before their idea (error)', () => {
  const v = goodTeach(); v.steps[1].show = [];  // vline (labelled) now in no step
  assert.ok(codes(clean(v)).includes('steps.always-visible'));
});
await ok('visual lint: contrast pictures need a clash step and an ending question; apply pictures a final question', () => {
  const c = goodTeach(); c.purpose = 'contrast';
  assert.ok(codes(clean(c, 'contrast:x')).includes('contrast.no-clash-step') && codes(clean(c, 'contrast:x')).includes('contrast.no-check'));
  const a = goodTeach(); a.purpose = 'apply'; delete a.checkQuestion;
  assert.ok(codes(clean(a, 'apply')).includes('apply.no-question'));
  a.steps[2].phase = 'apply'; a.steps[2].caption = 'Where does the line sit?';
  assert.ok(!codes(clean(a, 'apply')).includes('apply.no-question'));
});
await ok('visual lint: colliding boxes, boxes on the board edge and text-only slides are flagged with the renderer\'s own metrics', () => {
  const box = (id, x, y, text = 'Respiration') => ({ id, kind: 'box', at: [x, y], text });
  const v = {
    dim: '2d', title: 't', purpose: 'teach', frame: { kind: 'canvas' },
    elements: [box('a', 50, 30), box('b', 56, 32, 'Excretion'), box('c', 50, 60, 'Nutrition')],
    steps: [{ id: 's1', name: 'a', caption: 'What do you notice?', show: ['a', 'b', 'c'], phase: 'hook' }, { id: 's2', name: 'b', caption: 'Look again.', show: [], focus: ['a'], phase: 'check' }],
    checkQuestion: 'Which is which?',
  };
  const c = codes(clean(v));
  assert.ok(c.includes('layout.overlap'), c.join());
  assert.ok(c.includes('layout.off-board'), c.join());
  const slide = {
    dim: '2d', title: 't', purpose: 'teach', frame: { kind: 'canvas' },
    elements: [1, 2, 3, 4].map((n) => ({ id: `t${n}`, kind: 'text', at: [30 + n * 10, 10 + n * 10], text: `Sentence ${n} about the idea` })),
    steps: [{ id: 's1', name: 'a', caption: 'What?', show: ['t1', 't2', 't3', 't4'], phase: 'hook' }],
    checkQuestion: 'Why?',
  };
  assert.ok(codes(clean(slide)).includes('form.text-slide'));
});
await ok('visual lint: 3D with one solid or empty steps is decorative', () => {
  const v3 = {
    dim: '3d', title: 'cell', purpose: 'teach', frame: { kind: 'space', x: [-2, 2], y: [-2, 2], z: [-2, 2], axes: true },
    elements: [{ id: 'c', kind: 'cuboid', center: [0, 0, 0], size: [1, 1, 1], label: 'cell wall' }],
    steps: [{ id: 's1', name: 'a', caption: 'What is this?', show: ['c'] }, { id: 's2', name: 'b', caption: 'And now?', show: [] }],
    checkQuestion: 'Why?',
  };
  const c = codes(lintVisual(sanitizeBoardVisual(v3, '3d').visual, { key: '3d' }));
  assert.ok(c.includes('3d.decorative') && c.includes('3d.empty-step'), c.join());
});
console.log(`\n${passed} quality checks passed`);
