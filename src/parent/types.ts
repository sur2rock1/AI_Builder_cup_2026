// ─────────────────────────────────────────────────────────────────
// Parent view — shared types (server builds it, ParentReport.tsx renders it).
// Everything a parent sees is derived from the learner model's real evidence;
// nothing here is a new source of truth. See docs/PARENT_VIEW.md.
// ─────────────────────────────────────────────────────────────────

/** One real exchange the parent can open: what Ananta asked, what the child said. */
export interface EvidenceCard {
  id: string;            // the real eventId
  at: number;
  conceptLabel: string;
  asked: string;
  answered: string;
  reasoning?: string;
  /** Plain-words result of Ananta's check on this answer. */
  outcome: string;
}

/** A sentence plus the evidence behind it. A sentence without evidence is never shown. */
export interface CitedLine {
  text: string;
  evidenceIds: string[];
}

export type StoryStepKind = 'noticed' | 'confirmed' | 'changed' | 'fixed' | 'watching';

export interface StoryStep {
  kind: StoryStepKind;
  title: string;          // "Ananta noticed something"
  caption: string;        // one plain line, built from the child's own words
  at: number;
  evidenceIds: string[];
}

/** The journey of one mix-up: noticed → seen again → new approach → fixed. */
export interface StoryThread {
  key: string;
  conceptLabel: string;
  /** The mix-up in plain words (from the course's own misconception catalogue). */
  mixUp: string;
  state: 'open' | 'watching' | 'fixed';
  steps: StoryStep[];
}

export interface TopicProgress {
  conceptId: string;
  label: string;
  /** 0..5 = Ananta's evidence ladder, shown to parents only as a word. */
  stage: number;
  stageLabel: string;
  answersChecked: number;
  lastAt: number;
  mixUp?: 'open' | 'watching' | 'fixed';
}

export interface NextLessonPlan {
  focus: string;
  /** What Ananta will do, in order, in parent words. */
  willDo: string[];
  keepAnEyeOn: string[];
  /** Topics Ananta will quickly revisit first. */
  revisit: string[];
}

export interface HomeTip {
  title: string;
  minutes: number;
  steps: string[];
  source: 'ai' | 'template';
}

/** The parts of the report a model writes. Cached on the profile. */
export interface ReportNarrative {
  letter: CitedLine[];
  worksFor: CitedLine[];
  homeTip: HomeTip;
  source: 'ai' | 'template';
  model?: string;
  /** Number of answers this was written from — a changed count means it's stale. */
  basedOnAnswers: number;
  generatedAt: number;
  rejectedLines?: number;
}

/** The last lesson, so a parent opening the page after a lesson sees that lesson first. */
export interface LatestLesson {
  sessionId: string;
  at: number;
  minutes: number | null;
  topics: string[];
  answersChecked: number;
  /** Answers where the child also explained why (Ananta's check said so). */
  explained: number;
  /** The answers from this lesson, newest last (ids into `evidence`). */
  evidenceIds: string[];
  /** Ananta's live notes during the lesson, each with the child's own words. Impressions, not checked like the answers. */
  notes: Array<{ at: number; text: string; childSaid?: string }>;
}

export interface ParentReport {
  studentId: string;
  childName: string;
  simulated: boolean;
  grade: string;
  board?: string;
  subjectId: string;
  subjectLabel: string;
  generatedAt: number;
  stats: {
    lessons: number;
    minutes: number;
    answersChecked: number;
    mixUpsFixed: number;
    mixUpsOpen: number;
    helpMoments: number;
  };
  narrative: ReportNarrative;
  /** True while the AI-written parts are still the offline template (client then asks to generate). */
  narrativeStale: boolean;
  journey: TopicProgress[];
  story: StoryThread[];
  nextLesson: NextLessonPlan | null;
  /** The most recent lesson in this subject: what it covered and the answers from it. */
  latestLesson: LatestLesson | null;
  evidence: Record<string, EvidenceCard>;
  availableSubjects: Array<{ subjectId: string; label: string }>;
}
