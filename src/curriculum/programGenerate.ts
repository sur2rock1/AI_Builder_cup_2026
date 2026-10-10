import {
  IngestJob, cupAgeMeta, generateWithFallback, ingestGemini,
  mergeIntoCurriculum, pickSuggestedTitle, slug, uniq,
} from './extractShared';
import { getCurriculum } from './ingest';
import { hashText, writeMaterial, writeProgram, writeSharedCurriculum, enrollLearner } from './programStore';
import { boardPackFor } from './boardPack';
import type { LearningMaterial, LearningProgram, ProgramLesson, ProgramQuiz, MultimediaRef } from './programTypes';

export async function confirmAndGenerate(job: IngestJob, label: string, studentId: string): Promise<LearningProgram> {
  const payload = job.payload;
  const preview = job.preview;
  if (!payload || !preview) throw new Error('This extract is gone. Read the materials again.');
  if (job.stage !== 'preview' && job.stage !== 'saving' && job.stage !== 'generating') {
    throw new Error('Confirm only after the preview is ready.');
  }
  const learnerId = studentId || payload.studentId;
  if (!learnerId) throw new Error('Missing learner.');

  const title = label.trim().slice(0, 80) || preview.suggestedTitle;
  const subjectId = slug(title) || payload.subjectId;
  const age = cupAgeMeta(payload.grade);

  job.stage = 'saving';
  job.message = 'Saving the learning material…';

  const materialId = `mat_${Date.now().toString(36)}`;
  const material: LearningMaterial = {
    materialId,
    learnerId,
    sourceType: preview.sourceType,
    subject: title,
    suggestedTitle: preview.suggestedTitle,
    extractedContent: {
      summary: preview.summary,
      topics: preview.topics,
      keyConcepts: preview.keyConcepts,
      rawTextHash: hashText(payload.rawText),
    },
    originalSources: payload.sources,
    grade: payload.grade,
    ageBand: age.band,
    ageGroupLabel: age.ageGroupLabel,
    estimatedMinutes: preview.estimatedMinutes,
    status: 'confirmed',
    createdAt: job.startedAt,
    confirmedAt: Date.now(),
  };
  await writeMaterial(material);

  job.stage = 'generating';
  job.message = `Building a ${age.sessionMinutes}-minute program for ${payload.learnerName || 'this learner'}…`;

  const curriculum = mergeIntoCurriculum(getCurriculum(subjectId), payload.extractions, {
    subjectId, subjectLabel: title, grade: payload.grade, sourceNames: payload.sourceNames,
  });

  const generated = await generateProgramShape(payload.apiKey, {
    title, grade: payload.grade, learnerName: payload.learnerName,
    topics: preview.topics, keyConcepts: preview.keyConcepts, summary: preview.summary,
  });

  const lessons = generated.lessons.length ? generated.lessons : fallbackLessons(curriculum.concepts.map(c => c.label), age.sessionMinutes);
  const quizzes = generated.quizzes.length ? generated.quizzes : fallbackQuizzes(lessons);
  const multimedia = generated.multimedia.length ? generated.multimedia : fallbackMultimedia(title, preview.keyConcepts);
  const boardPack = boardPackFor(title, preview.keyConcepts.join(' '));

  const programId = `prog_${Date.now().toString(36)}`;
  const program: LearningProgram = {
    programId,
    learnerId,
    materialId,
    curriculumId: curriculum.id,
    curriculum,
    lessons,
    quizzes,
    multimediaContent: multimedia,
    boardPack,
    progressTracking: { byLesson: Object.fromEntries(lessons.map(l => [l.id, 'not_started' as const])) },
    createdAt: Date.now(),
  };
  await writeSharedCurriculum(program, material);
  await enrollLearner(learnerId, curriculum.id, program.programId);
  await writeProgram(program);

  job.program = {
    programId, materialId, subjectId: curriculum.id, label: curriculum.label,
    lessonCount: lessons.length, quizCount: quizzes.length,
    lessons: lessons.map(l => ({ id: l.id, title: l.title, minutes: l.minutes })),
  };
  job.result = {
    subjectId: curriculum.id, label: curriculum.label, suggestedLabel: pickSuggestedTitle(payload.extractions, title),
    chapterCount: preview.topics.length, conceptCount: curriculum.concepts.length, chapters: preview.topics,
  };
  job.stage = 'ready';
  job.message = `Program ready — ${lessons.length} lessons`;
  return program;
}

