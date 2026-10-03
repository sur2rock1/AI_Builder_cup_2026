// docs/TEACHING_PLAN.md §2 — the compiled per-learner Teaching Plan.
import { AgeBand, LadderLevel, TeachingStrategy } from '../adaptive/learnerModel';
import { SubjectMode } from '../persona/subjectModes';
import { Channel } from '../persona/channels';

export interface PlanReason { text: string; evidenceRefs: string[]; rule: string }

export interface TeachingPlan {
  planVersion: string;
  personaVersion: string;
  generatedAt: number;
  studentId: string;
  subjectId: string;
  channel: Channel;
  ageBand: AgeBand;
  subjectMode: SubjectMode;

  reviewItems: Array<{ conceptId: string; label: string; reason: PlanReason }>;
  targetConcept: { conceptId: string; label: string; reason: PlanReason };
  prerequisitesToProbe: Array<{ conceptId: string; label: string; checkQuestion?: string; reason: PlanReason }>;
  startLadderGoal: LadderLevel;

  representationOrder: Array<{ strategy: TeachingStrategy; expected: number; reason: PlanReason }>;
  avoidRepresentations: Array<{ strategy: TeachingStrategy; reason: PlanReason }>;
  scaffoldLevel: 'full' | 'faded' | 'independent';
  difficulty: 1 | 2 | 3 | 4 | 5;
  fastTrackEligible: boolean;
  exampleThemes: string[];
  watchMisconceptions: Array<{ id: string; text: string; status: 'suspected' | 'confirmed'; probe?: string; reason: PlanReason }>;

  pace: { chunkSentences: [number, number]; checkEvery: number; confidenceCheckEvery: number; sessionMinutes: number };
  limits: { probeBudget: number; retryCap: number; maxChecksWithoutTeach: number; maxPrereqProbes: number };

  register: string;
  accessibility: Record<string, boolean | undefined>;

  thinkAloudLines: string[];

  // Mutable in-session counters, updated by compilePlanDelta (T20). Not
  // persisted to the immutable plan snapshot — tracked alongside it by
  // the session orchestrator.
}

export interface PlanDeltaState {
  retryCountByConcept: Record<string, number>;
  consecutiveFailures: number;
  consecutiveChecksWithoutTeach: number;
  probesUsedByQuestion: Record<string, number>;
}

export interface PlanDeltaResult {
  instruction: string;      // one-line guidance for the tutor
  nextRepresentation?: TeachingStrategy;
  parkConcept?: boolean;
  escalate?: boolean;
  encourageReset?: boolean;
  state: PlanDeltaState;
}
