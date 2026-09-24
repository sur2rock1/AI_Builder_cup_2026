// ─────────────────────────────────────────────────────────────────
// Learner Store — orchestrates reads/writes through the repository
// layer (src/adaptive/repo). (T03: was a direct JSON-file reader/writer;
// now backend-agnostic and async. T10: records ladder level, mastery
// status, cross-concept strategy profile and affect alongside the
// existing BKT + misconception-ledger logic.)
// ─────────────────────────────────────────────────────────────────
import {
  LearnerProfile, ConceptState, TeachingStrategy, MasteryLevel,
  AdaptiveSessionState, AssessmentResult, QuizAttempt,
  EvidenceEvent, ErrorClass, Confidence3, MisconceptionRecord,
} from './learnerModel';
import { getRepo } from './repo';
import { updateMastery, BKTObservation } from './bkt';
import { ladderLevelForDepth, updateLadder, computeMasteryStatus } from './ladder';
import { recordStrategyOutcome } from './strategyProfile';

function scoreToLevel(score: number): MasteryLevel {
  if (score === 0)  return 'not_started';
  if (score < 20)   return 'exposed';
  if (score < 40)   return 'partial';
  if (score < 60)   return 'developing';
  if (score < 80)   return 'proficient';
  return 'mastered';
}

// ─── Public profile API ─────────────────────────────────────────

export async function getOrCreateLearner(studentId: string, name: string, grade: string): Promise<LearnerProfile> {
  const repo = getRepo();
  const existing = await repo.getProfile(studentId);
  if (existing) return existing;
  const fresh: LearnerProfile = {
    studentId, name, grade,
    createdAt: Date.now(), updatedAt: Date.now(),
    subjects: {}, globalInsights: [],
  };
  await repo.saveProfile(fresh);
  return fresh;
}
export async function getLearner(studentId: string): Promise<LearnerProfile | null> {
  return getRepo().getProfile(studentId);
}
export async function listLearners(): Promise<LearnerProfile[]> {
  return getRepo().listProfiles();
}
export async function deleteLearner(studentId: string): Promise<void> {
  return getRepo().deleteProfile(studentId);
}

export async function ensureSubject(
  studentId: string, subjectId: string, subjectLabel: string, grade: string, curriculumSource: string
): Promise<void> {
  const repo = getRepo();
  const learner = await repo.getProfile(studentId);
  if (!learner) return;
  if (!learner.subjects[subjectId]) {
    learner.subjects[subjectId] = {
      subjectId, subjectLabel, grade, curriculumSource,
      conceptStates: {}, sessionCount: 0, totalMinutes: 0, lastSession: Date.now(),
    };
    await repo.saveProfile(learner);
  }
}

export async function ensureConceptState(
  studentId: string, subjectId: string, conceptId: string,
  label: string, initialStrategy: TeachingStrategy = 'direct_explanation',
  conceptType: string = 'general',
): Promise<ConceptState | null> {
  const repo = getRepo();
  const learner = await repo.getProfile(studentId);
  if (!learner?.subjects?.[subjectId]) return null;
  if (!learner.subjects[subjectId].conceptStates[conceptId]) {
    learner.subjects[subjectId].conceptStates[conceptId] = {
      conceptId, label, masteryLevel: 'not_started', masteryScore: 0,
      attemptCount: 0, correctCount: 0, lastVisited: Date.now(),
      strategiesUsed: [initialStrategy], effectiveStrategies: [],
      ineffectiveStrategies: [], confirmedMisconceptions: [],
      suspectedMisconceptions: [], quizHistory: [], prerequisitesGapped: [], notes: [],
      conceptType, masteryStatus: 'none',
    };
    await repo.saveProfile(learner);
  }
  return learner.subjects[subjectId].conceptStates[conceptId];
}

