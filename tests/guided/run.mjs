// Guided mode checks — offline, no model, no network.
//   node tests/guided/run.mjs
//
// 1. the mode switch resolves correctly (and defaults to the standard tutor)
// 2. every guided script passes the script checks against the STORED pictures
// 3. the board only grows, skipping ahead leaves no holes, slots take answers
// 4. the server-side session walks a lesson and finishes
// 5. guided mode swaps only the board block and the board tools; standard is untouched
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const out = path.join(root, 'tests', '.build', 'guided.bundle.mjs');
const entry = path.join(root, 'tests', '.build', 'guided.entry.ts');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(entry, `
export * from '../../src/guided/mode';
export * from '../../src/guided/board';
export * from '../../src/guided/validate';
export * from '../../src/guided/registry';
export * from '../../src/guided/session';
export * from '../../src/guided/prompt';
export * from '../../src/guided/tools';
export * from '../../src/guided/pace';
export * from '../../src/utils/transcriptLog';
export { composeSystemInstruction } from '../../src/persona/compose';
export { ALL_TOOLS } from '../../src/live/liveConfig';
`);
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'warning', outfile: out });
const G = await import(out + '?t=' + Date.now());

let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failed++; };

// ── 1. mode switch ───────────────────────────────────────────────
ok(G.resolveTutorMode(undefined, undefined) === 'standard', 'no request, no default → standard');
ok(G.resolveTutorMode(undefined, 'guided') === 'guided', 'server default guided is used when the session asks for nothing');
ok(G.resolveTutorMode('standard', 'guided') === 'standard', "the session's own request beats the server default");
ok(G.resolveTutorMode('guided', 'standard') === 'guided', 'session can opt in when the default is standard');
ok(G.resolveTutorMode('nonsense', 'alsobad') === 'standard', 'invalid values fall back to standard');
ok(G.resolveTutorMode('GUIDED', undefined) === 'standard', 'values are exact (no accidental matches)');

// ── 2. scripts vs stored pictures ────────────────────────────────
const preDir = path.join(root, 'data', 'pregenerated');
const records = new Map();
for (const f of fs.readdirSync(preDir)) {
  try { const r = JSON.parse(fs.readFileSync(path.join(preDir, f), 'utf8')); if (r.conceptId) records.set(r.conceptId, r); } catch {}
}
ok(G.ALL_GUIDED_SCRIPTS.length === 4, `registry holds ${G.ALL_GUIDED_SCRIPTS.length} scripts (expected 4)`);
for (const s of G.ALL_GUIDED_SCRIPTS) {
  const rec = records.get(s.conceptId);
  ok(!!rec, `stored record exists for ${s.title}`);
  const issues = G.validateScript(s, { expectedConceptId: s.conceptId, pictures: rec?.visuals ?? {} });
  ok(issues.errors.length === 0, `${s.title}: no script errors${issues.errors.length ? ' → ' + issues.errors.join('; ') : ''}`);
  if (issues.warnings.length) console.log('      warnings:\n        - ' + issues.warnings.join('\n        - '));
  ok(G.getGuidedScript(s.conceptId) === s, `${s.title}: registry lookup works`);
}
ok(G.getGuidedScript('no-such-concept') === null, 'unknown concept has no script');
ok(G.getGuidedScript(undefined) === null, 'missing concept id has no script');

// The checker must actually catch problems (otherwise "no errors" means nothing).
const good = G.ALL_GUIDED_SCRIPTS[0];
const clone = () => JSON.parse(JSON.stringify(good));
{ const s = clone(); s.beats[1].board.push({ type: 'picture', ref: 'main', step: 'nope' });
  const r = G.validateScript(s, { pictures: records.get(s.conceptId).visuals });
  ok(r.errors.some((e) => /no step/.test(e)), 'checker catches a picture step that does not exist'); }
{ const s = clone(); s.beats[1].board.push({ type: 'picture', ref: 'ghost' });
  const r = G.validateScript(s, { pictures: records.get(s.conceptId).visuals });
  ok(r.errors.some((e) => /does not exist/.test(e)), 'checker catches a picture that does not exist'); }
{ const s = clone(); s.beats[1].ask.slot = 'missing';
  ok(G.validateScript(s).errors.some((e) => /not a slot/.test(e)), 'checker catches an ask pointing at a missing slot'); }
{ const s = clone(); s.beats[0].kind = 'rule';
  ok(G.validateScript(s).errors.some((e) => /first beat/.test(e)), 'checker requires the first beat to be orient'); }
{ const s = clone(); s.beats = s.beats.slice(0, 3);
  ok(G.validateScript(s).errors.some((e) => /needs 6/.test(e)), 'checker requires a sensible number of beats'); }
{ const s = clone(); s.beats.forEach((b) => delete b.ask);
  ok(G.validateScript(s).errors.some((e) => /asks the learner/.test(e)), 'checker requires at least one question'); }
{ const s = clone(); s.beats[2].id = s.beats[1].id;
  ok(G.validateScript(s).errors.some((e) => /duplicated/.test(e)), 'checker catches duplicate beat ids'); }
{ const s = clone(); s.conceptId = 'other';
  ok(G.validateScript(s, { expectedConceptId: good.conceptId }).errors.some((e) => /does not match/.test(e)), 'checker catches a script filed under the wrong concept'); }

