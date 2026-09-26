// ─────────────────────────────────────────────────────────────────
// Seed demo learners (lightweight T27 stand-in)
//
// Hand-scripted, standalone — NOT part of the running app. It drives the
// exact same public functions the live voice pipeline calls
// (getOrCreateLearner, ensureSubject, ensureConceptState,
// recordReasoningEvidence, incrementSessionCount, disputeMisconception),
// so every ladder level, mastery-status transition and misconception
// confirmation comes from the real BKT/ladder/ledger logic in
// src/adaptive/{bkt,ladder,learnerStore}.ts — nothing here fakes a status
// field directly. The one exception, called out below, is spaced-review
// scheduling (T15 is not built, so nothing in the app ever sets
// ConceptState.review — this script sets it by hand for one concept so
// the "review due" plan beat has something to show).
//
// These are SIMULATED learners for demo/testing purposes only — not
// evidence of real-user validation (see docs/BUILD_PLAN.md T27,
// docs/DECISIONS.md D-2026-09-25-2). Every profile name is suffixed
// "(Simulated)" and studentId is prefixed "demo_" so this can never be
// mistaken for a real child's data, on screen or in the data files.
//
// Usage:
//   npm run seed:demo            create/refresh the 3 demo learners
//   npm run seed:demo -- --reset delete them first, then recreate
// ─────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import {
  getOrCreateLearner, ensureSubject, ensureConceptState,
  recordReasoningEvidence, incrementSessionCount, addGlobalInsight,
  disputeMisconception, deleteLearner, getLearner,
} from '../src/adaptive/learnerStore';
import type { TeachingStrategy, UnderstandingDepth } from '../src/adaptive/learnerModel';

const SUBJECT_ID = 'math';
const SUBJECT_LABEL = 'Math';
const GRADE = 'Secondary 2 (Grade 8)'; // must match data/curricula.json's math entry exactly
const CURRICULUM_SOURCE = '757429818 3B Think Mathematics 260917 114300';

const C_CONGRUENCE = '757429818-3b-think-mathematics-260917-114300--9--triangle-congruence-tests-sss-sas-aas-rhs';
const C_SCALE = '757429818-3b-think-mathematics-260917-114300--9--scale-drawings-and-scale-factor';
const C_AREA_RATIO = '757429818-3b-think-mathematics-260917-114300--10--area-ratio-of-similar-figures';

type Depth = UnderstandingDepth;
type Classification = 'clear_reasoning' | 'needs_clarification' | 'misconception_behind_correct' | 'wrong_answer' | 'no_reasoning_given';

interface Exchange {
  promptType: 'teach' | 'check' | 'probe' | 'transfer';
  conceptId: string;
  questionAsked: string;
  childAnswer: string;
  childReasoning: string;
  classification: Classification;
  understandingDepth: Depth;
  misconceptions?: Array<{ id: string; text: string }>;
  confidence: 'high' | 'medium' | 'low';
  strategy: TeachingStrategy;
  sessionId: string; // used later to group + backdate timestamps
}

async function seedStudent(
  studentId: string, name: string, exchanges: Exchange[], conceptLabels: Record<string, string>,
  sessions: { id: string; minutes: number }[],
) {
  await getOrCreateLearner(studentId, name, GRADE);
  await ensureSubject(studentId, SUBJECT_ID, SUBJECT_LABEL, GRADE, CURRICULUM_SOURCE);
  for (const [conceptId, label] of Object.entries(conceptLabels)) {
    await ensureConceptState(studentId, SUBJECT_ID, conceptId, label, 'direct_explanation', 'geometry');
  }

  for (const ex of exchanges) {
    await recordReasoningEvidence({
      studentId, subjectId: SUBJECT_ID, conceptId: ex.conceptId, conceptType: 'geometry',
      difficultyLevel: 3, promptType: ex.promptType,
      questionAsked: ex.questionAsked, childAnswer: ex.childAnswer, childReasoning: ex.childReasoning,
      classification: ex.classification, understandingDepth: ex.understandingDepth,
      candidateMisconceptions: ex.misconceptions || [], confidence: ex.confidence,
      strategyInUse: ex.strategy, sessionId: ex.sessionId, source: 'voice',
      moveUsed: ex.promptType === 'probe' ? 'targeted_probe' : ex.promptType === 'transfer' ? 'transfer_check' : 'check_understanding',
    });
  }

  for (const s of sessions) {
    await incrementSessionCount(studentId, SUBJECT_ID, s.minutes);
  }
}