export async function getConceptState(
  studentId: string, subjectId: string, conceptId: string
): Promise<ConceptState | null> {
  const learner = await getRepo().getProfile(studentId);
  return learner?.subjects?.[subjectId]?.conceptStates?.[conceptId] || null;
}

export async function recordAttempt(
  studentId: string, subjectId: string, conceptId: string,
  attempt: QuizAttempt, assessment: AssessmentResult
): Promise<void> {
  const repo = getRepo();
  const learner = await repo.getProfile(studentId);
  if (!learner?.subjects?.[subjectId]?.conceptStates?.[conceptId]) return;
  const cs = learner.subjects[subjectId].conceptStates[conceptId];

  cs.quizHistory.push(attempt);
  cs.attemptCount += 1;
  if (attempt.isCorrect) cs.correctCount += 1;
  cs.lastVisited = Date.now();

  cs.masteryScore = Math.max(0, Math.min(100, cs.masteryScore + assessment.masteryDelta));
  cs.masteryLevel = scoreToLevel(cs.masteryScore);

  if (assessment.misconceptionDetected && assessment.misconceptionDescription) {
    const desc = assessment.misconceptionDescription;
    if (!cs.suspectedMisconceptions.includes(desc)) cs.suspectedMisconceptions.push(desc);
    const occurrences = cs.quizHistory.filter(q => q.misconceptionDetected === desc).length;
    if (occurrences >= 2 && !cs.confirmedMisconceptions.includes(desc))
      cs.confirmedMisconceptions.push(desc);
  }

  if (!cs.strategiesUsed.includes(attempt.strategyUsed)) cs.strategiesUsed.push(attempt.strategyUsed);
  if (['advance','praise_and_continue'].includes(assessment.recommendedAction)) {
    if (!cs.effectiveStrategies.includes(attempt.strategyUsed))
      cs.effectiveStrategies.push(attempt.strategyUsed);
  } else if (assessment.recommendedAction === 'switch_strategy') {
    if (!cs.ineffectiveStrategies.includes(attempt.strategyUsed))
      cs.ineffectiveStrategies.push(attempt.strategyUsed);
  }

  if (assessment.teachingNote) {
    cs.notes.push(`[${new Date().toISOString().slice(0,10)}] ${assessment.teachingNote}`);
    if (cs.notes.length > 20) cs.notes = cs.notes.slice(-20);
  }

  learner.updatedAt = Date.now();
  await repo.saveProfile(learner);
}

export async function addGlobalInsight(studentId: string, insight: string): Promise<void> {
  const repo = getRepo();
  const learner = await repo.getProfile(studentId);
  if (!learner) return;
  learner.globalInsights.push(`[${new Date().toISOString().slice(0,10)}] ${insight}`);
  if (learner.globalInsights.length > 30) learner.globalInsights = learner.globalInsights.slice(-30);
  await repo.saveProfile(learner);
}

/**
 * T21 (FR-22) — the learner disputes a misconception ledger entry from the
 * learner card ("That's not right"). We don't have a separate claim/dispute
 * table (T14's Profiler/claimValidator isn't built yet), so this marks the
 * ledger entry itself `disputed`; compileTeachingPlan's R-WATCH rule only
 * surfaces `suspected`/`confirmed` entries, so a disputed one drops out of
 * the plan immediately while staying in the evidence trail for replay.
 */
export async function disputeMisconception(
  studentId: string, subjectId: string, conceptId: string, misconceptionId: string,
): Promise<MisconceptionRecord | null> {
  const repo = getRepo();
  const learner = await repo.getProfile(studentId);
  const cs = learner?.subjects?.[subjectId]?.conceptStates?.[conceptId];
  if (!cs?.misconceptionLedger) return null;
  const rec = cs.misconceptionLedger.find((r) => r.id === misconceptionId);
  if (!rec) return null;
  rec.status = 'disputed';
  rec.disputedAt = Date.now();
  learner!.updatedAt = Date.now();
  await repo.saveProfile(learner!);
  return rec;
}

