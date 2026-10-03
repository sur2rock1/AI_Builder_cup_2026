// ─────────────────────────────────────────────────────────────────
// Learner Model — core types for the adaptive loop
// ─────────────────────────────────────────────────────────────────

export type MasteryLevel = 'not_started' | 'exposed' | 'partial' | 'developing' | 'proficient' | 'mastered';

export type TeachingStrategy =
  | 'direct_explanation'
  | 'worked_example'
  | 'visual_diagram'
  | 'real_world_analogy'
  | 'socratic_questioning'
  | 'step_by_step'
  | 'story_context'
  | 'interactive_simulation'
  | 'peer_comparison'
  | 'prerequisite_review';

export type UnderstandingDepth =
  | 'memorised'       // Child repeated back the answer verbatim
  | 'recognised'      // Child identified the right answer from options
  | 'understood'      // Child can explain in own words
  | 'applied'         // Child applied the concept to a new problem
  | 'transferred'     // Child used it in a novel context unprompted
  | 'incorrect'       // Child was wrong
  | 'guessed'         // Child admitted they guessed
  | 'confused';       // Child expressed confusion

export interface QuizAttempt {
  timestamp: number;
  questionSummary: string;
  conceptTag: string;
  selectedOption: number;
  correctOption: number;
  isCorrect: boolean;
  understandingDepth: UnderstandingDepth;
  misconceptionDetected?: string;
  strategyUsed: TeachingStrategy;
  teachingNote?: string;   // Gemini's note on what the child showed
}

export interface ConceptState {
  conceptId: string;
  label: string;
  masteryLevel: MasteryLevel;
  masteryScore: number;         // 0–100
  attemptCount: number;
  correctCount: number;
  lastVisited: number;          // timestamp
  strategiesUsed: TeachingStrategy[];
  effectiveStrategies: TeachingStrategy[];    // strategies that led to improvement
  ineffectiveStrategies: TeachingStrategy[];  // strategies that didn't help
  confirmedMisconceptions: string[];
  suspectedMisconceptions: string[];
  quizHistory: QuizAttempt[];
  prerequisitesGapped: string[];  // concept IDs where gaps were detected
  notes: string[];                // Gemini's running notes on this child's pattern

  // ─── Live-voice evidence layer (optional: older profiles predate these) ───
  evidenceLog?: LearningEvidence[];
  misconceptionLedger?: MisconceptionRecord[];
  strategyOutcomes?: StrategyOutcome[];
  /** Posterior P(knows skill) from Bayesian Knowledge Tracing, 0..1. */
  pKnown?: number;

  // ── Extensions (docs/LEARNER_MODEL.md §3) ──
  conceptType?: string;
  ladder?: LadderState;
  masteryStatus?: MasteryStatus;
  review?: ReviewState;
}

export interface SubjectProgress {
  subjectId: string;
  subjectLabel: string;
  grade: string;
  curriculumSource: string;       // e.g. 'singapore-sec2-maths' or 'uploaded-pdf'
  conceptStates: Record<string, ConceptState>;
  sessionCount: number;
  totalMinutes: number;
  lastSession: number;
}

// T22 (FR-20/PARK_AND_ESCALATE) — a durable record of the plan compiler's
// PARK_AND_ESCALATE move (src/plan/delta.ts: retries >= plan.limits.retryCap).
// Previously `delta.escalate`/`delta.parkConcept` were computed and then
// discarded (see docs/AGENT_GUIDE.md landmine #4) -- nothing persisted the
// event and Parent Portal had no way to show it. This is intentionally NOT
// a LearnerClaim (docs/LEARNER_MODEL.md §3's Gemini-authored, validated
// claim pipeline) -- it's a deterministic, rule-triggered event straight
// from the plan compiler, no LLM judgment involved, so it's recorded and
// surfaced directly rather than going through T14's Profiler/claimValidator.
export interface EscalationEvent {
  id: string;
  subjectId: string;
  conceptId: string;
  conceptLabel?: string;
  reason: 'retry_cap_reached';
  retryCount: number;
  timestamp: number;
  sessionId?: string;
  resolved: boolean;
  resolvedAt?: number;
  resolvedNote?: string;
}

export interface LearnerProfile {
  studentId: string;
  name: string;
  /** Display label, e.g. "Grade 8". Kept as a string for older profiles. */
  grade: string;
  /** Board chosen at signup (e.g. "IGCSE"). With gradeLevel, decides which
   * courses the learner sees (docs/CURRICULUM.md §6). Optional: older profiles. */
  board?: string;
  gradeLevel?: number;
  createdAt: number;
  updatedAt: number;
  subjects: Record<string, SubjectProgress>;
  globalInsights: string[];     // Cross-subject patterns Gemini has noted

