// ─────────────────────────────────────────────────────────────────
// compileTeachingPlan() — deterministic (T17). See docs/TEACHING_PLAN.md
// §4 for the numbered rules this implements (R-REVIEW, R-TARGET, ...).
// GenAI is deliberately NOT used here: the plan must be testable,
// reproducible for the demo, and explainable to a judge or a parent.
// ─────────────────────────────────────────────────────────────────
import {
  LearnerProfile, ConceptState, CurriculumSubject, CurriculumConcept,
  TeachingStrategy,
} from '../adaptive/learnerModel';
import { rankRepresentations, MIN_USES_BEFORE_AVOID, AVOID_THRESHOLD } from '../adaptive/strategyProfile';
import { representationsForMode } from '../persona/representations';
import { subjectModeForSubject } from '../persona/subjectModes';
import { ageBandFromGrade } from '../persona/ageBands';
import { AGE_BAND_CONFIG, LIMITS } from '../persona/config';
import { PERSONA_VERSION } from '../persona/config';
import { PlanReason, TeachingPlan } from './types';
import { Channel } from '../persona/channels';

export interface CompileContext {
  studentId: string;
  subjectId: string;
  channel: Channel;
  requestedConceptId?: string;
  now?: number;
}

function reason(rule: string, text: string, evidenceRefs: string[] = []): PlanReason {
  return { rule, text, evidenceRefs };
}

function conceptState(learner: LearnerProfile, subjectId: string, conceptId: string): ConceptState | undefined {
  return learner.subjects[subjectId]?.conceptStates?.[conceptId];
}

function isDurable(cs: ConceptState | undefined): boolean {
  return cs?.masteryStatus === 'durable' || cs?.masteryStatus === 'durable_plus';
}

let planCounter: Record<string, number> = {};
function nextPlanVersion(studentId: string, subjectId: string): string {
  const key = `${studentId}:${subjectId}`;
  planCounter[key] = (planCounter[key] || 0) + 1;
  return `${key}:${planCounter[key]}`;
}

