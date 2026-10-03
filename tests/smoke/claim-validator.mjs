// Smoke test (not part of npm test yet, same convention as plan-and-store.mjs)
// for T14's claimValidator.ts — pure-function assertions, no network, no
// throwaway data dir needed. Written 2026-09-26 alongside profiler.ts/
// claimValidator.ts (D-2026-09-26-6); run manually with:
//   npx tsx tests/smoke/claim-validator.mjs
import { validateClaims, capForEvidenceCount, mergeClaims } from '../../src/adaptive/claimValidator.ts';

let failed = false;
function assertEq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { console.error(`FAIL ${label}: got ${a}, want ${e}`); failed = true; }
  else console.log(`ok ${label}`);
}

assertEq(capForEvidenceCount(0), 0, 'cap(0)');
assertEq(capForEvidenceCount(1), 0.4, 'cap(1)');
assertEq(capForEvidenceCount(2), 0.6, 'cap(2)');
assertEq(capForEvidenceCount(3), 0.85, 'cap(3)');
assertEq(capForEvidenceCount(10), 0.85, 'cap(10)');

const ctx = { studentId: 's1', ownedEventIds: new Set(['e1', 'e2', 'e3']), existingClaims: [] };

let r = validateClaims([{ kind: 'gap', statement: 'x', scope: {}, evidenceRefs: ['e1'] }], ctx);
assertEq(r.accepted.length, 0, 'missing scope rejected (accepted count)');
assertEq(r.rejected.length, 1, 'missing scope rejected (rejected count)');

r = validateClaims([{ kind: 'gap', statement: 'x', scope: { conceptId: 'c1' }, evidenceRefs: ['e1', 'e99'] }], ctx);
assertEq(r.accepted.length, 0, 'unowned evidenceRef rejected');

r = validateClaims([{ kind: 'pattern', statement: 'This child is a visual learner', scope: { conceptId: 'c1' }, evidenceRefs: ['e1'] }], ctx);
assertEq(r.accepted.length, 0, 'banned lexicon rejected (visual learner)');
r = validateClaims([{ kind: 'pattern', statement: 'Struggles because of ADHD', scope: { conceptId: 'c1' }, evidenceRefs: ['e1'] }], ctx);
assertEq(r.accepted.length, 0, 'banned lexicon rejected (ADHD)');

r = validateClaims([{ kind: 'strategy', statement: 'Responds well to worked examples for ratio problems', scope: { conceptType: 'algebra.ratio' }, evidenceRefs: ['e1'] }], ctx);
assertEq(r.accepted.length, 1, 'valid claim accepted (count)');
assertEq(r.accepted[0]?.confidence, 0.4, 'valid claim confidence = cap(1)');
assertEq(r.accepted[0]?.source, 'profiler', 'valid claim source = profiler');

r = validateClaims([{ kind: 'strategy', statement: 'Consistently strong with visual diagrams for geometry proofs', scope: { conceptType: 'geometry.proof' }, evidenceRefs: ['e1', 'e2', 'e3'] }], ctx);
assertEq(r.accepted[0]?.confidence, 0.85, 'confidence = cap(3)');

const ctxWithStated = {
  studentId: 's1', ownedEventIds: new Set(['e1']),
  existingClaims: [{
    claimId: 'c_stated', kind: 'preference', statement: 'Prefers text explanations, not diagrams',
    scope: { conceptType: 'geometry.proof' }, confidence: 1, evidenceRefs: [], source: 'learner_stated',
    status: 'active', createdAt: 0, lastConfirmedAt: 0,
  }],
};
r = validateClaims([{ kind: 'preference', statement: 'Prefers diagrams', scope: { conceptType: 'geometry.proof' }, evidenceRefs: ['e1'] }], ctxWithStated);
assertEq(r.accepted.length, 0, 'contradicts learner_stated claim -> rejected');
assertEq(r.rejected[0]?.reason.includes('learner_stated'), true, 'rejection reason mentions learner_stated');

const existing = [{
  claimId: 'c_old', kind: 'strategy', statement: 'old statement', scope: { conceptType: 'x' },
  confidence: 0.4, evidenceRefs: ['e1'], source: 'profiler', status: 'active', createdAt: 0, lastConfirmedAt: 0,
}];
const merged = mergeClaims(existing, [{
  claimId: 'c_new', kind: 'strategy', statement: 'new statement', scope: { conceptType: 'x' },
  confidence: 0.6, evidenceRefs: ['e2'], source: 'profiler', status: 'active', createdAt: 1, lastConfirmedAt: 1,
}]);
assertEq(merged.length, 1, 'mergeClaims does not duplicate same-slot profiler claim');
assertEq(merged[0].statement, 'new statement', 'mergeClaims updates statement');
assertEq([...merged[0].evidenceRefs].sort(), ['e1', 'e2'], 'mergeClaims unions evidenceRefs');
assertEq(merged[0].confidence, 0.6, 'mergeClaims recomputes confidence from merged evidence count');

if (failed) { console.error('\nSOME TESTS FAILED'); process.exit(1); }
console.log('\nALL claim-validator.mjs TESTS PASSED');
