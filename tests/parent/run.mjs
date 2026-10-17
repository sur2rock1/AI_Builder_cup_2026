// Parent view tests (docs/PARENT_VIEW.md). Offline: no network, no model, no stored data.
//   npm run test:parent
import assert from 'node:assert/strict';
import { buildBaseReport, quote } from '../../src/parent/facts.ts';
import { gateLine, gateHomeTip, templateNarrative, aiNarrative, eventsForSubject } from '../../src/parent/report.ts';
import { hasInternalTerm, hasLabel, STAGE_LABELS, outcomeWords } from '../../src/parent/plainLanguage.ts';

let pass = 0; let fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

// ── Fixture: one child, two topics. Topic A: mix-up noticed → confirmed → approach changed → fixed. Topic B: seen once.
const SID = 'subj'; const A = 'subj--a'; const B = 'subj--b';
const MA = `${A}::flat-line-x`; const MB = `${B}::sign`;
let ts = 1_700_000_000_000;
const ev = (id, concept, o) => ({
  eventId: id, timestamp: (ts += 3600_000), conceptId: concept, subjectId: SID, sessionId: o.sess,
  promptType: o.type || 'probe', questionAsked: o.q, childAnswer: o.a, childReasoning: o.r || '',
  classification: o.cls || 'clear_reasoning', understandingDepth: o.depth, candidateMisconceptionIds: o.mis ? [o.mis] : [],
  confidence: 'high', strategyInUse: o.rep, representationUsed: o.rep, moveUsed: 'DISCRIMINATING_PROBE',
  ladderLevel: 1, errorClass: 'none', masteryBefore: 0, masteryAfter: 0, derivation: 'P(known) 21% → 58% · pS=0.10',
});
const events = [
  ev('e1', A, { sess: 's1', q: 'Flat line through (3,-2)?', a: 'x = 3', r: 'It runs along the x-axis.', depth: 'incorrect', mis: MA, rep: 'direct_explanation' }),
  ev('e2', A, { sess: 's2', q: 'Flat line through (-4,7),(2,7)?', a: 'x = 7', r: "It's flat so it's x.", depth: 'incorrect', mis: MA, rep: 'direct_explanation' }),
  ev('e3', A, { sess: 's3', q: 'Which number never changes?', a: '7', r: 'Every point has 7.', depth: 'understood', rep: 'visual_diagram' }),
  ev('e4', A, { sess: 's4', type: 'transfer', q: 'Rectangle sides?', a: 'y=2,y=6,x=1,x=7', r: 'Flat sides keep y.', depth: 'transferred', rep: 'visual_diagram' }),
  ev('e5', B, { sess: 's5', q: 'Rearrange 3x-4y=12', a: 'y=3x/4+3', r: 'Sign stayed.', depth: 'incorrect', mis: MB, rep: 'step_by_step' }),
];
const ledgerRec = (id, text, status, extra = {}) => ({ id, text, status, observations: status === 'suspected' ? 1 : 2, firstSeen: 1, lastSeen: 2, ...extra });
const learner = {
  studentId: 'demo_kid', name: 'Kai (Simulated)', grade: 'Grade 8', createdAt: 1, updatedAt: 2, globalInsights: [],
  onboarding: { interests: ['football'], subjectFeelings: {}, accessibility: {} },
  affect: { confusionSignals: { dont_understand: 2 }, frustrationEvents: 0 },
  claims: [{ claimId: 'c1', kind: 'strategy', statement: 'Listing points on a line helped the learner see the constant number.', scope: { subjectId: SID }, confidence: 0.6, evidenceRefs: ['e3', 'e4'], source: 'profiler', status: 'active', createdAt: 1, lastConfirmedAt: 1 },
    { claimId: 'c2', kind: 'gap', statement: 'The learner is a visual learner.', scope: { subjectId: SID }, confidence: 0.6, evidenceRefs: ['e1'], source: 'profiler', status: 'active', createdAt: 1, lastConfirmedAt: 1 }],
  subjects: { [SID]: { subjectId: SID, subjectLabel: 'Maths', grade: 'Grade 8', curriculumSource: 'x', sessionCount: 5, totalMinutes: 55, lastSession: 5,
    conceptStates: {
      [A]: { conceptId: A, label: 'Flat and upright lines', attemptCount: 4, lastVisited: 4, ladder: { highestLevel: 4, levelEvidence: {} }, misconceptionLedger: [ledgerRec(MA, 'A flat line is x = c.', 'resolved', { resolvedAt: 9 })] },
      [B]: { conceptId: B, label: 'Rearranging equations', attemptCount: 1, lastVisited: 5, ladder: { highestLevel: 0, levelEvidence: {} }, misconceptionLedger: [ledgerRec(MB, 'Sign of b is ignored.', 'suspected')] },
    } } },
};

