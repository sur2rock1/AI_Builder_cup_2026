// ─────────────────────────────────────────────────────────────────
// Learner Store — JSON file persistence + in-memory active sessions
// ─────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import {
  LearnerProfile, ConceptState, TeachingStrategy, MasteryLevel,
  AdaptiveSessionState, AssessmentResult, QuizAttempt,
} from './learnerModel';

const DATA_DIR  = path.join(process.cwd(), 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'learner-profiles.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function readProfiles(): Record<string, LearnerProfile> {
  ensureDataDir();
  if (!fs.existsSync(PROFILES_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf-8')); } catch { return {}; }
}
function writeProfiles(p: Record<string, LearnerProfile>) {
  ensureDataDir();
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(p, null, 2), 'utf-8');
}
function scoreToLevel(score: number): MasteryLevel {
  if (score === 0)  return 'not_started';
  if (score < 20)   return 'exposed';
  if (score < 40)   return 'partial';
  if (score < 60)   return 'developing';
  if (score < 80)   return 'proficient';
  return 'mastered';
}

// ─── Public profile API ─────────────────────────────────────────

export function getOrCreateLearner(studentId: string, name: string, grade: string): LearnerProfile {
  const profiles = readProfiles();
  if (profiles[studentId]) return profiles[studentId];
  const fresh: LearnerProfile = {
    studentId, name, grade,
    createdAt: Date.now(), updatedAt: Date.now(),
    subjects: {}, globalInsights: [],
  };
  profiles[studentId] = fresh;
  writeProfiles(profiles);
  return fresh;
}
export function getLearner(studentId: string): LearnerProfile | null {
  return readProfiles()[studentId] || null;
}
export function listLearners(): LearnerProfile[] {
  return Object.values(readProfiles());
}

export function ensureSubject(
  studentId: string, subjectId: string, subjectLabel: string, grade: string, curriculumSource: string
): void {
  const profiles = readProfiles();
  const learner = profiles[studentId];
  if (!learner) return;
  if (!learner.subjects[subjectId]) {
    learner.subjects[subjectId] = {
      subjectId, subjectLabel, grade, curriculumSource,
      conceptStates: {}, sessionCount: 0, totalMinutes: 0, lastSession: Date.now(),
    };
  }
  profiles[studentId] = learner;
  writeProfiles(profiles);
}

export function ensureConceptState(
  studentId: string, subjectId: string, conceptId: string,
  label: string, initialStrategy: TeachingStrategy = 'direct_explanation'
): ConceptState | null {
  const profiles = readProfiles();
  const learner = profiles[studentId];
  if (!learner?.subjects?.[subjectId]) return null;
  if (!learner.subjects[subjectId].conceptStates[conceptId]) {
    learner.subjects[subjectId].conceptStates[conceptId] = {
      conceptId, label, masteryLevel: 'not_started', masteryScore: 0,
      attemptCount: 0, correctCount: 0, lastVisited: Date.now(),
      strategiesUsed: [initialStrategy], effectiveStrategies: [],
      ineffectiveStrategies: [], confirmedMisconceptions: [],
      suspectedMisconceptions: [], quizHistory: [], prerequisitesGapped: [], notes: [],
    };
  }
  profiles[studentId] = learner;
  writeProfiles(profiles);
  return learner.subjects[subjectId].conceptStates[conceptId];
}

export function getConceptState(
  studentId: string, subjectId: string, conceptId: string
): ConceptState | null {
  return getLearner(studentId)?.subjects?.[subjectId]?.conceptStates?.[conceptId] || null;
}

export function recordAttempt(
  studentId: string, subjectId: string, conceptId: string,
  attempt: QuizAttempt, assessment: AssessmentResult
): void {
  const profiles = readProfiles();
  const learner = profiles[studentId];
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
  profiles[studentId] = learner;
  writeProfiles(profiles);
}

export function addGlobalInsight(studentId: string, insight: string): void {
  const profiles = readProfiles();
  const learner = profiles[studentId];
  if (!learner) return;
  learner.globalInsights.push(`[${new Date().toISOString().slice(0,10)}] ${insight}`);
  if (learner.globalInsights.length > 30) learner.globalInsights = learner.globalInsights.slice(-30);
  profiles[studentId] = learner; writeProfiles(profiles);
}

export function incrementSessionCount(studentId: string, subjectId: string, mins: number): void {
  const profiles = readProfiles();
  const learner = profiles[studentId];
  if (!learner?.subjects?.[subjectId]) return;
  learner.subjects[subjectId].sessionCount += 1;
  learner.subjects[subjectId].totalMinutes += mins;
  learner.subjects[subjectId].lastSession = Date.now();
  learner.updatedAt = Date.now();
  profiles[studentId] = learner; writeProfiles(profiles);
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
// Live-voice evidence recording
//
// Differs from recordAttempt() in three ways that matter:
//   1. Mastery moves by a BKT posterior, not a hand-tuned delta.
//   2. A misconception starts SUSPECTED and needs two independent
//      observations before it is CONFIRMED — the false-positive guard.
//   3. Strategy effectiveness is measured against an actual mastery
//      GAIN, not against the model's opinion of what to do next.
// ─────────────────────────────────────────────────────────────────
import { LearningEvidence, MisconceptionRecord, StrategyOutcome } from './learnerModel';
import { updateMastery, BKTObservation } from './bkt';

export interface RecordEvidenceInput {
  studentId: string;
  subjectId: string;
  conceptId: string;
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
}

export interface RecordEvidenceResult {
  masteryBefore: number;
  masteryAfter: number;
  pKnown: number;
  derivation: string;
  newlyConfirmed: MisconceptionRecord[];
  ledger: MisconceptionRecord[];
}

export function recordReasoningEvidence(input: RecordEvidenceInput): RecordEvidenceResult | null {
  const profiles = readProfiles();
  const learner = profiles[input.studentId];
  const cs = learner?.subjects?.[input.subjectId]?.conceptStates?.[input.conceptId];
  if (!cs) return null;

  if (!cs.evidenceLog) cs.evidenceLog = [];
  if (!cs.misconceptionLedger) cs.misconceptionLedger = [];
  if (!cs.strategyOutcomes) cs.strategyOutcomes = [];

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

  // ── 4. Strategy outcome, judged by whether mastery actually went up.
  let so = cs.strategyOutcomes.find(s => s.strategy === input.strategyInUse);
  if (!so) {
    so = { strategy: input.strategyInUse, timesUsed: 0, timesFollowedByGain: 0 };
    cs.strategyOutcomes.push(so);
  }
  so.timesUsed += 1;
  if (bkt.delta > 0) so.timesFollowedByGain += 1;

  if (!cs.strategiesUsed.includes(input.strategyInUse)) cs.strategiesUsed.push(input.strategyInUse);
  // Needs a real track record before we declare a strategy effective or not.
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

  // ── 5. Append the evidence record.
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
  profiles[input.studentId] = learner;
  writeProfiles(profiles);

  return {
    masteryBefore,
    masteryAfter: bkt.masteryScore,
    pKnown: bkt.pKnown,
    derivation: bkt.derivation,
    newlyConfirmed,
    ledger: cs.misconceptionLedger,
  };
}

/** Full evidence timeline for a concept — powers the parent portal replay. */
export function getEvidenceLog(
  studentId: string, subjectId: string, conceptId: string
): LearningEvidence[] {
  return getConceptState(studentId, subjectId, conceptId)?.evidenceLog || [];
}
