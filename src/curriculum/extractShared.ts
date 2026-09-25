// Shared curriculum extract + merge. Used by PDF ingest and mixed-source ingest.
import { CurriculumSubject, CurriculumConcept } from '../adaptive/learnerModel';
import { GoogleGenAI } from '@google/genai';

export type AgeBand =
  | 'early-years'
  | 'lower-primary'
  | 'upper-primary'
  | 'lower-secondary'
  | 'upper-secondary'
  | 'pre-university';

export type JobStage =
  | 'queued' | 'collecting' | 'splitting' | 'extracting' | 'merging'
  | 'preview' | 'saving' | 'generating' | 'ready' | 'done' | 'error';

export interface RailProgress {
  message: string;
  done: number;
  total: number;
}

export interface SourceRef {
  kind: 'file' | 'url';
  label: string;
  href?: string;
}

export interface MaterialPreview {
  suggestedTitle: string;
  summary: string;
  topics: string[];
  keyConcepts: string[];
  sources: SourceRef[];
  sourceType: 'file' | 'internet' | 'hybrid';
  estimatedMinutes: number;
  ageBand: AgeBand;
  ageGroupLabel: string;
  grade: string;
  learnerName?: string;
}

export interface ProgramReady {
  programId: string;
  materialId: string;
  subjectId: string;
  label: string;
  lessonCount: number;
  quizCount: number;
  lessons: Array<{ id: string; title: string; minutes: number }>;
}

export interface IngestJob {
  id: string;
  stage: JobStage;
  message: string;
  chunksDone: number;
  chunksTotal: number;
  warnings: string[];
  error?: string;
  result?: { subjectId: string; label: string; suggestedLabel?: string; chapterCount: number; conceptCount: number; chapters: string[] };
  startedAt: number;
  rails?: { files: RailProgress; internet: RailProgress };
  preview?: MaterialPreview;
  program?: ProgramReady;
  /** Server-only; stripped from GET /jobs. */
  payload?: IngestPayload;
}

export interface IngestPayload {
  studentId: string;
  grade: string;
  learnerName?: string;
  apiKey: string;
  subjectId: string;
  extractions: ChunkExtraction[];
  sourceNames: string[];
  sources: SourceRef[];
  rawText: string;
}

export interface IngestRequest {
  apiKey: string;
  subjectId: string;
  subjectLabel: string;
  grade: string;
  learnerName?: string;
  studentId?: string;
  topic?: string;
  files: Array<{ path: string; originalName: string; mimeType?: string }>;
  urls?: string[];
}

export interface ExtractedConcept {
  label: string;
  prerequisites?: string[];
  commonMisconceptions?: string[];
  keyFacts?: string[];
  workedExamples?: string[];
  difficultyLevel?: number;
  order?: number;
}
export interface ExtractedChapter { number?: number | null; title: string; concepts: ExtractedConcept[] }
export interface ChunkExtraction {
  book: string;
  fromPage?: number;
  chapters: ExtractedChapter[];
  suggestedTitle?: string;
}

const jobs = new Map<string, IngestJob>();
export const getJob = (id: string) => jobs.get(id) || null;

/** Job view for the browser — no raw extract or API key. */
export function publicJob(job: IngestJob): Omit<IngestJob, 'payload'> {
  const { payload: _omit, ...rest } = job;
  return rest;
}

