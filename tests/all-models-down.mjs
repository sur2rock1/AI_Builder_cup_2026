import { assessReasoningWithDeadline } from './.build/assessor.bundle.mjs'; import { input, ok } from './common.mjs';
// Every model dead: must still answer fast, conservatively, and never invent a misconception.
globalThis.STUB = { calls: [], models: {} };
const t = Date.now(); const r = await assessReasoningWithDeadline(input, 2500);
ok(Date.now() - t < 300, `all models down → answered in ${Date.now() - t}ms`);
ok(r.assessment.candidateMisconceptionIds.length === 0 && /do not give the answer/i.test(r.assessment.tutorGuidance),
   'fallback asserts no misconception and does not reveal the answer');