// ── 3. the board only grows ──────────────────────────────────────
{
  const s = good;
  let b = { beatIndex: -1, items: [], filled: {} };
  let prevCount = 0, grew = true;
  for (let i = 0; i < s.beats.length; i++) {
    b = G.startBeat(b, s);
    if (b.items.length <= prevCount) grew = false;
    prevCount = b.items.length;
  }
  ok(grew, 'every beat adds something to the board');
  ok(b.beatIndex === s.beats.length - 1, 'board reaches the last beat');
  ok(b.items.length === s.beats.reduce((n, x) => n + x.board.length, 0), 'board holds exactly the items the script wrote');
  ok(new Set(b.items.map((p) => p.key)).size === b.items.length, 'every board item has a unique key');
  const after = G.startBeat(b, s);
  ok(after === b, 'starting past the end changes nothing');

  const skip = G.startBeat({ beatIndex: -1, items: [], filled: {} }, s, s.beats[3].id);
  ok(skip.beatIndex === 3 && skip.items.length === s.beats.slice(0, 4).reduce((n, x) => n + x.board.length, 0), 'skipping ahead writes the skipped beats too (no holes)');
  const back = G.startBeat(skip, s, s.beats[0].id);
  ok(back.beatIndex === 4, 'asking for an earlier beat just continues in order');
  const unknown = G.startBeat({ beatIndex: -1, items: [], filled: {} }, s, 'zzz');
  ok(unknown.beatIndex === 0, 'an unknown beat id just continues in order');

  const slotBeat = s.beats.findIndex((x) => x.board.some((i) => i.type === 'slot'));
  let c = G.startBeat({ beatIndex: -1, items: [], filled: {} }, s, s.beats[slotBeat].id);
  const slotId = s.beats[slotBeat].board.find((i) => i.type === 'slot').id;
  const filled = G.fillSlot(c, slotId, '  the   left one ');
  ok(filled.filled[slotId] === 'the left one', 'fill_slot stores the answer, whitespace tidied');
  ok(G.fillSlot(c, 'not-on-board', 'x') === c, 'fill_slot ignores a slot that is not on the board');
  ok(G.fillSlot(c, slotId, '   ') === c, 'fill_slot ignores an empty answer');
  ok(G.fillSlot(c, slotId, 'a'.repeat(500)).filled[slotId].length === G.MAX_SLOT_ANSWER_CHARS, 'fill_slot caps a very long answer');
  ok(G.currentPicture(c)?.ref !== undefined, 'the current picture is the last picture written');
}

// ── 4. server-side session ───────────────────────────────────────
for (const s of G.ALL_GUIDED_SCRIPTS) {
  const sess = new G.GuidedSession(s);
  let n = 0, last;
  let lines = 0;
  while (true) {
    last = sess.advance();
    if (last.refused) { // a line-by-line beat: write its lines first (answering any question)
      const r = sess.handle('next_line', {}, { lineWritten: false });
      if (r.response.result === 'written') lines++;
      if (++n > 400) break;
      continue;
    }
    if (last.finished) break; n++; if (n > 400) break;
  }
  const withLines = s.beats.reduce((k, b) => k + (b.lines?.length ?? 0), 0);
  ok(lines === withLines, `${s.title}: every line of every line-by-line beat was written (${lines}/${withLines})`);
  n = sess.state.beatIndex + 1;
  ok(n === s.beats.length, `${s.title}: session walks ${n} beats then finishes`);
  ok(/finished/.test(last.instruction), `${s.title}: the end tells the tutor the lesson is finished`);
}
{
  const sess = new G.GuidedSession(good);
  const first = sess.advance();
  ok(first.beatId === good.beats[0].id && /BEAT 1 of/.test(first.instruction), 'first advance starts beat 1');
  const second = sess.advance();
  ok(/THEN ASK/.test(second.instruction) && /fill_slot/.test(second.instruction), 'a beat with a question tells the tutor to ask, then fill the slot');
  ok(sess.fill(good.beats[1].ask.slot, 'left').ok === true, 'session fills a slot that is on the board');
  ok(sess.fill('zzz', 'x').ok === false, 'session refuses a slot that is not on the board');
}