  // ── Extensions (docs/LEARNER_MODEL.md §3) ──
  ageBand?: AgeBand;
  onboarding?: Onboarding;
  strategyProfile?: StrategyProfile;
  affect?: AffectState;
  claims?: LearnerClaim[];
  sessionSummaries?: SessionSummary[];
  escalations?: EscalationEvent[];
}

// ─── Active Session (in-memory only) ───────────────────────────
export interface AdaptiveSessionState {
  sessionId: string;
  studentId: string;
  subjectId: string;
  currentConceptId: string;
  currentStrategy: TeachingStrategy;
  sessionStarted: number;
  interactionCount: number;
  recentAttempts: QuizAttempt[];  // last 5 in this session
  pendingStrategySwitch?: TeachingStrategy;
  switchReason?: string;
}

// ─── Assessment result from Gemini ─────────────────────────────
export interface AssessmentResult {
  understandingDepth: UnderstandingDepth;
  misconceptionDetected: boolean;
  misconceptionDescription?: string;
  misconceptionType?: 'conceptual' | 'procedural' | 'factual' | 'prerequisite_gap';
  confidence: 'high' | 'medium' | 'low';
  recommendedAction: 'advance' | 'reinforce' | 'switch_strategy' | 'revisit_prerequisite' | 'praise_and_continue';
  suggestedNextStrategy?: TeachingStrategy;
  teachingNote: string;
  masteryDelta: number;   // how much to adjust masteryScore (-20 to +15)
}

// ─── Rich misconception detail (populated from PDF extraction) ─
export interface MisconceptionDetail {
  /** Stable id, unique within the concept (e.g. "ssa-assumed-valid"). This is
   * the id the diagnostician selects and the misconception ledger stores, so it
   * must never change once a course is published (docs/CURRICULUM.md §4). Older
   * data has no id — misconceptionCatalog() then falls back to positional ids. */
  id?: string;
  belief: string;           // What the child wrongly believes
  triggerPattern?: string;  // What kind of question/context triggers it
  probeQuestion: string;    // Question to surface the misconception
  correctionHint: string;   // How to correct it if confirmed
}

// ─── Rich prerequisite detail (populated from PDF extraction) ──
export interface PrerequisiteDetail {
  label: string;            // Human-readable prerequisite name
  reason: string;           // Why this prereq matters for the current concept
  checkQuestion: string;    // Quick question to verify the prereq is understood
  /** Set when this prerequisite IS a concept in the same course (then it is also
   * in `prerequisites`). Unset = an earlier-grade/other-subject prerequisite the
   * tutor can only probe, not teach from this course. */
  conceptId?: string;
}

/** Where a scope statement came from. Only 'syllabus' and 'textbook' are
 * facts about the course; nothing model-invented is stored as scope. */
export type ScopeSource = 'syllabus' | 'textbook';

// ─── Chapter scope map (populated from PDF extraction) ─────────
export interface ChapterScopeMap {
  chapterTitle: string;
  inScope: string[];        // Topics explicitly covered in this chapter
  advanced: string[];       // Topics mentioned but marked advanced/extension
  outOfScope: string[];     // Topics deliberately excluded at this grade/level
  gradeNote?: string;       // Grade-level context (e.g. "Grade 8 only covers...")
  /** Provenance of this map. 'syllabus' when an official syllabus document was
   * uploaded and mapped to the chapter; otherwise 'textbook' (and outOfScope is
   * then only what the book itself says is excluded — never model-invented). */
  source?: ScopeSource;
  /** Syllabus topic codes/titles this chapter was mapped to, when known. */
  syllabusRefs?: string[];
}

/** Evidence-ladder items authored per concept at ingest time, phrased for the
 * course's subject mode (docs/TUTOR_PERSONA.md §5, §12.2). Levels 1..4 map to
 * the ladder the tutor and src/adaptive/ladder.ts already use; L5 (teach-back)
 * is always generated live. */
export interface LadderItem {
  level: 1 | 2 | 3 | 4;
  /** Stable id within the concept, e.g. "L3-A" / "L3-B" — the parallel L3 pair (docs/CURRICULUM.md). */
  id?: string;
  prompt: string;
  /** What a sound answer contains — for the tutor, never read out verbatim. */
  lookFor: string;
  /** Graded hints for "just tell me the answer" (persona P-10): nudge → bigger hint → worked step of a PARALLEL problem. Never the answer. Tutor-only. */
  hints?: string[];
}

/** Decided once at ingest, per concept, by the same review that picks the representations — never by a hard-coded subject list. */
export interface ConceptPresentation {
  /** A real-world image genuinely helps understanding (observable things), and the scene to show. */
  photo?: { useful: boolean; scene?: string; why?: string };
  /** The idea is intrinsically a solid/spatial arrangement that a flat picture flattens. */
  spatial3d?: { useful: boolean; why?: string };
}

