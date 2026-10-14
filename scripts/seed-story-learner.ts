// ─────────────────────────────────────────────────────────────────
// Seed "Maya (Simulated)" — the demo child for the Parent view
// (docs/PARENT_VIEW.md). One learner, five lessons over twelve days, telling the
// story the 3-minute demo needs:
//   noticed a mix-up → seen again (confirmed) → Ananta changes how it teaches →
//   fixed in a question never seen before → a new, smaller mix-up being watched.
//
// Honesty: the CHILD'S ANSWERS are scripted (she is a simulated learner; the name
// carries "(Simulated)", the id starts "demo_", and the Parent view shows a
// "Simulated learner" badge). Everything derived from the answers — mastery,
// ladder, mix-up status, the "changed approach" moment, the next-lesson plan —
// comes from the app's real code (recordReasoningEvidence / BKT / ladder /
// compileTeachingPlan). With a Gemini key, the end-of-lesson summaries/claims
// and the parent letter are real Gemini output too (runProfiler, generateParentReport).
//
// Usage:
//   npm run seed:story                 real Gemini for lesson summaries + parent letter (needs GEMINI_API_KEY)
//   npm run seed:story -- --no-ai      fully offline: scripted lesson summaries, template letter
//   npm run seed:story -- --course <courseId>
// File-based learner store only (run on your PC, then `npm run migrate:cloud -- --only learners`).
// ─────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  getOrCreateLearner, ensureSubject, ensureConceptState, recordReasoningEvidence,
  incrementSessionCount, deleteLearner, getLearner,
} from '../src/adaptive/learnerStore';
import { getRepo, useFirestore } from '../src/adaptive/repo';
import type {
  CurriculumConcept, CurriculumSubject, EvidenceEvent, SessionSummary, TeachingStrategy, UnderstandingDepth,
} from '../src/adaptive/learnerModel';
import { listCurriculaAsync } from '../src/curriculum/ingest';
import { misconceptionCatalog } from '../src/adaptive/reasoningAssessor';
import { conceptTypeFor, gradeLabel, gradeLevelFromLabel } from '../src/curriculum/catalog';
import { validateClaims, mergeClaims, ProposedClaim } from '../src/adaptive/claimValidator';
import { runProfiler } from '../src/adaptive/profiler';
import { generateParentReport } from '../src/parent/report';

dotenv.config({ path: '.env' });

const STUDENT_ID = 'demo_maya';
const NAME = 'Maya (Simulated)';
const DAY = 24 * 3600 * 1000;
const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const NO_AI = process.argv.includes('--no-ai') || !process.env.GEMINI_API_KEY;

type Cls = 'clear_reasoning' | 'needs_clarification' | 'wrong_answer' | 'misconception_behind_correct' | 'no_reasoning_given';
interface Ex {
  s: 'm1' | 'm2' | 'm3' | 'm4' | 'm5';
  c: 'A' | 'B';
  type: 'teach' | 'check' | 'probe' | 'transfer';
  q: string; a: string; r: string;
  cls: Cls; depth: UnderstandingDepth; conf: 'high' | 'medium' | 'low';
  strat: TeachingStrategy;
  mis?: boolean;          // carries the concept's catalogued misconception
  help?: boolean;
}