// ── pace ─────────────────────────────────────────────────────────
{
  ok(G.resolvePace('slow') === 'slow' && G.resolvePace('bogus') === 'steady' && G.resolvePace(null) === 'steady', 'pace: valid values kept, anything else is steady');
  const sess = new G.GuidedSession(good, 'slow');
  ok(/PACE: SLOW/.test(sess.advance().instruction), 'pace: slow session tells the tutor to go slowly');
  sess.setPace('quick');
  ok(/PACE: QUICK/.test(sess.advance().instruction), 'pace: a change mid-lesson applies from the next beat');
  ok(/PACE: STEADY/.test(new G.GuidedSession(good).advance().instruction), 'pace: default is steady');
  ok(G.paceRevealMs('slow') > G.paceRevealMs('steady') && G.paceRevealMs('steady') > G.paceRevealMs('quick'), 'pace: slow reveals slower than quick');
}

// ── line by line: say it, write it; answers held back; nothing skipped ─────
const lineScript = G.ALL_GUIDED_SCRIPTS.find((x) => x.beats.some((b) => b.lines));
ok(!!lineScript, 'at least one lesson has a line-by-line beat');
{
  const bi = lineScript.beats.findIndex((b) => b.lines);
  const beat = lineScript.beats[bi];
  const sess = new G.GuidedSession(lineScript);
  sess.handle('advance_beat', { beat_id: beat.id });
  ok(sess.state.beatIndex === bi, 'jumped to the line-by-line beat');
  const refused = sess.handle('advance_beat', {});
  ok(refused.response.result === 'not_yet' && sess.state.beatIndex === bi, 'advance_beat is refused while lines are unwritten');
  const before = sess.state.items.length;
  const r1 = sess.handle('next_line', {}, { lineWritten: false });
  ok(r1.response.result === 'written' && sess.state.items.length === before + 1, 'next_line writes exactly one line');
  ok(/SAY IT/.test(r1.response.instruction) && r1.response.instruction.includes(beat.lines[0].say), 'next_line tells the tutor to say that line');
  const budget = { lineWritten: false };
  sess.handle('next_line', {}, budget);
  const r3 = sess.handle('next_line', {}, budget);
  ok(r3.response.result === 'not_yet', 'a second next_line in the same model message is refused (no heaps of lines)');
  // walk to the first asked line
  const askAt = beat.lines.findIndex((l) => l.ask);
  while (sess.state.lineIndex < askAt) sess.handle('next_line', {}, { lineWritten: false });
  const n0 = sess.state.items.length;
  const asked = sess.handle('next_line', {}, { lineWritten: false });
  const answerText = beat.lines[askAt].text;
  ok(asked.response.result === 'ask' && sess.state.items.length === n0, 'a line with a question is ASKED first - nothing written');
  ok(!sess.state.items.some((p) => p.item.text === answerText), 'the answer is not on the board while the question is open');
  ok(sess.handle('advance_beat', {}).response.result === 'not_yet', 'cannot move on while the question is open');
  // side question in the middle of it
  sess.handle('write_aside', { text: 'gradient = rise ÷ run', question: 'why divide?' }, { lineWritten: false });
  const last = sess.state.items[sess.state.items.length - 1];
  ok(last.item.type === 'aside' && last.item.question === 'why divide?', 'write_aside puts the side answer on the board with the question');
  const resume = sess.handle('resume_lesson', {});
  ok(resume.response.instruction.includes(beat.lines[askAt].ask.prompt) && /still unanswered/.test(resume.response.instruction), 'resume_lesson returns to the open question, not the start of the beat');
  const ans = sess.handle('next_line', {}, { lineWritten: false });
  ok(ans.response.result === 'written' && sess.state.items.some((p) => p.item.text === answerText), 'after the answer, next_line writes it');
  ok(/answer is now WRITTEN/.test(ans.response.instruction), 'and tells the tutor to confirm the learner\'s answer');
  const resume2 = sess.handle('resume_lesson', {});
  ok(resume2.response.instruction.includes(answerText), 'resume_lesson names the last line written');
}
{
  // the checker catches the original gradient slip: "4" with no line working it out
  const s = JSON.parse(JSON.stringify(lineScript));
  const b = s.beats.find((x) => x.lines);
  b.lines = b.lines.filter((l) => l.id !== 'rise');
  const r = G.validateScript(s);
  ok(r.errors.some((e) => /not written on any line above/.test(e) && /\b4\b/.test(e)), 'checker catches a number that appears from nowhere (missing step)');
  ok(G.untracedNumbers('rise = 5 − 1 = 4', new Set(['5', '1'])).length === 0, 'traceability: the final result may be new');
  ok(G.untracedNumbers('gradient = 4 ÷ 0', new Set(['0'])).join() === '4', 'traceability: numbers being used must be above');
  ok(G.untracedNumbers('Two points: (2, 1) and (2, 5)', new Set()).length === 0, 'traceability: a line with no "=" introduces data');
  const s2 = JSON.parse(JSON.stringify(lineScript));
  const b2 = s2.beats.find((x) => x.lines);
  b2.lines[0].say = '';
  ok(G.validateScript(s2).errors.some((e) => /must say every line/.test(e)), 'checker requires something to say for every line');
}
{
  // a new beat's block items are revealed one by one; lines and asides are not held
  let a = G.resetBoard();
  let b = G.startBeat(a, good);
  ok(G.itemsToStagger(a, b).length === Math.max(0, good.beats[0].board.filter((x) => true).length - 1), 'stagger: all but the first new block item wait their turn');
  const c = G.addAside(b, 'x', 'q');
  ok(G.itemsToStagger(b, c).length === 0, 'stagger: a side note is shown at once');
}
{
  const { TranscriptLog } = G;
  const lines = [];
  const t = new TranscriptLog((l) => lines.push(l));
  t.feed({ serverContent: { outputTranscription: { text: 'Hello ' } } });
  t.feed({ serverContent: { outputTranscription: { text: 'there.' } } });
  t.feed({ toolCall: { functionCalls: [{ name: 'advance_beat', args: { beat_id: 'b2' } }] } });
  t.feed({ serverContent: { inputTranscription: { text: 'number two' }, turnComplete: true } });
  ok(lines[0] === '[transcript] tutor: Hello there.' && /tool: advance_beat b2/.test(lines[1]) && lines[2] === '[transcript] child: number two', 'transcript log: speech and tool calls are logged in order');
}

