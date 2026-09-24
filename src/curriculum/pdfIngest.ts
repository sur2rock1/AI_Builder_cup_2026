// ─────────────────────────────────────────────────────────────────
// Textbook ingestion — any number of PDFs, any size.
//
// Gemini accepts a PDF of at most 50 MB / 1000 pages per request, even via
// the Files API. A scanned textbook is often larger. So:
//
//   1. SPLIT   each PDF into chunks well under the limit (pdf-lib, pure JS)
//   2. UPLOAD  each chunk with the Files API (not inline base64)
//   3. EXTRACT chapters + concepts from each chunk, in parallel (2 at a time)
//   4. MERGE   chapters that straddle a chunk boundary, dedupe concepts,
//              resolve prerequisites by name, renumber teaching order
//   5. SAVE    into the subject — adding to it if it already exists, so
//              Book A today and Book B tomorrow become one curriculum
//
// It runs as a background JOB with progress, because a whole textbook takes
// minutes and an HTTP request should not be held open that long.
// ─────────────────────────────────────────────────────────────────
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GoogleGenAI, createPartFromUri, FileState } from '@google/genai';
import { spawn } from 'child_process';
import {
  CurriculumSubject,
  CurriculumConcept,
  PrerequisiteDetail,
  MisconceptionDetail,
  ChapterScopeMap,
} from '../adaptive/learnerModel';
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

// Path to the pre-generated asset cache
const PREGEN_DIR = path.join(process.cwd(), 'data', 'pregenerated');