async function generateProgramShape(apiKey: string, opts: {
  title: string; grade: string; learnerName?: string;
  topics: string[]; keyConcepts: string[]; summary: string;
}): Promise<{ lessons: ProgramLesson[]; quizzes: ProgramQuiz[]; multimedia: MultimediaRef[] }> {
  const age = cupAgeMeta(opts.grade);
  const who = opts.learnerName ? ` for ${opts.learnerName}` : '';
  const prompt = `You are building a teachable program${who}.
Subject: ${opts.title}
Learner: ${opts.grade} (${age.ages}). Band: ${age.band} / ${age.ageGroupLabel}.
DIFFICULTY: ${age.difficulty}
PACING: ${age.pacing}
PRESENTATION: ${age.presentation}
Session length target: ${age.sessionMinutes} minutes per lesson.

Source summary: ${opts.summary}
Topics: ${opts.topics.join('; ')}
Key concepts: ${opts.keyConcepts.join('; ')}

Return ONLY JSON:
{
  "lessons": [
    {
      "id": "l1",
      "title": "short title",
      "objectives": ["what the child can do"],
      "breakdown": ["step"],
      "takeaways": ["one line"],
      "minutes": ${age.sessionMinutes},
      "prerequisites": []
    }
  ],
  "quizzes": [
    {
      "id": "q1",
      "lessonId": "l1",
      "gate": true,
      "items": [
        { "kind": "mcq", "prompt": "…", "options": ["A","B","C"], "answer": "A", "explanation": "…" }
      ]
    }
  ],
  "multimedia": [
    { "kind": "image", "title": "…", "prompt": "photorealistic still Lumen can generate in-lesson (leaf, stomata, kitchen sink, …)" },
    { "kind": "infographic", "title": "…", "prompt": "one labelled diagram the child can point to" },
    { "kind": "videoScript", "title": "…", "prompt": "30-second controlled clip outline — pause if the child interrupts" }
  ]
}

Rules:
- 3 to 8 lessons. minutes must stay in this age band (not adult 60-min modules).
- Quizzes: mix mcq / tf / open, language at THIS age. Immediate-feedback explanations.
- Multimedia: at least two kind=image prompts ready for generate_photo_visual, plus one infographic and one videoScript outline. No video files.
- Do not invent later-year proofs or career-prep tracks.`;

  try {
    const ai = ingestGemini(apiKey);
    const text = await generateWithFallback(ai, [prompt]);
    const parsed = JSON.parse(text.replace(/```json\s*|\s*```/g, '').trim());
    const lessons: ProgramLesson[] = Array.isArray(parsed.lessons) ? parsed.lessons.map(normalizeLesson) : [];
    const quizzes: ProgramQuiz[] = Array.isArray(parsed.quizzes) ? parsed.quizzes.map(normalizeQuiz) : [];
    const multimedia: MultimediaRef[] = Array.isArray(parsed.multimedia) ? parsed.multimedia.map(normalizeMedia) : [];
    return { lessons: lessons.filter(l => l.title), quizzes, multimedia };
  } catch (e) {
    console.warn('[Program] generate fallback:', String((e as Error).message || e).slice(0, 160));
    return { lessons: [], quizzes: [], multimedia: [] };
  }
}

function normalizeLesson(raw: any, i: number): ProgramLesson {
  return {
    id: String(raw?.id || `l${i + 1}`),
    title: String(raw?.title || `Lesson ${i + 1}`).slice(0, 80),
    objectives: uniq(arr(raw?.objectives), 5),
    breakdown: uniq(arr(raw?.breakdown), 8),
    takeaways: uniq(arr(raw?.takeaways), 4),
    minutes: Math.min(35, Math.max(5, Number(raw?.minutes) || 15)),
    prerequisites: uniq(arr(raw?.prerequisites), 4),
  };
}

function normalizeQuiz(raw: any, i: number): ProgramQuiz {
  const items = Array.isArray(raw?.items) ? raw.items.map((it: any) => {
    const kind = (['mcq', 'tf', 'open'].includes(it?.kind) ? it.kind : 'mcq') as 'mcq' | 'tf' | 'open';
    const item: { kind: typeof kind; prompt: string; answer: string; explanation: string; options?: string[] } = {
      kind,
      prompt: String(it?.prompt || ''),
      answer: String(it?.answer || ''),
      explanation: String(it?.explanation || ''),
    };
    if (kind === 'mcq') {
      const opts = Array.isArray(it?.options) ? it.options.map(String).filter(Boolean).slice(0, 6) : [];
      item.options = opts.length ? opts : ['Yes', 'No', 'Not sure'];
    } else if (kind === 'tf') {
      item.options = ['True', 'False'];
    }
    return item;
  }).filter((it: any) => it.prompt) : [];
  return {
    id: String(raw?.id || `q${i + 1}`),
    lessonId: String(raw?.lessonId || 'l1'),
    items,
    gate: Boolean(raw?.gate),
  };
}

function normalizeMedia(raw: any): MultimediaRef {
  const kind = ['videoScript', 'infographic', 'audioScript', 'exercise', 'image'].includes(raw?.kind)
    ? raw.kind : 'image';
  return { kind, title: String(raw?.title || 'Picture').slice(0, 80), prompt: String(raw?.prompt || '') };
}

function arr(v: any): string[] {
  return Array.isArray(v) ? v.map(x => String(x)).filter(Boolean) : [];
}

function fallbackLessons(concepts: string[], minutes: number): ProgramLesson[] {
  const labels = concepts.slice(0, 6);
  return labels.map((title, i) => ({
    id: `l${i + 1}`,
    title,
    objectives: [`Check that the learner can explain ${title}`],
    breakdown: [`Introduce ${title}`, 'Try one example', 'Ask how they got it'],
    takeaways: [title],
    minutes,
    prerequisites: i ? [`l${i}`] : [],
  }));
}

function fallbackQuizzes(lessons: ProgramLesson[]): ProgramQuiz[] {
  return lessons.slice(0, 4).map((l, i) => ({
    id: `q${i + 1}`,
    lessonId: l.id,
    gate: i > 0,
    items: [
      { kind: 'open' as const, prompt: `In your own words, what is ${l.title}?`, answer: l.title, explanation: 'Listen for their method, not a copied sentence.' },
    ],
  }));
}

function fallbackMultimedia(title: string, concepts: string[]): MultimediaRef[] {
  const bits = concepts.slice(0, 3).join(', ') || title;
  return [
    { kind: 'image', title: `${title} in real life`, prompt: `Photorealistic close-up a Primary child would recognise for ${bits}. No text overlay.` },
    { kind: 'infographic', title: `${title} diagram`, prompt: `Simple labelled diagram of ${bits} for a 10-year-old. Few words.` },
    { kind: 'videoScript', title: `${title} in 30 seconds`, prompt: `Narrate ${bits} at this child's age. Pause if they interrupt.` },
    { kind: 'exercise', title: 'Try it', prompt: 'One hands-on check before the next lesson.' },
  ];
}
