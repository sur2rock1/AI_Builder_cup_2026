// ─────────────────────────────────────────────────────────────────
// Textbook ingestion — any number of PDFs, any size.
//
// Gemini accepts a PDF of at most 50 MB / 1000 pages per request, even via
// the Files API. A scanned textbook is often larger (the Sec 2A book is
// ~119 MB). So:
//
//   1. SPLIT   each PDF into chunks well under the limit (pdf-lib, pure JS)
//   2. UPLOAD  each chunk with the Files API (not inline base64)
//   3. EXTRACT chapters + concepts from each chunk, in parallel (2 at a time)
//   4. MERGE   chapters that straddle a chunk boundary, dedupe concepts,
//              resolve prerequisites by name, renumber teaching order
//   5. SAVE    into the subject — adding to it if it already exists, so
//              Book 2A today and Book 2B tomorrow become one curriculum
//
// It runs as a background JOB with progress, because a whole textbook takes
// minutes and an HTTP request should not be held open that long.
// ─────────────────────────────────────────────────────────────────
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GoogleGenAI, createPartFromUri, FileState } from '@google/genai';
import { CurriculumSubject, CurriculumConcept } from '../adaptive/learnerModel';
import { getCurriculum, saveCurriculum } from './ingest';

const MAX_CHUNK_PAGES = 60;
const MAX_CHUNK_BYTES = 40 * 1024 * 1024;   // headroom under Gemini's 50 MB
const CONCURRENCY = 2;
const CHUNK_TIMEOUT_MS = 4 * 60 * 1000;
const MODEL_CANDIDATES = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];
let resolvedModel: string | null = null;
const failedModels = new Set<string>();

// ─── Jobs ───────────────────────────────────────────────────────
export type JobStage = 'queued' | 'splitting' | 'extracting' | 'merging' | 'done' | 'error';
export interface IngestJob {
  id: string;
  stage: JobStage;
  message: string;
  chunksDone: number;
  chunksTotal: number;
  warnings: string[];
  error?: string;
  result?: { subjectId: string; label: string; chapterCount: number; conceptCount: number; chapters: string[] };
  startedAt: number;
}
const jobs = new Map<string, IngestJob>();
export const getJob = (id: string) => jobs.get(id) || null;

export interface IngestRequest {
  apiKey: string;
  subjectId: string;
  subjectLabel: string;
  grade: string;
  files: Array<{ path: string; originalName: string }>;
}