export function compileTeachingPlan(
  learner: LearnerProfile,
  curriculum: CurriculumSubject,
  ctx: CompileContext,
): TeachingPlan {
  const now = ctx.now ?? Date.now();
  const subject = learner.subjects[ctx.subjectId];
  const ageBand = learner.ageBand || ageBandFromGrade(learner.grade);
  const ageCfg = AGE_BAND_CONFIG[ageBand];
  const subjectMode = subjectModeForSubject(ctx.subjectId, curriculum.label);

  // R-REVIEW — due spaced reviews, max 3, most-overdue first.
  const reviewItems: TeachingPlan['reviewItems'] = Object.values(subject?.conceptStates || {})
    .filter((cs) => cs.review?.nextDueAt && cs.review.nextDueAt <= now)
    .sort((a, b) => (a.review!.nextDueAt! - b.review!.nextDueAt!))
    .slice(0, 3)
    .map((cs) => ({
      conceptId: cs.conceptId, label: cs.label,
      reason: reason('R-REVIEW', `Review due (overdue by ${Math.round((now - cs.review!.nextDueAt!) / 3_600_000)}h).`),
    }));

  // R-TARGET / R-PREREQ-FIRST — pick the target concept.
  let targetConceptDef: CurriculumConcept | undefined = ctx.requestedConceptId
    ? curriculum.concepts.find((c) => c.id === ctx.requestedConceptId)
    : undefined;
  let targetReason = reason('R-TARGET', 'Requested concept.');
  if (!targetConceptDef) {
    targetConceptDef = [...curriculum.concepts]
      .sort((a, b) => a.typicalTeachingOrder - b.typicalTeachingOrder)
      .find((c) => {
        const cs = conceptState(learner, ctx.subjectId, c.id);
        return !cs || (cs.masteryStatus !== 'durable' && cs.masteryStatus !== 'durable_plus');
      });
    targetReason = reason('R-TARGET', 'Next concept in teaching order without durable mastery.');
  }
  if (!targetConceptDef) targetConceptDef = curriculum.concepts[0];

  // Check the target's direct prerequisites are strong enough (pKnown >= 0.6);
  // if not, the WEAKEST prerequisite becomes the target instead (R-PREREQ-FIRST).
  const prereqIds = targetConceptDef.prerequisites || [];
  const weakPrereq = prereqIds
    .map((id) => ({ id, cs: conceptState(learner, ctx.subjectId, id) }))
    .find(({ cs }) => (cs?.pKnown ?? 0) < 0.6);
  if (weakPrereq) {
    const prereqDef = curriculum.concepts.find((c) => c.id === weakPrereq.id);
    if (prereqDef) {
      targetConceptDef = prereqDef;
      targetReason = reason('R-PREREQ-FIRST', `Prerequisite "${prereqDef.label}" is not yet solid (pKnown ${((weakPrereq.cs?.pKnown ?? 0) * 100).toFixed(0)}%).`);
    }
  }
  const targetConceptState = conceptState(learner, ctx.subjectId, targetConceptDef.id);

  // R-PROBE — prerequisites to probe, max LIMITS.maxPrereqProbes, skipping
  // ones with recent strong evidence.
  const prerequisitesToProbe: TeachingPlan['prerequisitesToProbe'] = (targetConceptDef.prerequisites || [])
    .map((id) => curriculum.concepts.find((c) => c.id === id))
    .filter((c): c is CurriculumConcept => !!c)
    .filter((c) => !isDurable(conceptState(learner, ctx.subjectId, c.id)))
    .slice(0, LIMITS.maxPrereqProbes)
    .map((c) => ({
      conceptId: c.id, label: c.label,
      checkQuestion: c.prerequisiteDetails?.[0]?.checkQuestion,
      reason: reason('R-PROBE', `Direct prerequisite of "${targetConceptDef!.label}" without durable mastery.`),
    }));

  // R-WATCH — misconceptions to watch: this concept's ledger + confirmed
  // misconceptions on sibling concepts of the same conceptType.
  const watchMisconceptions: TeachingPlan['watchMisconceptions'] = [];
  for (const rec of targetConceptState?.misconceptionLedger || []) {
    if (rec.status === 'suspected' || rec.status === 'confirmed') {
      watchMisconceptions.push({
        id: rec.id, text: rec.text, status: rec.status,
        reason: reason('R-WATCH', `${rec.status} on this concept (${rec.observations} observation(s)).`, []),
      });
    }
  }
  const conceptType = targetConceptState?.conceptType || targetConceptDef.chapter || 'general';
  for (const otherCs of Object.values(subject?.conceptStates || {})) {
    if (otherCs.conceptId === targetConceptDef.id) continue;
    if ((otherCs.conceptType || '') !== conceptType) continue;
    for (const rec of otherCs.misconceptionLedger || []) {
      if (rec.status === 'confirmed' && !watchMisconceptions.some((w) => w.id === rec.id)) {
        watchMisconceptions.push({
          id: rec.id, text: rec.text, status: 'confirmed',
          reason: reason('R-WATCH', `Confirmed on a related concept ("${otherCs.label}") of the same type — the same wrong rule often recurs.`),
        });
      }
    }
  }

  // R-REP / R-AVOID — representation order from the cross-concept strategy profile.
  const candidates = representationsForMode(subjectMode);
  const ranked = rankRepresentations(learner.strategyProfile, conceptType, candidates);
  const hasData = ranked.some((r) => r.uses > 0);
  const representationOrder: TeachingPlan['representationOrder'] = ranked.map((r) => ({
    strategy: r.strategy, expected: r.expected,
    reason: r.uses > 0
      ? reason('R-REP', `${r.uses} use(s) on "${conceptType}" concepts; ${(r.expected * 100).toFixed(0)}% led to a gain.`)
      : reason('R-REP', hasData ? 'No track record yet for this representation on this concept type.' : `Default order for a ${subjectMode.replace('_', '-')} subject — no evidence yet.`),
  }));
  const avoidRepresentations: TeachingPlan['avoidRepresentations'] = ranked
    .filter((r) => r.uses >= MIN_USES_BEFORE_AVOID && r.expected < AVOID_THRESHOLD)
    .map((r) => ({
      strategy: r.strategy,
      reason: reason('R-AVOID', `${r.uses} uses, only ${(r.expected * 100).toFixed(0)}% led to a gain.`),
    }));

  // R-SCAFFOLD
  const highestLevel = targetConceptState?.ladder?.highestLevel ?? 0;
  const scaffoldLevel: TeachingPlan['scaffoldLevel'] =
    highestLevel <= 1 ? 'full' : highestLevel <= 3 ? 'faded' : 'independent';

  // R-DIFF
  let difficulty = (targetConceptDef.difficultyLevel || 2) as TeachingPlan['difficulty'];
  const recentEvents = (targetConceptState?.evidenceLog || []).slice(-5);
  if (recentEvents.length >= 3) {
    const successRate = recentEvents.filter((e) => ['applied', 'transferred', 'understood'].includes(e.understandingDepth)).length / recentEvents.length;
    if (successRate > 0.9 && difficulty < 5) difficulty = (difficulty + 1) as TeachingPlan['difficulty'];
    else if (successRate < 0.6 && difficulty > 1) difficulty = (difficulty - 1) as TeachingPlan['difficulty'];
  }

  // R-FAST
  const allPrereqsDurable = prereqIds.every((id) => isDurable(conceptState(learner, ctx.subjectId, id)));
  const fastTrackEligible = allPrereqsDurable && highestLevel >= 2;

  // R-GOAL
  const startLadderGoal: TeachingPlan['startLadderGoal'] =
    highestLevel === 0 ? 3 : isDurable(targetConceptState) === false && highestLevel >= 3 ? 4 : (ageBand !== '5-7' ? 5 : 4);

  // R-PACE
  let checkEvery = ageCfg.checkEvery;
  const confusionCount = Object.values(learner.affect?.confusionSignals || {}).reduce((a, b) => a + b, 0);
  if (confusionCount >= 4 && checkEvery > 1) checkEvery -= 1;

  // R-TALK
  const thinkAloudLines: string[] = [];
  const bestRep = representationOrder[0];
  if (bestRep && bestRep.expected > 0.5 && bestRep.reason.rule === 'R-REP' && ranked[0]?.uses > 0) {
    thinkAloudLines.push(`Last time, ${bestRep.strategy.replace(/_/g, ' ')} really helped you with this kind of idea — let's start there.`);
  } else {
    thinkAloudLines.push("I'm still getting to know how you think — tell me if anything's too easy or too hard.");
  }

  const planVersion = nextPlanVersion(ctx.studentId, ctx.subjectId);

  return {
    planVersion,
    personaVersion: PERSONA_VERSION,
    generatedAt: now,
    studentId: ctx.studentId,
    subjectId: ctx.subjectId,
    channel: ctx.channel,
    ageBand,
    subjectMode,
    reviewItems,
    targetConcept: { conceptId: targetConceptDef.id, label: targetConceptDef.label, reason: targetReason },
    prerequisitesToProbe,
    startLadderGoal,
    representationOrder,
    avoidRepresentations,
    scaffoldLevel,
    difficulty,
    fastTrackEligible,
    exampleThemes: learner.onboarding?.interests || [],
    watchMisconceptions,
    pace: {
      chunkSentences: ageCfg.chunkSentences,
      checkEvery,
      confidenceCheckEvery: ageCfg.confidenceCheckEvery,
      sessionMinutes: ageCfg.sessionMinutes,
    },
    limits: {
      probeBudget: LIMITS.probeBudgetPerQuestion,
      retryCap: LIMITS.retryCapPerConcept,
      maxChecksWithoutTeach: LIMITS.maxConsecutiveChecksWithoutTeach,
      maxPrereqProbes: LIMITS.maxPrereqProbes,
    },
    register: ageCfg.register,
    accessibility: learner.onboarding?.accessibility || {},
    thinkAloudLines,
  };
}
