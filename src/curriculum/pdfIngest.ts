// ─────────────────────────────────────────────────────────────────
// Textbook PDF path — split → Files API → extract.
// Mixed sources (web, YouTube, EPUB, images…) live in sourceIngest.ts.
// Both merge through extractShared.ts. Authoring only — not a Live tool.
// ─────────────────────────────────────────────────────────────────
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GoogleGenAI, createPartFromUri, FileState } from '@google/genai';
import { getCurriculum, saveCurriculum } from './ingest';
import {
  IngestJob, IngestRequest, ChunkExtraction, createJob,
  generateWithFallback, parseExtractPayload, buildCurriculumPrompt,
  withRetry, bookName, mergeIntoCurriculum, ingestGemini,
} from './extractShared';

export { getJob } from './extractShared';
export type { IngestJob, IngestRequest } from './extractShared';

const MAX_CHUNK_PAGES = 60;
const MAX_CHUNK_BYTES = 40 * 1024 * 1024;
const CONCURRENCY = 2;

export interface PdfChunk { file: string; book: string; fromPage: number; toPage: number; tmp: boolean }

export function startIngestJob(req: IngestRequest): IngestJob {
  const job = createJob();
  runPdfJob(job, req).catch(err => {
    job.stage = 'error';
    job.error = String(err?.message || err);
    job.message = 'Failed';
    console.error('[Ingest] job failed:', err);
  }).finally(() => {
    for (const f of req.files) fs.promises.unlink(f.path).catch(() => {});
  });
  return job;
}

async function runPdfJob(job: IngestJob, req: IngestRequest) {
  const ai = ingestGemini(req.apiKey);
  job.stage = 'splitting';
  const chunks: PdfChunk[] = [];
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
        extractions.push(await withRetry(() => extractPdfChunk(ai, c, req), 2));
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
  const curriculum = mergeIntoCurriculum(existing, extractions, {
    subjectId: req.subjectId, subjectLabel: req.subjectLabel, grade: req.grade,
    sourceNames: req.files.map(f => bookName(f.originalName)),
  });
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

async function loadPdfLib() {
  try {
    return await import('pdf-lib');
  } catch {
    throw new Error('The PDF splitter is not installed yet. Stop the server, run "npm install", then start it again.');
  }
}

export async function splitPdf(file: string, book: string): Promise<PdfChunk[]> {
  const { size } = await fs.promises.stat(file);
  const { PDFDocument } = await loadPdfLib();
  const src = await PDFDocument.load(await fs.promises.readFile(file), { ignoreEncryption: true, updateMetadata: false });
  const pages = src.getPageCount();

  if (size <= MAX_CHUNK_BYTES && pages <= MAX_CHUNK_PAGES) {
    return [{ file, book, fromPage: 1, toPage: pages, tmp: false }];
  }

  const out: PdfChunk[] = [];
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

export async function extractPdfChunk(ai: GoogleGenAI, chunk: PdfChunk, req: IngestRequest): Promise<ChunkExtraction> {
  const uploaded = await ai.files.upload({ file: chunk.file, config: { mimeType: 'application/pdf', displayName: path.basename(chunk.file) } });
  try {
    let f = uploaded;
    const until = Date.now() + 120_000;
    while (f.state === FileState.PROCESSING && Date.now() < until) {
      await new Promise(r => setTimeout(r, 2000));
      f = await ai.files.get({ name: uploaded.name! });
    }
    if (f.state === FileState.FAILED) throw new Error('Gemini could not process this part of the PDF');

    const prompt = buildCurriculumPrompt({
      book: chunk.book, grade: req.grade, subjectLabel: req.subjectLabel,
      learnerName: req.learnerName,
      sourceHint: `This PDF is pages ${chunk.fromPage} to ${chunk.toPage} of the book.`,
    });
    const text = await generateWithFallback(ai, [prompt, createPartFromUri(f.uri!, f.mimeType || 'application/pdf')]);
    const parsed = parseExtractPayload(text);
    return { book: chunk.book, fromPage: chunk.fromPage, chapters: parsed.chapters, suggestedTitle: parsed.suggestedTitle };
  } finally {
    if (uploaded.name) ai.files.delete({ name: uploaded.name }).catch(() => {});
  }
}