async function main() {
  const reset = process.argv.includes('--reset');
  const ids = ['demo_aisha', 'demo_marcus', 'demo_priya'];
  if (reset) {
    for (const id of ids) await deleteLearner(id);
    console.log('Reset: deleted existing demo learners (if present).');
  }

  // ── Aisha (Simulated) — a standing, undisputed misconception ──
  // Demo purpose: show a confirmed misconception surface, mastery NOT
  // advance because of it, and leave it undisputed so the *live* demo
  // can click "That's not right" on it in front of judges.
  await seedStudent(
    'demo_aisha', 'Aisha (Simulated)',
    [
      { sessionId: 's1', promptType: 'teach', conceptId: C_CONGRUENCE,
        questionAsked: 'Which congruence test would you use for these two triangles?',
        childAnswer: 'SAS, because two sides and the angle between them match.',
        childReasoning: 'The included angle is between the two known sides.',
        classification: 'clear_reasoning', understandingDepth: 'recognised', confidence: 'medium',
        strategy: 'direct_explanation' },
      { sessionId: 's1', promptType: 'probe', conceptId: C_CONGRUENCE,
        questionAsked: 'Here two sides and a NON-included angle match. Are the triangles congruent?',
        childAnswer: 'Yes, two sides and an angle match so they must be congruent.',
        childReasoning: 'If two sides and any angle are equal, the triangles should be the same.',
        classification: 'misconception_behind_correct', understandingDepth: 'incorrect', confidence: 'medium',
        strategy: 'direct_explanation',
        misconceptions: [{ id: 'ssa-congruence', text: 'Assumes any two sides and any angle (SSA) prove congruence' }] },
      { sessionId: 's2', promptType: 'probe', conceptId: C_CONGRUENCE,
        questionAsked: 'Same idea, different triangle pair with a non-included angle matching — congruent?',
        childAnswer: "I think so — SSA, it's basically the same as SAS.",
        childReasoning: "It's still two sides and an angle, so it should count.",
        classification: 'misconception_behind_correct', understandingDepth: 'incorrect', confidence: 'medium',
        strategy: 'worked_example',
        misconceptions: [{ id: 'ssa-congruence', text: 'Assumes any two sides and any angle (SSA) prove congruence' }] },
      { sessionId: 's2', promptType: 'probe', conceptId: C_CONGRUENCE,
        questionAsked: "Can you build a counterexample where SSA gives two DIFFERENT triangles?",
        childAnswer: "Hmm, I'm not sure how to make two different ones.",
        childReasoning: "I guessed there might be a way but I couldn't find it.",
        classification: 'no_reasoning_given', understandingDepth: 'confused', confidence: 'low',
        strategy: 'visual_diagram',
        misconceptions: [{ id: 'ssa-congruence', text: 'Assumes any two sides and any angle (SSA) prove congruence' }] },
    ],
    { [C_CONGRUENCE]: 'Triangle congruence tests (SSS, SAS, AAS, RHS)' },
    [{ id: 's1', minutes: 14 }, { id: 's2', minutes: 11 }],
  );
  await addGlobalInsight('demo_aisha', '[SEEDED DEMO DATA] Standing SSA-congruence misconception across 2 sessions; visual counterexample attempted, not yet resolved.');

  // ── Marcus (Simulated) — misconception confirmed then RESOLVED, plus a review due ──
  // Demo purpose: show the ladder/mastery recovering after a strategy
  // switch, and a due spaced review (hand-set — see header note on T15).
  await seedStudent(
    'demo_marcus', 'Marcus (Simulated)',
    [
      { sessionId: 's1', promptType: 'teach', conceptId: C_SCALE,
        questionAsked: 'A shape is enlarged with scale factor 3. What happens to a 40° angle?',
        childAnswer: 'It becomes 120°, I multiplied by 3.',
        childReasoning: 'Scale factor applies to every measurement in the shape.',
        classification: 'misconception_behind_correct', understandingDepth: 'incorrect', confidence: 'medium',
        strategy: 'direct_explanation',
        misconceptions: [{ id: 'scale-angle-multiply', text: 'Multiplies angles by the scale factor when enlarging' }] },
      { sessionId: 's1', promptType: 'probe', conceptId: C_SCALE,
        questionAsked: 'Different shape, scale factor 2, a 70° angle — what happens to it?',
        childAnswer: '140°? Times 2 again.',
        childReasoning: 'Same rule as before, multiply the angle by the scale factor.',
        classification: 'misconception_behind_correct', understandingDepth: 'incorrect', confidence: 'medium',
        strategy: 'direct_explanation',
        misconceptions: [{ id: 'scale-angle-multiply', text: 'Multiplies angles by the scale factor when enlarging' }] },
      { sessionId: 's2', promptType: 'probe', conceptId: C_SCALE,
        questionAsked: "Let's look at the diagram together — does the angle's opening actually get wider when we enlarge?",
        childAnswer: "Oh — no, it looks exactly the same shape, just bigger.",
        childReasoning: 'Enlargement keeps the shape the same, so angles should stay the same.',
        classification: 'clear_reasoning', understandingDepth: 'applied', confidence: 'high',
        strategy: 'visual_diagram' },
      { sessionId: 's2', promptType: 'transfer', conceptId: C_SCALE,
        questionAsked: 'New shape, scale factor 5, a 55° angle after enlargement?',
        childAnswer: 'Still 55° — angles never change under enlargement, only lengths do.',
        childReasoning: 'Enlargement is similar shapes: same angles, sides scale by the factor.',
        classification: 'clear_reasoning', understandingDepth: 'transferred', confidence: 'high',
        strategy: 'visual_diagram' },
      { sessionId: 's3', promptType: 'check', conceptId: C_SCALE,
        questionAsked: 'Quick check: scale factor 4, side length 6cm — new length?',
        childAnswer: '24cm.',
        childReasoning: 'Multiply the length by the scale factor, not the angle.',
        classification: 'clear_reasoning', understandingDepth: 'applied', confidence: 'high',
        strategy: 'visual_diagram' },
    ],
    {
      [C_SCALE]: 'Scale drawings and scale factor',
      [C_CONGRUENCE]: 'Triangle congruence tests (SSS, SAS, AAS, RHS)',
    },
    [{ id: 's1', minutes: 12 }, { id: 's2', minutes: 15 }, { id: 's3', minutes: 8 }],
  );
  await addGlobalInsight('demo_marcus', '[SEEDED DEMO DATA] visual_diagram resolved a standing misconception that direct_explanation had not; scale-factor concept reached provisional mastery.');
  // Hand-set a due spaced review on the untouched congruence concept —
  // honest limitation: T15 (spaced-review scheduling) is not built, so
  // nothing in the running app ever sets this field itself. This is the
  // only field in this script not derived from the real evidence pipeline.
  {
    const learner = await getLearner('demo_marcus');
    const cs = learner?.subjects[SUBJECT_ID]?.conceptStates[C_CONGRUENCE];
    if (cs) {
      cs.review = { nextDueAt: Date.now() - 2 * 24 * 3600 * 1000, intervalDays: 3, passes: 0, lapses: 0 };
      const { getRepo } = await import('../src/adaptive/repo');
      await getRepo().saveProfile(learner!);
    }
  }

  // ── Priya (Simulated) — near mastery, with a disputed ledger entry ──
  // Demo purpose: show a DIFFERENT ledger status (disputed, not
  // confirmed) than Aisha's, and a concept that reaches provisional
  // mastery through real evidence.
  await seedStudent(
    'demo_priya', 'Priya (Simulated)',
    [
      { sessionId: 's1', promptType: 'teach', conceptId: C_AREA_RATIO,
        questionAsked: 'Two similar triangles have side ratio 2:3. What is their area ratio?',
        childAnswer: 'I think 2:3 as well.',
        childReasoning: 'The shapes are similar so everything scales the same way.',
        classification: 'misconception_behind_correct', understandingDepth: 'incorrect', confidence: 'medium',
        strategy: 'direct_explanation',
        misconceptions: [{ id: 'area-ratio-linear', text: 'Assumes the ratio of areas equals the ratio of lengths' }] },
      { sessionId: 's1', promptType: 'probe', conceptId: C_AREA_RATIO,
        questionAsked: 'Different pair, side ratio 3:5 this time — area ratio?',
        childAnswer: '3:5 again, same as the sides.',
        childReasoning: 'Similar figures scale everything by the same ratio.',
        classification: 'misconception_behind_correct', understandingDepth: 'incorrect', confidence: 'medium',
        strategy: 'step_by_step',
        misconceptions: [{ id: 'area-ratio-linear', text: 'Assumes the ratio of areas equals the ratio of lengths' }] },
      { sessionId: 's2', promptType: 'probe', conceptId: C_AREA_RATIO,
        questionAsked: 'Side ratio 4:1 — walk me through the area ratio step by step.',
        childAnswer: 'Area ratio is 16:1 — square each side of the ratio.',
        childReasoning: 'Area scales with the square of the length ratio, so (4)^2 : (1)^2.',
        classification: 'clear_reasoning', understandingDepth: 'applied', confidence: 'high',
        strategy: 'step_by_step' },
      { sessionId: 's2', promptType: 'transfer', conceptId: C_AREA_RATIO,
        questionAsked: 'A model bridge is 1:20 scale. If the deck area is 3 m² in the model, what is the real deck area?',
        childAnswer: '3 × 20² = 1200 m².',
        childReasoning: 'Length ratio is 1:20 so area ratio is 1:400, and 3 × 400 = 1200.',
        classification: 'clear_reasoning', understandingDepth: 'transferred', confidence: 'high',
        strategy: 'step_by_step' },
      { sessionId: 's3', promptType: 'check', conceptId: C_CONGRUENCE,
        questionAsked: 'Two triangles share all three sides equal — congruent?',
        childAnswer: 'Yes, SSS.',
        childReasoning: 'All three corresponding sides match, that is the SSS test.',
        classification: 'clear_reasoning', understandingDepth: 'recognised', confidence: 'high',
        strategy: 'direct_explanation' },
    ],
    {
      [C_AREA_RATIO]: 'Area ratio of similar figures',
      [C_CONGRUENCE]: 'Triangle congruence tests (SSS, SAS, AAS, RHS)',
    },
    [{ id: 's1', minutes: 13 }, { id: 's2', minutes: 10 }, { id: 's3', minutes: 6 }],
  );
  // Dispute the early misconception explicitly (parent/child pushed back
  // and, on review, the ledger entry is marked disputed) — real call to
  // the same route the learner-card "That's not right" button uses.
  await disputeMisconception('demo_priya', SUBJECT_ID, C_AREA_RATIO, 'area-ratio-linear');
  await addGlobalInsight('demo_priya', '[SEEDED DEMO DATA] step_by_step + a sound transfer answer resolved the area-ratio misconception, but mastery score is still recovering from the earlier wrong answers (BKT does not jump straight to high confidence from one good observation) — congruence concept only lightly touched.');

  // ── Backdate timestamps so this reads as real longitudinal history ──
  // (createdAt/updatedAt/lastVisited/evidenceLog timestamps/event
  // timestamps/session lastSession) rather than "3 sessions, all just
  // now." Pure post-processing on the JSON files — does not touch any
  // ladder/mastery/misconception VALUE, only WHEN it's recorded as
  // having happened. Session offsets are in days-ago from the moment
  // this script runs.
  const SESSION_DAYS_AGO: Record<string, Record<string, number>> = {
    demo_aisha:  { s1: 8, s2: 3 },
    demo_marcus: { s1: 14, s2: 9, s3: 1 },
    demo_priya:  { s1: 11, s2: 6, s3: 2 },
  };
  backdateStudent('demo_aisha', SESSION_DAYS_AGO.demo_aisha);
  backdateStudent('demo_marcus', SESSION_DAYS_AGO.demo_marcus);
  backdateStudent('demo_priya', SESSION_DAYS_AGO.demo_priya);

  console.log('Seeded 3 simulated demo learners: demo_aisha, demo_marcus, demo_priya.');
  console.log('Log in as any of "Aisha (Simulated)" / "Marcus (Simulated)" / "Priya (Simulated)" to inspect them.');
}

