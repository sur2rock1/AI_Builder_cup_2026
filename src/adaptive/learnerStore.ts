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
  EvidenceEvent, ErrorClass, Confidence3, MisconceptionRecord, EscalationEvent,
} from './learnerModel';
import { getRepo } from './repo';
import { updateMastery, BKTObservation, MASTERY_THRESHOLD } from './bkt';
import { ladderLevelForDepth, updateLadder, computeMasteryStatus } from './ladder';
import { recordStrategyOutcome } from './strategyProfile';

// ── Per-learner write lock ───────────────────────────────────────
// Every mutating call below is read-profile → change → write-profile. In a live lesson several of them run close
// together (an assessment, the live observer's evidence, a confusion signal, the session-end count and profiler);
// without serialising them the later write silently overwrites the earlier one. One chain per learner, in process
// (Cloud Run runs a single instance for this app: scripts/deploy-cloudrun.sh MAX_INSTANCES).
const learnerLocks = new Map<string, Promise<unknown>>();
export function withLearnerLock<T>(studentId: string, fn: () => Promise<T>): Promise<T> {
  const prev = learnerLocks.get(studentId) || Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  learnerLocks.set(studentId, tail);
  void tail.then(() => { if (learnerLocks.get(studentId) === tail) learnerLocks.delete(studentId); });
  return run;
}

function scoreToLevel(score: number, attempts = 0): MasteryLevel {
  if (score === 0)  return attempts > 0 ? 'exposed' : 'not_started';   // answered, but nothing secure yet - not "not started"
  if (score < 20)   return 'exposed';
  if (score < 40)   return 'partial';
  if (score < 60)   return 'developing';
  if (score < 80)   return 'proficient';
  return 'mastered';
}

// ─── Public profile API ─────────────────────────────────────────

