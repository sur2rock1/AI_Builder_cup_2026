// The guided-lesson generator loop, offline, with a scripted fake model.
//   node tests/guided/generate.mjs
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const out = path.join(root, 'tests', '.build', 'guided-generate.bundle.mjs');
await build({ entryPoints: [path.join(root, 'src', 'guided', 'generate.ts')], bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'warning', outfile: out });
const G = await import(out + '?t=' + Date.now());

let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failed++; };

// real material for one concept
const curricula = JSON.parse(fs.readFileSync(path.join(root, 'data', 'curricula.json'), 'utf8'));
const course = curricula.find((c) => c.id === 'igcse--g8--biology');
const concept = course.concepts.find((c) => /diffusion/.test(c.id));
const record = JSON.parse(fs.readFileSync(path.join(root, 'data', 'pregenerated', `${concept.id}.json`), 'utf8'));
const { source, pictures, pictureRefs } = G.sourceFromCurriculum(concept, course, record);
ok(source.keyFacts.length > 0 && source.workedExamples.length > 0 && source.misconceptions.length > 0, 'source: facts, worked examples and misconceptions are taken from the curriculum');
ok(pictures.length > 0 && pictures.every((p) => p.steps.length > 0), `source: ${pictures.length} stored pictures with their steps`);
ok(pictures.some((p) => p.steps.some((s) => s.shows.length > 0)), 'source: each step lists what it shows (so answers in pictures can be checked)');
const prompt = G.buildGuidedPrompt(source, pictures);
ok(prompt.includes('NEVER SKIP A STEP') && prompt.includes('"main"') && prompt.includes(source.keyFacts[0].slice(0, 40)), 'prompt carries the method, the picture keys and the key facts');

// a lesson that meets every rule
const pic = pictures[0];
const line = (id, text, say, extra = {}) => ({ id, text, say, style: 'work', ...extra });
const ask = (prompt) => ({ prompt, lookFor: 'the reason', onMiss: 'a hint' });
const goodLesson = {
  version: 1, conceptId: concept.id, title: 'Osmosis',
  beats: [
    { id: 'b1', kind: 'orient', say: 'Set up.', board: [{ type: 'heading', text: 'Moving water' }], lines: [line('o1', 'Water moves in and out of cells', 'Today: how water moves.', { style: 'point' })] },
    { id: 'b2', kind: 'define', say: 'Define.', board: [{ type: 'picture', ref: pic.key, step: pic.steps[0].id }], lines: [line('d1', 'osmosis: water moves through a membrane', 'Osmosis is...', { style: 'rule' }), line('d2', 'dilute → concentrated', 'Water goes towards the concentrated side.', { ask: ask('Which way does water move?') })] },
    { id: 'b3', kind: 'show', say: 'Work it.', board: [], lines: [line('w1', 'start mass 2.50 g, end mass 2.15 g', 'Given.'), line('w2', 'change = 2.15 − 2.50 = −0.35 g', 'Subtract.'), line('f1', '% change = change ÷ start mass × 100', 'The formula.', { style: 'rule' }), line('w3', '% change = (−0.35 ÷ 2.50) × 100', 'Formula with numbers.'), line('w4', '= −14.0%', 'So it lost 14 percent.', { ask: ask('What is the percentage change?') })] },
    { id: 'b4', kind: 'contrast', say: 'Myth.', board: [], lines: [line('c1', 'Myth: sugar crosses the membrane', 'Some think sugar moves.', { style: 'point' }), line('c2', 'only water passes - sugar is too big', 'Only water.', { style: 'point', ask: ask('Why can sugar not pass?') })] },
    { id: 'b5', kind: 'rule', say: 'Rule.', board: [], lines: [line('r1', 'water moves to the more concentrated side', 'The rule.', { style: 'rule' })] },
    { id: 'b6', kind: 'apply', say: 'You try.', board: [], lines: [line('a1', 'cell in pure water → water moves in', 'Your turn.', { style: 'point', ask: ask('A cell is in pure water. Which way does water move?') })] },
    { id: 'b7', kind: 'check', say: 'Check.', board: [], lines: [line('k1', 'plant cell: wall stops it bursting', 'Check.', { style: 'point', ask: ask('Why does a plant cell not burst?') })] },
  ],
};
ok(G.normalizeScript(goodLesson, concept.id, 'x') !== null, 'the sample lesson normalises');

const badLesson = JSON.parse(JSON.stringify(goodLesson));
badLesson.beats[2].lines.splice(1, 1); // drop the "change" line: −0.35 now appears from nowhere