// Concept A = equations of horizontal and vertical lines (misconception: a flat line is "x = c").
// Concept B = graphs of ax + by = k (misconception: dropping the sign of b when rearranging).
const SCRIPT: Ex[] = [
  // m1 — 12 days ago — Ananta explains directly
  { s: 'm1', c: 'A', type: 'check', q: 'Look at the points (1, 3), (4, 3) and (7, 3). What do you notice?', a: 'The second number is always 3.', r: 'I looked at all three and the 3 never changes.', cls: 'clear_reasoning', depth: 'understood', conf: 'high', strat: 'direct_explanation' },
  { s: 'm1', c: 'A', type: 'probe', q: 'A flat line passes through (3, −2). What is its equation?', a: 'x = 3', r: 'The line goes sideways along the x-axis, so I called it x.', cls: 'wrong_answer', depth: 'incorrect', conf: 'medium', strat: 'direct_explanation', mis: true },
  { s: 'm1', c: 'A', type: 'check', q: 'Which number stays the same along that flat line, the 3 or the −2?', a: 'The −2, I think.', r: '', cls: 'needs_clarification', depth: 'recognised', conf: 'low', strat: 'direct_explanation' },
  // m2 — 9 days ago — same slip again; Maya says she does not get it
  { s: 'm2', c: 'A', type: 'probe', q: 'Here is another flat line, through (−4, 7) and (2, 7). What is its equation?', a: 'x = 7', r: "It's flat, so it's an x one.", cls: 'wrong_answer', depth: 'incorrect', conf: 'medium', strat: 'direct_explanation', mis: true },
  { s: 'm2', c: 'A', type: 'check', q: 'What do you notice about those two points?', a: "I don't really get it. They both have 7 but the line says x.", r: "I don't get why it isn't x.", cls: 'needs_clarification', depth: 'confused', conf: 'low', strat: 'direct_explanation', help: true },
  // m3 — 6 days ago — Ananta stops explaining and shows points on the line instead
  { s: 'm3', c: 'A', type: 'check', q: 'Here are four points on that flat line: (−4, 7), (0, 7), (2, 7) and (9, 7). Which number never changes?', a: "7! It's always 7.", r: 'Every point has 7 as its second number.', cls: 'clear_reasoning', depth: 'understood', conf: 'high', strat: 'visual_diagram' },
  { s: 'm3', c: 'A', type: 'probe', q: 'So what is the equation of the flat line?', a: 'y = 7', r: 'Because y is 7 for every point on it.', cls: 'clear_reasoning', depth: 'applied', conf: 'high', strat: 'visual_diagram' },
  { s: 'm3', c: 'A', type: 'probe', q: 'Now an up-and-down line through (5, 1) and (5, 6). What is its equation?', a: 'x = 5', r: 'x is 5 for both points.', cls: 'clear_reasoning', depth: 'applied', conf: 'high', strat: 'visual_diagram' },
  // m4 — 3 days ago — a question she has never seen
  { s: 'm4', c: 'A', type: 'transfer', q: 'A rectangle has corners (1, 2), (7, 2), (7, 6) and (1, 6). Write the equation of each side.', a: 'y = 2, y = 6, x = 1 and x = 7.', r: 'The flat sides keep the same y, and the up-and-down sides keep the same x.', cls: 'clear_reasoning', depth: 'transferred', conf: 'high', strat: 'visual_diagram' },
  { s: 'm4', c: 'A', type: 'probe', q: 'What is the equation of the line through (−2, 5) and (6, 5)?', a: 'y = 5', r: 'Both points have y = 5, so y stays 5 all along.', cls: 'clear_reasoning', depth: 'applied', conf: 'high', strat: 'visual_diagram' },
  // m5 — yesterday — opens with a quick review of last lesson's topic, then the next topic with one sign slip
  { s: 'm5', c: 'A', type: 'check', q: 'Quick one from last time: what is the equation of the up-and-down line through (−1, 3) and (−1, 9)?', a: 'x = −1', r: 'The x is −1 for both points, so x stays −1.', cls: 'clear_reasoning', depth: 'applied', conf: 'high', strat: 'visual_diagram' },
  { s: 'm5', c: 'B', type: 'probe', q: 'Rearrange 3x − 4y = 12 into the form y = mx + c.', a: 'y = 3x/4 + 3', r: 'I moved the 3x across and divided by 4, and the sign stayed the same.', cls: 'wrong_answer', depth: 'incorrect', conf: 'medium', strat: 'step_by_step', mis: true },
  { s: 'm5', c: 'B', type: 'check', q: 'Does the point (4, 0) lie on the line 3x − 4y = 12?', a: 'Yes.', r: '3 times 4 is 12, and 4 times 0 is nothing.', cls: 'clear_reasoning', depth: 'understood', conf: 'high', strat: 'step_by_step' },
];

