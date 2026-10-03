// Smoke test for the board-visual system (docs/BOARD_VISUALS.md).
// Run: npx tsx tests/smoke/board-visual.mjs
//
// Covers: the safe expression compiler, the sanitizer, every fact-check,
// the strip-on-failure safety net, the tutor brief, reveal matching,
// focus lookup, and a server-side render of real pictures through the
// actual React renderer (no browser needed).
import assert from 'node:assert/strict';
import { compileExpr, evalExpr } from '../../src/visual/expr.ts';
import {
  sanitizeBoardVisual, repairableIssues, stripUnverifiedClaims, lineClaim, coordinatePairs,
} from '../../src/visual/sanitize.ts';
import {
  matchRevealTarget, findVisualForFocus, boardContextBlock, toolSummary, matchScore,
} from '../../src/visual/tutorBrief.ts';

let passed = 0;
const ok = (name, fn) => {
  try { fn(); passed++; console.log(`ok ${name}`); }
  catch (err) { console.error(`FAIL ${name}\n  ${err.message}`); process.exitCode = 1; }
};

// ─── expression compiler ─────────────────────────────────────────
ok('expr: linear with implicit multiplication', () => assert.equal(evalExpr('2x + 1', 3), 7));
ok('expr: leading "y =" and unicode minus/square', () => assert.equal(evalExpr('y = x² − 4', 3), 5));
ok('expr: brackets and powers', () => assert.equal(evalExpr('3(x - 2)^2', 4), 12));
ok('expr: unary minus binds below power', () => assert.equal(evalExpr('-x^2', 3), -9));
ok('expr: negative exponent', () => assert.equal(evalExpr('2^-1', 0), 0.5));
ok('expr: functions and constants', () => assert.ok(Math.abs(evalExpr('sin(pi/2) + sqrt(16)', 0) - 5) < 1e-12));
ok('expr: shorthand "sin x"', () => assert.ok(Math.abs(evalExpr('sin x', Math.PI / 2) - 1) < 1e-12));
ok('expr: absolute value bars', () => assert.equal(evalExpr('|x - 5|', 2), 3));
ok('expr: root symbol', () => assert.equal(evalExpr('√(x+7)', 9), 4));
ok('expr: rejects code', () => {
  for (const bad of ['alert(1)', 'process.exit()', 'x; x', 'constructor', '2 +']) {
    assert.equal(compileExpr(bad).ok, false, `should reject ${bad}`);
  }
});

// ─── claim parsing ───────────────────────────────────────────────
ok('claims: coordinate pairs', () => assert.deepEqual(coordinatePairs('Point B(2, −1) and (0,3)'), [[2, -1], [0, 3]]));
ok('claims: x = c', () => assert.deepEqual(lineClaim('Vertical line x = 2'), { kind: 'x', c: 2 }));
ok('claims: y = c with a note', () => assert.deepEqual(lineClaim('y = 1 (gradient 0)'), { kind: 'y', c: 1 }));
ok('claims: y = f(x)', () => assert.deepEqual(lineClaim('y = 2x + 1'), { kind: 'fn', expr: '2x + 1' }));
ok('claims: symbolic form is not a claim', () => assert.equal(lineClaim('y = mx + c'), null));