export function createJob(): IngestJob {
  const job: IngestJob = {
    id: `ingest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    stage: 'queued', message: 'Queued', chunksDone: 0, chunksTotal: 0,
    warnings: [], startedAt: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
}

export const MODEL_CANDIDATES = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];
let resolvedModel: string | null = null;
const failedModels = new Set<string>();
export const CHUNK_TIMEOUT_MS = 4 * 60 * 1000;

export function bookName(file: string) {
  return file.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
}

export async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let last: any;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
  throw last;
}

/** AI Studio key (AQ.*) must not go through Vertex even if ENTERPRISE env is set. */
export function ingestGemini(apiKey: string) {
  return new GoogleGenAI({
    apiKey,
    vertexai: false,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

export async function generateWithFallback(ai: GoogleGenAI, contents: any[]): Promise<string> {
  const order = [...(resolvedModel ? [resolvedModel] : []),
    ...MODEL_CANDIDATES.filter(m => m !== resolvedModel && !failedModels.has(m))];
  let lastErr: any;
  for (const model of order) {
    try {
      const call = ai.models.generateContent({ model, contents, config: { responseMimeType: 'application/json' } });
      const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timed out')), CHUNK_TIMEOUT_MS));
      const r: any = await Promise.race([call, timeout]);
      const text = r.text || '';
      if (!text) throw new Error('empty response');
      if (resolvedModel !== model) console.log(`[Ingest] using ${model}`);
      resolvedModel = model;
      return text;
    } catch (e: any) {
      lastErr = e;
      if (/not found|not supported|404/i.test(String(e?.message))) failedModels.add(model);
      else throw e;
    }
  }
  throw lastErr || new Error('no model available');
}

export function parseExtractPayload(text: string): { chapters: ExtractedChapter[]; suggestedTitle?: string } {
  const parsed = JSON.parse(text.replace(/```json\s*|\s*```/g, '').trim());
  const chapters: ExtractedChapter[] = Array.isArray(parsed.chapters) ? parsed.chapters : [];
  const suggestedTitle = typeof parsed.suggestedTitle === 'string' ? parsed.suggestedTitle.trim() : undefined;
  return {
    chapters: chapters.filter(c => c && c.title && Array.isArray(c.concepts)),
    suggestedTitle: suggestedTitle || undefined,
  };
}

/** @deprecated use parseExtractPayload */
export function parseChaptersJson(text: string): ExtractedChapter[] {
  return parseExtractPayload(text).chapters;
}

export function ageBandFromGrade(grade: string): { band: AgeBand; ages: string; teaching: string } {
  const g = (grade || '').toLowerCase();
  const primary = g.match(/primary\s*(\d+)/);
  const secondary = g.match(/secondary\s*(\d+)/);
  const jc = /jc|junior college|grade\s*1[12]/.test(g);
  const gradeN = Number((g.match(/grade\s*(\d+)/) || [])[1] || NaN);

  if (/pre-?school|kindergarten|nursery|\bk-?2\b|\bk1\b/.test(g) || gradeN === 0) {
    return {
      band: 'early-years', ages: 'about 3–6',
      teaching: `EARLY YEARS. Keep 1–3 tiny ideas. Use stories, pictures, body, and play. No symbols, proofs, or homework language.
Key facts must be things a child can point to or count. Worked examples: "three blocks and one more". 
Misconceptions: mixing up bigger/smaller, left/right, counting the same object twice.
If the source is a secondary textbook, throw away algebra and proofs — keep only the picture-level idea.`,
    };
  }
  const p = primary ? Number(primary[1]) : (gradeN >= 1 && gradeN <= 6 ? gradeN : 0);
  if (p >= 1 && p <= 3) {
    return {
      band: 'lower-primary', ages: 'about 6–9',
      teaching: `LOWER PRIMARY. Short steps, familiar objects, everyday words. No formal proofs or algebraic letters unless the child already wrote them.
3–5 concepts max per chapter. Worked examples with numbers a child can hold (under 100).
If the source is older, rewrite each idea at this age — do not copy exam wording.`,
    };
  }
  if (p >= 4 && p <= 6) {
    return {
      band: 'upper-primary', ages: 'about 9–12',
      teaching: `UPPER PRIMARY. Rules in words first, then one number example. Light diagrams. Avoid formal proof and heavy algebra unless the source already uses it for this year.
Misconceptions: mixing up two similar ideas, using the wrong operation, reading a diagram the wrong way.
If the source is a later-year proof, keep the claim and a picture-level idea only.`,
    };
  }
  const s = secondary ? Number(secondary[1]) : (gradeN >= 7 && gradeN <= 10 ? gradeN - 6 : 0);
  if (s >= 3 && s <= 4 || gradeN >= 9 && gradeN <= 10) {
    return {
      band: 'upper-secondary', ages: 'about 14–16',
      teaching: `UPPER SECONDARY. Formal statements, exam slips, and a short justification when the source has one.
Keep 3–8 concepts. Misconceptions should be the ones that cost marks (swapped terms, dropped step, converse vs statement).`,
    };
  }
  if (jc || gradeN >= 11) {
    return {
      band: 'pre-university', ages: 'about 16–18',
      teaching: `PRE-UNIVERSITY. Abstraction, transfer, edge cases. Still extract a teachable path, not a lecture transcript.
Keep misconceptions that break a first-year proof.`,
    };
  }
  return {
    band: 'lower-secondary', ages: 'about 12–14',
    teaching: `LOWER SECONDARY. Formal statement + one real picture + one bare shape. Exam-style slips are useful.
3–8 concepts. Do not jump to later-year proofs. If the source is a kids' page, still extract it — mark difficulty 1 and keep the language honest for this year.`,
  };
}

