// Photo pipeline: lesson-specific plan, vision verification, fail-closed. Run: npx tsx tests/smoke/photo-gen.mjs
import assert from 'node:assert/strict';
import { generateVerifiedPhoto, fallbackPhotoPlan, planPhoto } from '../../src/curriculum/photoGen.ts';
let passed = 0;
const ok = async (n, f) => { try { await f(); passed++; console.log(`ok ${n}`); } catch (e) { console.error(`FAIL ${n}\n  ${e.message}`); process.exitCode = 1; } };
const ctx = { topic: 'Horizontal and vertical lines', grade: 'Grade 9', subjectLabel: 'Mathematics', keyFacts: ['Every point on a vertical line has the same x-value.'], workedExamples: [], misconceptions: [], ladderItems: [], representationIdeas: [] };
const scripted = (map) => { const calls = []; const n = {}; return { calls, model: async ({ call, prompt }) => { calls.push({ call, prompt }); const i = n[call] = (n[call] ?? -1) + 1; const h = map[call]; if (!h) throw new Error('no ' + call); const v = Array.isArray(h) ? h[Math.min(i, h.length - 1)] : h; if (v instanceof Error) throw v; return { data: v, model: 's' }; } }; };
const img = async () => ({ mimeType: 'image/png', data: 'AAAA' });
const plan = { intent: 'A fence post line at a fixed distance from a wall', prompt: 'A row of fence posts along a wall, natural light. Do not put any words anywhere.' };
const pass = { showsConcept: true, caption: 'A row of fence posts along a wall.', issues: [] };

await ok('plan: lesson-specific, from a key fact — never the bare topic label; text-free instruction always present', async () => {
  const f = fallbackPhotoPlan(ctx);
  assert.ok(f.prompt.includes('same x-value') && /Do not put any words/.test(f.prompt));
  const s = scripted({ 'photo.plan': [{ intent: 'x', prompt: 'A fence' }] });
  const p = await planPhoto(s.model, ctx);
  assert.ok(/Do not put any words/.test(p.prompt));
  const s2 = scripted({ 'photo.plan': [new Error('down')] });
  assert.equal((await planPhoto(s2.model, ctx)).intent, f.intent);
});
await ok('verified image ships with the reviewer\'s neutral caption and an ai-generated source', async () => {
  const s = scripted({ 'photo.plan': [plan], 'critic.photo': [pass] });
  const r = await generateVerifiedPhoto(ctx, { model: s.model, imageGen: img });
  assert.ok(r.photoUrl?.startsWith('data:image/png;base64,')); assert.equal(r.meta.verified, true);
  assert.equal(r.meta.caption, 'A row of fence posts along a wall.'); assert.equal(r.meta.source, 'ai-generated');
});
await ok('a rejected image is retried with the rejection fed back; two rejections → no photo (unverified, never shipped)', async () => {
  const bad = { showsConcept: true, caption: 'x', issues: [{ severity: 'error', code: 'drawing-label', where: 'sign', message: 'garbled number on the sign' }] };
  const s = scripted({ 'photo.plan': [plan], 'critic.photo': [bad] });
  const r = await generateVerifiedPhoto(ctx, { model: s.model, imageGen: img, maxAttempts: 2 });
  assert.equal(r.photoUrl, null); assert.equal(r.meta.verified, false); assert.equal(r.attempts, 2);
  assert.ok(s.calls.filter((c) => c.call === 'photo.plan')[1].prompt.includes('garbled number'), 'second plan is told what was rejected');
});
await ok('reviewer unreachable: the unreviewed image is NOT shipped', async () => {
  const s = scripted({ 'photo.plan': [plan], 'critic.photo': [new Error('503')] });
  const r = await generateVerifiedPhoto(ctx, { model: s.model, imageGen: img });
  assert.equal(r.photoUrl, null); assert.equal(r.reviewRan, false);
});
await ok('image model returns nothing: no photo, error recorded, no stock fallback', async () => {
  const s = scripted({ 'photo.plan': [plan] });
  const r = await generateVerifiedPhoto(ctx, { model: s.model, imageGen: async () => null, maxAttempts: 1 });
  assert.equal(r.photoUrl, null); assert.match(r.error, /no image/);
});
console.log(`\n${passed} photo-gen checks passed`);