// ─── a realistic, correct picture (horizontal & vertical lines) ─
const goodMain = {
  dim: '2d', title: 'Lines where one coordinate never changes', purpose: 'teach', representation: 'visual_diagram',
  why: 'Seeing many points share x = 2 shows why the whole line is called x = 2.',
  frame: { kind: 'plane', x: [-3, 6], y: [-4, 5], axes: 'both', grid: true, equalScale: true, xLabel: 'x', yLabel: 'y' },
  elements: [
    { id: 'A', kind: 'point', at: [2, -2], label: 'A(2, -2)', color: 'rose', name: 'point A' },
    { id: 'B', kind: 'point', at: [2, 1], label: 'B(2, 1)', color: 'rose', name: 'point B' },
    { id: 'C', kind: 'point', at: [2, 4], label: 'C(2, 4)', color: 'rose', name: 'point C' },
    { id: 'vline', kind: 'line', through: [[2, -2], [2, 4]], label: 'x = 2', color: 'rose', name: 'the vertical line' },
    { id: 'D', kind: 'point', at: [-1, 1], label: 'D(-1, 1)', color: 'sky' },
    { id: 'E', kind: 'point', at: [4, 1], label: 'E(4, 1)', color: 'sky' },
    { id: 'hline', kind: 'line', through: [[-1, 1], [4, 1]], label: 'y = 1', color: 'sky', name: 'the horizontal line' },
    { id: 'tbl', kind: 'table', rows: [['point', 'x', 'y'], ['A', '2', '-2'], ['B', '2', '1'], ['C', '2', '4']], placement: 'right' },
  ],
  steps: [
    { id: 's1', name: 'three points', caption: 'Look at A, B and C. What do their x-values have in common?', show: ['A', 'B', 'C', 'tbl'], phase: 'hook' },
    { id: 's2', name: 'the vertical line', caption: 'Every point on this line has x = 2, so the line is x = 2.', show: ['vline'], phase: 'teach' },
    { id: 's3', name: 'the horizontal line', caption: 'Here y stays 1 while x changes: this line is y = 1.', show: ['D', 'E', 'hline'], phase: 'teach' },
    { id: 's4', name: 'where they meet', caption: 'They cross at (2, 1) — point B is on both lines.', show: [], focus: ['B', 'vline', 'hline'], phase: 'check' },
  ],
  checkQuestion: 'Why is the vertical line called x = 2 and not y = 2?',
};

ok('sanitize: a correct picture passes with no blocking issues', () => {
  const r = sanitizeBoardVisual(goodMain);
  assert.ok(r.visual, 'visual kept');
  assert.deepEqual(repairableIssues(r.issues), [], JSON.stringify(r.issues));
  assert.equal(r.visual.elements.length, 8);
  assert.equal(r.visual.steps.length, 4);
});

// ─── the same picture with the kind of slips models make ────────
const wrong = JSON.parse(JSON.stringify(goodMain));
wrong.elements[1].at = [2, 3];                     // B labelled (2, 1) but drawn at (2, 3)
wrong.elements[3].through = [[3, -2], [3, 4]];     // "x = 2" drawn at x = 3
wrong.elements.push({ id: 'f', kind: 'function', expr: '2x + 1', label: 'y = 3x + 1' });
wrong.elements.push({ id: 'ang', kind: 'angle', vertex: [0, 0], from: [1, 0], to: [1, 1], right: true });
wrong.elements.push({ id: 'junk', kind: 'hologram', at: [0, 0] });
wrong.elements.push({ id: 'bad-fn', kind: 'function', expr: 'process.exit()' });
wrong.elements.push({ id: 'far', kind: 'point', at: [40, 1] });

ok('fact-check: catches every false claim', () => {
  const r = sanitizeBoardVisual(wrong);
  const errs = r.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('\n');
  assert.match(errs, /point "b" says \(2, 1\) but is drawn at \(2, 3\)/);
  assert.match(errs, /line "vline" is labelled "x = 2"/);
  assert.match(errs, /function "f" is labelled "y = 3x \+ 1" but plots y = 2x \+ 1/);
  assert.match(errs, /marked as a right angle but measures 45°/);
});

ok('sanitize: drops unknown and unsafe bricks, widens the frame', () => {
  const r = sanitizeBoardVisual(wrong);
  const ids = r.visual.elements.map((e) => e.id);
  assert.ok(!ids.includes('junk') && !ids.includes('bad-fn'));
  assert.ok(r.visual.frame.x[1] >= 40, 'x-range widened to include the far point');
});

ok('strip: false labels removed, geometry kept', () => {
  const r = sanitizeBoardVisual(wrong);
  const { visual, stripped } = stripUnverifiedClaims(r.visual, r.issues);
  const B = visual.elements.find((e) => e.id === 'b');
  const v = visual.elements.find((e) => e.id === 'vline');
  const ang = visual.elements.find((e) => e.id === 'ang');
  assert.equal(B.label, undefined); assert.deepEqual(B.at, [2, 3]);
  assert.equal(v.label, undefined);
  assert.equal(ang.right, false);
  assert.ok(stripped.every((i) => i.severity === 'fix'));
});

ok('caption check: coordinates must be on the board', () => {
  const v = JSON.parse(JSON.stringify(goodMain));
  v.steps[3].caption = 'They cross at (5, 5).';
  const warns = sanitizeBoardVisual(v).issues.filter((i) => i.severity === 'warn');
  assert.equal(warns.length, 1);
  assert.match(warns[0].message, /\(5, 5\)/);
});