/** Cup display + pacing. Adult bands stay documented, not generated. */
export function cupAgeMeta(grade: string): {
  band: AgeBand; ages: string; teaching: string;
  ageGroupLabel: string; sessionMinutes: number;
  difficulty: string; pacing: string; presentation: string;
} {
  const base = ageBandFromGrade(grade);
  if (base.band === 'early-years') {
    return {
      ...base, ageGroupLabel: 'toddler(2-4) / early years', sessionMinutes: 8,
      difficulty: 'Ultra-simple. One idea per lesson. Picture-based.',
      pacing: '5–10 min sessions. Frequent repetition. High reward frequency.',
      presentation: 'Bright visuals, spoken narration, play, no dense text.',
    };
  }
  if (base.band === 'lower-primary') {
    return {
      ...base, ageGroupLabel: 'child(5-8)', sessionMinutes: 10,
      difficulty: 'Simple vocabulary, concrete examples, story-based.',
      pacing: '5–10 min sessions. Frequent repetition. High reward frequency.',
      presentation: 'Bright visuals, animations, audio narration, gamified rewards.',
    };
  }
  if (base.band === 'upper-primary') {
    return {
      ...base, ageGroupLabel: 'preteen(9-12)', sessionMinutes: 18,
      difficulty: 'Moderate complexity, real-world connections, structured exercises.',
      pacing: '15–20 min sessions. Spaced repetition. Milestone progression.',
      presentation: 'Interactive diagrams, short videos, badges. No adult essays.',
    };
  }
  return {
    ...base, ageGroupLabel: 'teen(13-17)', sessionMinutes: 30,
    difficulty: 'Abstract thinking, critical analysis, project-style challenges.',
    pacing: '25–35 min sessions. Challenge-based. No 60-min adult modules.',
    presentation: 'Video prompts, discussion, real-world cases. Not certification tracks.',
  };
}

export function pickSuggestedTitle(parts: ChunkExtraction[], fallback: string): string {
  const votes = parts.map(p => p.suggestedTitle).filter(Boolean) as string[];
  if (votes[0]) return votes[0].slice(0, 60);
  const ch = parts.find(p => p.chapters[0]?.title)?.chapters[0]?.title;
  if (ch) return ch.slice(0, 60);
  return fallback.slice(0, 60) || 'New subject';
}

export function buildCurriculumPrompt(opts: {
  book: string;
  grade: string;
  subjectLabel?: string;
  learnerName?: string;
  sourceHint: string;
}) {
  const age = ageBandFromGrade(opts.grade);
  const who = opts.learnerName ? ` for ${opts.learnerName}` : '';
  const subjectLine = opts.subjectLabel
    ? `Working title (may ignore if the source is clearly about something else): "${opts.subjectLabel}".`
    : `Suggest a short subject name a parent would tap.`;
  return `You are a curriculum analyst turning source material into a teachable graph${who}.
The learner is ${opts.grade} (${age.ages}). Age band: ${age.band}.
${age.teaching}

Source: "${opts.book}".
${subjectLine}
${opts.sourceHint}

Identify every CHAPTER (or major section) and the teachable CONCEPTS this learner can actually meet.

The subject is whatever THIS source teaches — science, language, humanities, or maths. Do not assume Pythagoras, triangles, or any previous lesson.

Ignore front matter, contents, answer keys, ads, comments, glossaries and indexes.
If there is no teaching content, return {"suggestedTitle":"","chapters":[]}.

Return ONLY JSON:
{
  "suggestedTitle": "Short subject name",
  "chapters": [
    {
      "number": null,
      "title": "Chapter title from the source",
      "concepts": [
        {
          "label": "One checkable idea from this source",
          "prerequisites": ["labels of concepts this one depends on"],
          "commonMisconceptions": ["specific error THIS age makes, phrased as the wrong belief"],
          "keyFacts": ["rule or fact THIS learner must know, in their words"],
          "workedExamples": ["one-line summary of a worked example at THIS age"],
          "difficultyLevel": 2,
          "order": 1
        }
      ]
    }
  ]
}

Rules:
- suggestedTitle: 2–6 words, no "Chapter", no grade number. Name the subject the source actually teaches.
- Chapter "number" is the printed number if any; null otherwise.
- Concepts are things THIS learner can learn and be checked on — not later-year extras.
- Fewer concepts is better when the child is younger. Rich sources for older learners: 3 to 8 per chapter.
- difficultyLevel 1 (easy for this age) to 5 (stretch for this age). Never rate against a university bar.
- commonMisconceptions must be specific to this age and this subject. 2 to 4 per concept. Do not invent ones unrelated to the source.`;
}

