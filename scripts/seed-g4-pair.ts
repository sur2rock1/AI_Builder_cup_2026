// ─────────────────────────────────────────────────────────────────
// Seed a PAIR of Grade 4 demo learners with contrasting histories, so the
// demo can show the same lesson taught differently to two children.
//
//   Maya (Simulated): picture-based explanations (number lines, place-value
//     charts, thermometers) worked; plain spoken explanations did not.
//     All three concepts mastered.
//   Leo (Simulated):  worked examples and step-by-step working worked;
//     pictures confused him. Still holds a confirmed misconception on
//     positive and negative numbers ("a bigger number after the minus
//     sign is a bigger number").
//
// Both have studied, in this order: reading/writing 4-digit numbers ->
// ordering and rounding -> positive and negative numbers. Both then open
// "Money and decimal place value". All four concepts share one concept type,
// so what the tutor learned about each child carries over.
//
// Like scripts/seed-demo-learners.ts this drives the REAL pipeline
// (recordReasoningEvidence -> BKT, ladder, misconception ledger, strategy
// profile); nothing sets a mastery or strategy value by hand. Only the
// timestamps are moved back so it reads as history over ten days.
// SIMULATED learners: ids start "demo_g4_", names end "(Simulated)", and every
// answer is marked "(simulated)".
//
// Usage:
//   npx tsx scripts/seed-g4-pair.ts            seed (skips learners that already exist)
//   npx tsx scripts/seed-g4-pair.ts --reset    clear both learners first, then seed
//   npx tsx scripts/seed-g4-pair.ts --show     only print what the tutor and the parent view will say
// ─────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import {
  getOrCreateLearner, ensureSubject, ensureConceptState,
  recordReasoningEvidence, incrementSessionCount, addGlobalInsight, getLearner,
} from '../src/adaptive/learnerStore';
import type {
  CurriculumConcept, CurriculumSubject, MisconceptionDetail, TeachingStrategy, UnderstandingDepth,
} from '../src/adaptive/learnerModel';
import { listCurriculaAsync } from '../src/curriculum/ingest';
import { misconceptionCatalog } from '../src/adaptive/reasoningAssessor';
import { conceptTypeFor, gradeLabel, gradeLevelFromLabel } from '../src/curriculum/catalog';
import { compileTeachingPlan, renderPlanForPrompt } from '../src/plan';
import { getParentReport } from '../src/parent/report';
import { computeMasteryStatus } from '../src/adaptive/ladder';

const COURSE = 'cambridge-lower-secondary--g4--mathematics';
const C1 = `${COURSE}--number--reading-writing-and-partitioning-4-digit-numbers`;
const C2 = `${COURSE}--number--ordering-and-rounding-whole-numbers`;
const C3 = `${COURSE}--number--positive-and-negative-numbers`;
const NEXT = `${COURSE}--number--money-and-decimal-place-value`;
const MAYA = 'demo_g4_maya';
const LEO = 'demo_g4_leo';

type Classification = 'clear_reasoning' | 'needs_clarification' | 'misconception_behind_correct' | 'wrong_answer' | 'no_reasoning_given';
interface Exchange {
  sessionId: string;
  promptType: 'teach' | 'check' | 'probe' | 'transfer';
  concept: CurriculumConcept;
  questionAsked: string;
  childAnswer: string;
  childReasoning: string;
  classification: Classification;
  understandingDepth: UnderstandingDepth;
  misconceptions?: Array<{ id: string; text: string }>;
  confidence: 'high' | 'medium' | 'low';
  strategy: TeachingStrategy;
}

let course: CurriculumSubject;
const concept = (id: string) => {
  const c = course.concepts.find((x) => x.id === id);
  if (!c) throw new Error(`Concept ${id} is not in ${course.id}`);
  return c;
};
const ladder = (c: CurriculumConcept, level: number) => c.ladderItems?.find((l) => l.level === level);
const firstMisconception = (c: CurriculumConcept): MisconceptionDetail => {
  const m = (c.misconceptionDetails || []).find((x) => x.id);
  if (!m) throw new Error(`${c.label} has no catalogued misconception`);
  return m;
};
const catalogueEntry = (c: CurriculumConcept, m: MisconceptionDetail) => {
  const e = misconceptionCatalog(c).find((x) => x.text === m.belief);
  if (!e) throw new Error(`No catalogue entry for "${m.belief}" on ${c.id}`);
  return e;
};
const belief = (b: string) => `(simulated) I thought ${b.replace(/^(students|learners|pupils|children)\s+(often\s+|may\s+|sometimes\s+)?(think|believe|assume|say|claim)s?\s+(that\s+)?/i, '').replace(/^./, (x) => x.toLowerCase())}`;

