// Regression checks for the repeat / tone problems seen in live guided sessions (2026-10-14).
import { beatInstruction, lineInstruction, guidedBoardBlock } from '../../src/guided/prompt';
import { ALL_GUIDED_SCRIPTS } from '../../src/guided/registry';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fail++; };
const s = ALL_GUIDED_SCRIPTS.find((x) => x.beats.some((b) => b.lines?.length))!;
const bi = s.beats.findIndex((b) => b.lines?.length);
const beat = beatInstruction(s, bi);
ok(!/one short sentence to set it up/i.test(beat) && /Do NOT say anything yet/.test(beat), 'a new beat opens with next_line, not a spoken set-up sentence (that doubled the first line)');
ok(/do not say it aloud/i.test(beat), 'the beat summary is background only');
const line = lineInstruction(s.beats[bi].lines![0], false, 3);
ok(/almost word for word/.test(line) && /same calm, even, warm voice/.test(line), 'each line is spoken from the script in one steady voice');
ok(/VOICE: keep exactly the same/.test(guidedBoardBlock(s)), 'system block states the voice rule');
process.exit(fail ? 1 : 0);
