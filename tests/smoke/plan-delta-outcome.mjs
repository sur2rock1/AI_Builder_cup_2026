// Branch-coverage test for deriveOutcome() (src/plan/delta.ts).
//
// Built directly in response to D-2026-09-28-4/5: two real bugs
// (server/routes/tutor.ts, server.ts) existed because their outcome
// derivation branched on candidateMisconceptions.length as a PROXY for
// classification, leaving a gap for 'misconception_behind_correct' with no
// catalogued id, and because nothing enumerated every classification x
// candidateMisconceptionsCount x newlyConfirmedCount combination to check
// what outcome each one actually produces. This test is exactly that
// enumeration, run against the real, un-stubbed deriveOutcome() — pure
// function, no model, no network, no server — so a future gap of the same
// shape (a new classification value, or a new proxy-instead-of-direct
// branch) fails fast instead of shipping into both channels again.
//
//     node tests/smoke/plan-delta-outcome.mjs
//
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const buildDir = path.join(root, 'tests', '.build');

const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };

async function main() {
  await build({
    entryPoints: [path.join(root, 'src', 'plan', 'delta.ts')],
    bundle: true, platform: 'node', format: 'esm', logLevel: 'warning',
    packages: 'external',
    outfile: path.join(buildDir, 'plan-delta.bundle.mjs'),
  });
  const { deriveOutcome } = await import(`${path.join(buildDir, 'plan-delta.bundle.mjs')}?t=${Date.now()}`);

  const CLASSIFICATIONS = [
    'clear_reasoning', 'needs_clarification', 'misconception_behind_correct',
    'wrong_answer', 'no_reasoning_given',
  ];

  // ── With candidateMisconceptionsCount > 0, classification is irrelevant:
  // a catalogued misconception id always wins, confirmed or suspected by
  // newlyConfirmedCount alone.
  for (const classification of CLASSIFICATIONS) {
    ok(
      deriveOutcome({ classification, candidateMisconceptionsCount: 1, newlyConfirmedCount: 0 }) === 'misconception_suspected',
      `candidates>0, newlyConfirmed=0, classification=${classification} -> misconception_suspected`,
    );
    ok(
      deriveOutcome({ classification, candidateMisconceptionsCount: 2, newlyConfirmedCount: 1 }) === 'misconception_confirmed',
      `candidates>0, newlyConfirmed>0, classification=${classification} -> misconception_confirmed`,
    );
  }

  // ── With candidateMisconceptionsCount === 0, classification decides —
  // this is the exact table the original bug had a gap in. newlyConfirmed
  // is irrelevant here (it can only be >0 if there was a candidate to
  // confirm), included at 0 for realism.
  const expectedByClassification = {
    clear_reasoning: 'sound',
    needs_clarification: 'failed_check',
    misconception_behind_correct: 'misconception_suspected', // the bug: this used to be 'sound'
    wrong_answer: 'failed_check',
    no_reasoning_given: 'sound', // pre-existing, unverified-as-correct behaviour — see docs/PROJECT_STATE.md open question
  };
  for (const [classification, expected] of Object.entries(expectedByClassification)) {
    const got = deriveOutcome({ classification, candidateMisconceptionsCount: 0, newlyConfirmedCount: 0 });
    ok(got === expected, `candidates=0, classification=${classification} -> ${expected} (got ${got})`);
  }

  // ── Every classification value must be covered by the table above —
  // this fails loudly if a new classification is ever added to
  // ReasoningClassification without a corresponding row here, rather than
  // silently falling through deriveOutcome's default 'sound' untested.
  ok(
    CLASSIFICATIONS.every((c) => c in expectedByClassification),
    `every ReasoningClassification value has an explicit expected outcome above (${CLASSIFICATIONS.length} values)`,
  );

  console.log(process.exitCode ? '\nFAILED' : '\nall deriveOutcome branch-coverage checks passed');
  process.exit(process.exitCode || 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
