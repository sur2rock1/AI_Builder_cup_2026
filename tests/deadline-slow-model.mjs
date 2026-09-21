// Slow diagnosis: the voice model must be answered at the deadline.
import { assessReasoningWithDeadline } from './.build/assessor.bundle.mjs'; import { input, ok } from './common.mjs';

// 1. Slow model: the voice model must be answered at the deadline, not after 5s.
globalThis.STUB = { calls: [], models: { 'gemini-3.6-flash': { delay: 5000 } } };
let t = Date.now(); let r = await assessReasoningWithDeadline(input, 600);
ok(r.timedOut && Date.now() - t < 900, `slow model answered at deadline (${Date.now() - t}ms, timedOut=${r.timedOut})`);
ok(/same method/i.test(r.assessment.tutorGuidance) && r.assessment.candidateMisconceptionIds.length === 0,
   'deadline reply is a transfer move and asserts NO misconception');
const full = await r.full;
ok(full.classification === 'misconception_behind_correct', 'full diagnosis still arrives afterwards');
ok(full.candidateMisconceptionIds.join() === 'finding-hypotenuse::m1', 'out-of-vocabulary id "bogus::id" is dropped');
