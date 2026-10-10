import type { CurriculumSubject } from '../adaptive/learnerModel';
import type { AgeBand, SourceRef } from './extractShared';

export interface LearningMaterial {
  materialId: string;
  learnerId: string;
  sourceType: 'file' | 'internet' | 'hybrid';
  subject: string;
  suggestedTitle: string;
  extractedContent: {
    summary: string;
    topics: string[];
    keyConcepts: string[];
    rawTextHash: string;
  };
  originalSources: SourceRef[];
  grade: string;
  ageBand: AgeBand;
  ageGroupLabel: string;
  estimatedMinutes: number;
  status: 'previewed' | 'confirmed';
  createdAt: number;
  confirmedAt?: number;
}

export interface ProgramLesson {
  id: string;
  title: string;
  objectives: string[];
  breakdown: string[];
  takeaways: string[];
  minutes: number;
  prerequisites: string[];
}

export interface ProgramQuizItem {
  kind: 'mcq' | 'tf' | 'open';
  prompt: string;
  options?: string[];
  answer: string;
  explanation: string;
}

export interface ProgramQuiz {
  id: string;
  lessonId: string;
  items: ProgramQuizItem[];
  gate: boolean;
}

export interface MultimediaRef {
  kind: 'videoScript' | 'infographic' | 'audioScript' | 'exercise' | 'image';
  title: string;
  prompt: string;
}

export interface LearningProgram {
  programId: string;
  learnerId?: string;
  materialId: string;
  curriculumId?: string;
  curriculum: CurriculumSubject;
  lessons: ProgramLesson[];
  quizzes: ProgramQuiz[];
  multimediaContent: MultimediaRef[];
  boardPack?: Array<'photo' | 'diagram' | 'model' | 'chalk' | 'video'>;
  progressTracking: { byLesson: Record<string, 'not_started' | 'done'> };
  createdAt: number;
}