ok('caption check: a point on a drawn line counts as on the board', () => {
  const v = JSON.parse(JSON.stringify(goodMain));
  v.steps[3].caption = 'Try (2, 3): it is on the line x = 2 too.';
  assert.equal(sanitizeBoardVisual(v).issues.filter((i) => i.severity === 'warn').length, 0);
});

ok('steps: repaired — unknown ids dropped, duplicates removed, missing steps synthesised', () => {
  const v = JSON.parse(JSON.stringify(goodMain));
  v.steps[1].show = ['vline', 'nope', 'A'];         // A already shown in step 1
  const r = sanitizeBoardVisual(v);
  assert.deepEqual(r.visual.steps[1].show, ['vline']);
  const none = sanitizeBoardVisual({ ...goodMain, steps: [] });
  assert.equal(none.visual.steps.length, 1);
  assert.equal(none.visual.steps[0].show.length, goodMain.elements.length);
});

// ─── canvas pictures: process + connectors ───────────────────────
const cycle = {
  dim: '2d', title: 'The water cycle', purpose: 'teach', representation: 'visual_diagram', why: 'A loop shows water is reused.',
  frame: { kind: 'canvas' },
  elements: [
    { id: 'sea', kind: 'box', at: [20, 45], text: 'Sea', sub: 'liquid water' },
    { id: 'cloud', kind: 'box', at: [50, 12], text: 'Clouds', sub: 'water droplets' },
    { id: 'rain', kind: 'box', at: [80, 45], text: 'Rain', sub: 'falls to land' },
    { id: 'c1', kind: 'connector', from: 'sea', to: 'cloud', label: 'evaporation', bend: 0.2 },
    { id: 'c2', kind: 'connector', from: 'cloud', to: 'rain', label: 'condensation' },
    { id: 'c3', kind: 'connector', from: 'rain', to: 'sea', label: 'runoff' },
    { id: 'ghost', kind: 'connector', from: 'sea', to: 'moon' },
    { id: 'lost', kind: 'box', at: [140, -20], text: 'Off the board' },
  ],
  steps: [
    { id: 's1', name: 'the sea', caption: 'Water starts in the sea.', show: ['sea', 'c1'] },
    { id: 's2', name: 'evaporation', caption: 'The sun warms it and it rises as vapour.', show: ['cloud'] },
    { id: 's3', name: 'rain', caption: 'It cools, falls as rain and flows back.', show: ['rain', 'c2', 'c3', 'lost'] },
  ],
};

ok('canvas: dangling connector dropped, off-canvas box pulled back, early connector moved', () => {
  const r = sanitizeBoardVisual(cycle);
  const ids = r.visual.elements.map((e) => e.id);
  assert.ok(!ids.includes('ghost'));
  assert.deepEqual(r.visual.elements.find((e) => e.id === 'lost').at, [100, 0]);
  // c1 joins sea (step 1) to cloud (step 2) — it cannot appear before step 2.
  assert.ok(!r.visual.steps[0].show.includes('c1'));
  assert.ok(r.visual.steps[1].show.includes('c1'));
});

ok('canvas: plane-only bricks rejected on a canvas', () => {
  const r = sanitizeBoardVisual({ ...cycle, elements: [...cycle.elements, { id: 'l', kind: 'line', through: [[0, 0], [1, 1]] }] });
  assert.ok(!r.visual.elements.some((e) => e.id === 'l'));
});

// ─── 3D ──────────────────────────────────────────────────────────
ok('3d: sanitized and fact-checked', () => {
  const r = sanitizeBoardVisual({
    dim: '3d', title: 'Volume of a cuboid', frame: { kind: 'space', x: [0, 5], y: [0, 5], z: [0, 5], axes: true },
    elements: [
      { id: 'box', kind: 'cuboid', center: [2, 1.5, 1], size: [4, 3, 2], label: '4 × 3 × 2', color: 'sky' },
      { id: 'wrongbox', kind: 'cuboid', center: [2, 1.5, 1], size: [4, 3, 2], label: '5 × 3 × 2' },
      { id: 'p', kind: 'point', at: [4, 3, 2], label: 'corner (4, 3, 2)' },
    ],
    steps: [{ id: 's1', name: 'the box', caption: 'A 4 by 3 by 2 box.', show: ['box', 'wrongbox', 'p'] }],
  }, '3d');
  assert.equal(r.visual.dim, '3d');
  const errs = r.issues.filter((i) => i.severity === 'error');
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /wrongbox/);
});

