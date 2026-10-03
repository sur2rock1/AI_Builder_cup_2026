// Regression for D-2026-09-30-9: the tutor must NEVER park, defer or hand off.
// Replays student-1's real outcome sequence on "Equations of Horizontal and
// Vertical Lines" (fail, sound, fail, sound, fail, fail) through the real,
// un-stubbed compilePlanDelta().
//
//     node tests/smoke/plan-delta-never-stops.mjs
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const buildDir = path.join(root, 'tests', '.build');
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };

await build({
  entryPoints: [path.join(root, 'src', 'plan', 'delta.ts')],
  bundle: true, platform: 'node', format: 'esm', logLevel: 'warning', packages: 'external',
  outfile: path.join(buildDir, 'plan-delta-never-stops.bundle.mjs'),
});
const { compilePlanDelta, initialDeltaState } = await import(`${path.join(buildDir, 'plan-delta-never-stops.bundle.mjs')}?t=${Date.now()}`);

const plan = {
  limits: { probeBudget: 2, retryCap: 3, maxChecksWithoutTeach: 3, maxPrereqProbes: 3 },
  representationOrder: ['visual_diagram', 'worked_example', 'real_world_analogy', 'step_by_step']
    .map((strategy) => ({ strategy, expected: 0.5, reason: {} })),
  avoidRepresentations: [],
};
const C = 'concept-x';
const BAD = /park|come back|tomorrow|teacher|parent|break|later|pause/i;

let state = initialDeltaState();
const seq = ['failed_check', 'sound', 'failed_check', 'sound', 'failed_check', 'failed_check'];
let rep = 'direct_explanation';
seq.forEach((outcome, i) => {
  const d = compilePlanDelta(plan, state, { conceptId: C, outcome, representationUsed: rep, hasReasoning: i % 2 === 0 });
  state = d.state;
  ok(d.parkConcept === undefined && d.escalate === undefined, `step ${i + 1} (${outcome}): no park/escalate flag`);
  ok(!BAD.test(d.instruction.replace(/do not (end or pause|say you will come back|mention)[^.]*\./gi, '').replace(/Do NOT pause or defer/gi, '')),
    `step ${i + 1} (${outcome}): instruction does not tell the tutor to stop/defer/hand off`);
  if (outcome === 'failed_check') ok(/TEACH|EXPLAIN|Walk me through/i.test(d.instruction), `step ${i + 1}: a miss leads to asking why or explaining`);
  if (d.nextRepresentation) rep = d.nextRepresentation;
});

// Scattered misses with a success between them must NOT reach the cap.
ok((state.retryCountByConcept[C] || 0) === 2, 'retry counter reset by the successes (2 trailing misses, not 4)');

// Even far past the cap, every response is still "teach", never "stop".
for (let i = 0; i < 6; i++) {
  const d = compilePlanDelta(plan, state, { conceptId: C, outcome: 'failed_check', representationUsed: rep });
  state = d.state;
  ok(d.teachDirectly === true && d.parkConcept === undefined && d.escalate === undefined, `miss #${i + 3} beyond cap: teachDirectly, no park/escalate`);
}

// Frustration: normalise + shrink, but keep teaching (no "pause").
const f = compilePlanDelta(plan, initialDeltaState(), { conceptId: C, outcome: 'frustration_signal', representationUsed: rep });
ok(!/pause/i.test(f.instruction) && /keep teaching/i.test(f.instruction), 'frustration: keeps teaching, no pause');

// The plan's loop (H1 -> DIAGNOSE -> REMEDIATE): first miss with no reasoning = ask WHY, no new question.
const first = compilePlanDelta(plan, initialDeltaState(), { conceptId: C, outcome: 'failed_check', representationUsed: 'direct_explanation', hasReasoning: false });
ok(/Walk me through/.test(first.instruction) && /do NOT ask a new question/i.test(first.instruction), 'first bare wrong answer: tutor asks why, no new question');
// Once they explain: explain the concept in a new representation before any new check.
const second = compilePlanDelta(plan, first.state, { conceptId: C, outcome: 'failed_check', representationUsed: 'direct_explanation', hasReasoning: true });
ok(second.teachDirectly === true && /explain/i.test(second.instruction) && second.nextRepresentation === 'visual_diagram', 'after their reasoning: explains with a NEW representation');