// ── 5. guided swaps only the board block and board tools ─────────
{
  const base = { ageBand: '8-12', subjectMode: 'well_structured', channel: 'voice', topic: 'x' };
  const std = G.composeSystemInstruction(base);
  const gui = G.composeSystemInstruction({ ...base, boardBlockOverride: G.guidedBoardBlock(good) });
  ok(std.includes('THE BOARD (voice channel)') && !std.includes('THE BOARD (guided lesson)'), 'standard prompt is the standard board block');
  ok(gui.includes('THE BOARD (guided lesson)') && !gui.includes('THE BOARD (voice channel)'), 'guided prompt swaps in the guided board block');
  ok(std.replace(/THE BOARD \(voice channel\)[\s\S]*?say the idea in your own words and move on\./, '') .length > 1000, 'standard prompt otherwise intact');
  const names = G.guidedToolDeclarations().map((t) => t.name).sort();
  ok(JSON.stringify(names) === JSON.stringify(['advance_beat', 'assess_child_reasoning', 'fill_slot', 'next_line', 'record_confusion_signal', 'resume_lesson', 'write_aside']), `guided tools: ${names.join(', ')}`);
  ok(!names.includes('update_chalkboard_notes') && !names.includes('update_diagram'), 'guided tools do not include the standard board tools');
  ok(G.ALL_TOOLS.some((t) => t.name === 'update_chalkboard_notes') && !G.ALL_TOOLS.some((t) => t.name === 'advance_beat'), 'standard tool list is unchanged by guided mode');
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall guided checks passed');
process.exit(failed ? 1 : 0);