export async function getOrCreateLearner(
  studentId: string, name: string, grade: string,
  /** Board + numeric grade chosen at signup (docs/CURRICULUM.md §6). Only
   * applied when the profile is created; an existing profile is returned as is. */
  extra: { board?: string; gradeLevel?: number } = {},
): Promise<LearnerProfile> {
  const repo = getRepo();
  const existing = await repo.getProfile(studentId);
  if (existing) return existing;
  const fresh: LearnerProfile = {
    studentId, name, grade,
    ...(extra.board ? { board: extra.board } : {}),
    ...(extra.gradeLevel ? { gradeLevel: extra.gradeLevel } : {}),
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
  cs.masteryLevel = scoreToLevel(cs.masteryScore, cs.attemptCount);

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

// ─────────────────────────────────────────────────────────────────
// record_confusion_signal (live tool, src/live/liveConfig.ts) durable
// persistence. Previously acked with { result: 'ok' } and dropped —
// this makes the "I'll make a note of that" the tutor says actually
// true. Reuses two fields that already exist for exactly this purpose
// rather than inventing new storage: AffectState.confusionSignals
// (tally by signal type, same shape self_reported_confusion/
// help_requested already use) and ConceptState.notes (Gemini's
// running per-concept notes, same capped-append pattern as
// recordAttempt's teachingNote above).
// ─────────────────────────────────────────────────────────────────
export interface RecordConfusionSignalInput {
  studentId: string;
  subjectId?: string;
  conceptId?: string;
  signal: string;       // one of liveConfig.ts's record_confusion_signal 'signal' enum values
  aboutWhat?: string;   // what specifically the child is stuck on, if given
}

export interface RecordConfusionSignalResult {
  signal: string;
  totalForSignal: number;
  notedOnConcept: boolean;
}

export function recordConfusionSignal(input: RecordConfusionSignalInput): Promise<RecordConfusionSignalResult | null> {
  return withLearnerLock(input.studentId, () => recordConfusionSignalUnlocked(input));
}

async function recordConfusionSignalUnlocked(
  input: RecordConfusionSignalInput
): Promise<RecordConfusionSignalResult | null> {
  const repo = getRepo();
  const learner = await repo.getProfile(input.studentId);
  if (!learner) return null;

  learner.affect = learner.affect || { confusionSignals: {}, frustrationEvents: 0 };
  learner.affect.confusionSignals[input.signal] = (learner.affect.confusionSignals[input.signal] || 0) + 1;

  let notedOnConcept = false;
  const cs = input.subjectId && input.conceptId
    ? learner.subjects?.[input.subjectId]?.conceptStates?.[input.conceptId]
    : undefined;
  if (cs) {
    const about = input.aboutWhat ? ` — ${input.aboutWhat}` : '';
    cs.notes.push(`[${new Date().toISOString().slice(0,10)}] confusion signal (${input.signal})${about}`);
    if (cs.notes.length > 20) cs.notes = cs.notes.slice(-20);
    notedOnConcept = true;
  }

  learner.updatedAt = Date.now();
  await repo.saveProfile(learner);

  return {
    signal: input.signal,
    totalForSignal: learner.affect.confusionSignals[input.signal],
    notedOnConcept,
  };
}

// ─────────────────────────────────────────────────────────────────
// T22 (FR-20) — durable persistence for the plan compiler's PARK_AND_ESCALATE
// move. See EscalationEvent's comment in learnerModel.ts and
// docs/AGENT_GUIDE.md landmine #4 for why this exists: `delta.escalate` was
// computed by compilePlanDelta() every time a concept's retry cap was hit,
// but nothing ever wrote it down -- it was recorded nowhere, so there was no
// durable record for a parent/teacher to see and no way to know later how
// often, or on which concepts, a learner was getting stuck badly enough to
// need a human. Called from server.ts's WS handler at the same
// compilePlanDelta() call site that discovered the gap.
// ─────────────────────────────────────────────────────────────────
export interface RecordEscalationInput {
  studentId: string;
  subjectId: string;
  conceptId: string;
  conceptLabel?: string;
  retryCount: number;
  sessionId?: string;
}

export async function recordEscalation(
  input: RecordEscalationInput
): Promise<EscalationEvent | null> {
  const repo = getRepo();
  const learner = await repo.getProfile(input.studentId);
  if (!learner) return null;

  const event: EscalationEvent = {
    id: `esc_${input.conceptId}_${Date.now()}`,
    subjectId: input.subjectId,
    conceptId: input.conceptId,
    conceptLabel: input.conceptLabel,
    reason: 'retry_cap_reached',
    retryCount: input.retryCount,
    timestamp: Date.now(),
    sessionId: input.sessionId,
    resolved: false,
  };

  learner.escalations = learner.escalations || [];
  learner.escalations.push(event);
  // Cap like every other unbounded-append list in this store (notes,
  // globalInsights) -- a hackathon demo learner shouldn't grow this forever.
  if (learner.escalations.length > 50) learner.escalations = learner.escalations.slice(-50);

  learner.updatedAt = Date.now();
  await repo.saveProfile(learner);
  return event;
}

export async function resolveEscalation(
  studentId: string,
  escalationId: string,
  note?: string,
): Promise<EscalationEvent | null> {
  const repo = getRepo();
  const learner = await repo.getProfile(studentId);
  if (!learner || !learner.escalations) return null;

  const event = learner.escalations.find((e) => e.id === escalationId);
  if (!event) return null;

  event.resolved = true;
  event.resolvedAt = Date.now();
  if (note) event.resolvedNote = note;

  learner.updatedAt = Date.now();
  await repo.saveProfile(learner);
  return event;
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

/** Adds the minutes; counts a lesson unless `countLesson` is false (a reconnect within the same lesson). */
export function incrementSessionCount(studentId: string, subjectId: string, mins: number, countLesson = true): Promise<void> {
  return withLearnerLock(studentId, () => incrementSessionCountUnlocked(studentId, subjectId, mins, countLesson));
}

async function incrementSessionCountUnlocked(studentId: string, subjectId: string, mins: number, countLesson: boolean): Promise<void> {
  const repo = getRepo();
  const learner = await repo.getProfile(studentId);
  if (!learner?.subjects?.[subjectId]) return;
  if (countLesson) learner.subjects[subjectId].sessionCount += 1;
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
  /** false = record the answer, but do not credit or blame a teaching approach (the approach in use is not known). */
  creditStrategy?: boolean;
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

/** The profile keeps only the latest evidence per concept (Firestore documents are capped at 1 MiB); every event is
 *  also stored in learners/{id}/events, which is what the parent view and the profiler read. */
const EVIDENCE_MIRROR_CAP = 60;
const clip = (v: string | undefined, n: number) => (typeof v === 'string' && v.length > n ? v.slice(0, n) : v);

function makeEventId(): string {
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** A standing mix-up counts as fixed after this many sound applications of the idea with no sign of it. */
export const RESOLVE_AFTER_CLEAN_APPLICATIONS = 2;

/**
 * Misconception ledger rules for one evidence event. Mutates `ledger`; returns the entries newly confirmed.
 *  - One observation only ever yields "suspected"; confirmation needs a second, independent one (probe/transfer).
 *  - Resolution: a sound transfer answer with no mix-up clears every standing entry (original rule), OR an entry is
 *    cleared after RESOLVE_AFTER_CLEAN_APPLICATIONS sound "applied"/"transferred" answers with no sign of it since it
 *    was last seen ("counts a mix-up as fixed when the child uses the idea in a question they have not seen before").
 *    Without the second route a confirmed mix-up could only clear on an item the tutor had tagged "transfer", which it
 *    rarely does - mastery then stayed at 0% however many correct answers followed (seen live, 2026-10-18).
 */
export function applyLedgerEvidence(
  ledger: MisconceptionRecord[],
  input: Pick<RecordEvidenceInput, 'candidateMisconceptions' | 'promptType' | 'understandingDepth'>,
  now: number,
): MisconceptionRecord[] {
  const newlyConfirmed: MisconceptionRecord[] = [];
  const seen = new Set(input.candidateMisconceptions.map(c => c.id));
  for (const cand of input.candidateMisconceptions) {
    let rec = ledger.find(m => m.id === cand.id);
    if (!rec) {
      rec = { id: cand.id, text: cand.text, status: 'suspected', observations: 0, firstSeen: now, lastSeen: now };
      ledger.push(rec);
    }
    // Only a probe or a transfer item counts as an INDEPENDENT observation.
    // A repeat of the same question is the same evidence twice over.
    const isIndependent = input.promptType === 'probe' || input.promptType === 'transfer';
    if (isIndependent || rec.observations === 0) rec.observations += 1;
    rec.lastSeen = now;
    rec.resolvedAt = undefined;
    rec.cleanApplications = 0;
    if (rec.status === 'resolved') rec.status = rec.observations >= 2 ? 'confirmed' : 'suspected';
    if (rec.observations >= 2 && rec.status !== 'confirmed') {
      rec.status = 'confirmed';
      newlyConfirmed.push(rec);
    }
  }

  const soundApplication = ['applied', 'transferred'].includes(input.understandingDepth) && input.candidateMisconceptions.length === 0;
  const soundTransfer =
    input.promptType === 'transfer' &&
    ['applied', 'transferred', 'understood'].includes(input.understandingDepth) &&
    input.candidateMisconceptions.length === 0;
  for (const rec of ledger) {
    if (rec.status === 'resolved' || rec.status === 'disputed' || seen.has(rec.id)) continue;
    if (soundApplication) rec.cleanApplications = (rec.cleanApplications || 0) + 1;
    if (soundTransfer || (rec.cleanApplications || 0) >= RESOLVE_AFTER_CLEAN_APPLICATIONS) {
      rec.status = 'resolved';
      rec.resolvedAt = now;
    }
  }
  return newlyConfirmed;
}

export function recordReasoningEvidence(input: RecordEvidenceInput): Promise<RecordEvidenceResult | null> {
  return withLearnerLock(input.studentId, () => recordReasoningEvidenceUnlocked(input));
}

async function recordReasoningEvidenceUnlocked(input: RecordEvidenceInput): Promise<RecordEvidenceResult | null> {
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

  // ── 1–2. Ledger update + resolution (pure, shared with scripts/repair-mastery.ts).
  const newlyConfirmed = applyLedgerEvidence(cs.misconceptionLedger, input, now);

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
  cs.masteryLevel = scoreToLevel(bkt.masteryScore, cs.attemptCount + 1);
  cs.attemptCount += 1;
  cs.lastVisited = now;
  if (['understood', 'applied', 'transferred'].includes(input.understandingDepth)) cs.correctCount += 1;

  // Mirror the ledger into the legacy string arrays so existing UI keeps working.
  cs.suspectedMisconceptions = cs.misconceptionLedger.filter(m => m.status === 'suspected').map(m => m.text);
  cs.confirmedMisconceptions = cs.misconceptionLedger.filter(m => m.status === 'confirmed').map(m => m.text);

  // ── 4. Strategy outcome (per-concept, existing) + eventId + ladder.
  const eventId = makeEventId();
  const creditStrategy = input.creditStrategy !== false;
  let so = cs.strategyOutcomes.find(s => s.strategy === input.strategyInUse);
  if (!so) {
    so = { strategy: input.strategyInUse, timesUsed: 0, timesFollowedByGain: 0 };
    if (creditStrategy) cs.strategyOutcomes.push(so);
  }
  if (creditStrategy) so.timesUsed += 1;
  const ladderLevel = ladderLevelForDepth(input.understandingDepth);
  const prevLadderLevel = cs.ladder?.highestLevel ?? 0;
  // A "gain" credits the teaching strategy that was in use, so it must come from the child's answer, not from BKT's
  // learning-transition term (which lifts the score even after a wrong answer): a sound observation, or a higher rung.
  const gained = bkt.supportsMastery || ladderLevel > prevLadderLevel;
  if (gained && creditStrategy) so.timesFollowedByGain += 1;

  if (creditStrategy && !cs.strategiesUsed.includes(input.strategyInUse)) cs.strategiesUsed.push(input.strategyInUse);
  if (creditStrategy && so.timesUsed >= 2) {
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

  // Bug fix 2026-09-26 (docs/AGENT_GUIDE.md landmine #3): a single strong BKT
  // observation (e.g. one 'transferred'-depth answer on a virgin concept) can
  // push the raw posterior to 90%+ before there's been any chance to confirm
  // it holds up across multiple, independent items. computeMasteryStatus()
  // above already encodes every reason this concept isn't confirmed yet
  // (insufficient distinct evidence, low pKnown, or a standing confirmed
  // misconception) -- so if the status says 'none' while the raw score
  // implies "mastered", shrink the STORED score/pKnown to match. This is
  // deliberate regularization, not a display trick: every consumer of this
  // field (API responses, the tutor's own learner-context prompt in
  // server.ts, the plan compiler's prerequisite check in src/plan/compile.ts,
  // the parent portal) reads cs.masteryScore/cs.pKnown directly with no
  // per-consumer gating, and the next call to this function uses the STORED
  // score as its Bayesian prior (see `masteryBefore` above) -- so capping it
  // here also correctly makes the next observation "re-earn" confidence
  // instead of compounding an unconfirmed number forever.
  let shrunkFromUnconfirmedEvidence = false;
  if (cs.masteryStatus === 'none' && cs.masteryScore >= MASTERY_THRESHOLD) {
    cs.masteryScore = MASTERY_THRESHOLD - 1;
    cs.pKnown = Math.min(cs.pKnown, (MASTERY_THRESHOLD - 1) / 100);
    cs.masteryLevel = scoreToLevel(cs.masteryScore, cs.attemptCount);
    shrunkFromUnconfirmedEvidence = true;
  }
  // Every downstream consumer (event log, the live WS update below, the
  // returned result) must report the SAME final number as what's persisted
  // -- never the raw bkt.masteryScore/bkt.pKnown, which may have just been
  // shrunk away above. One concept, one mastery number.
  const finalMasteryScore = cs.masteryScore;
  const finalPKnown = cs.pKnown;
  const finalDerivation = shrunkFromUnconfirmedEvidence
    ? `${bkt.derivation} · capped to ${finalMasteryScore}% (evidence not yet sufficient to confirm -- see docs/AGENT_GUIDE.md landmine #3)`
    : bkt.derivation;

  if (creditStrategy) {
    learner.strategyProfile = recordStrategyOutcome(
      learner.strategyProfile, cs.conceptType, input.strategyInUse, gained, now,
    );
  }

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
    questionAsked: clip(input.questionAsked, 400) as string,
    childAnswer: clip(input.childAnswer, 400) as string,
    childReasoning: clip(input.childReasoning, 400) as string,
    classification: input.classification,
    understandingDepth: input.understandingDepth,
    candidateMisconceptionIds: input.candidateMisconceptions.map(m => m.id),
    confidence: input.confidence,
    strategyInUse: input.strategyInUse,
    responseLatencyMs: input.responseLatencyMs,
    helpRequested: input.helpRequested,
    selfReportedConfusion: input.selfReportedConfusion,
    masteryBefore,
    masteryAfter: finalMasteryScore,
    derivation: finalDerivation,
  };
  cs.evidenceLog.push(evidence);
  if (cs.evidenceLog.length > EVIDENCE_MIRROR_CAP) cs.evidenceLog = cs.evidenceLog.slice(-EVIDENCE_MIRROR_CAP);

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
    masteryAfter: finalMasteryScore,
    pKnown: finalPKnown,
    derivation: finalDerivation,
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
