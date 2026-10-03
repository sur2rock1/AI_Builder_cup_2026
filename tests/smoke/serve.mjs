// What reaches the browser. Run: npx tsx tests/smoke/serve.mjs
import assert from 'node:assert/strict';
import { publicLesson, verifiedPhoto, cleanReasoning } from '../../src/curriculum/serve.ts';
import { toFirestore, fromFirestore } from '../../src/curriculum/pregenStore.ts';
let passed = 0;
const ok = (n, f) => { try { f(); passed++; console.log(`ok ${n}`); } catch (e) { console.error(`FAIL ${n}\n  ${e.message}`); process.exitCode = 1; } };

ok('tutor-only fields never leave the server (diagnostics, option notes, lookFor, legacy scene/photo/diagram)', () => {
  const l = publicLesson({ tagline: 't', diagnostics: [{ question: 'q' }], scene3d: {}, photoVisual: {}, diagram: {}, quiz: { question: 'q', options: ['a', 'b'], correctIndex: 0, explanation: 'e', optionNotes: ['n1', 'n2'], lookFor: 'x', itemId: 'L3-B' } });
  assert.deepEqual(Object.keys(l).sort(), ['quiz', 'tagline']);
  assert.deepEqual(Object.keys(l.quiz).sort(), ['correctIndex', 'explanation', 'itemId', 'options', 'question']);
});
ok('a photo is served only when verified; an unreviewed (legacy) photo is not', () => {
  assert.deepEqual(verifiedPhoto({ photoUrl: 'data:x', photoMeta: { verified: true, caption: 'A fence.' } }), { photoUrl: 'data:x', photoCaption: 'A fence.' });
  assert.equal(verifiedPhoto({ photoUrl: 'data:x' }).photoUrl, null);
  assert.equal(verifiedPhoto({ photoUrl: 'data:x', photoMeta: { verified: false, caption: '' } }).photoUrl, null);
  assert.equal(verifiedPhoto(null).photoUrl, null);
});
ok('reasoning from the browser is sanitised', () => {
  assert.equal(cleanReasoning(null), null); assert.equal(cleanReasoning({ how: 'hack' }), null);
  assert.deepEqual(cleanReasoning({ how: 'guessed', text: '  a   b \n c  ' }), { how: 'guessed', text: 'a b c' });
  assert.equal(cleanReasoning({ text: 'x'.repeat(900) }).text.length, 500);
});
ok('Firestore round-trip keeps quarantined pictures (nested arrays travel as JSON) and drops nothing else', () => {
  const pic = { dim: '2d', elements: [{ id: 'l', kind: 'line', through: [[0, 0], [1, 1]] }], steps: [] };
  const rec = { topic: 't', slug: 's', generatedAt: 'x', lessonData: { a: 1 }, visuals: { main: pic }, visualsQuarantine: { apply: { visual: pic, issues: [{ code: 'c', severity: 'error', where: 'w', message: 'm' }] } }, photoMeta: { verified: false, caption: '', intent: '', source: 'ai-generated', reviewedAt: 'r' } };
  const fs = toFirestore(rec);
  assert.ok(typeof fs.visualsJson === 'string' && typeof fs.quarantineJson === 'string' && !('visuals' in fs) && !('visualsQuarantine' in fs));
  assert.deepEqual(fromFirestore(JSON.parse(JSON.stringify(fs))), rec);
});
console.log(`\n${passed} serve checks passed`);