/** A concrete idea for teaching this concept with one representation. The
 * representation name is the shared TeachingStrategy enum, so the plan's
 * representation order (strategyProfile) and these ideas line up. */
export interface RepresentationIdea {
  strategy: TeachingStrategy;
  idea: string;
}

// ─── Curriculum concept (populated from PDF or hardcoded) ──────
export interface CurriculumConcept {
  id: string;
  label: string;
  subjectId: string;
  prerequisites: string[];         // concept IDs that must be understood first
  /** Rich prerequisite details with reason + check question (from PDF extraction). */
  prerequisiteDetails?: PrerequisiteDetail[];
  commonMisconceptions: string[];  // known misconceptions for this concept
  /** Rich misconception details with belief, probe, correction (from PDF extraction). */
  misconceptionDetails?: MisconceptionDetail[];
  keyFacts: string[];
  workedExamples: string[];
  difficultyLevel: 1 | 2 | 3 | 4 | 5;
  typicalTeachingOrder: number;
  /** e.g. "Chapter 9: Pythagoras' Theorem" — set for concepts extracted from a textbook. */
  chapter?: string;
  /** Which uploaded book it came from. */
  book?: string;

  // ── Curriculum-library fields (docs/CURRICULUM.md). All optional so older
  //    data and hand-written test fixtures keep loading. ──
  /** Family of concepts that share a way of thinking, e.g. "similarity-and-scaling".
   * Keys the learner's cross-concept strategyProfile and the plan's R-WATCH /
   * R-REP rules, so it is assigned once at ingest and never changed afterwards. */
  conceptType?: string;
  /** Stable chapter key within the course, e.g. "ch9-congruence-and-similarity". */
  chapterId?: string;
  chapterNumber?: number | null;
  /** Position within its chapter (1 = taught first). */
  orderInChapter?: number;
  ladderItems?: LadderItem[];
  representationIdeas?: RepresentationIdea[];
  presentation?: ConceptPresentation;
  /** Provenance: which uploaded source and pages this concept came from. */
  sourceRef?: { sourceId: string; pages?: [number, number] };
  /** Outcome of the AI verification pass for this concept. */
  verification?: { status: 'verified' | 'corrected'; notes: string[] };
}

export type SubjectModeId = 'well_structured' | 'interpretive' | 'skill';

/** One uploaded document that contributed to a course. */
export interface CurriculumSource {
  id: string;                       // slug of the title, stable across re-uploads
  kind: 'textbook' | 'syllabus';
  title: string;
  fileName: string;
  pages?: number;
  ingestedAt: number;
}

/** A syllabus topic as stated in an official syllabus document. */
export interface SyllabusTopic {
  code?: string;
  title: string;
  objectives: string[];
  excluded: string[];
  extension: string[];
}

/** Summary of the AI verification pass — the automated review that replaces a
 * human review step before a course is published (DECISIONS.md D-2026-09-26-7). */
export interface VerificationReport {
  verifiedAt: number;
  model?: string;
  conceptsChecked: number;
  conceptsCorrected: number;
  conceptsRejected: number;
  examplesCorrected: number;
  examplesDropped: number;
  prerequisiteEdgesDropped: number;
  issues: string[];
}

export interface CurriculumSubject {
  id: string;
  label: string;
  grade: string;
  source: string;
  concepts: CurriculumConcept[];
  prerequisiteMap: Record<string, string[]>;  // conceptId → [prerequisite conceptIds]
  /** Chapter scope maps extracted from the PDF textbook. */
  scopeMaps?: ChapterScopeMap[];

  // ── Curriculum-library fields (docs/CURRICULUM.md) ──
  /** Display name of the board/curriculum, e.g. "IGCSE", "CBSE", "IB MYP". */
  board?: string;
  /** Numeric grade 1..12, the key a student's profile is matched on. */
  gradeLevel?: number;
  /** Subject name without board/grade, e.g. "Mathematics". `label` is the same. */
  subject?: string;
  subjectMode?: SubjectModeId;
  /** conceptType id -> short description, as assigned at ingest. */
  conceptTypes?: Record<string, string>;
  sources?: CurriculumSource[];
  syllabus?: SyllabusTopic[];
  verification?: VerificationReport;
  updatedAt?: number;
}

// ─── Live-voice evidence layer ──────────────────────────────────
// One record per CONVERSATIONAL TURN, not per quiz click. This is the
// unit the learner model is actually built from during a voice lesson.

export type PromptType = 'teach' | 'check' | 'probe' | 'transfer';