console.log('Parent view');
const base = buildBaseReport(learner, SID, events, null, 1_800_000_000_000);

await t('story: fixed mix-up has noticed → confirmed → changed → fixed, each with evidence', () => {
  const s = base.story.find((x) => x.state === 'fixed');
  assert.deepEqual(s.steps.map((x) => x.kind), ['noticed', 'confirmed', 'changed', 'fixed']);
  for (const st of s.steps) assert.ok(st.evidenceIds.length && st.evidenceIds.every((i) => base.evidence[i]), st.kind);
  assert.match(s.steps[2].caption, /stopped explaining it in words and switched to drawing it out/);
});
await t('story: a mix-up seen once is "watching", never confirmed', () => {
  const s = base.story.find((x) => x.state === 'watching');
  assert.deepEqual(s.steps.map((x) => x.kind), ['noticed', 'watching']);
});
await t('story: a disputed mix-up is never shown to the parent', () => {
  const l2 = structuredClone(learner);
  l2.subjects[SID].conceptStates[A].misconceptionLedger[0].status = 'disputed';
  assert.equal(buildBaseReport(l2, SID, events, null).story.some((x) => x.mixUp.includes('flat line')), false);
});
await t('stats and journey come from the stored evidence', () => {
  assert.equal(base.stats.lessons, 5); assert.equal(base.stats.minutes, 55);
  assert.equal(base.stats.answersChecked, 5); assert.equal(base.stats.mixUpsFixed, 1); assert.equal(base.stats.helpMoments, 2);
  assert.equal(base.simulated, true); assert.equal(base.childName, 'Kai');
  const a = base.journey.find((j) => j.conceptId === A);
  assert.equal(a.stageLabel, STAGE_LABELS[4]); assert.equal(a.mixUp, 'fixed');
});
await t('quote() trims, strips simulated tag and trailing punctuation, and returns "" for nothing', () => {
  assert.equal(quote('(simulated) It is flat.'), '“It is flat”'); assert.equal(quote('   '), ''); assert.equal(quote(undefined), '');
});

const tpl = templateNarrative(base, learner, events.length);
await t('template narrative: every line cites real evidence; ≥2 lines', () => {
  assert.ok(tpl.letter.length >= 2);
  for (const l of [...tpl.letter, ...tpl.worksFor]) assert.ok(l.evidenceIds.length && l.evidenceIds.every((i) => base.evidence[i]), l.text);
});
await t('template narrative: a claim that labels the child ("visual learner") is not passed through', () => {
  assert.equal(tpl.worksFor.some((l) => /visual learner/i.test(l.text)), false);
  assert.ok(tpl.worksFor.some((l) => l.text.startsWith('Listing points on a line helped Kai')), 'strategy claim with the child named');
});
await t('NO internal term or label reaches any parent-visible string', () => {
  const strings = [
    ...tpl.letter.map((l) => l.text), ...tpl.worksFor.map((l) => l.text), tpl.homeTip.title, ...tpl.homeTip.steps,
    ...base.story.flatMap((s) => [s.mixUp, ...s.steps.flatMap((x) => [x.title, x.caption])]),
    ...base.journey.map((j) => j.stageLabel), ...STAGE_LABELS,
    ...Object.values(base.evidence).map((c) => c.outcome),
  ];
  for (const s of strings) { assert.equal(hasInternalTerm(s), false, `jargon in: ${s}`); assert.equal(hasLabel(s), false, `label in: ${s}`); }
});
await t('outcomeWords never exposes classification ids', () => {
  for (const d of ['memorised', 'recognised', 'understood', 'applied', 'transferred', 'incorrect', 'guessed', 'confused', 'zzz'])
    assert.equal(hasInternalTerm(outcomeWords({ understandingDepth: d, classification: 'misconception_behind_correct' })), false);
});

// ── Subject isolation (regression: Biology once showed Maths answers)
await t('events are isolated per subject (other subject → none; legacy events matched by concept)', () => {
  const l2 = structuredClone(learner);
  l2.subjects.bio = { subjectId: 'bio', subjectLabel: 'Biology', grade: 'Grade 8', curriculumSource: 'x', sessionCount: 0, totalMinutes: 0, lastSession: 0, conceptStates: {} };
  assert.equal(eventsForSubject(events, l2, 'bio').length, 0);
  assert.equal(eventsForSubject(events, l2, SID).length, events.length);
  const legacy = { ...events[0], eventId: 'old', subjectId: undefined };
  assert.equal(eventsForSubject([legacy], l2, SID).length, 1); assert.equal(eventsForSubject([legacy], l2, 'bio').length, 0);
  const empty = buildBaseReport(l2, 'bio', eventsForSubject(events, l2, 'bio'), null);
  assert.equal(empty.stats.answersChecked, 0); assert.equal(empty.story.length, 0); assert.equal(Object.keys(empty.evidence).length, 0);
});

