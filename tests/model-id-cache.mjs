import { assessReasoningWithDeadline } from './.build/assessor.bundle.mjs'; import { input, ok } from './common.mjs';
// Wrong first model ID: pay for it once, never again.
globalThis.STUB = { calls: [], models: { 'gemini-3.1-flash-lite': { delay: 50 } } };
await assessReasoningWithDeadline(input, 2500);
const first = globalThis.STUB.calls.map(c => c.model); globalThis.STUB.calls = [];
let t = Date.now(); const r = await assessReasoningWithDeadline(input, 2500);
const second = globalThis.STUB.calls.map(c => c.model);
ok(first.join() === 'gemini-3.6-flash,gemini-3.1-flash-lite', `1st answer tries the bad ID once: [${first}]`);
ok(second.join() === 'gemini-3.1-flash-lite', `2nd answer goes straight to the working model: [${second}]`);
ok(!r.timedOut && Date.now() - t < 300, `fast model answers in budget (${Date.now() - t}ms)`);