const SESSIONS: Record<string, { daysAgo: number; minutes: number; note: string }> = {
  m1: { daysAgo: 12, minutes: 14, note: 'Maya noticed that every point on a flat line shares the same second number, but then named the flat line through (3, −2) as “x = 3”. Ananta asked Maya to explain and saw that the line was being named after the axis it runs along.' },
  m2: { daysAgo: 9, minutes: 16, note: 'The same slip came up on a second flat line, so Ananta treated it as a real mix-up rather than a one-off. Maya said she did not understand why the line was not “x”.' },
  m3: { daysAgo: 6, minutes: 12, note: 'Ananta stopped explaining and listed several points on the line instead. Maya spotted the number that never changes, wrote y = 7, then correctly gave x = 5 for an up-and-down line.' },
  m4: { daysAgo: 3, minutes: 11, note: 'Maya wrote the equations of all four sides of a rectangle, explaining that flat sides keep the same y and up-and-down sides keep the same x.' },
  m5: { daysAgo: 1, minutes: 9, note: 'Maya moved on to rearranging equations such as 3x − 4y = 12 and dropped a sign once while dividing. Ananta will check this once more before treating it as a real mix-up.' },
};

function retime(events: EvidenceEvent[], now: number): Map<string, number> {
  const out = new Map<string, number>();
  const perSession: Record<string, number> = {};
  for (const e of events) {
    const meta = SESSIONS[e.sessionId]; if (!meta) continue;
    const idx = (perSession[e.sessionId] = (perSession[e.sessionId] ?? -1) + 1);
    out.set(e.eventId, now - meta.daysAgo * DAY + idx * 4 * 60 * 1000);
  }
  return out;
}

/** Shift timestamps back in time on the file store (values — mastery, ladder, status — are never touched). */
function backdate(courseId: string, now: number) {
  const dir = process.env.LEARNER_DATA_DIR || path.join(process.cwd(), 'data');
  const evFile = path.join(dir, 'events', `${STUDENT_ID}.json`);
  const profFile = path.join(dir, 'learner-profiles.json');
  const events = JSON.parse(fs.readFileSync(evFile, 'utf-8')) as EvidenceEvent[];
  const newTs = retime(events, now);
  for (const e of events) e.timestamp = newTs.get(e.eventId) ?? e.timestamp;
  fs.writeFileSync(evFile, JSON.stringify(events, null, 2));

  const all = JSON.parse(fs.readFileSync(profFile, 'utf-8'));
  const l = all[STUDENT_ID];
  const sub = l.subjects[courseId];
  const stamps = events.map((e) => e.timestamp).sort((a, b) => a - b);
  for (const cs of Object.values<any>(sub.conceptStates)) {
    const cEvents = events.filter((e) => e.conceptId === cs.conceptId);
    (cs.evidenceLog || []).forEach((ev: any, i: number) => { if (cEvents[i]) ev.timestamp = cEvents[i].timestamp; });
    if (cEvents.length) cs.lastVisited = cEvents[cEvents.length - 1].timestamp;
    for (const rec of cs.misconceptionLedger || []) {
      const hits = cEvents.filter((e) => (e.candidateMisconceptionIds || []).includes(rec.id));
      if (hits.length) { rec.firstSeen = hits[0].timestamp; rec.lastSeen = hits[hits.length - 1].timestamp; }
      if (rec.status === 'resolved') {
        const sound = cEvents.filter((e) => e.promptType === 'transfer' && !(e.candidateMisconceptionIds || []).length).pop();
        if (sound) rec.resolvedAt = sound.timestamp;
      }
    }
  }
  sub.lastSession = stamps[stamps.length - 1];
  l.createdAt = stamps[0];
  l.updatedAt = stamps[stamps.length - 1];
  fs.writeFileSync(profFile, JSON.stringify(all, null, 2));
}