/** Holds the misconception: answer looks plausible, reasoning is wrong. */
function misconceived(c: CurriculumConcept, sessionId: string, strategy: TeachingStrategy, again = false): Exchange {
  const m = firstMisconception(c);
  return {
    sessionId, promptType: 'probe', concept: c,
    questionAsked: again && m.triggerPattern ? `A new case: ${m.triggerPattern}. What happens here?` : m.probeQuestion,
    childAnswer: again ? '(simulated) Same as before, I think.' : '(simulated) Yes, I think so.',
    childReasoning: belief(m.belief),
    classification: 'misconception_behind_correct', understandingDepth: 'incorrect', confidence: 'medium',
    strategy, misconceptions: [catalogueEntry(c, m)],
  };
}
/** Lost: could not follow this way of explaining. */
function lost(c: CurriculumConcept, sessionId: string, strategy: TeachingStrategy): Exchange {
  return {
    sessionId, promptType: 'check', concept: c,
    questionAsked: ladder(c, 2)?.prompt || `What does this show about ${c.label}?`,
    childAnswer: "(simulated) I don't really get the picture.",
    childReasoning: '(simulated) I was not sure what to look at.',
    classification: 'no_reasoning_given', understandingDepth: 'confused', confidence: 'low',
    strategy,
  };
}
/** Half-way: right idea, shaky explanation. */
function partial(c: CurriculumConcept, sessionId: string, strategy: TeachingStrategy): Exchange {
  return {
    sessionId, promptType: 'check', concept: c,
    questionAsked: ladder(c, 2)?.prompt || `Explain ${c.label} in your own words.`,
    childAnswer: `(simulated) ${ladder(c, 2)?.lookFor || 'Partly right.'}`,
    childReasoning: '(simulated) I think it is like that but I am not sure why.',
    classification: 'needs_clarification', understandingDepth: 'recognised', confidence: 'low',
    strategy,
  };
}
/** Sound reasoning at ladder level 3 (apply) or 4 (transfer). */
function sound(c: CurriculumConcept, level: 3 | 4, sessionId: string, strategy: TeachingStrategy): Exchange {
  const item = ladder(c, level);
  return {
    sessionId, promptType: level === 4 ? 'transfer' : 'probe', concept: c,
    questionAsked: item?.prompt || (level === 4 ? `Use ${c.label} in a new situation.` : `Try a new problem on ${c.label}.`),
    childAnswer: `(simulated) ${item?.lookFor || 'A correct answer with a sound method.'}`,
    childReasoning: `(simulated) ${c.keyFacts[0] || 'I used the method we practised.'}`,
    classification: 'clear_reasoning', understandingDepth: level === 4 ? 'transferred' : 'applied', confidence: 'high',
    strategy,
  };
}

async function seed(studentId: string, name: string, interests: string[], exchanges: Exchange[], minutes: Record<string, number>) {
  const level = course.gradeLevel ?? gradeLevelFromLabel(course.grade);
  await getOrCreateLearner(studentId, name, level ? gradeLabel(level) : course.grade, { board: course.board, gradeLevel: level });
  await ensureSubject(studentId, course.id, course.label, course.grade, course.source);
  for (const id of [C1, C2, C3, NEXT]) {
    const c = concept(id);
    await ensureConceptState(studentId, course.id, c.id, c.label, 'direct_explanation', conceptTypeFor(c));
  }
  for (const ex of exchanges) {
    await recordReasoningEvidence({
      studentId, subjectId: course.id, conceptId: ex.concept.id, conceptType: conceptTypeFor(ex.concept),
      difficultyLevel: ex.concept.difficultyLevel || 2, promptType: ex.promptType,
      questionAsked: ex.questionAsked, childAnswer: ex.childAnswer, childReasoning: ex.childReasoning,
      classification: ex.classification, understandingDepth: ex.understandingDepth,
      candidateMisconceptions: ex.misconceptions || [], confidence: ex.confidence,
      strategyInUse: ex.strategy, sessionId: ex.sessionId, source: 'voice',
      moveUsed: ex.promptType === 'probe' ? 'DISCRIMINATING_PROBE' : ex.promptType === 'transfer' ? 'TRANSFER_FAR' : 'CHECK_UNDERSTANDING',
    });
  }
  for (const m of Object.values(minutes)) await incrementSessionCount(studentId, course.id, m);
  // Finish onboarding so the demo goes straight to the lesson (same shape the app writes).
  const all = readProfiles();
  const p = all[studentId];
  p.onboarding = { interests, subjectFeelings: { [course.id]: 'ok' }, accessibility: { audioFirst: false, largeText: false, captions: false }, completedAt: Date.now() };
  p.tutorName = p.tutorName || 'Ananta';
  writeProfiles(all);
}