export async function incrementSessionCount(studentId: string, subjectId: string, mins: number): Promise<void> {
  const repo = getRepo();
  const learner = await repo.getProfile(studentId);
  if (!learner?.subjects?.[subjectId]) return;
  learner.subjects[subjectId].sessionCount += 1;
  learner.subjects[subjectId].totalMinutes += mins;
  learner.subjects[subjectId].lastSession = Date.now();
  learner.updatedAt = Date.now();
  await repo.saveProfile(learner);
}

// ─── In-memory active sessions ──────────────────────────────────
const activeSessions = new Map<string, AdaptiveSessionState>();

export function startSession(s: AdaptiveSessionState) { activeSessions.set(s.sessionId, s); }
export function getSession(id: string)                { return activeSessions.get(id); }
export function updateSession(id: string, patch: Partial<AdaptiveSessionState>) {
  const s = activeSessions.get(id);
  if (s) activeSessions.set(id, { ...s, ...patch });
}
export function endSession(id: string)                { activeSessions.delete(id); }

// ─────────────────────────────────────────────────────────────────
// Live-voice / text evidence recording
//
// Differs from recordAttempt() in several ways that matter:
//   1. Mastery moves by a BKT posterior, not a hand-tuned delta.
//   2. A misconception starts SUSPECTED and needs two independent
//      observations before it is CONFIRMED — the false-positive guard.
//   3. Strategy effectiveness is measured against an actual mastery
//      GAIN, tracked both per-concept (existing) and cross-concept by
//      conceptType (new — src/adaptive/strategyProfile.ts).
//   4. Every event gets an id, a ladder level, an error class and is
//      appended to the durable event log via the repository (T03/T10).
// ─────────────────────────────────────────────────────────────────
import { LearningEvidence, StrategyOutcome } from './learnerModel';

export interface RecordEvidenceInput {
  studentId: string;
  subjectId: string;
  conceptId: string;
  conceptType: string;
  difficultyLevel: number;
  promptType: LearningEvidence['promptType'];
  questionAsked: string;
  childAnswer: string;
  childReasoning: string;
  classification: string;
  understandingDepth: LearningEvidence['understandingDepth'];
  candidateMisconceptions: Array<{ id: string; text: string }>;
  confidence: 'high' | 'medium' | 'low';
  strategyInUse: TeachingStrategy;
  responseLatencyMs?: number;
  helpRequested?: boolean;
  selfReportedConfusion?: boolean;
  // T10 additions (all optional, backward compatible):
  errorClass?: ErrorClass;
  learnerConfidence?: Confidence3;
  moveUsed?: string;
  sessionId?: string;
  itemId?: string;
  planVersion?: string;
  diagnosticianModel?: string;
  source?: EvidenceEvent['source'];
}

export interface RecordEvidenceResult {
  eventId: string;
  masteryBefore: number;
  masteryAfter: number;
  pKnown: number;
  derivation: string;
  newlyConfirmed: MisconceptionRecord[];
  ledger: MisconceptionRecord[];
  ladderLevel: number;
  masteryStatus: string;
}

