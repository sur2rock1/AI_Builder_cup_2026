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
// Rewritten 2026-09-26 (docs/CURRICULUM.md §10): it no longer hard-codes a
// particular textbook. It seeds against a course that is ACTUALLY in the
// curriculum library (upload one first through the admin content library),
// and every misconception it records uses that course's own catalogue id
// (reasoningAssessor.misconceptionCatalog → `${conceptId}::${detail.id}`),
// so a live session that detects the same misconception adds an
// observation to the seeded ledger entry instead of opening a second one.
// The learners get the course's board + grade, so they see it on login.
//
// These are SIMULATED learners for demo/testing purposes only — not
// evidence of real-user validation (see docs/BUILD_PLAN.md T27,
// DECISIONS.md D-2026-09-25-2). Every profile name is suffixed
// "(Simulated)" and studentId is prefixed "demo_" so this can never be
// mistaken for a real child's data, on screen or in the data files. The
// children's answers are templated from the course's own misconception
// and ladder data and marked "(simulated)".
//
// Usage:
//   npm run seed:demo                          seed against the first course in the library
//   npm run seed:demo -- --course <courseId>   seed against a specific course
//   npm run seed:demo -- --reset               delete the demo learners first, then recreate
//   npm run seed:demo -- --list                list the courses available to seed against
// ─────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import {
  getOrCreateLearner, ensureSubject, ensureConceptState,
  recordReasoningEvidence, incrementSessionCount, addGlobalInsight,
  disputeMisconception, deleteLearner, getLearner,
} from '../src/adaptive/learnerStore';
import type {
  CurriculumConcept, CurriculumSubject, MisconceptionDetail, TeachingStrategy, UnderstandingDepth,
} from '../src/adaptive/learnerModel';
import { listCurriculaAsync } from '../src/curriculum/ingest';
import { misconceptionCatalog } from '../src/adaptive/reasoningAssessor';
import { conceptTypeFor, gradeLabel, gradeLevelFromLabel } from '../src/curriculum/catalog';

type Depth = UnderstandingDepth;
type Classification = 'clear_reasoning' | 'needs_clarification' | 'misconception_behind_correct' | 'wrong_answer' | 'no_reasoning_given';