// ── Sentence gate
const ctx = { idMap: new Map([['E1', ['e1']], ['E3', ['e3']], ['C1', ['e3', 'e4']]]), realEventIds: new Set(events.map((e) => e.eventId)) };
const ok = 'Kai now sees which number stays the same on a flat line.';
await t('gate keeps a sentence that cites real evidence and maps ids to event ids', () => {
  const g = gateLine({ text: ok, evidence: ['E3', 'C1'] }, ctx); assert.deepEqual(g.line.evidenceIds, ['e3', 'e4']);
});
for (const [name, raw, reason] of [
  ['no evidence', { text: ok, evidence: [] }, 'no-evidence'],
  ['invented evidence id', { text: ok, evidence: ['E99'] }, 'no-evidence'],
  ['jargon', { text: 'Kai reached ladder level 3 on this topic today.', evidence: ['E1'] }, 'jargon'],
  ['move id', { text: 'The DISCRIMINATING_PROBE move showed the idea clearly.', evidence: ['E1'] }, 'jargon'],
  ['percentage', { text: 'Kai is now at 80% on this topic overall.', evidence: ['E1'] }, 'number-score'],
  ['label about the child', { text: 'Kai is a visual learner who needs pictures first.', evidence: ['E1'] }, 'label'],
  ['judgement word', { text: 'Kai is smart and picks this up quickly now.', evidence: ['E1'] }, 'label'],
  ['gendered pronoun', { text: 'Kai said he found the picture helpful today.', evidence: ['E1'] }, 'pronoun'],
  ['too short', { text: 'Good.', evidence: ['E1'] }, 'length'],
]) await t(`gate drops: ${name}`, () => { const g = gateLine(raw, ctx); assert.equal(g.line, null); assert.equal(g.reason, reason); });

await t('home tip gate: accepts a good tip, clamps minutes, rejects bad ones', () => {
  assert.equal(gateHomeTip({ title: 'Teach it back', minutes: 99, steps: ['Ask Kai to explain.', 'Ask for a drawing.'] }).minutes, 10);
  assert.equal(gateHomeTip({ title: 'x', minutes: 5, steps: ['only one'] }), null);
  assert.equal(gateHomeTip({ title: 'Quiz', minutes: 5, steps: ['Test the ladder level.', 'Ask again.'] }), null);
});

// ── AI path with a fake model (no network)
const good = { letter: [{ text: 'Kai now sees which number stays the same on a flat line.', evidence: ['E3'] }, { text: 'Ananta switched to showing points on the line, and that is when it clicked.', evidence: ['E3', 'E4'] }, { text: 'Kai is an amazing natural genius at maths.', evidence: ['E3'] }, { text: 'An invented achievement that has no evidence behind it.', evidence: [] }], worksFor: [], homeTip: { title: 'Teach it back', minutes: 5, steps: ['Ask Kai to explain.', 'Ask for a drawing.'] } };
await t('AI path: unsupported / labelled sentences are removed, supported ones kept, source = ai', async () => {
  const n = await aiNarrative(base, learner, events, 'k', async () => ({ data: good, model: 'fake', raw: '' }));
  assert.equal(n.source, 'ai'); assert.equal(n.letter.length, 2); assert.equal(n.rejectedLines, 2); assert.equal(n.homeTip.source, 'ai');
});
await t('AI path: fewer than 2 surviving sentences → null (caller uses the template)', async () => {
  const bad = { letter: [{ text: 'Kai now sees which number stays the same on a flat line.', evidence: ['E3'] }, { text: 'Nothing here is backed by an answer at all.', evidence: [] }] };
  assert.equal(await aiNarrative(base, learner, events, 'k', async () => ({ data: bad, model: 'fake', raw: '' })), null);
});
await t('AI path: model failure → null, never throws', async () => {
  assert.equal(await aiNarrative(base, learner, events, 'k', async () => { throw new Error('all candidates failed'); }), null);
});
await t('AI prompt only carries this child\'s own evidence', async () => {
  let seen = '';
  await aiNarrative(base, learner, events, 'k', async (o) => { seen = o.prompt; return { data: good, model: 'fake', raw: '' }; });
  assert.match(seen, /Kai/); assert.doesNotMatch(seen, /demo_kid|ev_/); assert.match(seen, /E1 \[Flat and upright lines\]/);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