// ── file helpers (local file repository; the demo runs on local data) ──
const dataDir = () => process.env.LEARNER_DATA_DIR || path.join(process.cwd(), 'data');
const profilesFile = () => path.join(dataDir(), 'learner-profiles.json');
const readProfiles = () => JSON.parse(fs.readFileSync(profilesFile(), 'utf-8'));
const writeProfiles = (all: any) => fs.writeFileSync(profilesFile(), JSON.stringify(all, null, 2), 'utf-8');

/** Clear a learner without deleting files (the files are emptied in place). */
function clearLearner(studentId: string) {
  const all = readProfiles();
  delete all[studentId];
  writeProfiles(all);
  for (const [dir, empty] of [['events', '[]'], ['plans', '{}'], ['sessions', '{}']] as const) {
    const f = path.join(dataDir(), dir, `${studentId}.json`);
    if (fs.existsSync(f)) fs.writeFileSync(f, empty, 'utf-8');
  }
}

/** Move timestamps back per session so the history spans days (only WHEN, never a value). */
function backdate(studentId: string, daysAgo: Record<string, number>) {
  const now = Date.now();
  const eventsFile = path.join(dataDir(), 'events', `${studentId}.json`);
  const stamps: number[] = [];
  if (fs.existsSync(eventsFile)) {
    const events = JSON.parse(fs.readFileSync(eventsFile, 'utf-8')) as any[];
    const n: Record<string, number> = {};
    for (const ev of events) {
      const d = daysAgo[ev.sessionId];
      if (d === undefined) continue;
      const i = (n[ev.sessionId] = (n[ev.sessionId] || 0) + 1) - 1;
      ev.timestamp = now - d * 86400000 + i * 6 * 60000;
      stamps.push(ev.timestamp);
    }
    fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2), 'utf-8');
  }
  stamps.sort((a, b) => a - b);
  const all = readProfiles();
  const learner = all[studentId];
  const subject = learner?.subjects?.[course.id];
  if (subject) {
    let k = 0;
    for (const cs of Object.values<any>(subject.conceptStates)) {
      for (const ev of cs.evidenceLog || []) { ev.timestamp = stamps[Math.min(k++, stamps.length - 1)] ?? now; }
      if (cs.evidenceLog?.length) cs.lastVisited = cs.evidenceLog[cs.evidenceLog.length - 1].timestamp;
      for (const rec of cs.misconceptionLedger || []) {
        if (rec.firstSeen) rec.firstSeen = stamps[0] ?? now;
        if (rec.lastSeen) rec.lastSeen = stamps[stamps.length - 1] ?? now;
      }
    }
    subject.lastSession = stamps[stamps.length - 1] ?? now;
  }
  if (learner && stamps.length) { learner.createdAt = stamps[0]; learner.updatedAt = stamps[stamps.length - 1]; }
  writeProfiles(all);
}

function simulatedReviewPass(studentId: string, conceptIds: string[]) {
  const all = readProfiles();
  const subject = all[studentId]?.subjects?.[course.id];
  for (const id of conceptIds) {
    const cs = subject?.conceptStates?.[id];
    if (!cs) continue;
    const input = {
      pKnown: typeof cs.pKnown === 'number' ? cs.pKnown : (cs.masteryScore ?? 0) / 100,
      ladder: cs.ladder,
      anyConfirmedMisconceptionStanding: (cs.misconceptionLedger || []).some((m: any) => m.status === 'confirmed'),
    };
    if (computeMasteryStatus({ ...input, review: undefined }) !== 'provisional') continue;   // not learned yet: leave it
    cs.review = { nextDueAt: Date.now() + 5 * 86400000, intervalDays: 3, passes: 1, lapses: 0 };
    cs.masteryStatus = computeMasteryStatus({ ...input, review: cs.review });
  }
  writeProfiles(all);
}

async function show() {
  for (const [id, name] of [[MAYA, 'Maya'], [LEO, 'Leo']] as const) {
    const learner = await getLearner(id);
    if (!learner) { console.log(`${id}: not seeded`); continue; }
    const states = learner.subjects[course.id]?.conceptStates || {};
    console.log(`\n══ ${learner.name} ══`);
    for (const cid of [C1, C2, C3, NEXT]) {
      const cs: any = states[cid];
      const mis = (cs?.misconceptionLedger || []).filter((m: any) => m.status === 'confirmed' || m.status === 'suspected').map((m: any) => `${m.status}: ${m.text}`);
      const score = cs?.masteryScore ?? 0;
      console.log(`  ${concept(cid).label}: ${cs?.masteryLevel ?? '-'} / ${cs?.masteryStatus ?? 'none'} (${Math.round(score > 1 ? score : score * 100)}%)${mis.length ? ' | ' + mis.join('; ') : ''}`);
    }
    const plan = compileTeachingPlan(learner, course, { studentId: id, subjectId: course.id, channel: 'voice', requestedConceptId: NEXT });
    console.log(`\n  -- What the tutor is told when ${name} opens "${concept(NEXT).label}" --`);
    console.log(renderPlanForPrompt(plan, name).split('\n').map((l) => '  ' + l).join('\n'));
    const report: any = await getParentReport(id, course.id);
    if (report) {
      console.log(`\n  -- Parent View (key lines) --`);
      const nl = report.nextLesson || {};
      if (nl.focus) console.log(`  Next lesson: ${nl.focus}`);
      for (const w of nl.willDo || nl.plan || []) console.log(`   - ${typeof w === 'string' ? w : JSON.stringify(w)}`);
      for (const s of (report.switches || report.howWeFiguredOut || []).slice(0, 3)) console.log(`   * ${typeof s === 'string' ? s : (s.caption || JSON.stringify(s)).slice(0, 220)}`);
    }
  }
}