function makeEventId(): string {
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function recordReasoningEvidence(input: RecordEvidenceInput): Promise<RecordEvidenceResult | null> {
  const repo = getRepo();
  const learner = await repo.getProfile(input.studentId);
  const cs = learner?.subjects?.[input.subjectId]?.conceptStates?.[input.conceptId];
  if (!learner || !cs) return null;

  if (!cs.evidenceLog) cs.evidenceLog = [];
  if (!cs.misconceptionLedger) cs.misconceptionLedger = [];
  if (!cs.strategyOutcomes) cs.strategyOutcomes = [];
  if (!cs.conceptType) cs.conceptType = input.conceptType;

  const masteryBefore = cs.masteryScore;
  const now = Date.now();

  // ── 1. Ledger update. One observation only ever yields "suspected".
  const newlyConfirmed: MisconceptionRecord[] = [];
  for (const cand of input.candidateMisconceptions) {
    let rec = cs.misconceptionLedger.find(m => m.id === cand.id);
    if (!rec) {
      rec = {
        id: cand.id, text: cand.text, status: 'suspected',
        observations: 0, firstSeen: now, lastSeen: now,
      };
      cs.misconceptionLedger.push(rec);
    }
    // Only a probe or a transfer item counts as an INDEPENDENT observation.
    // A repeat of the same question is the same evidence twice over.
    const isIndependent = input.promptType === 'probe' || input.promptType === 'transfer';
    if (isIndependent || rec.observations === 0) rec.observations += 1;
    rec.lastSeen = now;
    rec.resolvedAt = undefined;
    if (rec.observations >= 2 && rec.status !== 'confirmed') {
      rec.status = 'confirmed';
      newlyConfirmed.push(rec);
    }
  }

  // ── 2. Resolution. A sound transfer answer clears standing misconceptions.
  const soundTransfer =
    input.promptType === 'transfer' &&
    ['applied', 'transferred', 'understood'].includes(input.understandingDepth) &&
    input.candidateMisconceptions.length === 0;
  if (soundTransfer) {
    for (const rec of cs.misconceptionLedger) {
      if (rec.status !== 'resolved') { rec.status = 'resolved'; rec.resolvedAt = now; }
    }
  }

  const anyConfirmedStanding = cs.misconceptionLedger.some(m => m.status === 'confirmed');

  // ── 3. Mastery via BKT.
  const obs: BKTObservation = {
    depth: input.understandingDepth,
    misconceptionConfirmed: anyConfirmedStanding,
    difficultyLevel: input.difficultyLevel,
  };
  const bkt = updateMastery(masteryBefore, obs, cs.attemptCount);

  cs.masteryScore = bkt.masteryScore;
  cs.pKnown = bkt.pKnown;
  cs.masteryLevel = scoreToLevel(bkt.masteryScore);
  cs.attemptCount += 1;
  cs.lastVisited = now;
  if (['understood', 'applied', 'transferred'].includes(input.understandingDepth)) cs.correctCount += 1;

  // Mirror the ledger into the legacy string arrays so existing UI keeps working.
  cs.suspectedMisconceptions = cs.misconceptionLedger.filter(m => m.status === 'suspected').map(m => m.text);
  cs.confirmedMisconceptions = cs.misconceptionLedger.filter(m => m.status === 'confirmed').map(m => m.text);

  // ── 4. Strategy outcome (per-concept, existing) + eventId + ladder.
  const eventId = makeEventId();
  let so = cs.strategyOutcomes.find(s => s.strategy === input.strategyInUse);
  if (!so) {
    so = { strategy: input.strategyInUse, timesUsed: 0, timesFollowedByGain: 0 };
    cs.strategyOutcomes.push(so);
  }
  so.timesUsed += 1;
  const ladderLevel = ladderLevelForDepth(input.understandingDepth);
  const prevLadderLevel = cs.ladder?.highestLevel ?? 0;
  const gained = bkt.delta > 0 || ladderLevel > prevLadderLevel;
  if (gained) so.timesFollowedByGain += 1;

  if (!cs.strategiesUsed.includes(input.strategyInUse)) cs.strategiesUsed.push(input.strategyInUse);
  if (so.timesUsed >= 2) {
    const rate = so.timesFollowedByGain / so.timesUsed;
    const inEff = cs.effectiveStrategies.indexOf(input.strategyInUse);
    const inIneff = cs.ineffectiveStrategies.indexOf(input.strategyInUse);
    if (rate >= 0.5) {
      if (inEff === -1) cs.effectiveStrategies.push(input.strategyInUse);
      if (inIneff !== -1) cs.ineffectiveStrategies.splice(inIneff, 1);
    } else {
      if (inIneff === -1) cs.ineffectiveStrategies.push(input.strategyInUse);
      if (inEff !== -1) cs.effectiveStrategies.splice(inEff, 1);
    }
  }

  // ── 5. T10: ladder state, mastery status, cross-concept strategy profile, affect.
  cs.ladder = updateLadder(cs.ladder, ladderLevel, eventId);
  cs.masteryStatus = computeMasteryStatus({
    pKnown: bkt.pKnown,
    ladder: cs.ladder,
    anyConfirmedMisconceptionStanding: anyConfirmedStanding,
    review: cs.review,
  });

  learner.strategyProfile = recordStrategyOutcome(
    learner.strategyProfile, cs.conceptType, input.strategyInUse, gained, now,
  );

  if (input.selfReportedConfusion || input.helpRequested) {
    learner.affect = learner.affect || { confusionSignals: {}, frustrationEvents: 0 };
    const key = input.selfReportedConfusion ? 'self_reported_confusion' : 'help_requested';
    learner.affect.confusionSignals[key] = (learner.affect.confusionSignals[key] || 0) + 1;
  }

  // ── 6. Append the evidence record (legacy capped mirror + durable event log).
  const evidence: LearningEvidence = {
    timestamp: now,
    conceptId: input.conceptId,
    promptType: input.promptType,
    questionAsked: input.questionAsked,
    childAnswer: input.childAnswer,
    childReasoning: input.childReasoning,
    classification: input.classification,
    understandingDepth: input.understandingDepth,
    candidateMisconceptionIds: input.candidateMisconceptions.map(m => m.id),
    confidence: input.confidence,
    strategyInUse: input.strategyInUse,
    responseLatencyMs: input.responseLatencyMs,
    helpRequested: input.helpRequested,
    selfReportedConfusion: input.selfReportedConfusion,
    masteryBefore,
    masteryAfter: bkt.masteryScore,
    derivation: bkt.derivation,
  };
  cs.evidenceLog.push(evidence);
  if (cs.evidenceLog.length > 200) cs.evidenceLog = cs.evidenceLog.slice(-200);

  learner.updatedAt = now;
  await repo.saveProfile(learner);

  const fullEvent: EvidenceEvent = {
    ...evidence,
    eventId,
    sessionId: input.sessionId || 'unknown',
    subjectId: input.subjectId,
    conceptType: cs.conceptType,
    itemId: input.itemId,
    ladderLevel: ladderLevel as EvidenceEvent['ladderLevel'],
    errorClass: input.errorClass || inferErrorClass(input),
    learnerConfidence: input.learnerConfidence,
    moveUsed: input.moveUsed || 'unspecified',
    representationUsed: input.strategyInUse,
    planVersion: input.planVersion,
    diagnosticianModel: input.diagnosticianModel,
    source: input.source || 'voice',
  };
  await repo.appendEvent(input.studentId, fullEvent);

  return {
    eventId,
    masteryBefore,
    masteryAfter: bkt.masteryScore,
    pKnown: bkt.pKnown,
    derivation: bkt.derivation,
    newlyConfirmed,
    ledger: cs.misconceptionLedger,
    ladderLevel,
    masteryStatus: cs.masteryStatus,
  };
}

/** Best-effort error class when the Diagnostician did not classify one explicitly. */
function inferErrorClass(input: RecordEvidenceInput): ErrorClass {
  if (input.candidateMisconceptions.length > 0) return 'misconception';
  if (input.understandingDepth === 'guessed') return 'guess';
  if (input.understandingDepth === 'confused') return 'attention';
  if (input.understandingDepth === 'incorrect') return 'procedural';
  return 'none';
}

/** Full evidence timeline for a concept — powers the parent portal replay. */
export async function getEvidenceLog(
  studentId: string, subjectId: string, conceptId: string
): Promise<LearningEvidence[]> {
  const cs = await getConceptState(studentId, subjectId, conceptId);
  return cs?.evidenceLog || [];
}