export const norm = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const slug = (s: string) => norm(s).replace(/\s+/g, '-').slice(0, 60);
export const uniq = (a: string[], max: number) => {
  const seen = new Set<string>(); const out: string[] = [];
  for (const x of a) { const k = norm(x); if (x && !seen.has(k)) { seen.add(k); out.push(x); } }
  return out.slice(0, max);
};

export function mergeIntoCurriculum(
  existing: CurriculumSubject | null,
  parts: ChunkExtraction[],
  req: { subjectId: string; subjectLabel: string; grade: string; sourceNames: string[] },
): CurriculumSubject {
  type Ch = { number: number | null; title: string; book: string; firstPage: number;
              concepts: Map<string, ExtractedConcept & { firstSeen: number }> };
  const chapters = new Map<string, Ch>();

  parts.sort((a, b) => a.book.localeCompare(b.book) || (a.fromPage || 0) - (b.fromPage || 0));
  let seq = 0;
  for (const part of parts) {
    for (const ch of part.chapters) {
      const num = typeof ch.number === 'number' ? ch.number : null;
      const key = `${part.book}::${num ?? norm(ch.title)}`;
      if (!chapters.has(key)) {
        chapters.set(key, { number: num, title: ch.title, book: part.book, firstPage: part.fromPage || 0, concepts: new Map() });
      }
      const target = chapters.get(key)!;
      for (const c of ch.concepts) {
        if (!c?.label) continue;
        const k = norm(c.label);
        const prev = target.concepts.get(k);
        if (!prev) {
          target.concepts.set(k, { ...c, firstSeen: seq++ });
        } else {
          prev.prerequisites = uniq([...(prev.prerequisites || []), ...(c.prerequisites || [])], 6);
          prev.commonMisconceptions = uniq([...(prev.commonMisconceptions || []), ...(c.commonMisconceptions || [])], 5);
          prev.keyFacts = uniq([...(prev.keyFacts || []), ...(c.keyFacts || [])], 6);
          prev.workedExamples = uniq([...(prev.workedExamples || []), ...(c.workedExamples || [])], 4);
        }
      }
    }
  }

  const concepts: CurriculumConcept[] = existing ? existing.concepts.map(c => ({ ...c })) : [];
  const existingIds = new Set(concepts.map(c => c.id));
  const ordered = [...chapters.values()].sort((a, b) =>
    a.book.localeCompare(b.book) || (a.number ?? 1e9) - (b.number ?? 1e9) || a.firstPage - b.firstPage);

  for (const ch of ordered) {
    const chapterLabel = ch.number != null ? `Chapter ${ch.number}: ${ch.title}` : ch.title;
    const list = [...ch.concepts.values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.firstSeen - b.firstSeen);
    for (const c of list) {
      const id = `${slug(ch.book)}--${ch.number ?? slug(ch.title)}--${slug(c.label)}`;
      if (existingIds.has(id)) continue;
      existingIds.add(id);
      concepts.push({
        id,
        label: c.label,
        subjectId: req.subjectId,
        prerequisites: [],
        commonMisconceptions: uniq(c.commonMisconceptions || [], 5),
        keyFacts: uniq(c.keyFacts || [], 6),
        workedExamples: uniq(c.workedExamples || [], 4),
        difficultyLevel: Math.min(5, Math.max(1, Math.round(c.difficultyLevel || 2))) as 1 | 2 | 3 | 4 | 5,
        typicalTeachingOrder: 0,
        chapter: chapterLabel,
        book: ch.book,
        ...( { _prereqLabels: c.prerequisites || [] } as any ),
      } as CurriculumConcept);
    }
  }

  const byLabel = new Map(concepts.map(c => [norm(c.label), c.id]));
  for (const c of concepts as any[]) {
    if (c._prereqLabels) {
      c.prerequisites = uniq(
        (c._prereqLabels as string[]).map((l: string) => byLabel.get(norm(l))).filter((id: string | undefined) => !!id && id !== c.id), 6);
      delete c._prereqLabels;
    }
  }
  concepts.forEach((c, i) => { c.typicalTeachingOrder = i + 1; });

  const books = uniq([...(existing?.source ? existing.source.split(' + ') : []), ...req.sourceNames], 20);
  return {
    id: req.subjectId,
    label: req.subjectLabel,
    grade: req.grade,
    source: books.join(' + '),
    concepts,
    prerequisiteMap: Object.fromEntries(concepts.map(c => [c.id, c.prerequisites])),
  };
}