/** Slugify a string the same way pregenerate-assets.ts does */
function slugifyLabel(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

/**
 * Spawn the pre-generation script in the background for any concept
 * that does not yet have a pre-generated asset file.
 * The script uses its own cache-skip logic (it will skip existing files).
 * We unref() the child so it never blocks the server from exiting.
 */
function triggerPregenerationBackground(concepts: CurriculumConcept[], apiKey: string): void {
  try {
    const newOnes = concepts.filter(
      c => !fs.existsSync(path.join(PREGEN_DIR, `${slugifyLabel(c.label)}.json`))
    );
    if (newOnes.length === 0) {
      console.log('[Ingest] All concepts already pre-generated — skipping background pregen.');
      return;
    }
    console.log(`[Ingest] Launching background pre-generation for ${newOnes.length} new concept(s)...`);
    // Use tsx so TypeScript is handled; inherit env so GEMINI_API_KEY is available.
    const child = spawn(
      'npx',
      ['tsx', 'scripts/pregenerate-assets.ts'],
      {
        env: { ...process.env, GEMINI_API_KEY: apiKey },
        cwd: process.cwd(),
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    child.stdout?.on('data', (d: Buffer) => process.stdout.write(`[pregen] ${d}`));
    child.stderr?.on('data', (d: Buffer) => process.stderr.write(`[pregen] ${d}`));
    child.on('exit', (code: number | null) => {
      console.log(`[Ingest] Background pre-generation finished (exit ${code}).`);
    });
    child.unref();
  } catch (err: any) {
    console.warn('[Ingest] Could not spawn background pre-generation:', err?.message);
  }
}

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

  // Kick off background pre-generation for any newly ingested concepts
  triggerPregenerationBackground(curriculum.concepts, req.apiKey);
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

// Rich types from the Gemini extraction schema
interface ExtractedPrerequisiteDetail {
  label: string;        // Name of the prerequisite concept
  reason: string;       // Why it's needed for the current concept
  checkQuestion: string; // Quick question to verify the student has this prereq
}

interface ExtractedMisconceptionDetail {
  belief: string;           // What the student wrongly believes
  triggerPattern?: string;  // What kind of question/context triggers it
  probeQuestion: string;    // Question to surface the misconception
  correctionHint: string;   // How to correct it if confirmed
}

interface ExtractedScopeMap {
  inScope: string[];     // Topics explicitly covered in this chapter at this grade
  advanced: string[];    // Topics mentioned but marked as extension/advanced
  outOfScope: string[];  // Topics deliberately excluded at this grade
  gradeNote?: string;    // Grade-specific note (e.g. "Grade 8 only covers positive roots")
}

interface ExtractedConcept {
  label: string;
  prerequisites?: string[];            // prerequisite labels (simple strings, for backward compat)
  prerequisiteDetails?: ExtractedPrerequisiteDetail[];  // rich prereq info
  commonMisconceptions?: string[];     // simple strings
  misconceptionDetails?: ExtractedMisconceptionDetail[]; // rich misconception info
  keyFacts?: string[];
  workedExamples?: string[];
  difficultyLevel?: number;
  order?: number;
}

interface ExtractedChapter {
  number?: number | null;
  title: string;
  scopeMap?: ExtractedScopeMap;
  concepts: ExtractedConcept[];
}

interface ChunkExtraction { chunk: Chunk; chapters: ExtractedChapter[] }

async function uploadWithRetry(ai: GoogleGenAI, chunk: Chunk): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await ai.files.upload({ file: chunk.file, config: { mimeType: 'application/pdf', displayName: path.basename(chunk.file) } });
    } catch (e: any) {
      if (isRetryable(e) && attempt < 3) {
        const wait = Math.min(30_000, 5_000 * 2 ** attempt);
        console.warn(`[Ingest] File upload transient error (attempt ${attempt + 1}/4), retrying in ${wait / 1000}s: ${e?.message}`);
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }
}

async function extractChunk(ai: GoogleGenAI, chunk: Chunk, req: IngestRequest): Promise<ChunkExtraction> {
  const uploaded = await uploadWithRetry(ai, chunk);
  try {
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

/** True for errors that are safe to retry (rate-limit / overload / server busy). */
function isRetryable(e: any): boolean {
  const msg = String(e?.message ?? e?.status ?? e?.code ?? '');
  return /503|502|429|overload|too many|resource.exhausted|rate.limit|quota|temporarily|high demand|unavailable/i.test(msg);
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function generateWithFallback(ai: GoogleGenAI, contents: any[]): Promise<string> {
  const order = [...(resolvedModel ? [resolvedModel] : []),
    ...MODEL_CANDIDATES.filter(m => m !== resolvedModel && !failedModels.has(m))];
  let lastErr: any;
  for (const model of order) {
    // Up to 5 retries with exponential back-off for transient 503/429 errors
    for (let attempt = 0; attempt < 5; attempt++) {
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
        if (/not found|not supported|404/i.test(String(e?.message))) {
          failedModels.add(model);
          break; // try next model
        }
        if (isRetryable(e) && attempt < 4) {
          const wait = Math.min(60_000, 5_000 * 2 ** attempt); // 5s, 10s, 20s, 40s, 60s
          console.warn(`[Ingest] ${model} returned transient error (attempt ${attempt + 1}/5), retrying in ${wait / 1000}s: ${e?.message}`);
          await sleep(wait);
          continue;
        }
        throw e; // non-retryable or exhausted retries
      }
    }
  }
  throw lastErr || new Error('no model available');
}

function buildPrompt(chunk: Chunk, req: IngestRequest) {
  return `You are a curriculum analyst and expert teacher reading part of a school textbook.
Book: "${chunk.book}". Level: ${req.grade}. Subject: "${req.subjectLabel}".
This PDF is pages ${chunk.fromPage} to ${chunk.toPage} of the book.

Identify every CHAPTER that appears in these pages and the teachable CONCEPTS in each.
Ignore front matter, contents pages, answer keys, glossaries and indexes.
If these pages contain no teaching content, return {"chapters": []}.

Return ONLY valid JSON matching this schema exactly:
{
  "chapters": [
    {
      "number": 9,
      "title": "Chapter title exactly as printed in the book",
      "scopeMap": {
        "inScope": ["topic or skill explicitly taught in this chapter at this grade"],
        "advanced": ["topic mentioned but marked extension or beyond this grade"],
        "outOfScope": ["topic deliberately excluded — name it so a tutor knows NOT to go there"],
        "gradeNote": "One sentence on what this grade level covers vs higher grades, or omit"
      },
      "concepts": [
        {
          "label": "Finding the hypotenuse given both legs",
          "order": 1,
          "difficultyLevel": 2,
          "keyFacts": ["a² + b² = c² where c is the hypotenuse"],
          "workedExamples": ["Find c when a=3, b=4 → c=5"],
          "prerequisiteDetails": [
            {
              "label": "Squaring and square roots",
              "reason": "Students must square the legs and take the square root of the sum",
              "checkQuestion": "What is the square root of 25?"
            }
          ],
          "misconceptionDetails": [
            {
              "belief": "Students add the legs directly: a + b = c",
              "triggerPattern": "Asked to find the hypotenuse without a diagram",
              "probeQuestion": "In a right triangle with legs 3 and 4, what is the hypotenuse — is it 7?",
              "correctionHint": "Show that 3+4=7 but 7²=49 ≠ 3²+4²=25. The theorem uses squares, not addition."
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- Chapter "number" is the number printed in the book; null if none shown.
- Use the chapter title exactly as printed.
- Concepts are things a student can learn and be tested on — NOT section headings like "Exercise 9A".
- 3 to 8 concepts per chapter. "order" is teaching order within the chapter (1 = first taught).
- difficultyLevel 1 (easy intro) to 5 (advanced/extension), relative to this grade level.
- scopeMap.outOfScope: name specific topics a tutor must NOT teach at this level (e.g. "3D Pythagoras", "proof of theorem").
- prerequisiteDetails: 1–4 entries. Each entry must have label, reason AND checkQuestion.
- misconceptionDetails: 2–4 entries per concept. Each must have belief, probeQuestion AND correctionHint. triggerPattern is optional.
- ALL misconceptions must be specific to the content — do NOT invent generic ones.
- If any field would be empty, omit it rather than including an empty array.`;
}

// ─── 4. Merge ───────────────────────────────────────────────────
const norm = (s: string) => s.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s: string) => norm(s).replace(/\s+/g, '-').slice(0, 60);

const uniq = (a: string[], max: number) => {
  const seen = new Set<string>(); const out: string[] = [];
  for (const x of a) { const k = norm(x); if (x && !seen.has(k)) { seen.add(k); out.push(x); } }
  return out.slice(0, max);
};

/** Deduplicate rich objects by a string key extracted from each item. */
function uniqRich<T>(items: T[], keyFn: (item: T) => string, max: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = norm(keyFn(item));
    if (item && k && !seen.has(k)) { seen.add(k); out.push(item); }
  }
  return out.slice(0, max);
}

/** Extract simple labels from rich prereq details, for the prerequisites[] field. */
function prereqLabels(details: ExtractedPrerequisiteDetail[]): string[] {
  return details.map(d => d.label).filter(Boolean);
}

/** Convert extracted rich prereq details to the stored type. */
function prereqDetails(details: ExtractedPrerequisiteDetail[]): PrerequisiteDetail[] {
  return details
    .filter(d => d?.label && d?.reason && d?.checkQuestion)
    .map(d => ({ label: d.label, reason: d.reason, checkQuestion: d.checkQuestion }));
}

function mergeIntoCurriculum(
  existing: CurriculumSubject | null,
  parts: ChunkExtraction[],
  req: IngestRequest,
): CurriculumSubject {
  type Ch = {
    number: number | null;
    title: string;
    book: string;
    firstPage: number;
    scopeMap: ExtractedScopeMap | undefined;
    concepts: Map<string, ExtractedConcept & { firstSeen: number }>;
  };
  const chapters = new Map<string, Ch>();

  parts.sort((a, b) => a.chunk.book.localeCompare(b.chunk.book) || a.chunk.fromPage - b.chunk.fromPage);
  let seq = 0;
  for (const part of parts) {
    for (const ch of part.chapters) {
      const num = typeof ch.number === 'number' ? ch.number : null;
      const key = `${part.chunk.book}::${num ?? norm(ch.title)}`;
      if (!chapters.has(key)) {
        chapters.set(key, {
          number: num, title: ch.title, book: part.chunk.book,
          firstPage: part.chunk.fromPage, scopeMap: ch.scopeMap,
          concepts: new Map(),
        });
      }
      const target = chapters.get(key)!;
      // Merge scope map items if this chunk has a richer one
      if (ch.scopeMap && !target.scopeMap) target.scopeMap = ch.scopeMap;

      for (const c of ch.concepts) {
        if (!c?.label) continue;
        const k = norm(c.label);
        const prev = target.concepts.get(k);
        if (!prev) {
          target.concepts.set(k, { ...c, firstSeen: seq++ });
        } else {
          // Merge simple arrays
          prev.prerequisites = uniq([...(prev.prerequisites || []), ...(c.prerequisites || [])], 6);
          prev.commonMisconceptions = uniq([...(prev.commonMisconceptions || []), ...(c.commonMisconceptions || [])], 5);
          prev.keyFacts = uniq([...(prev.keyFacts || []), ...(c.keyFacts || [])], 6);
          prev.workedExamples = uniq([...(prev.workedExamples || []), ...(c.workedExamples || [])], 4);
          // Merge rich arrays
          prev.prerequisiteDetails = uniqRich(
            [...(prev.prerequisiteDetails || []), ...(c.prerequisiteDetails || [])],
            d => d.label, 6);
          prev.misconceptionDetails = uniqRich(
            [...(prev.misconceptionDetails || []), ...(c.misconceptionDetails || [])],
            d => d.belief, 5);
        }
      }
    }
  }

  // Keep existing concepts from earlier uploads; new chapters follow.
  const concepts: CurriculumConcept[] = existing ? existing.concepts.map(c => ({ ...c })) : [];
  const existingIds = new Set(concepts.map(c => c.id));
  const scopeMaps: ChapterScopeMap[] = existing?.scopeMaps ? [...existing.scopeMaps] : [];
  const existingScopeMapTitles = new Set(scopeMaps.map(sm => norm(sm.chapterTitle)));

  const ordered = [...chapters.values()].sort((a, b) =>
    a.book.localeCompare(b.book) || (a.number ?? 1e9) - (b.number ?? 1e9) || a.firstPage - b.firstPage);

  for (const ch of ordered) {
    const chapterLabel = ch.number != null ? `Chapter ${ch.number}: ${ch.title}` : ch.title;

    // Collect scope map for this chapter
    if (ch.scopeMap) {
      const smKey = norm(chapterLabel);
      if (!existingScopeMapTitles.has(smKey)) {
        existingScopeMapTitles.add(smKey);
        scopeMaps.push({
          chapterTitle: chapterLabel,
          inScope: ch.scopeMap.inScope || [],
          advanced: ch.scopeMap.advanced || [],
          outOfScope: ch.scopeMap.outOfScope || [],
          gradeNote: ch.scopeMap.gradeNote,
        });
      }
    }

    const list = [...ch.concepts.values()].sort(
      (a, b) => (a.order ?? 99) - (b.order ?? 99) || a.firstSeen - b.firstSeen);

    for (const c of list) {
      const id = `${slug(ch.book)}--${ch.number ?? slug(ch.title)}--${slug(c.label)}`;
      if (existingIds.has(id)) continue;
      existingIds.add(id);

      // Build prereq labels from rich details if available, falling back to simple list
      const richDetails = c.prerequisiteDetails || [];
      const richLabels = richLabels_(richDetails);
      const simpleLabels = c.prerequisites || [];
      const allPrereqLabels = uniq([...richLabels, ...simpleLabels], 6);

      // Build misconception details
      const richMisconceptions = c.misconceptionDetails || [];
      const simpleMisconceptions = c.commonMisconceptions || [];

      const concept: CurriculumConcept = {
        id,
        label: c.label,
        subjectId: req.subjectId,
        prerequisites: [],       // resolved below
        commonMisconceptions: uniq([
          ...richMisconceptions.map(m => m.belief),
          ...simpleMisconceptions,
        ], 5),
        keyFacts: uniq(c.keyFacts || [], 6),
        workedExamples: uniq(c.workedExamples || [], 4),
        difficultyLevel: Math.min(5, Math.max(1, Math.round(c.difficultyLevel || 2))) as 1 | 2 | 3 | 4 | 5,
        typicalTeachingOrder: 0,
        chapter: chapterLabel,
        book: ch.book,
      };

      // Attach rich details when available
      if (richDetails.length > 0) {
        concept.prerequisiteDetails = prereqDetails(richDetails);
      }
      if (richMisconceptions.length > 0) {
        concept.misconceptionDetails = richMisconceptions
          .filter(m => m?.belief && m?.probeQuestion && m?.correctionHint)
          .map(m => ({
            belief: m.belief,
            triggerPattern: m.triggerPattern,
            probeQuestion: m.probeQuestion,
            correctionHint: m.correctionHint,
          } as MisconceptionDetail))
          .slice(0, 5);
      }

      // Stash labels for resolution after all concepts are inserted
      (concept as any)._prereqLabels = allPrereqLabels;
      concepts.push(concept);
    }
  }

  // Resolve prerequisite LABELS to IDs
  const byLabel = new Map(concepts.map(c => [norm(c.label), c.id]));
  for (const c of concepts as any[]) {
    if (c._prereqLabels) {
      c.prerequisites = uniq(
        (c._prereqLabels as string[])
          .map((l: string) => byLabel.get(norm(l)))
          .filter((id: string | undefined): id is string => !!id && id !== c.id),
        6);
      delete c._prereqLabels;
    }
    // Also resolve prerequisiteDetails labels → make sure they reference valid labels
    if (c.prerequisiteDetails) {
      c.prerequisiteDetails = (c.prerequisiteDetails as PrerequisiteDetail[])
        .filter(d => d.label && d.reason && d.checkQuestion);
    }
  }

  concepts.forEach((c, i) => { c.typicalTeachingOrder = i + 1; });

  const booksUsed = uniq([
    ...(existing?.source ? existing.source.split(' + ') : []),
    ...req.files.map(f => bookName(f.originalName)),
  ], 20);

  return {
    id: req.subjectId,
    label: req.subjectLabel,
    grade: req.grade,
    source: booksUsed.join(' + '),
    concepts,
    prerequisiteMap: Object.fromEntries(concepts.map(c => [c.id, c.prerequisites])),
    scopeMaps: scopeMaps.length > 0 ? scopeMaps : undefined,
  };
}

/** Extract simple label strings from rich prerequisite details. */
function richLabels_(details: ExtractedPrerequisiteDetail[]): string[] {
  return details.map(d => d?.label).filter(Boolean) as string[];
}