// ─── tutor alignment: brief, reveal matching, focus lookup ───────
const main = sanitizeBoardVisual(goodMain).visual;
const contrast = sanitizeBoardVisual({
  ...goodMain, title: 'Testing the rule "horizontal means x = c"', purpose: 'contrast',
  misconceptionId: 'horizontal-line-named-x', focus: 'A horizontal line has the equation x = c',
}).visual;
const visuals = { main, 'contrast:horizontal-line-named-x': contrast };

ok('reveal: the tutor\'s words find the right step', () => {
  const r = matchRevealTarget([{ key: 'main', visual: main }], 'the vertical line');
  assert.equal(r.stepIndex, 1);
  assert.equal(matchRevealTarget([{ key: 'main', visual: main }], 'where the two lines meet').stepIndex, 3);
  assert.equal(matchRevealTarget([{ key: 'main', visual: main }], 'step 3').stepIndex, 2);
});

ok('reveal: naming a brick moves to the step that shows it', () => {
  const r = matchRevealTarget([{ key: 'main', visual: main }], 'point E');
  assert.deepEqual(r.elementIds, ['e']);
  assert.equal(r.stepIndex, 2);
});

ok('reveal: unrelated words match nothing', () => {
  assert.equal(matchRevealTarget([{ key: 'main', visual: main }], 'photosynthesis in leaves'), null);
});

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
ok('focus: exact contrast key, spaced form, and free text all resolve', () => {
  assert.equal(findVisualForFocus(visuals, 'contrast:horizontal-line-named-x', slug).key, 'contrast:horizontal-line-named-x');
  assert.equal(findVisualForFocus(visuals, 'contrast: horizontal-line-named-x', slug).key, 'contrast:horizontal-line-named-x');
  assert.equal(findVisualForFocus(visuals, 'the idea that a horizontal line has the equation x = c', slug).key, 'contrast:horizontal-line-named-x');
  assert.equal(findVisualForFocus(visuals, 'photosynthesis', slug), null);
});

ok('brief: lists every step in order with reveal instructions', () => {
  const block = boardContextBlock({ visuals, misconceptions: [{ id: 'horizontal-line-named-x', belief: 'A horizontal line has the equation x = c' }] });
  for (const s of main.steps) assert.ok(block.includes(`"${s.name}"`), s.name);
  assert.match(block, /reveal_part\(\{parts:\["<step name>"\]\}\)/);
  assert.match(block, /update_diagram\(\{focus: "contrast:horizontal-line-named-x"\}\)/);
  assert.match(block, /3D VIEW: none/);
  assert.equal(boardContextBlock({ visuals: {} }), '');
});

ok('tool summary: step names for a picture drawn mid-lesson', () => {
  const s = toolSummary(main);
  assert.deepEqual(s.steps, ['three points', 'the vertical line', 'the horizontal line', 'where they meet']);
  assert.match(s.instruction, /reveal_part/);
});

ok('match score: equation tokens survive spacing', () => assert.equal(matchScore('x=2', 'the line x = 2'), 1));

// ─── storage: Firestore cannot hold arrays inside arrays ─────────
const { toFirestore, fromFirestore } = await import('../../src/curriculum/pregenStore.ts');
ok('firestore: pictures stored without nested arrays, and read back intact', () => {
  const record = {
    topic: 't', slug: 's', generatedAt: 'now',
    lessonData: { tagline: 'x', visual: main },          // a stray copy inside lessonData must not leak
    visuals: { main, 'contrast:horizontal-line-named-x': contrast },
  };
  const stored = JSON.parse(JSON.stringify(toFirestore(record)));
  const nested = (v) => Array.isArray(v) ? v.some((x) => Array.isArray(x) || nested(x)) : v && typeof v === 'object' ? Object.values(v).some(nested) : false;
  assert.equal(nested(stored), false, 'no array directly inside an array anywhere in the Firestore document');
  assert.equal(stored.lessonData.visual, undefined);
  const back = fromFirestore(stored);
  assert.deepEqual(back.visuals.main, main);
  assert.equal(back.visualsJson, undefined);
});

export { goodMain, cycle };

if (process.env.BOARD_VISUAL_SKIP_RENDER !== '1') {
  await import('./board-visual-render.mjs');
}
console.log(`\n${process.exitCode ? 'SOME CHECKS FAILED' : `ALL ${passed} board-visual CHECKS PASSED`}`);
