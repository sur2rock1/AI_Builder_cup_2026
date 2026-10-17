// "Quiz me": the learner can skip to the practice questions, and a missed question sends the tutor back to teach a skipped part.
//   npx tsx tests/guided/skip-practice.mjs
import fs from 'node:fs';
const { GuidedSession } = await import('../../src/guided/session.ts');
const script = JSON.parse(fs.readFileSync('src/guided/scripts/cambridge-lower-secondary--g4--mathematics--number--positive-and-negative-numbers.json', 'utf8'));

let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failed++; };
const s = new GuidedSession(script);
const call = (name, args = {}) => s.handle(name, args, { lineWritten: false });
const beatId = () => script.beats[s.state.beatIndex]?.id;
const uniqueKeys = () => new Set(s.state.items.map((p) => p.key)).size === s.state.items.length;

call('advance_beat'); call('next_line');                       // b1, first line written
ok(beatId() === 'b1', 'lesson starts at b1');
const r1 = call('skip_to_practice');
ok(r1.response.result === 'ok' && beatId() === 'b7', `"quiz me" in the opening beat jumps to the first practice beat (now at ${beatId()})`);
ok(/b1 .*b2 .*b3 .*b4 .*b5 .*b6/.test(r1.response.instruction), 'the tutor is told which parts were skipped');
ok(!s.state.items.some((p) => ['b2', 'b3', 'b4', 'b5', 'b6'].includes(p.beatId)), 'skipped parts are not dumped onto the board');
ok(/never|teach_skipped/i.test(r1.response.instruction), 'the tutor is told what to do if a practice question is missed');
call('next_line');                                               // l19 (point)
const ask = call('next_line');                                   // l20 asks
ok(ask.response.result === 'ask' && s.state.pendingAsk === 'l20', 'the first practice question is asked and waits for the learner');
ok(call('skip_to_practice').response.result === 'not_available', 'asking again while already practising does not jump further');

// The learner misses it: go back and teach the friend's-idea part.
const t = call('teach_skipped', { beat_id: 'b4' });
ok(t.response.result === 'ok' && beatId() === 'b4' && s.state.lineIndex === 0, 'teach_skipped goes back to the chosen part (b4)');
ok(call('advance_beat').response.result === 'not_yet', 'cannot leave the re-taught part before its lines are written');
for (let i = 0; i < 3; i++) call('next_line');
const back = call('advance_beat');
ok(beatId() === 'b7' && s.state.pendingAsk === 'l20', 'after the re-taught part, advance_beat returns to the missed practice question');
ok(/ask it again/i.test(back.response.instruction), 'the tutor is told to ask that question again');
const w = call('next_line');
ok(w.response.result === 'written' && s.state.lineIndex === 2, 'after the second try the answer is written and practice continues');
ok(uniqueKeys(), 'board items keep unique keys throughout');
// b1 was cut short at line 1: it can be taught from where it stopped.
const t2 = call('teach_skipped', { beat_id: 'b1' });
ok(beatId() === 'b1' && s.state.lineIndex === 1, 'a beat cut short is re-taught from the line where it stopped');
ok(uniqueKeys(), 'still unique keys after re-teaching a partly written beat');
console.log(failed ? `\n${failed} check(s) failed` : '\nall skip-to-practice checks passed');
process.exit(failed ? 1 : 0);