function fakeModel(replies) {
  const calls = [];
  const fn = async (c) => { calls.push(c); const r = replies.shift(); if (r instanceof Error) throw r; return { data: typeof r === 'function' ? r(c) : r, model: 'fake' }; };
  fn.calls = calls;
  return fn;
}

{ // A: missing step → repaired → critic passes → shipped
  const m = fakeModel([badLesson, goodLesson, { issues: [] }]);
  const r = await G.generateGuidedLesson(source, pictures, pictureRefs, m, {});
  ok(r.script && !r.withheld, 'A: a lesson that passes after one repair is shipped');
  ok(r.attempts === 2 && r.criticCalls === 1, `A: 1 draft + 1 repair, then the critic (${r.attempts}/${r.criticCalls})`);
  ok(m.calls[1].call === 'guided.repair' && /0\.35/.test(m.calls[1].prompt) && /not written on any line above/.test(m.calls[1].prompt), 'A: the repair prompt names the missing step');
  ok(m.calls[2].role === 'review', 'A: the critic is a separate review call');
}
{ // B: critic keeps finding a real error → withheld (never shipped)
  const crit = { issues: [{ severity: 'error', where: 'b3/w4', problem: 'percentage is wrong' }] };
  const m = fakeModel([goodLesson, crit, goodLesson, crit, goodLesson, crit]);
  const r = await G.generateGuidedLesson(source, pictures, pictureRefs, m, { maxAttempts: 3 });
  ok(r.withheld && r.script === null && r.quarantined, 'B: unresolved critic errors → withheld, draft kept for review');
  ok(r.errors.some((e) => /percentage is wrong/.test(e)), 'B: the reason is reported');
  ok(m.calls.filter((c) => c.call === 'guided.repair').every((c) => /percentage is wrong/.test(c.prompt)), 'B: critic errors are fed into the repair');
}
{ // C: critic cannot run → withheld, not shipped unchecked
  const m = fakeModel([goodLesson, new Error('timeout')]);
  const r = await G.generateGuidedLesson(source, pictures, pictureRefs, m, {});
  ok(r.withheld && /critic could not run/.test(r.errors[0] || ''), 'C: a failed critic means withheld, not shipped');
}
{ // D: lesson not line by line / too few questions / bad picture → errors
  const flat = JSON.parse(JSON.stringify(goodLesson));
  flat.beats[2].board.push({ type: 'point', text: 'all working in one block' });
  flat.beats.forEach((b) => b.lines.forEach((l) => delete l.ask));
  flat.beats[1].board[0].step = 'nope';
  const m = fakeModel([flat, flat, flat]);
  const r = await G.generateGuidedLesson(source, pictures, pictureRefs, m, { maxAttempts: 3 });
  ok(r.withheld, 'D: a lesson that keeps breaking the rules is withheld');
  ok(r.errors.some((e) => /only a heading and a picture/.test(e)) && r.errors.some((e) => /asked lines|asks the learner/.test(e)) && r.errors.some((e) => /no step "nope"/.test(e)),
    'D: block text, too few questions and a missing picture step are all caught');
}
{ // E: garbage answer, then a good one
  const m = fakeModel(['not json', goodLesson, { issues: [{ severity: 'warning', where: 'b1/o1', problem: 'a bit dull' }] }]);
  const r = await G.generateGuidedLesson(source, pictures, pictureRefs, m, {});
  ok(r.script && r.warnings.some((w) => /a bit dull/.test(w)), 'E: recovers from a malformed answer; critic warnings are kept, not blocking');
}
{ // F: on the last draft, the number heuristic alone does not withhold - the critic decides
  const m = fakeModel([badLesson, { issues: [] }]);
  const r = await G.generateGuidedLesson(source, pictures, pictureRefs, m, { maxAttempts: 1 });
  ok(r.script && r.warnings.some((w) => /^check: .*step is missing/.test(w)), 'F: last draft with only a "number from nowhere" flag goes to the critic and ships with a warning');
}
{ // the prompt explains asked lines (the answer is written after the learner replies)
  ok(/never the question, never "ask: \.\.\."/.test(prompt) && /must NOT state the answer/.test(prompt), 'prompt spells out how an asked line works');
  ok(/do not report that/.test(G.buildCriticPrompt(source, pictures, goodLesson)), 'critic is told how asked lines run (no false alarms)');
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall generator checks passed');
process.exit(failed ? 1 : 0);
