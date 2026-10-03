// Lesson-text generator: prompt contract, normalisation, and the draft → lint → critic → repair → withhold loop
// with a scripted model. Run: npx tsx tests/smoke/lesson-gen.mjs
import assert from 'node:assert/strict';
import { generateLessonText, normalizeLesson } from '../../src/curriculum/lessonGen.ts';
import { buildLessonPrompt, ladderPair } from '../../src/curriculum/lessonPrompt.ts';

let passed = 0;
const ok = async (name, fn) => { try { await fn(); passed++; console.log(`ok ${name}`); } catch (e) { console.error(`FAIL ${name}\n  ${e.message}`); process.exitCode = 1; } };
const codes = (l) => l.map((i) => i.code);

const ctx = {
  topic: 'Horizontal and vertical lines', grade: 'Grade 9', subjectLabel: 'Mathematics',
  keyFacts: ['Every point on a vertical line has the same x-value, so the line is written x = a.', 'Every point on a horizontal line has the same y-value, so the line is written y = b.', 'A vertical line is parallel to the y-axis and a horizontal line is parallel to the x-axis.'],
  workedExamples: ['The points (3, 1), (3, 5) and (3, -2) all lie on the line x = 3.'],
  misconceptions: [{ id: 'swap', belief: 'A horizontal line is called x = b' }],
  ladderItems: [{ level: 3, id: 'L3-A', prompt: 'A drone flies along the path through (4, 2) and (4, 9). Write the equation of its path.', lookFor: 'x = 4 because every x is 4' }],
  representationIdeas: [],
};
const good = () => ({
  tagline: 'See why some lines have an equation with only one letter.',
  overview: 'A vertical line keeps the same x-value and a horizontal line keeps the same y-value. That is why their equations have only one letter.',
  chalkNotes: {
    title: 'Horizontal and vertical lines', subtitle: 'One value stays the same', coreRuleOrFormula: 'Vertical line: x = a. Horizontal line: y = b.',
    bulletPoints: ['Every point on a vertical line has the same x-value, so the line is written x = a.', 'Every point on a horizontal line has the same y-value, so the line is written y = b.', 'A vertical line is parallel to the y-axis; a horizontal line is parallel to the x-axis.'],
    keyTakeaways: ['Look at which coordinate stays the same.', 'That coordinate names the line.'],
  },
  quiz: {
    question: 'A rope is stretched between the points (7, 1) and (7, 8) on a map grid. Which equation describes the rope?',
    options: ['x = 7', 'y = 7', 'x = 1', 'y = 8 and x = 7'], correctIndex: 0,
    explanation: 'Both points have x = 7 and only y changes, so the rope lies on x = 7.',
    hint: 'Which coordinate is the same at both ends?', lookFor: 'names x as the constant coordinate and writes x = 7',
    optionNotes: ['reads the constant x correctly', 'may be swapping which letter is fixed', 'may be picking a y-value as x', 'may be listing coordinates instead of one rule'],
  },
  suggestedQuestions: ['Why is a vertical line x = something and not y = something?', 'What would the line through (0, 5) and (3, 5) be called?', 'Can a line have both x and y in its equation?'],
  diagnostics: [{ purpose: 'prerequisite', question: 'Which number in (4, 2) is the x-coordinate?', listenFor: 'the first number' }, { purpose: 'misconception', question: 'A line goes straight up through (2, 1) and (2, 6). What would you call it?', listenFor: 'x = 2 versus y = 2' }],
  scene3d: { junk: 1 }, photoVisual: { caption: 'old' }, diagram: {},
});
function scripted(map) {
  const calls = []; const counts = {};
  const model = async ({ call, prompt }) => {
    calls.push({ call, prompt }); const n = counts[call] = (counts[call] ?? -1) + 1;
    const h = map[call]; if (h === undefined) throw new Error(`no scripted reply for ${call}`);
    const v = typeof h === 'function' ? h(prompt, n) : Array.isArray(h) ? h[Math.min(n, h.length - 1)] : h;
    if (v instanceof Error) throw v; return { data: v, model: 'scripted' };
  };
  return { model, calls };
}
// The blind solver answers by looking for the option that says x = 7 alone.
const solver = (q) => ({ working: '...', solvedIndex: q.options.findIndex((o) => o.trim() === 'x = 7'), alsoDefensible: [], ambiguity: '' });
const criticOk = { issues: [] };
const solveFrom = (prompt) => { const opts = [...prompt.matchAll(/^(\d)\. (.*)$/gm)].map((m) => m[2]); return solver({ options: opts }); };