function dataDir() {
  return process.env.LEARNER_DATA_DIR || path.join(process.cwd(), 'data');
}

/**
 * Shifts a learner's recorded timestamps back in time per sessionId, so
 * the profile and event log look like real history spread across days
 * instead of one seeding run a few seconds ago. sessionId isn't stored on
 * evidenceLog entries (only on the durable EvidenceEvent log), so events
 * are matched to a session by nearest-timestamp bucket at seed time,
 * before this rewrite — we captured them in seed order, so we reconstruct
 * the mapping from the events file's own sessionId field directly.
 */
function backdateStudent(studentId: string, daysAgoBySession: Record<string, number>) {
  const profilesFile = path.join(dataDir(), 'learner-profiles.json');
  const eventsFile = path.join(dataDir(), 'events', `${studentId}.json`);
  const now = Date.now();

  // Events file: has a real sessionId per entry — shift each by its
  // session's offset, spreading entries within a session by ~6 minutes.
  let sessionTimestamps: Record<string, number[]> = {};
  if (fs.existsSync(eventsFile)) {
    const events = JSON.parse(fs.readFileSync(eventsFile, 'utf-8')) as any[];
    const perSessionCount: Record<string, number> = {};
    for (const ev of events) {
      const sid = ev.sessionId as string;
      const daysAgo = daysAgoBySession[sid];
      if (daysAgo === undefined) continue;
      const idx = (perSessionCount[sid] = (perSessionCount[sid] || 0) + 1) - 1;
      const ts = now - daysAgo * 24 * 3600 * 1000 + idx * 6 * 60 * 1000;
      ev.timestamp = ts;
      ev.masteryBefore = ev.masteryBefore; // unchanged
      sessionTimestamps[sid] = sessionTimestamps[sid] || [];
      sessionTimestamps[sid].push(ts);
    }
    fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2), 'utf-8');
  }

  // Profile file: evidenceLog entries have no sessionId, so we shift them
  // in seed order against the same per-session timestamp buckets, and set
  // lastVisited / lastSession / createdAt / updatedAt from the same data.
  if (!fs.existsSync(profilesFile)) return;
  const all = JSON.parse(fs.readFileSync(profilesFile, 'utf-8'));
  const learner = all[studentId];
  if (!learner) return;

  const allTimestamps = Object.values(sessionTimestamps).flat().sort((a, b) => a - b);
  let cursor = 0;
  const subject = learner.subjects[SUBJECT_ID];
  if (subject) {
    for (const cs of Object.values<any>(subject.conceptStates)) {
      if (Array.isArray(cs.evidenceLog)) {
        for (const ev of cs.evidenceLog) {
          const ts = allTimestamps[Math.min(cursor, allTimestamps.length - 1)] ?? now;
          ev.timestamp = ts;
          cursor++;
        }
        if (cs.evidenceLog.length) cs.lastVisited = cs.evidenceLog[cs.evidenceLog.length - 1].timestamp;
      }
      if (cs.misconceptionLedger) {
        for (const rec of cs.misconceptionLedger) {
          const oldest = allTimestamps[0] ?? now;
          const newest = allTimestamps[allTimestamps.length - 1] ?? now;
          if (rec.firstSeen) rec.firstSeen = oldest;
          if (rec.lastSeen) rec.lastSeen = newest;
          if (rec.disputedAt) rec.disputedAt = newest;
        }
      }
    }
    subject.lastSession = allTimestamps[allTimestamps.length - 1] ?? now;
  }
  if (allTimestamps.length) {
    learner.createdAt = allTimestamps[0];
    learner.updatedAt = allTimestamps[allTimestamps.length - 1];
  }
  all[studentId] = learner;
  fs.writeFileSync(profilesFile, JSON.stringify(all, null, 2), 'utf-8');
}

main().catch((err) => { console.error(err); process.exit(1); });
