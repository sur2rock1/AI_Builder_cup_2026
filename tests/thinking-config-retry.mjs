import { assessReasoningWithDeadline } from './.build/assessor.bundle.mjs'; import { input, ok } from './common.mjs';
// Model rejects the low-thinking setting: retried without it, and remembered.
globalThis.STUB = { calls: [], models: { 'gemini-3.6-flash': { delay: 50, rejectThinking: true } } };
const r1 = await assessReasoningWithDeadline(input, 2500);
const c1 = globalThis.STUB.calls.map(c => `${c.model}${c.thinking ? '+think' : ''}`); globalThis.STUB.calls = [];
await assessReasoningWithDeadline(input, 2500);
const c2 = globalThis.STUB.calls.map(c => `${c.model}${c.thinking ? '+think' : ''}`);
ok(c1.includes('gemini-3.6-flash+think') && c1.includes('gemini-3.6-flash'), `rejected thinking → retried without: [${c1}]`);
ok(r1.assessment.classification === 'misconception_behind_correct', 'and still produced a real diagnosis');
ok(c2.join() === 'gemini-3.6-flash', `next call skips the rejected setting: [${c2}]`);
