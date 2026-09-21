export type GradeLevel =
  | 'Elementary (Grade 3-5)'
  | 'Middle School (Grade 6-8)'
  | 'Secondary 2 (Grade 8)'
  | 'High School (Grade 9-12)'
  | 'College / Undergraduate'
  | 'Beginner / Self-Learner';

export interface ConceptNode {
  id: string;
  label: string;
  sublabel?: string;
  category?: string;
  color: 'emerald' | 'amber' | 'sky' | 'violet' | 'rose' | 'teal';
  details: string;
  icon?: string;
}

export interface DiagramConnection {
  from: string;
  to: string;
  label?: string;
}

export interface DynamicDiagramData {
  diagramType: 'flow' | 'cycle' | 'nodes' | 'comparison' | 'hierarchy';
  title: string;
  description: string;
  nodes: ConceptNode[];
  connections: DiagramConnection[];
}

export interface ChalkboardNotesData {
  title: string;
  subtitle: string;
  bulletPoints: string[];
  coreRuleOrFormula?: string;
  keyTakeaways: string[];
}

export interface InteractiveVariable {
  id: string;
  name: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: string;
  description: string;
}

export interface InteractiveExplorerData {
  title: string;
  description: string;
  variables: InteractiveVariable[];
  outcomeLabel: string;
  calculateOutcome: (vals: Record<string, number>) => {
    valueText: string;
    explanation: string;
    status: 'normal' | 'high' | 'critical' | 'optimal';
  };
  outcomeFormulaString?: string;
}

export interface DynamicQuizData {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  hint?: string;
}

export type BlackboardTab = '2d' | '3d' | 'photo' | 'chalkboard' | 'explorer' | 'quiz';

export interface Scene3DData {
  sceneType: 'orbit' | 'molecule' | 'geometry' | 'network' | 'dna' | 'globe' | 'particles';
  title: string;
  description: string;
  elements: Array<{
    name: string;
    description: string;
    color: string;
    position?: [number, number, number];
  }>;
}

export interface PhotoVisualData {
  imageUrl?: string;
  caption: string;
  promptUsed: string;
  annotations?: Array<{
    label: string;
    description: string;
    x: number; // percentage 0-100
    y: number; // percentage 0-100
  }>;
}

export interface DynamicLessonData {
  topic: string;
  grade: string;
  subject: string;
  tagline: string;
  overview: string;
  diagram: DynamicDiagramData;
  scene3d?: Scene3DData;
  photoVisual?: PhotoVisualData;
  chalkNotes: ChalkboardNotesData;
  explorer: InteractiveExplorerData;
  quiz: DynamicQuizData;
  suggestedQuestions: string[];
}

export interface BlackboardState {
  activeTab: BlackboardTab;
  lessonData: DynamicLessonData | null;
  isLoading: boolean;
  isGeneratingPhoto?: boolean;
  highlightedNodeId: string | null;
  interactiveValues: Record<string, number>;
  selectedQuizOption: number | null;
  showQuizResult: boolean;
  customLiveNotes: string[];
}

export interface TutorState {
  isSpeaking: boolean;
  mouthOpenness: number; // 0 to 1
  isBlinking: boolean;
  isNodding: boolean;
  eyebrowsRaised: boolean;
  name: string;
  title: string;
  avatarStyle?: 'professor' | 'modern' | 'friendly';
}

export interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

// ─── Adaptive Learning Types (frontend-facing) ─────────────────

export type MasteryLevel = 'not_started' | 'exposed' | 'partial' | 'developing' | 'proficient' | 'mastered';
export type TeachingStrategy =
  | 'direct_explanation' | 'worked_example' | 'visual_diagram'
  | 'real_world_analogy' | 'socratic_questioning' | 'step_by_step'
  | 'story_context' | 'interactive_simulation' | 'peer_comparison' | 'prerequisite_review';

export type UnderstandingDepth =
  | 'memorised' | 'recognised' | 'understood' | 'applied'
  | 'transferred' | 'incorrect' | 'guessed' | 'confused';

export interface ConceptStateUI {
  conceptId: string;
  label: string;
  masteryLevel: MasteryLevel;
  masteryScore: number;
  attemptCount: number;
  correctCount: number;
  lastVisited: number;
  strategiesUsed: TeachingStrategy[];
  effectiveStrategies: TeachingStrategy[];
  ineffectiveStrategies: TeachingStrategy[];
  confirmedMisconceptions: string[];
  suspectedMisconceptions: string[];
  notes: string[];
}

export interface SubjectProgressUI {
  subjectId: string;
  subjectLabel: string;
  grade: string;
  conceptStates: Record<string, ConceptStateUI>;
  sessionCount: number;
  totalMinutes: number;
  lastSession: number;
}

export interface LearnerProfileUI {
  studentId: string;
  name: string;
  grade: string;
  createdAt: number;
  updatedAt: number;
  subjects: Record<string, SubjectProgressUI>;
  globalInsights: string[];
}

export interface AssessmentResultUI {
  understandingDepth: UnderstandingDepth;
  misconceptionDetected: boolean;
  misconceptionDescription?: string;
  misconceptionType?: string;
  confidence: 'high' | 'medium' | 'low';
  recommendedAction: 'advance' | 'reinforce' | 'switch_strategy' | 'revisit_prerequisite' | 'praise_and_continue';
  suggestedNextStrategy?: TeachingStrategy;
  teachingNote: string;
  masteryDelta: number;
}

export interface AdaptiveSessionUI {
  sessionId: string;
  studentId: string;
  subjectId: string;
  currentConceptId: string;
  currentStrategy: TeachingStrategy;
  sessionStarted: number;
  interactionCount: number;
  pendingStrategySwitch?: TeachingStrategy;
  switchReason?: string;
}

export interface CurriculumConceptUI {
  id: string;
  label: string;
  subjectId: string;
  prerequisites: string[];
  commonMisconceptions: string[];
  keyFacts: string[];
  workedExamples: string[];
  difficultyLevel: number;
  typicalTeachingOrder: number;
}