await ok('prompt: contract lines are present (parallel form B, teach-before-test, child voice, tutor-only diagnostics)', () => {
  const p = buildLessonPrompt({ ctx });
  for (const s of ['TEACH BEFORE TEST', 'NEW situation', 'DIFFERENT problem', 'Never "wrong"', 'tutor-only', 'Do NOT output scene3d']) assert.ok(p.includes(s), s);
  assert.ok(p.includes(ctx.ladderItems[0].prompt), 'form A is shown so form B can differ');
  const withB = buildLessonPrompt({ ctx: { ...ctx, ladderItems: [...ctx.ladderItems, { level: 3, id: 'L3-B', prompt: 'A rope runs through (7, 1) and (7, 8).', lookFor: 'x = 7' }] } });
  assert.ok(withB.includes('authored parallel item'));
  assert.equal(ladderPair({ ...ctx }).formB, null);
});
await ok('normalize: legacy fields dropped, quiz shuffled + marked, subject comes from the course', () => {
  const l = normalizeLesson(good(), ctx, 's');
  assert.ok(!('scene3d' in l) && !('photoVisual' in l) && !('diagram' in l));
  assert.equal(l.quiz.order, 'shuffled'); assert.equal(l.subject, 'Mathematics');
  assert.equal(l.quiz.options[l.quiz.correctIndex], 'x = 7');
  assert.equal(l.quiz.optionNotes[l.quiz.correctIndex], 'reads the constant x correctly', 'notes travel with options');
  assert.equal(l.quiz.parallelOf, 'L3-A');
  assert.equal(normalizeLesson({ tagline: 'x' }, ctx, 's'), null);
});
await ok('loop: a sound lesson ships in one attempt with the critic run', async () => {
  const s = scripted({ 'lesson.text': [good()], 'critic.quiz.solve': (p) => solveFrom(p), 'critic.lesson': [criticOk] });
  const r = await generateLessonText(ctx, { model: s.model });
  assert.ok(r.lesson, JSON.stringify(r.quality)); assert.equal(r.attempts, 1); assert.equal(r.criticRan, true);
  assert.equal(r.lesson.quiz.options[r.lesson.quiz.correctIndex], 'x = 7');
});
await ok('loop: a suggested question with a tutor label is repaired using the lint message', async () => {
  const bad = good(); bad.suggestedQuestions[0] = 'Misconception Probe: why is a vertical line x = a?';
  const s = scripted({ 'lesson.text': [bad], 'lesson.text.repair': [good()], 'critic.quiz.solve': (p) => solveFrom(p), 'critic.lesson': [criticOk] });
  const r = await generateLessonText(ctx, { model: s.model });
  assert.ok(r.lesson); assert.equal(r.attempts, 2);
  assert.ok(/starts with a label/.test(s.calls.find((c) => c.call === 'lesson.text.repair').prompt));
});
await ok('loop: a quiz whose key the independent solver disagrees with is caught and repaired', async () => {
  const bad = good(); bad.quiz.correctIndex = 1; // key says "y = 7"
  const s = scripted({ 'lesson.text': [bad], 'lesson.text.repair': [good()], 'critic.quiz.solve': (p) => solveFrom(p), 'critic.lesson': [criticOk] });
  const r = await generateLessonText(ctx, { model: s.model });
  assert.ok(r.lesson && r.attempts === 2);
  assert.ok(/reviewer solved it independently/.test(s.calls.find((c) => c.call === 'lesson.text.repair').prompt));
});
await ok('loop: a quiz that repeats the application picture problem is an error; unresolved → withheld, not shipped', async () => {
  const bad = good(); bad.quiz.question = ctx.ladderItems[0].prompt;
  const s = scripted({ 'lesson.text': [bad], 'lesson.text.repair': [bad], 'critic.quiz.solve': (p) => solveFrom(p), 'critic.lesson': [criticOk] });
  const r = await generateLessonText(ctx, { model: s.model, maxAttempts: 2 });
  assert.equal(r.lesson, null); assert.equal(r.withheld, true); assert.ok(r.quarantined);
  assert.ok(codes(r.quality).includes('quiz.same-as-apply'), codes(r.quality).join());
});
await ok('loop: chalk notes that give away the quiz answer are an error', async () => {
  const bad = good(); bad.chalkNotes.bulletPoints[0] = 'A rope through (7, 1) and (7, 8) lies on x = 7.';
  const s = scripted({ 'lesson.text': [bad], 'lesson.text.repair': [bad], 'critic.quiz.solve': (p) => solveFrom(p), 'critic.lesson': [criticOk] });
  const r = await generateLessonText(ctx, { model: s.model, maxAttempts: 2 });
  assert.equal(r.withheld, true); assert.ok(codes(r.quality).some((c) => c.startsWith('leak') || c.startsWith('chalk') || c.startsWith('quiz')), codes(r.quality).join());
});
await ok('loop: critic unreachable is recorded, not silently passed', async () => {
  const s = scripted({ 'lesson.text': [good()], 'critic.quiz.solve': [new Error('503')] });
  const r = await generateLessonText(ctx, { model: s.model });
  assert.ok(r.lesson); assert.equal(r.criticRan, false);
});
await ok('loop: model failure returns an error, never a made-up lesson', async () => {
  const s = scripted({ 'lesson.text': [new Error('quota')] });
  const r = await generateLessonText(ctx, { model: s.model });
  assert.equal(r.lesson, null); assert.match(r.error, /quota/);
});
console.log(`\n${passed} lesson-gen checks passed`);