async function main() {
  const courses = await listCurriculaAsync();
  const found = courses.find((c) => c.id === COURSE);
  if (!found) { console.error(`Course ${COURSE} is not in the library.`); process.exit(1); }
  course = found;
  if (process.argv.includes('--show')) { await show(); return; }

  const reset = process.argv.includes('--reset');
  const existing = readProfiles();
  if (!reset && (existing[MAYA] || existing[LEO])) {
    console.log('Maya/Leo already exist. Use --reset to re-create them, or --show to print what they will see.');
    await show();
    return;
  }
  if (reset) { clearLearner(MAYA); clearLearner(LEO); console.log('Reset: cleared demo_g4_maya and demo_g4_leo.'); }

  const c1 = concept(C1), c2 = concept(C2), c3 = concept(C3);

  // Maya: plain spoken explanation misses; a picture (place-value chart, number line, thermometer) lands every time.
  await seed(MAYA, 'Maya (Simulated)', ['football', 'drawing'], [
    misconceived(c1, 's1', 'direct_explanation'),
    sound(c1, 3, 's1', 'visual_diagram'),
    sound(c1, 4, 's1', 'visual_diagram'),
    partial(c2, 's2', 'direct_explanation'),
    sound(c2, 3, 's2', 'visual_diagram'),
    sound(c2, 4, 's2', 'visual_diagram'),
    misconceived(c3, 's3', 'direct_explanation'),
    misconceived(c3, 's3', 'direct_explanation', true),
    sound(c3, 3, 's3', 'visual_diagram'),
    sound(c3, 4, 's3', 'visual_diagram'),
    sound(c3, 3, 's4', 'visual_diagram'),
    sound(c3, 4, 's4', 'visual_diagram'),
    sound(c3, 3, 's4', 'visual_diagram'),
  ], { s1: 14, s2: 12, s3: 15, s4: 8 });
  await addGlobalInsight(MAYA, '[SEEDED DEMO DATA] Picture-based explanations (place-value chart, number line, thermometer) resolved what spoken explanation had not, on all three concepts.');
  backdate(MAYA, { s1: 10, s2: 6, s3: 3, s4: 1 });

  // Leo: pictures leave him unsure; a worked example, then the steps written out, works. Negative numbers not settled yet.
  await seed(LEO, 'Leo (Simulated)', ['cooking', 'Lego'], [
    lost(c1, 's1', 'visual_diagram'),
    sound(c1, 3, 's1', 'worked_example'),
    sound(c1, 4, 's1', 'step_by_step'),
    lost(c2, 's2', 'visual_diagram'),
    sound(c2, 3, 's2', 'step_by_step'),
    sound(c2, 4, 's2', 'worked_example'),
    misconceived(c3, 's3', 'visual_diagram'),
    misconceived(c3, 's3', 'visual_diagram', true),
    partial(c3, 's3', 'worked_example'),
  ], { s1: 13, s2: 11, s3: 16 });
  await addGlobalInsight(LEO, '[SEEDED DEMO DATA] Worked examples and step-by-step working helped where pictures did not; still believes a bigger number after the minus sign is bigger.');
  backdate(LEO, { s1: 9, s2: 5, s3: 1 });

  // Spaced review is not built in the app (T15), so nothing ever marks a concept durably mastered and the Parent View would
  // keep recommending the first concept. As scripts/seed-demo-learners.ts does, set a passed review by hand - but only where
  // the app's own rule already says "provisional" - and let the app's rule (computeMasteryStatus) decide the status.
  simulatedReviewPass(MAYA, [C1, C2, C3]);
  simulatedReviewPass(LEO, [C1, C2, C3]);

  console.log('Seeded demo_g4_maya ("Maya (Simulated)") and demo_g4_leo ("Leo (Simulated)") - Grade 4, Cambridge.');
  await show();
}

main().catch((err) => { console.error(err); process.exit(1); });