export function startIngestJob(req: IngestRequest): IngestJob {
  const job: IngestJob = {
    id: `ingest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    stage: 'queued', message: 'Queued', chunksDone: 0, chunksTotal: 0,
    warnings: [], startedAt: Date.now(),
  };
  jobs.set(job.id, job);
  runJob(job, req).catch(err => {
    job.stage = 'error';
    job.error = String(err?.message || err);
    job.message = 'Failed';
    console.error('[Ingest] job failed:', err);
  }).finally(() => {
    for (const f of req.files) fs.promises.unlink(f.path).catch(() => {});
  });
  return job;
}

// ─── Pipeline ───────────────────────────────────────────────────
interface Chunk { file: string; book: string; fromPage: number; toPage: number; tmp: boolean }

async function runJob(job: IngestJob, req: IngestRequest) {
  const ai = new GoogleGenAI({ apiKey: req.apiKey });

  job.stage = 'splitting';
  const chunks: Chunk[] = [];
  for (const f of req.files) {
    job.message = `Splitting ${f.originalName}…`;
    chunks.push(...await splitPdf(f.path, bookName(f.originalName)));
  }
  job.chunksTotal = chunks.length;
  console.log(`[Ingest] ${req.files.length} PDF(s) → ${chunks.length} chunk(s)`);

  job.stage = 'extracting';
  const extractions: ChunkExtraction[] = [];
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const c = chunks[next++];
      job.message = `Reading ${c.book}, pages ${c.fromPage}–${c.toPage}`;
      try {
        extractions.push(await withRetry(() => extractChunk(ai, c, req), 2));
      } catch (e: any) {
        job.warnings.push(`${c.book} pages ${c.fromPage}–${c.toPage} could not be read: ${String(e?.message || e).slice(0, 140)}`);
      } finally {
        job.chunksDone++;
        if (c.tmp) fs.promises.unlink(c.file).catch(() => {});
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));
  if (extractions.length === 0) throw new Error('No part of the PDF could be read. ' + (job.warnings[0] || ''));

  job.stage = 'merging';
  job.message = 'Combining chapters…';
  const existing = getCurriculum(req.subjectId);
  const curriculum = mergeIntoCurriculum(existing, extractions, req);
  saveCurriculum(curriculum);

  const chapters = [...new Set(curriculum.concepts.map(c => c.chapter || 'General'))];
  job.result = {
    subjectId: curriculum.id, label: curriculum.label,
    chapterCount: chapters.length, conceptCount: curriculum.concepts.length, chapters,
  };
  job.stage = 'done';
  job.message = `Added ${curriculum.concepts.length} concepts across ${chapters.length} chapters`;
  console.log(`[Ingest] ${job.message} in ${Math.round((Date.now() - job.startedAt) / 1000)}s`);
}

function bookName(file: string) {
  return file.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
}

async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let last: any;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
  throw last;
}

// ─── 1. Split ───────────────────────────────────────────────────
async function loadPdfLib() {
  try {
    return await import('pdf-lib');
  } catch {
    throw new Error('The PDF splitter is not installed yet. Stop the server, run "npm install", then start it again.');
  }
}

async function splitPdf(file: string, book: string): Promise<Chunk[]> {
  const { size } = await fs.promises.stat(file);
  const { PDFDocument } = await loadPdfLib();
  const src = await PDFDocument.load(await fs.promises.readFile(file), { ignoreEncryption: true, updateMetadata: false });
  const pages = src.getPageCount();

  // Small enough already: send as-is.
  if (size <= MAX_CHUNK_BYTES && pages <= MAX_CHUNK_PAGES) {
    return [{ file, book, fromPage: 1, toPage: pages, tmp: false }];
  }

  const out: Chunk[] = [];
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pt-chunks-'));
  const write = async (from: number, to: number): Promise<void> => {
    const doc = await PDFDocument.create();
    const copied = await doc.copyPages(src, Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i));
    copied.forEach(p => doc.addPage(p));
    const bytes = await doc.save({ useObjectStreams: true });
    // Image-heavy pages can still exceed the byte budget: halve until it fits.
    if (bytes.length > MAX_CHUNK_BYTES && to > from) {
      const mid = Math.floor((from + to) / 2);
      await write(from, mid);
      await write(mid + 1, to);
      return;
    }
    const p = path.join(dir, `${out.length.toString().padStart(3, '0')}_${from}-${to}.pdf`);
    await fs.promises.writeFile(p, bytes);
    out.push({ file: p, book, fromPage: from, toPage: to, tmp: true });
  };
  for (let from = 1; from <= pages; from += MAX_CHUNK_PAGES) {
    await write(from, Math.min(pages, from + MAX_CHUNK_PAGES - 1));
  }
  return out;
}

// ─── 2 + 3. Upload and extract ──────────────────────────────────
interface ExtractedConcept {
  label: string;
  prerequisites?: string[];          // by LABEL — resolved to ids after merging
  commonMisconceptions?: string[];
  keyFacts?: string[];
  workedExamples?: string[];
  difficultyLevel?: number;
  order?: number;
}
interface ExtractedChapter { number?: number | null; title: string; concepts: ExtractedConcept[] }
interface ChunkExtraction { chunk: Chunk; chapters: ExtractedChapter[] }

async function extractChunk(ai: GoogleGenAI, chunk: Chunk, req: IngestRequest): Promise<ChunkExtraction> {
  const uploaded = await ai.files.upload({ file: chunk.file, config: { mimeType: 'application/pdf', displayName: path.basename(chunk.file) } });
  try {
    // Wait for Gemini to finish processing the document.
    let f = uploaded;
    const until = Date.now() + 120_000;
    while (f.state === FileState.PROCESSING && Date.now() < until) {
      await new Promise(r => setTimeout(r, 2000));
      f = await ai.files.get({ name: uploaded.name! });
    }
    if (f.state === FileState.FAILED) throw new Error('Gemini could not process this part of the PDF');

    const prompt = buildPrompt(chunk, req);
    const text = await generateWithFallback(ai, [prompt, createPartFromUri(f.uri!, f.mimeType || 'application/pdf')]);
    const parsed = JSON.parse(text.replace(/```json\s*|\s*```/g, '').trim());
    const chapters: ExtractedChapter[] = Array.isArray(parsed.chapters) ? parsed.chapters : [];
    return { chunk, chapters: chapters.filter(c => c && c.title && Array.isArray(c.concepts)) };
  } finally {
    if (uploaded.name) ai.files.delete({ name: uploaded.name }).catch(() => {});
  }
}

async function generateWithFallback(ai: GoogleGenAI, contents: any[]): Promise<string> {
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
      else throw e;   // real errors (quota, content) are retried by withRetry, not by switching model
    }
  }
  throw lastErr || new Error('no model available');
}

function buildPrompt(chunk: Chunk, req: IngestRequest) {
  return `You are a curriculum analyst reading part of a school textbook.
Book: "${chunk.book}". Level: ${req.grade}. Subject: "${req.subjectLabel}".
This PDF is pages ${chunk.fromPage} to ${chunk.toPage} of the book.

Identify every CHAPTER that appears in these pages (including one that starts
before or continues after them) and the teachable CONCEPTS in each.

Ignore front matter, contents pages, answer keys, glossaries and indexes.
If these pages contain no teaching content, return {"chapters": []}.

Return ONLY JSON:
{
  "chapters": [
    {
      "number": 9,
      "title": "Pythagoras' Theorem",
      "concepts": [
        {
          "label": "Finding the hypotenuse given both legs",
          "prerequisites": ["labels of concepts this one depends on, from any chapter"],
          "commonMisconceptions": ["specific error students make, phrased as the wrong belief"],
          "keyFacts": ["rule or fact the student must know"],
          "workedExamples": ["one-line summary of a worked example actually in these pages"],
          "difficultyLevel": 2,
          "order": 1
        }
      ]
    }
  ]
}

Rules:
- Chapter "number" is the number printed in the book; null if none is shown.
- Use the chapter title exactly as printed.
- Concepts are things a student can learn and be tested on — not section headings like "Exercise 9A".
- 3 to 8 concepts per chapter. "order" is teaching order within the chapter.
- difficultyLevel 1 (easy) to 5 (advanced), relative to this level.
- commonMisconceptions must be specific and useful to a tutor. Do not invent
  misconceptions unrelated to the content; 2 to 4 per concept.`;
}

// ─── 4. Merge ───────────────────────────────────────────────────
const norm = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s: string) => norm(s).replace(/\s+/g, '-').slice(0, 60);
const uniq = (a: string[], max: number) => {
  const seen = new Set<string>(); const out: string[] = [];
  for (const x of a) { const k = norm(x); if (x && !seen.has(k)) { seen.add(k); out.push(x); } }
  return out.slice(0, max);
};

function mergeIntoCurriculum(existing: CurriculumSubject | null, parts: ChunkExtraction[], req: IngestRequest): CurriculumSubject {
  type Ch = { number: number | null; title: string; book: string; firstPage: number;
              concepts: Map<string, ExtractedConcept & { firstSeen: number }> };
  const chapters = new Map<string, Ch>();

  // Keep reading order: book, then page.
  parts.sort((a, b) => a.chunk.book.localeCompare(b.chunk.book) || a.chunk.fromPage - b.chunk.fromPage);
  let seq = 0;
  for (const part of parts) {
    for (const ch of part.chapters) {
      const num = typeof ch.number === 'number' ? ch.number : null;
      // A chapter split across two chunks has the same number (or title) in both.
      const key = `${part.chunk.book}::${num ?? norm(ch.title)}`;
      if (!chapters.has(key)) {
        chapters.set(key, { number: num, title: ch.title, book: part.chunk.book, firstPage: part.chunk.fromPage, concepts: new Map() });
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

  // Existing concepts from earlier uploads stay first; new chapters follow.
  const concepts: CurriculumConcept[] = existing ? existing.concepts.map(c => ({ ...c })) : [];
  const existingIds = new Set(concepts.map(c => c.id));
  const ordered = [...chapters.values()].sort((a, b) =>
    a.book.localeCompare(b.book) || (a.number ?? 1e9) - (b.number ?? 1e9) || a.firstPage - b.firstPage);

  for (const ch of ordered) {
    const chapterLabel = ch.number != null ? `Chapter ${ch.number}: ${ch.title}` : ch.title;
    const list = [...ch.concepts.values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.firstSeen - b.firstSeen);
    for (const c of list) {
      const id = `${slug(ch.book)}--${ch.number ?? slug(ch.title)}--${slug(c.label)}`;
      if (existingIds.has(id)) continue;   // re-uploading the same book is idempotent
      existingIds.add(id);
      concepts.push({
        id,
        label: c.label,
        subjectId: req.subjectId,
        prerequisites: [],                  // resolved below
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

  // Resolve prerequisite LABELS to ids, now that every concept has one.
  const byLabel = new Map(concepts.map(c => [norm(c.label), c.id]));
  for (const c of concepts as any[]) {
    if (c._prereqLabels) {
      c.prerequisites = uniq(
        (c._prereqLabels as string[]).map(l => byLabel.get(norm(l))).filter((id): id is string => !!id && id !== c.id), 6);
      delete c._prereqLabels;
    }
  }
  concepts.forEach((c, i) => { c.typicalTeachingOrder = i + 1; });

  const books = uniq([...(existing?.source ? existing.source.split(' + ') : []), ...req.files.map(f => bookName(f.originalName))], 20);
  return {
    id: req.subjectId,
    label: req.subjectLabel,
    grade: req.grade,
    source: books.join(' + '),
    concepts,
    prerequisiteMap: Object.fromEntries(concepts.map(c => [c.id, c.prerequisites])),
  };
}