export interface LearningEvidence {
  timestamp: number;
  conceptId: string;
  promptType: PromptType;
  questionAsked: string;
  childAnswer: string;
  childReasoning: string;
  classification: string;
  understandingDepth: UnderstandingDepth;
  /** Ids from the concept's closed misconception catalogue. */
  candidateMisconceptionIds: string[];
  confidence: 'high' | 'medium' | 'low';
  strategyInUse: TeachingStrategy;
  /** Seconds the child took to respond — a signal, never a judgement. */
  responseLatencyMs?: number;
  helpRequested?: boolean;
  selfReportedConfusion?: boolean;
  masteryBefore: number;
  masteryAfter: number;
  /** Plain-language derivation of the mastery change, for the parent portal. */
  derivation: string;
}

export interface MisconceptionRecord {
  id: string;
  text: string;
  status: 'suspected' | 'confirmed' | 'resolved' | 'disputed';
  /** Independent observations. Promotion to confirmed requires >= 2. */
  observations: number;
  firstSeen: number;
  lastSeen: number;
  /** Set when a later transfer item was answered soundly. */
  resolvedAt?: number;
  /** Set when the learner (via the learner card, FR-22) disputes this entry.
   * A disputed entry is excluded from the plan's watch-list until new evidence
   * arrives (docs/FUNCTIONAL_SPEC.md J3) — it is not deleted, so the evidence
   * trail stays intact for the parent portal replay. */
  disputedAt?: number;
}

/** Which representation preceded a mastery gain, for THIS child on THIS concept. */
export interface StrategyOutcome {
  strategy: TeachingStrategy;
  timesUsed: number;
  timesFollowedByGain: number;
}

// ─────────────────────────────────────────────────────────────────
// Extensions for the base-persona / learner-model / teaching-plan build
// (docs/LEARNER_MODEL.md §3). All new fields are OPTIONAL so existing
// profiles (file or Firestore) keep loading without migration.
// ─────────────────────────────────────────────────────────────────

export type AgeBand = '5-7' | '8-12' | '13-17' | 'adult';
export type LadderLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type MasteryStatus = 'none' | 'provisional' | 'durable' | 'durable_plus';
export type Confidence3 = 'unsure' | 'fairly_sure' | 'sure';
export type ErrorClass =
  | 'none' | 'slip' | 'guess' | 'missing_prerequisite' | 'misconception'
  | 'right_answer_wrong_reasoning' | 'procedural' | 'overgeneralisation'
  | 'language' | 'attention';

export interface Onboarding {
  interests: string[];
  subjectFeelings: Record<string, 'love' | 'ok' | 'worried' | 'skip'>;
  accessibility: { audioFirst?: boolean; largeText?: boolean; captions?: boolean };
  languagePrefs?: { primary: string; alsoUnderstands?: string[] };
  completedAt?: number;
}

/** One diagnosed exchange. Append-only (see src/adaptive/repo). Extends LearningEvidence. */
export interface EvidenceEvent extends LearningEvidence {
  eventId: string;
  sessionId: string;
  subjectId: string;
  conceptType: string;
  itemId?: string;
  ladderLevel: LadderLevel;
  errorClass: ErrorClass;
  learnerConfidence?: Confidence3;
  moveUsed: string;
  representationUsed: TeachingStrategy;
  planVersion?: string;
  diagnosticianModel?: string;
  source: 'voice' | 'text' | 'quiz_click' | 'review';
}

export interface LadderState {
  highestLevel: LadderLevel;
  levelEvidence: Partial<Record<LadderLevel, string[]>>;
}

export interface ReviewState {
  nextDueAt?: number;
  intervalDays: number;
  passes: number;
  lapses: number;
}

export interface StrategyStat { alpha: number; beta: number; lastUsed: number }
export type StrategyProfile = Record<string, Partial<Record<TeachingStrategy, StrategyStat>>>;

export interface AffectState {
  confusionSignals: Record<string, number>;
  frustrationEvents: number;
  medianLatencyMs?: number;
  typicalSessionMinutes?: number;
}

export type ClaimKind = 'strength' | 'gap' | 'strategy' | 'engagement' | 'preference' | 'pattern';
export interface LearnerClaim {
  claimId: string;
  kind: ClaimKind;
  statement: string;
  childFriendly?: string;
  scope: { subjectId?: string; conceptType?: string; conceptId?: string };
  confidence: number;
  evidenceRefs: string[];
  source: 'rule' | 'profiler' | 'learner_stated' | 'parent_stated';
  status: 'active' | 'stale' | 'retracted' | 'disputed';
  createdAt: number;
  lastConfirmedAt: number;
}

export interface SessionSummary {
  sessionId: string; startedAt: number; endedAt: number;
  conceptsTouched: string[];
  ladderMoves: Array<{ conceptId: string; from: LadderLevel; to: LadderLevel }>;
  misconceptionsChanged: Array<{ id: string; from: string; to: string }>;
  movesUsed: Record<string, number>;
  representationsUsed: Record<string, number>;
  narrative: string;
  planVersion: string;
}
