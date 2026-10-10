import crypto from 'crypto';
import { admin, initFirebaseAdmin } from '../firebase/admin';
import type { CurriculumSubject } from '../adaptive/learnerModel';
import { getCurriculum, listCurricula, saveCurriculum } from './ingest';
import { PYTHAGORAS_CURRICULUM } from './pythagoras';
import { boardPackFor } from './boardPack';
import type { LearningMaterial, LearningProgram, ProgramLesson } from './programTypes';

const memoryPrograms = new Map<string, LearningProgram>();
const memoryCatalog = new Map<string, LearningProgram>();

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

export async function writeSharedCurriculum(program: LearningProgram, material?: LearningMaterial): Promise<void> {
  const id = program.curriculumId || program.curriculum?.id;
  if (!id) return;
  ensureProgramVisuals(program);
  memoryCatalog.set(id, program);
  saveCurriculum(program.curriculum);
  try {
    await db().collection('curricula').doc(id).set(stripUndefined({
      curriculumId: id,
      label: program.curriculum.label,
      grade: program.curriculum.grade,
      source: program.curriculum.source,
      programId: program.programId,
      materialId: program.materialId,
      boardPack: program.boardPack || [],
      multimediaContent: program.multimediaContent || [],
      lessons: program.lessons,
      quizzes: program.quizzes,
      curriculum: program.curriculum,
      material: material || null,
      createdAt: program.createdAt,
    }), { merge: true });
  } catch (e) {
    console.warn('[Program] shared curriculum write skipped:', String((e as Error).message || e).slice(0, 160));
  }
}

export async function enrollLearner(learnerId: string, curriculumId: string, programId: string): Promise<void> {
  try {
    await db().collection('learners').doc(learnerId)
      .collection('enrollments').doc(curriculumId).set({
        curriculumId, programId, enrolledAt: Date.now(),
      }, { merge: true });
  } catch (e) {
    console.warn('[Program] enroll skipped:', String((e as Error).message || e).slice(0, 160));
  }
}

export async function listSharedCurricula(): Promise<LearningProgram[]> {
  const fromMem = [...memoryCatalog.values()];
  try {
    const snap = await db().collection('curricula').get();
    const fromFs = snap.docs.map(d => {
      const data = d.data();
      return ensureProgramVisuals({
        programId: data.programId || `prog_${d.id}`,
        materialId: data.materialId || '',
        curriculumId: d.id,
        curriculum: data.curriculum,
        lessons: data.lessons || [],
        quizzes: data.quizzes || [],
        multimediaContent: data.multimediaContent || [],
        boardPack: data.boardPack || [],
        progressTracking: { byLesson: {} },
        createdAt: data.createdAt || 0,
      } as LearningProgram);
    }).filter(p => p.curriculum?.id);
    const seen = new Set<string>();
    const out: LearningProgram[] = [];
    for (const p of [...fromMem, ...fromFs]) {
      const id = p.curriculumId || p.curriculum?.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (p.curriculum) saveCurriculum(p.curriculum);
      memoryCatalog.set(id, p);
      out.push(p);
    }
    return out;
  } catch {
    return fromMem;
  }
}

export async function writeProgram(program: LearningProgram): Promise<void> {
  memoryPrograms.set(program.programId, program);
  saveCurriculum(program.curriculum);
  await writeSharedCurriculum(program);
  if (program.learnerId && program.curriculum?.id) {
    await enrollLearner(program.learnerId, program.curriculum.id, program.programId);
  }
  if (!program.learnerId) return;
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
  const catalog = memoryCatalog.get(subjectId);
  if (catalog?.curriculum) return catalog.curriculum;
  const mem = [...memoryPrograms.values()].find(p => p.curriculum?.id === subjectId);
  if (mem) return mem.curriculum;
  const file = getCurriculum(subjectId);
  if (file) return file;
  if (subjectId === PYTHAGORAS_CURRICULUM.id) return PYTHAGORAS_CURRICULUM;
  return null;
}

export function getSharedProgram(subjectId: string): LearningProgram | null {
  return memoryCatalog.get(subjectId) || [...memoryPrograms.values()].find(p => p.curriculum?.id === subjectId) || null;
}

function ensureProgramVisuals(program: LearningProgram): LearningProgram {
  const title = program.curriculum?.label || 'Lesson';
  const extra = (program.curriculum?.concepts || []).map(c => c.label).join(' ');
  if (!program.curriculumId && program.curriculum?.id) program.curriculumId = program.curriculum.id;
  if (!program.boardPack?.length) program.boardPack = boardPackFor(title, extra);
  else if (!program.boardPack.includes('model') && !program.boardPack.includes('video')) {
    program.boardPack = [...program.boardPack, 'video'];
  }
  const bits = extra.split(' ').filter(Boolean).slice(0, 8).join(' ') || title;
  if (!program.multimediaContent?.length) {
    program.multimediaContent = [
      { kind: 'image', title: `${title} in real life`, prompt: `Photorealistic close-up a Primary child would recognise for ${bits}. No text overlay.` },
      { kind: 'infographic', title: `${title} diagram`, prompt: `Simple labelled diagram of ${bits} for a 10-year-old. Few words.` },
      { kind: 'videoScript', title: `${title} in 30 seconds`, prompt: `Narrate ${bits} at this child's age. Pause if they interrupt.` },
    ];
  } else if (!program.multimediaContent.some(m => m.kind === 'image')) {
    program.multimediaContent = [
      { kind: 'image', title: `${title} in real life`, prompt: `Photorealistic close-up a Primary child would recognise for ${bits}. No text overlay.` },
      { kind: 'image', title: `${title} close-up`, prompt: `Another concrete photo of ${bits} a child can point to. No text overlay.` },
      ...program.multimediaContent,
    ];
  }
  return program;
}

export async function loadSharedProgram(subjectId: string): Promise<LearningProgram | null> {
  if (!subjectId) return null;
  const cached = getSharedProgram(subjectId);
  if (cached) return ensureProgramVisuals(cached);
  try {
    const doc = await db().collection('curricula').doc(subjectId).get();
    if (doc.exists) {
      const data = doc.data() || {};
      const program = ensureProgramVisuals({
        programId: data.programId || `prog_${subjectId}`,
        materialId: data.materialId || '',
        curriculumId: subjectId,
        curriculum: data.curriculum,
        lessons: data.lessons || [],
        quizzes: data.quizzes || [],
        multimediaContent: data.multimediaContent || [],
        boardPack: data.boardPack || [],
        progressTracking: { byLesson: {} },
        createdAt: data.createdAt || 0,
      } as LearningProgram);
      if (program.curriculum) {
        saveCurriculum(program.curriculum);
        memoryCatalog.set(subjectId, program);
      }
      return program.curriculum ? program : null;
    }
    const all = await listSharedCurricula();
    return all.find(p => p.curriculum?.id === subjectId) || null;
  } catch {
    return getSharedProgram(subjectId);
  }
}

export async function listEnrollments(learnerId: string): Promise<string[]> {
  try {
    const snap = await db().collection('learners').doc(learnerId).collection('enrollments').get();
    return snap.docs.map(d => d.id);
  } catch {
    return [];
  }
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
  const example = examplePythagorasProgram(learnerId);
  example.curriculumId = PYTHAGORAS_CURRICULUM.id;
  example.boardPack = ['photo', 'diagram', 'model', 'chalk'];
  await writeProgram(example);
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