interface Exchange {
  promptType: 'teach' | 'check' | 'probe' | 'transfer';
  concept: CurriculumConcept;
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

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

let course: CurriculumSubject;

async function seedStudent(
  studentId: string, name: string, exchanges: Exchange[], concepts: CurriculumConcept[],
  sessions: { id: string; minutes: number }[],
) {
  const level = course.gradeLevel ?? gradeLevelFromLabel(course.grade);
  await getOrCreateLearner(studentId, name, level ? gradeLabel(level) : course.grade, { board: course.board, gradeLevel: level });
  await ensureSubject(studentId, course.id, course.label, course.grade, course.source);
  for (const c of concepts) {
    await ensureConceptState(studentId, course.id, c.id, c.label, 'direct_explanation', conceptTypeFor(c));
  }

  for (const ex of exchanges) {
    await recordReasoningEvidence({
      studentId, subjectId: course.id, conceptId: ex.concept.id, conceptType: conceptTypeFor(ex.concept),
      difficultyLevel: ex.concept.difficultyLevel || 3, promptType: ex.promptType,
      questionAsked: ex.questionAsked, childAnswer: ex.childAnswer, childReasoning: ex.childReasoning,
      classification: ex.classification, understandingDepth: ex.understandingDepth,
      candidateMisconceptions: ex.misconceptions || [], confidence: ex.confidence,
      strategyInUse: ex.strategy, sessionId: ex.sessionId, source: 'voice',
      moveUsed: ex.promptType === 'probe' ? 'DISCRIMINATING_PROBE' : ex.promptType === 'transfer' ? 'TRANSFER_FAR' : 'CHECK_UNDERSTANDING',
    });
  }

  for (const s of sessions) {
    await incrementSessionCount(studentId, course.id, s.minutes);
  }
}

// ─── Templating from the course's own content ───────────────────

/** "Students often believe that X" → "X" (first person-ish, for the simulated reasoning). */
function beliefAsReasoning(belief: string): string {
  const b = belief.replace(/^(students|learners|pupils|children)\s+(often\s+|may\s+|sometimes\s+)?(think|believe|assume|say|claim)s?\s+(that\s+)?/i, '');
  return `(simulated) I thought ${b.charAt(0).toLowerCase()}${b.slice(1)}`;
}

function ladder(c: CurriculumConcept, level: 1 | 2 | 3 | 4) {
  return c.ladderItems?.find((l) => l.level === level);
}

/** Catalogue entry (the exact id the live diagnostician would select) for a misconception. */
function catalogueEntry(c: CurriculumConcept, m: MisconceptionDetail) {
  const entry = misconceptionCatalog(c).find((e) => e.text === m.belief);
  if (!entry) throw new Error(`No catalogue entry for "${m.belief}" on ${c.id}`);
  return entry;
}

function wrongExchanges(c: CurriculumConcept, m: MisconceptionDetail, sessions: [string, string], strategies: [TeachingStrategy, TeachingStrategy]): Exchange[] {
  const mc = catalogueEntry(c, m);
  return [
    {
      sessionId: sessions[0], promptType: 'probe', concept: c,
      questionAsked: m.probeQuestion,
      childAnswer: '(simulated) Yes, I think so.',
      childReasoning: beliefAsReasoning(m.belief),
      classification: 'misconception_behind_correct', understandingDepth: 'incorrect', confidence: 'medium',
      strategy: strategies[0], misconceptions: [mc],
    },
    {
      sessionId: sessions[1], promptType: 'probe', concept: c,
      questionAsked: m.triggerPattern ? `A new case: ${m.triggerPattern}. What happens here?` : `Same idea, a different case — ${m.probeQuestion}`,
      childAnswer: '(simulated) Same as before, I think.',
      childReasoning: beliefAsReasoning(m.belief),
      classification: 'misconception_behind_correct', understandingDepth: 'incorrect', confidence: 'medium',
      strategy: strategies[1], misconceptions: [mc],
    },
  ];
}

function soundExchange(c: CurriculumConcept, level: 3 | 4, sessionId: string, strategy: TeachingStrategy): Exchange {
  const item = ladder(c, level);
  return {
    sessionId, promptType: level === 4 ? 'transfer' : 'probe', concept: c,
    questionAsked: item?.prompt || (level === 4 ? `Use ${c.label} in a completely new situation.` : `Try a new problem on ${c.label}.`),
    childAnswer: `(simulated) ${item?.lookFor || 'A correct answer with a sound method.'}`,
    childReasoning: `(simulated) ${c.keyFacts[0] || 'I used the rule we worked on.'}`,
    classification: 'clear_reasoning', understandingDepth: level === 4 ? 'transferred' : 'applied', confidence: 'high',
    strategy,
  };
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const courses = await listCurriculaAsync();
  if (process.argv.includes('--list')) {
    if (!courses.length) console.log('No courses in the library yet.');
    for (const c of courses) console.log(`${c.id}  —  ${c.board || '?'} · ${c.grade} · ${c.label}  (${c.concepts.length} concepts)`);
    return;
  }
  const wanted = arg('--course');
  const found = wanted ? courses.find((c) => c.id === wanted) : courses[0];
  if (!found) {
    console.error(wanted
      ? `Course "${wanted}" is not in the library. Run with --list to see what is.`
      : 'The curriculum library is empty. Upload a textbook through the admin content library (login screen → "Content library (admin)") first, then run npm run seed:demo again.');
    process.exit(1);
  }
  course = found;

  const reset = process.argv.includes('--reset');
  const ids = ['demo_aisha', 'demo_marcus', 'demo_priya'];
  if (reset) {
    for (const id of ids) await deleteLearner(id);
    console.log('Reset: deleted existing demo learners (if present).');
  }

  // Concepts with a stable-id misconception catalogue, in teaching order.
  const usable = [...course.concepts]
    .sort((a, b) => a.typicalTeachingOrder - b.typicalTeachingOrder)
    .filter((c) => (c.misconceptionDetails || []).some((m) => m.id));
  if (!usable.length) {
    console.error(`Course ${course.id} has no concepts with misconception ids — was it ingested by the current pipeline?`);
    process.exit(1);
  }
  const A = usable[0];
  const B = usable[1] || usable[0];
  const C = usable[2] || usable[usable.length - 1];
  const mA = A.misconceptionDetails!.find((m) => m.id)!;
  const mB = B.misconceptionDetails!.find((m) => m.id)!;
  const mC = C.misconceptionDetails!.find((m) => m.id)!;
  console.log(`Seeding against ${course.board} · ${course.grade} · ${course.label} (${course.id})`);
  console.log(`  Aisha  → "${A.label}"  [${mA.id}]`);
  console.log(`  Marcus → "${B.label}"  [${mB.id}]`);
  console.log(`  Priya  → "${C.label}"  [${mC.id}]`);

  // ── Aisha (Simulated) — a standing, undisputed confirmed misconception ──
  // Demo purpose: show a confirmed misconception, mastery NOT advancing
  // because of it, and leave it undisputed so the *live* demo can click
  // "That's not right" on it in front of judges.
  await seedStudent('demo_aisha', 'Aisha (Simulated)', [
    {
      sessionId: 's1', promptType: 'teach', concept: A,
      questionAsked: ladder(A, 1)?.prompt || `What do you already know about ${A.label}?`,
      childAnswer: `(simulated) ${A.keyFacts[0] || 'Something about it.'}`,
      childReasoning: '(simulated) I remember it from class.',
      classification: 'clear_reasoning', understandingDepth: 'recognised', confidence: 'medium',
      strategy: 'direct_explanation',
    },
    ...wrongExchanges(A, mA, ['s1', 's2'], ['direct_explanation', 'worked_example']),
    {
      sessionId: 's2', promptType: 'probe', concept: A,
      questionAsked: `Can you build an example that shows whether "${mA.belief}" always works?`,
      childAnswer: "(simulated) I'm not sure how to make one.",
      childReasoning: '(simulated) I guessed there might be a way but I could not find it.',
      classification: 'no_reasoning_given', understandingDepth: 'confused', confidence: 'low',
      strategy: 'visual_diagram', misconceptions: [catalogueEntry(A, mA)],
    },
  ], [A], [{ id: 's1', minutes: 14 }, { id: 's2', minutes: 11 }]);
  await addGlobalInsight('demo_aisha', `[SEEDED DEMO DATA] Standing misconception on "${A.label}" across 2 sessions; a visual counterexample was attempted, not yet resolved.`);

  // ── Marcus (Simulated) — misconception confirmed then RESOLVED, plus a review due ──
  await seedStudent('demo_marcus', 'Marcus (Simulated)', [
    ...wrongExchanges(B, mB, ['s1', 's1'], ['direct_explanation', 'direct_explanation']),
    soundExchange(B, 3, 's2', 'visual_diagram'),
    soundExchange(B, 4, 's2', 'visual_diagram'),
    soundExchange(B, 3, 's3', 'visual_diagram'),
  ], B.id === A.id ? [B] : [B, A], [{ id: 's1', minutes: 12 }, { id: 's2', minutes: 15 }, { id: 's3', minutes: 8 }]);
  await addGlobalInsight('demo_marcus', `[SEEDED DEMO DATA] visual_diagram resolved a standing misconception on "${B.label}" that direct_explanation had not.`);
  // Hand-set a due spaced review — honest limitation: T15 (spaced-review
  // scheduling) is not built, so nothing in the running app ever sets this
  // field itself. This is the only field in this script not derived from
  // the real evidence pipeline.
  {
    const reviewConcept = B.id === A.id ? B : A;
    const learner = await getLearner('demo_marcus');
    const cs = learner?.subjects[course.id]?.conceptStates[reviewConcept.id];
    if (cs) {
      cs.review = { nextDueAt: Date.now() - 2 * 24 * 3600 * 1000, intervalDays: 3, passes: 0, lapses: 0 };
      const { getRepo } = await import('../src/adaptive/repo');
      await getRepo().saveProfile(learner!);
    }
  }

  // ── Priya (Simulated) — recovering mastery, with a disputed ledger entry ──
  await seedStudent('demo_priya', 'Priya (Simulated)', [
    ...wrongExchanges(C, mC, ['s1', 's1'], ['direct_explanation', 'step_by_step']),
    soundExchange(C, 3, 's2', 'step_by_step'),
    soundExchange(C, 4, 's2', 'step_by_step'),
    {
      sessionId: 's3', promptType: 'check', concept: A,
      questionAsked: ladder(A, 1)?.prompt || `Quick check on ${A.label}.`,
      childAnswer: `(simulated) ${ladder(A, 1)?.lookFor || A.keyFacts[0] || 'A correct answer.'}`,
      childReasoning: `(simulated) ${A.keyFacts[0] || 'I remembered the rule.'}`,
      classification: 'clear_reasoning', understandingDepth: 'recognised', confidence: 'high',
      strategy: 'direct_explanation',
    },
  ], C.id === A.id ? [C] : [C, A], [{ id: 's1', minutes: 13 }, { id: 's2', minutes: 10 }, { id: 's3', minutes: 6 }]);
  // Dispute the early misconception explicitly — real call to the same
  // function the learner-card "That's not right" button uses.
  await disputeMisconception('demo_priya', course.id, C.id, catalogueEntry(C, mC).id);
  await addGlobalInsight('demo_priya', `[SEEDED DEMO DATA] step_by_step + a sound transfer answer addressed a misconception on "${C.label}"; the ledger entry is disputed; mastery is still recovering from the early wrong answers.`);

  // ── Backdate timestamps so this reads as real longitudinal history ──
  const SESSION_DAYS_AGO: Record<string, Record<string, number>> = {
    demo_aisha:  { s1: 8, s2: 3 },
    demo_marcus: { s1: 14, s2: 9, s3: 1 },
    demo_priya:  { s1: 11, s2: 6, s3: 2 },
  };
  backdateStudent('demo_aisha', SESSION_DAYS_AGO.demo_aisha);
  backdateStudent('demo_marcus', SESSION_DAYS_AGO.demo_marcus);
  backdateStudent('demo_priya', SESSION_DAYS_AGO.demo_priya);

  console.log('Seeded 3 simulated demo learners: demo_aisha, demo_marcus, demo_priya.');
  console.log(`Log in as "Aisha (Simulated)" / "Marcus (Simulated)" / "Priya (Simulated)" — they are ${course.board} · ${course.grade} learners.`);
}

function dataDir() {
  return process.env.LEARNER_DATA_DIR || path.join(process.cwd(), 'data');
}

/**
 * Shifts a learner's recorded timestamps back in time per sessionId, so the
 * profile and event log look like real history spread across days instead of
 * one seeding run a few seconds ago. Pure post-processing on the JSON files —
 * never touches a ladder/mastery/misconception VALUE, only WHEN it happened.
 * (File repository only; with Firestore learners the seed is not backdated.)
 */
function backdateStudent(studentId: string, daysAgoBySession: Record<string, number>) {
  const profilesFile = path.join(dataDir(), 'learner-profiles.json');
  const eventsFile = path.join(dataDir(), 'events', `${studentId}.json`);
  const now = Date.now();

  const sessionTimestamps: Record<string, number[]> = {};
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
      (sessionTimestamps[sid] = sessionTimestamps[sid] || []).push(ts);
    }
    fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2), 'utf-8');
  }

  if (!fs.existsSync(profilesFile)) return;
  const all = JSON.parse(fs.readFileSync(profilesFile, 'utf-8'));
  const learner = all[studentId];
  if (!learner) return;

  const allTimestamps = Object.values(sessionTimestamps).flat().sort((a, b) => a - b);
  let cursor = 0;
  const subject = learner.subjects[course.id];
  if (subject) {
    for (const cs of Object.values<any>(subject.conceptStates)) {
      if (Array.isArray(cs.evidenceLog)) {
        for (const ev of cs.evidenceLog) {
          ev.timestamp = allTimestamps[Math.min(cursor, allTimestamps.length - 1)] ?? now;
          cursor++;
        }
        if (cs.evidenceLog.length) cs.lastVisited = cs.evidenceLog[cs.evidenceLog.length - 1].timestamp;
      }
      for (const rec of cs.misconceptionLedger || []) {
        const oldest = allTimestamps[0] ?? now;
        const newest = allTimestamps[allTimestamps.length - 1] ?? now;
        if (rec.firstSeen) rec.firstSeen = oldest;
        if (rec.lastSeen) rec.lastSeen = newest;
        if (rec.disputedAt) rec.disputedAt = newest;
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
