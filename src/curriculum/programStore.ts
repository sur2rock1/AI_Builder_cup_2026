import crypto from 'crypto';
import { admin, initFirebaseAdmin } from '../firebase/admin';
import type { CurriculumSubject } from '../adaptive/learnerModel';
import { getCurriculum, listCurricula, saveCurriculum } from './ingest';
import { PYTHAGORAS_CURRICULUM } from './pythagoras';
import type { LearningMaterial, LearningProgram, ProgramLesson } from './programTypes';

const memoryPrograms = new Map<string, LearningProgram>();

function db() {
  initFirebaseAdmin();
  return admin.firestore();
}

export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 32);
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(v => stripUndefined(v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

export async function writeMaterial(material: LearningMaterial): Promise<void> {
  memoryPrograms.set(`mat:${material.materialId}`, material as any);
  try {
    await db().collection('learners').doc(material.learnerId)
      .collection('materials').doc(material.materialId).set(stripUndefined(material));
  } catch (e) {
    console.warn('[Program] Firestore material write skipped:', String((e as Error).message || e).slice(0, 160));
  }
}

export async function writeProgram(program: LearningProgram): Promise<void> {
  memoryPrograms.set(program.programId, program);
  saveCurriculum(program.curriculum);
  try {
    const { curriculum, ...rest } = program;
    await db().collection('learners').doc(program.learnerId)
      .collection('programs').doc(program.programId).set(stripUndefined({
        ...rest,
        curriculum,
      }));
  } catch (e) {
    console.warn('[Program] Firestore program write skipped:', String((e as Error).message || e).slice(0, 160));
  }
}

export async function listProgramsForLearner(learnerId: string): Promise<LearningProgram[]> {
  const fromMem = [...memoryPrograms.values()].filter(p => p.learnerId === learnerId);
  try {
    const snap = await db().collection('learners').doc(learnerId).collection('programs').get();
    const fromFs = snap.docs.map(d => d.data() as LearningProgram);
    const seen = new Set<string>();
    const out: LearningProgram[] = [];
    for (const p of [...fromMem, ...fromFs]) {
      if (!p?.programId || seen.has(p.programId)) continue;
      seen.add(p.programId);
      if (p.curriculum) saveCurriculum(p.curriculum);
      out.push(p);
    }
    return out;
  } catch {
    return fromMem;
  }
}

export function getProgramCurriculum(subjectId: string): CurriculumSubject | null {
  const mem = [...memoryPrograms.values()].find(p => p.curriculum?.id === subjectId);
  if (mem) return mem.curriculum;
  const file = getCurriculum(subjectId);
  if (file) return file;
  // Seed definition only — not a global catalogue. Subject lists come from Firestore programs.
  if (subjectId === PYTHAGORAS_CURRICULUM.id) return PYTHAGORAS_CURRICULUM;
  return null;
}

/** Cup demo seed: Secondary 2 Pythagoras as one example program, not a special subject. */
export function examplePythagorasProgram(learnerId: string): LearningProgram {
  const lessons: ProgramLesson[] = PYTHAGORAS_CURRICULUM.concepts.map((c, i) => ({
    id: `l${i + 1}`,
    title: c.label,
    objectives: [`Check that the learner can explain ${c.label}`],
    breakdown: [`Introduce ${c.label}`, 'Try one example', 'Ask how they got it'],
    takeaways: [c.label],
    minutes: 15,
    prerequisites: i ? [`l${i}`] : [],
  }));
  return {
    programId: `prog_example_pythagoras_${learnerId}`,
    learnerId,
    materialId: `mat_example_pythagoras_${learnerId}`,
    curriculum: PYTHAGORAS_CURRICULUM,
    lessons,
    quizzes: [],
    multimediaContent: [],
    progressTracking: { byLesson: Object.fromEntries(lessons.map(l => [l.id, 'not_started' as const])) },
    createdAt: 0,
  };
}

export async function ensureExampleProgram(learnerId: string, grade: string): Promise<void> {
  if (!/secondary\s*2|grade\s*8/i.test(grade || '')) return;
  const existing = await listProgramsForLearner(learnerId);
  if (existing.some(p => p.curriculum?.id === PYTHAGORAS_CURRICULUM.id)) return;
  await writeProgram(examplePythagorasProgram(learnerId));
}

export function listProgramCurricula(): CurriculumSubject[] {
  const fromMem = [...memoryPrograms.values()].map(p => p.curriculum).filter(Boolean);
  const fromFile = listCurricula();
  const seen = new Set<string>();
  const out: CurriculumSubject[] = [];
  for (const c of [...fromMem, ...fromFile]) {
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}