async function main() {
  if (useFirestore()) {
    console.error('This script writes the local file store. Unset USE_FIRESTORE_LEARNERS (and run off Cloud Run), seed locally, then: npm run migrate:cloud -- --only learners');
    process.exit(1);
  }
  const courses = await listCurriculaAsync();
  const wanted = arg('--course') || 'igcse--g8--mathematics';
  const course: CurriculumSubject | undefined = courses.find((c) => c.id === wanted) || courses.find((c) => /mathematics/i.test(c.label) && (c.gradeLevel ?? 0) >= 6);
  if (!course) { console.error(`Course "${wanted}" not found. Available: ${courses.map((c) => c.id).join(', ')}`); process.exit(1); }
  const find = (slug: string): CurriculumConcept => {
    const c = course.concepts.find((k) => k.id.endsWith(`--${slug}`));
    if (!c) throw new Error(`Concept ending "--${slug}" not found in ${course.id}`);
    return c;
  };
  const A = find('equations-of-horizontal-and-vertical-lines');
  const B = find('graphs-of-linear-equations-in-the-form-ax-by-k');
  const mis = (c: CurriculumConcept, did: string) => {
    const d = (c.misconceptionDetails || []).find((m) => m.id === did);
    const e = d && misconceptionCatalog(c).find((x) => x.text === d.belief);
    if (!e) throw new Error(`Misconception ${did} not in the catalogue of ${c.id}`);
    return e;
  };
  const mA = mis(A, 'horizontal-line-named-x');
  const mB = mis(B, 'sign-error-rearranging-standard-form');
  const concept = { A, B };
  const catalogue = { A: mA, B: mB };

  await deleteLearner(STUDENT_ID);
  const level = course.gradeLevel ?? gradeLevelFromLabel(course.grade);
  const profile = await getOrCreateLearner(STUDENT_ID, NAME, level ? gradeLabel(level) : course.grade, { board: course.board, gradeLevel: level });
  await ensureSubject(STUDENT_ID, course.id, course.label, course.grade, course.source);
  for (const c of [A, B]) await ensureConceptState(STUDENT_ID, course.id, c.id, c.label, 'direct_explanation', conceptTypeFor(c));
  profile.onboarding = { interests: ['football'], subjectFeelings: { [course.id]: 'ok' }, accessibility: {}, languagePrefs: { primary: 'English' }, completedAt: Date.now() };
  const withOnb = (await getLearner(STUDENT_ID))!; withOnb.onboarding = profile.onboarding;
  await getRepo().saveProfile(withOnb);

  console.log(`Seeding Maya against ${course.board} · ${course.grade} · ${course.label}`);
  for (const ex of SCRIPT) {
    const c = concept[ex.c];
    await recordReasoningEvidence({
      studentId: STUDENT_ID, subjectId: course.id, conceptId: c.id, conceptType: conceptTypeFor(c),
      difficultyLevel: c.difficultyLevel || 3, promptType: ex.type,
      questionAsked: ex.q, childAnswer: ex.a, childReasoning: ex.r,
      classification: ex.cls, understandingDepth: ex.depth,
      candidateMisconceptions: ex.mis ? [catalogue[ex.c]] : [], confidence: ex.conf,
      strategyInUse: ex.strat, sessionId: ex.s, source: 'voice',
      helpRequested: ex.help, selfReportedConfusion: ex.help,
      moveUsed: ex.type === 'probe' ? 'DISCRIMINATING_PROBE' : ex.type === 'transfer' ? 'TRANSFER_FAR' : 'CHECK_UNDERSTANDING',
    });
  }
  for (const s of Object.values(SESSIONS)) await incrementSessionCount(STUDENT_ID, course.id, s.minutes);

  const now = Date.now();
  backdate(course.id, now);
  const repo = getRepo();
  const events = (await repo.listEvents(STUDENT_ID, { subjectId: course.id })) as EvidenceEvent[];

  // End-of-lesson step per lesson: real Gemini Profiler, or scripted offline.
  const apiKey = process.env.GEMINI_API_KEY || '';
  for (const sid of Object.keys(SESSIONS)) {
    const meta = SESSIONS[sid];
    const mine = events.filter((e) => e.sessionId === sid);
    const startedAt = mine[0].timestamp - 60_000;
    if (!NO_AI) {
      await runProfiler({ studentId: STUDENT_ID, subjectId: course.id, sessionId: sid, sessionStartedAt: startedAt, apiKey });
      const l = (await getLearner(STUDENT_ID))!;
      const sum = (l.sessionSummaries || []).find((x) => x.sessionId === sid);
      if (sum) {
        sum.startedAt = startedAt; sum.endedAt = mine[mine.length - 1].timestamp + 2 * 60_000;
        await repo.saveProfile(l); await repo.saveSessionSummary(STUDENT_ID, sid, sum);
      }
    } else {
      const moves: Record<string, number> = {}; const reps: Record<string, number> = {};
      for (const e of mine) { moves[e.moveUsed] = (moves[e.moveUsed] || 0) + 1; reps[e.representationUsed] = (reps[e.representationUsed] || 0) + 1; }
      const sum: SessionSummary = {
        sessionId: sid, startedAt, endedAt: mine[mine.length - 1].timestamp + 2 * 60_000,
        conceptsTouched: [...new Set(mine.map((e) => e.conceptId))], ladderMoves: [], misconceptionsChanged: [],
        movesUsed: moves, representationsUsed: reps, narrative: meta.note, planVersion: mine[mine.length - 1].planVersion || 'seeded',
      };
      const l = (await getLearner(STUDENT_ID))!;
      l.sessionSummaries = [...(l.sessionSummaries || []), sum];
      await repo.saveProfile(l); await repo.saveSessionSummary(STUDENT_ID, sid, sum);
    }
  }

  if (NO_AI) {
    // Scripted claims, still passed through the REAL claim validator (evidence ownership, banned labels, confidence cap).
    const idOf = (sess: string, i: number) => events.filter((e) => e.sessionId === sess)[i].eventId;
    const proposed: ProposedClaim[] = [
      { kind: 'strategy', statement: 'Listing several points that sit on a line helped Maya see which number stays constant and write the right equation.', childFriendly: 'Looking at several points on a line helps you spot the number that never changes.', scope: { subjectId: course.id, conceptId: A.id }, evidenceRefs: [idOf('m3', 0), idOf('m3', 1)] },
      { kind: 'strength', statement: 'Maya can explain that flat sides of a shape keep the same y-value and up-and-down sides keep the same x-value.', childFriendly: 'You can explain which number stays the same on flat and up-and-down lines.', scope: { subjectId: course.id, conceptId: A.id }, evidenceRefs: [idOf('m4', 0)] },
    ];
    const l = (await getLearner(STUDENT_ID))!;
    const v = validateClaims(proposed, { studentId: STUDENT_ID, ownedEventIds: new Set(events.map((e) => e.eventId)), existingClaims: l.claims || [] });
    l.claims = mergeClaims(l.claims || [], v.accepted);
    await repo.saveProfile(l);
    console.log(`Scripted claims: ${v.accepted.length} accepted, ${v.rejected.length} rejected by the validator.`);
  }

  const report = await generateParentReport(STUDENT_ID, course.id, NO_AI ? undefined : apiKey, true);
  const final = (await getLearner(STUDENT_ID))!;
  console.log(`\nDone. Maya (Simulated): ${events.length} answers over ${Object.keys(SESSIONS).length} lessons.`);
  console.log(`  mix-ups: ${Object.values(final.subjects[course.id].conceptStates).flatMap((c) => c.misconceptionLedger || []).map((m) => `${m.status}`).join(', ')}`);
  console.log(`  letter source: ${report?.narrative.source} (${report?.narrative.letter.length} sentences)${NO_AI ? ' — offline template; run without --no-ai on your PC for the Gemini letter' : ''}`);
  console.log('Open the app → Parent portal → Maya (Simulated).');
}

main().catch((e) => { console.error(e); process.exit(1); });
