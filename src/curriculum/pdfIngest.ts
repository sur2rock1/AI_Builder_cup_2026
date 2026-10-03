// ─────────────────────────────────────────────────────────────────
// Curriculum ingestion — textbooks (+ optional official syllabus) for
// one board + grade + subject → a published, verified course.
// Full design: docs/CURRICULUM.md. Admin-only (server.ts requireAdmin).
//
//   1. SPLIT      each PDF into chunks under Gemini's per-request limits
//   2. EXTRACT    per chunk, in parallel (2 at a time):
//                   textbook → chapters, concepts, facts, worked examples,
//                              misconceptions, prerequisites, page refs
//                   syllabus → topics, objectives, exclusions, extensions
//   3. MERGE      chapters straddling chunks; stable ids (structure.ts)
//   4. STRUCTURE  one pass over the whole course: subject mode, concept
//                 types, prerequisite graph, chapter→syllabus mapping.
//                 Validated deterministically (acyclic, ids exist, …)
//   5. VERIFY     per chapter: the automated review — re-checks every
//                 worked example step by step, corrects or drops it;
//                 checks facts and misconceptions; authors evidence-ladder
//                 items and representation ideas in the course's subject
//                 mode. Rejected concepts are not published.
//   6. PUBLISH    merge into the existing course (earlier books are kept
//                 unchanged), save, kick off asset pre-generation.
//
// CHAPTER LIMIT (D-2026-09-26-9): an upload can load only the first N
// chapters (the admin form defaults to 3). The textbook is then read in page
// order and reading STOPS as soon as chapter N+1 appears, so the rest of the
// PDF is never sent to Gemini; only those N chapters are structured,
// reviewed, published and pre-generated. Re-upload the same book with a
// higher limit (or "all") to add the next chapters — published ones are kept.
//
// Every model call goes through src/ai/gateway.ts (role 'strong'). All
// validation lives in src/curriculum/structure.ts, which has no network
// access and is tested (tests/smoke/curriculum-ingest.mjs). The
// model-facing steps are injectable (IngestDeps) so the whole pipeline can
// be exercised end to end with stubs.
// ─────────────────────────────────────────────────────────────────
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GoogleGenAI, createPartFromUri, FileState } from '@google/genai';
import { spawn } from 'child_process';
import type { CurriculumSubject, CurriculumSource, SyllabusTopic, VerificationReport } from '../adaptive/learnerModel';
import { generateJSON } from '../ai/gateway';
import { HINT_RULE, PRESENTATION_RULE } from './designRules';
import { getCurriculumAsync, saveCurriculumAsync } from './ingest';
import {
  courseId as makeCourseId, gradeLabel, normaliseBoard, normaliseSubject, slug,
} from './catalog';
import {
  DraftConcept, ExtractedChapter, StructureProposal, TextbookExtraction,
  VerificationProposal, VerifiedContent, applyStructure, applyVerification,
  buildScopeMaps, emptyTally, finaliseCourse, mergeExtractions, orderConcepts,
  limitChapters, chapterLimitReached,
} from './structure';
import { SUBJECT_MODE_SPEC, LADDER_LEVEL_NAMES, subjectModeForSubject, SubjectMode } from '../persona/subjectModes';
import { REPRESENTATION_DESCRIPTIONS } from '../persona/representations';
import { ageBandFromGradeLevel } from '../persona/ageBands';

const MAX_CHUNK_PAGES = 60;
const MAX_CHUNK_BYTES = 40 * 1024 * 1024;   // headroom under Gemini's 50 MB
const CONCURRENCY = 2;
const EXTRACT_TIMEOUT_MS = 4 * 60 * 1000;
const STRUCTURE_TIMEOUT_MS = 4 * 60 * 1000;
const VERIFY_TIMEOUT_MS = 4 * 60 * 1000;
const TRANSIENT_RETRIES = 4;

// ─── Jobs ───────────────────────────────────────────────────────
export type JobStage =
  | 'queued' | 'splitting' | 'extracting' | 'merging' | 'structuring'
  | 'verifying' | 'publishing' | 'done' | 'error';

export interface IngestJob {
  id: string;
  courseId: string;
  stage: JobStage;
  message: string;
  chunksDone: number;
  chunksTotal: number;
  /** Textbook parts never read because the chapter limit was already reached. */
  chunksSkipped: number;
  /** Progress within the current stage, 0..1, for the admin progress bar. */
  progress: number;
  warnings: string[];
  error?: string;
  result?: {
    subjectId: string; label: string; board: string; grade: string;
    chapterCount: number; conceptCount: number; newConcepts: number; chapters: string[];
    verification: VerificationReport;
    /** The limit applied to this upload (undefined = all chapters). */
    chapterLimit?: number;
    /** Chapters of this upload that were loaded / left out by the limit. */
    chaptersLoaded: string[];
    chaptersNotLoaded: number;
  };
  startedAt: number;
}
const jobs = new Map<string, IngestJob>();
const activeCourses = new Set<string>();
export const getJob = (id: string) => jobs.get(id) || null;
export const isCourseBusy = (courseId: string) => activeCourses.has(courseId);

export interface IngestFile { path: string; originalName: string }

export interface IngestRequest {
  apiKey: string;
  board: string;
  gradeLevel: number;
  subject: string;
  textbooks: IngestFile[];
  syllabi: IngestFile[];
  /** Load only the first N chapters of this upload (undefined/0 = all). */
  chapterLimit?: number;
}

// ─── Injectable model-facing steps (stubbed in tests) ───────────
export interface Chunk { file: string; sourceId: string; sourceOrder: number; title: string; fromPage: number; toPage: number; tmp: boolean }

export interface CourseContext {
  board: string; gradeLevel: number; subject: string; courseId: string;
}

export interface IngestDeps {
  split(file: IngestFile, sourceId: string, sourceOrder: number, title: string): Promise<{ chunks: Chunk[]; pages: number }>;
  extractTextbook(chunk: Chunk, ctx: CourseContext): Promise<ExtractedChapter[]>;
  extractSyllabus(chunk: Chunk, ctx: CourseContext): Promise<SyllabusTopic[]>;
  proposeStructure(input: StructureInput): Promise<StructureProposal>;
  reviewChapter(input: ReviewInput): Promise<VerificationProposal>;
  loadExisting(courseId: string): Promise<CurriculumSubject | null>;
  save(course: CurriculumSubject): Promise<void>;
  afterPublish(course: CurriculumSubject): void;
  modelName(): string | undefined;
}

export interface StructureInput {
  ctx: CourseContext;
  fallbackMode: SubjectMode;
  chapters: Array<{ chapterId: string; label: string }>;
  concepts: Array<{ id: string; chapterId: string; label: string; keyFacts: string[]; extractedPrerequisites: string[]; fixedType?: string }>;
  syllabus: SyllabusTopic[];
  existingTypes: Record<string, string>;
}

export interface ReviewInput {
  ctx: CourseContext;
  mode: SubjectMode;
  chapterLabel: string;
  concepts: DraftConcept[];
}

export function startIngestJob(req: IngestRequest, deps?: IngestDeps): IngestJob {
  const board = normaliseBoard(req.board);
  const subject = normaliseSubject(req.subject);
  const courseId = makeCourseId(board, req.gradeLevel, subject);
  const job: IngestJob = {
    id: `ingest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    courseId, stage: 'queued', message: 'Queued', chunksDone: 0, chunksTotal: 0, chunksSkipped: 0,
    progress: 0, warnings: [], startedAt: Date.now(),
  };
  jobs.set(job.id, job);
  activeCourses.add(courseId);
  runIngest(job, { ...req, board, subject }, deps || defaultDeps(req.apiKey)).catch(err => {
    job.stage = 'error';
    job.error = String(err?.message || err);
    job.message = 'Failed';
    console.error('[Ingest] job failed:', err);
  }).finally(() => {
    activeCourses.delete(courseId);
    for (const f of [...req.textbooks, ...req.syllabi]) fs.promises.unlink(f.path).catch(() => {});
  });
  return job;
}

// ─── Pipeline ───────────────────────────────────────────────────

async function pool<T>(items: T[], n: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

export function titleFromFile(name: string): string {
  return name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function runIngest(job: IngestJob, rawReq: IngestRequest, deps: IngestDeps): Promise<CurriculumSubject> {
  // Normalise here too (not only in startIngestJob), so every entry point
  // stores the canonical board/subject spelling ("igcse"/"maths" → "IGCSE"/"Mathematics").
  const req: IngestRequest = { ...rawReq, board: normaliseBoard(rawReq.board), subject: normaliseSubject(rawReq.subject) };
  const ctx: CourseContext = { board: req.board, gradeLevel: req.gradeLevel, subject: req.subject, courseId: job.courseId };
  if (!req.textbooks.length) throw new Error('At least one textbook PDF is required.');

  // 1. SPLIT
  job.stage = 'splitting';
  const sources: CurriculumSource[] = [];
  const textChunks: Chunk[] = [];
  const sylChunks: Chunk[] = [];
  const files = [
    ...req.textbooks.map((f) => ({ f, kind: 'textbook' as const })),
    ...req.syllabi.map((f) => ({ f, kind: 'syllabus' as const })),
  ];
  for (let i = 0; i < files.length; i++) {
    const { f, kind } = files[i];
    const title = titleFromFile(f.originalName);
    const sourceId = slug(title, 60) || `source-${i + 1}`;
    job.message = `Splitting ${f.originalName}…`;
    const { chunks, pages } = await deps.split(f, sourceId, i, title);
    (kind === 'textbook' ? textChunks : sylChunks).push(...chunks);
    sources.push({ id: sourceId, kind, title, fileName: f.originalName, pages, ingestedAt: Date.now() });
  }
  job.chunksTotal = textChunks.length + sylChunks.length;

  // 2. EXTRACT
  job.stage = 'extracting';
  const extractions: TextbookExtraction[] = [];
  const syllabus: SyllabusTopic[] = [];
  const limit = req.chapterLimit && req.chapterLimit > 0 ? Math.floor(req.chapterLimit) : undefined;
  const extractOne = async (c: Chunk, kind: 'textbook' | 'syllabus') => {
    job.message = `Reading ${c.title}, pages ${c.fromPage}–${c.toPage}`;
    try {
      if (kind === 'syllabus') {
        syllabus.push(...await deps.extractSyllabus(c, ctx));
      } else {
        const chapters = await deps.extractTextbook(c, ctx);
        extractions.push({ chunk: { sourceId: c.sourceId, sourceOrder: c.sourceOrder, fromPage: c.fromPage, toPage: c.toPage }, chapters });
      }
    } catch (e: any) {
      job.warnings.push(`${c.title} pages ${c.fromPage}–${c.toPage} could not be read: ${String(e?.message || e).slice(0, 160)}`);
    } finally {
      job.chunksDone++;
      job.progress = job.chunksDone / Math.max(1, job.chunksTotal);
      if (c.tmp) fs.promises.unlink(c.file).catch(() => {});
    }
  };
  await pool(sylChunks, CONCURRENCY, (c) => extractOne(c, 'syllabus'));
  const orderedText = [...textChunks].sort((a, b) => a.sourceOrder - b.sourceOrder || a.fromPage - b.fromPage);
  if (limit) {
    // Page order, one part at a time, stopping once chapter `limit` has ended —
    // the remaining parts are never sent to the model (that is the saving).
    for (let i = 0; i < orderedText.length; i++) {
      if (chapterLimitReached(extractions, limit)) {
        const rest = orderedText.slice(i);
        job.chunksSkipped = rest.length;
        job.chunksDone += rest.length;
        for (const c of rest) if (c.tmp) fs.promises.unlink(c.file).catch(() => {});
        break;
      }
      await extractOne(orderedText[i], 'textbook');
    }
  } else {
    await pool(orderedText, CONCURRENCY, (c) => extractOne(c, 'textbook'));
  }
  if (!extractions.some((e) => e.chapters.length)) {
    throw new Error('No teaching content could be read from the textbook(s). ' + (job.warnings[0] || ''));
  }
  const cleanSyllabus = dedupeSyllabus(syllabus);
  if (req.syllabi.length && !cleanSyllabus.length) {
    job.warnings.push('The syllabus document was uploaded but no topics could be read from it — scope falls back to what the textbook states.');
  }

  // 3. MERGE
  job.stage = 'merging';
  job.progress = 0;
  job.message = 'Combining chapters…';
  const existing = await deps.loadExisting(job.courseId);
  const limited = limitChapters(mergeExtractions(job.courseId, extractions), limit);
  const draft = limited.draft;
  if (limit) {
    job.warnings.push(`Chapter limit ${limit}: loaded ${limited.kept.length} chapter(s)${limited.dropped.length || job.chunksSkipped ? ` — the rest of the book was not ${job.chunksSkipped ? `read (${job.chunksSkipped} part(s) skipped)` : 'loaded'}` : ''}. Upload again with a higher limit or "All chapters" to add more.`);
  }
  const existingIds = new Set((existing?.concepts || []).map((c) => c.id));
  const fresh = draft.concepts.filter((c) => !existingIds.has(c.id));
  if (!fresh.length) {
    job.warnings.push('Every concept in this upload is already in the course — nothing new to add.');
  }

  // 4. STRUCTURE (whole course: existing + new, so a new book can link to an earlier one)
  job.stage = 'structuring';
  job.message = 'Linking prerequisites and grouping concept types…';
  const fallbackMode = (existing?.subjectMode as SubjectMode) || subjectModeForSubject(job.courseId, req.subject);
  const chapterInfo = new Map<string, { number: number | null; sourceOrder: number; firstPage: number }>();
  for (const c of existing?.concepts || []) {
    if (c.chapterId && !chapterInfo.has(c.chapterId)) chapterInfo.set(c.chapterId, { number: c.chapterNumber ?? null, sourceOrder: -1, firstPage: 0 });
  }
  for (const ch of draft.chapters) if (!chapterInfo.has(ch.chapterId)) chapterInfo.set(ch.chapterId, { number: ch.number, sourceOrder: ch.sourceOrder, firstPage: ch.firstPage });

  type Node = { id: string; label: string; chapterId?: string; orderInChapter?: number; keyFacts: string[]; extracted: string[]; fixedType?: string; seen: number };
  const nodes: Node[] = [
    ...(existing?.concepts || []).map((c, i) => ({ id: c.id, label: c.label, chapterId: c.chapterId, orderInChapter: c.orderInChapter, keyFacts: c.keyFacts, extracted: [] as string[], fixedType: c.conceptType, seen: i })),
    ...fresh.map((c) => ({ id: c.id, label: c.label, chapterId: c.chapterId, orderInChapter: c.orderInChapter, keyFacts: c.keyFacts, extracted: c.extractedPrerequisites.map((p) => p.label), seen: 100000 + c.firstSeen })),
  ];
  const orderedNodes = orderConcepts(nodes, chapterInfo, (n) => n.seen);
  const orderIndex = new Map(orderedNodes.map((n, i) => [n.id, i]));
  const chapterLabels = new Map<string, string>();
  for (const c of existing?.concepts || []) if (c.chapterId && c.chapter) chapterLabels.set(c.chapterId, c.chapter);
  for (const ch of draft.chapters) chapterLabels.set(ch.chapterId, ch.label);

  let proposal: StructureProposal | null = null;
  try {
    proposal = await deps.proposeStructure({
      ctx, fallbackMode,
      chapters: [...chapterLabels].map(([chapterId, label]) => ({ chapterId, label })),
      concepts: orderedNodes.map((n) => ({ id: n.id, chapterId: n.chapterId || '', label: n.label, keyFacts: n.keyFacts.slice(0, 2), extractedPrerequisites: n.extracted, fixedType: n.fixedType })),
      syllabus: cleanSyllabus,
      existingTypes: existing?.conceptTypes || {},
    });
  } catch (e: any) {
    job.warnings.push(`Structure pass failed (${String(e?.message || e).slice(0, 120)}) — concepts published without in-course prerequisite links and with concept type "general".`);
  }
  const syllabusRefs = new Set<string>();
  for (const t of cleanSyllabus) { syllabusRefs.add(normRef(t.title)); if (t.code) syllabusRefs.add(normRef(t.code)); }
  const structure = applyStructure(proposal, {
    fallbackMode,
    orderIndex,
    extractedPrereqLabels: new Map(fresh.map((c) => [c.id, c.extractedPrerequisites.map((p) => p.label)])),
    fixedTypes: new Map((existing?.concepts || []).filter((c) => c.conceptType).map((c) => [c.id, c.conceptType!])),
    chapterIds: new Set(draft.chapters.map((c) => c.chapterId)),
    syllabusRefs,
  });
  const mode = (existing?.subjectMode as SubjectMode) || structure.subjectMode;

  // 5. VERIFY (the automated review) — new concepts only, chapter by chapter
  job.stage = 'verifying';
  job.progress = 0;
  const tally = emptyTally();
  tally.issues.push(...structure.issues);
  const verified = new Map<string, VerifiedContent>();
  const byChapter = new Map<string, DraftConcept[]>();
  for (const c of fresh) byChapter.set(c.chapterId, [...(byChapter.get(c.chapterId) || []), c]);
  const chapterList = [...byChapter.entries()];
  let chaptersDone = 0;
  await pool(chapterList, CONCURRENCY, async ([chapterId, concepts]) => {
    const label = chapterLabels.get(chapterId) || chapterId;
    job.message = `Checking ${label}…`;
    let review: VerificationProposal | null = null;
    try {
      review = await deps.reviewChapter({ ctx, mode, chapterLabel: label, concepts });
    } catch (e: any) {
      job.warnings.push(`${label}: automated review failed (${String(e?.message || e).slice(0, 120)}) — published without worked examples.`);
    }
    const byId = new Map((review?.concepts || []).filter((x) => x && x.conceptId).map((x) => [x.conceptId, x]));
    for (const c of concepts) {
      const v = applyVerification(c, byId.get(c.id), tally);
      if (v) verified.set(c.id, v);
    }
    chaptersDone++;
    job.progress = chaptersDone / Math.max(1, chapterList.length);
  });

  // 6. PUBLISH
  job.stage = 'publishing';
  job.message = 'Publishing…';
  const conceptLabelsByChapter = new Map<string, string[]>();
  for (const c of fresh) if (verified.has(c.id)) conceptLabelsByChapter.set(c.chapterId, [...(conceptLabelsByChapter.get(c.chapterId) || []), c.label]);
  const newChapters = draft.chapters.filter((ch) => conceptLabelsByChapter.has(ch.chapterId));
  const scopeMaps = buildScopeMaps(newChapters, conceptLabelsByChapter, cleanSyllabus.length ? cleanSyllabus : existing?.syllabus, structure.chapterScope);

  const report: VerificationReport = {
    verifiedAt: Date.now(),
    model: deps.modelName(),
    conceptsChecked: tally.checked,
    conceptsCorrected: tally.corrected,
    conceptsRejected: tally.rejected,
    examplesCorrected: tally.examplesCorrected,
    examplesDropped: tally.examplesDropped,
    prerequisiteEdgesDropped: structure.edgesDropped,
    issues: tally.issues.slice(0, 60),
  };

  const course = finaliseCourse({
    existing, courseId: job.courseId, board: req.board, gradeLevel: req.gradeLevel,
    gradeLabel: gradeLabel(req.gradeLevel), subject: req.subject, draft,
    structure: { ...structure, subjectMode: mode }, verified, scopeMaps,
    syllabus: cleanSyllabus.length ? cleanSyllabus : undefined,
    newSources: sources, report: mergeReports(existing?.verification, report),
  });
  if (!course.concepts.length) throw new Error('Nothing passed the automated review — the course was not published. ' + (tally.issues[0] || ''));
  await deps.save(course);

  const chapters = [...new Set(course.concepts.map((c) => c.chapter || 'General'))];
  const newCount = course.concepts.filter((c) => !existingIds.has(c.id)).length;
  job.result = {
    subjectId: course.id, label: course.label, board: req.board, grade: course.grade,
    chapterCount: chapters.length, conceptCount: course.concepts.length, newConcepts: newCount, chapters,
    verification: report,
    chapterLimit: limit,
    chaptersLoaded: limited.kept,
    chaptersNotLoaded: limited.dropped.length,
  };
  job.stage = 'done';
  job.progress = 1;
  job.message = `Published ${newCount} new concept(s) — ${course.concepts.length} across ${chapters.length} chapter(s) in ${course.board} · ${course.grade} · ${course.label}`;
  console.log(`[Ingest] ${job.message} in ${Math.round((Date.now() - job.startedAt) / 1000)}s`);
  try { deps.afterPublish(course); } catch (e: any) { console.warn('[Ingest] afterPublish failed:', e?.message); }
  return course;
}

const normRef = (s: string) => String(s || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function dedupeSyllabus(topics: SyllabusTopic[]): SyllabusTopic[] {
  const out = new Map<string, SyllabusTopic>();
  const clean = (a: unknown): string[] =>
    (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()) : []);
  for (const t of topics) {
    if (!t || typeof t.title !== 'string' || !t.title.trim()) continue;
    const key = normRef(t.code || t.title);
    const next: SyllabusTopic = {
      code: t.code ? String(t.code).trim() : undefined,
      title: t.title.trim(),
      objectives: clean(t.objectives), excluded: clean(t.excluded), extension: clean(t.extension),
    };
    const prev = out.get(key);
    if (prev) {
      prev.objectives = [...new Set([...prev.objectives, ...next.objectives])];
      prev.excluded = [...new Set([...prev.excluded, ...next.excluded])];
      prev.extension = [...new Set([...prev.extension, ...next.extension])];
    } else out.set(key, next);
  }
  return [...out.values()];
}

function mergeReports(prev: VerificationReport | undefined, next: VerificationReport): VerificationReport {
  if (!prev) return next;
  return {
    verifiedAt: next.verifiedAt,
    model: next.model || prev.model,
    conceptsChecked: prev.conceptsChecked + next.conceptsChecked,
    conceptsCorrected: prev.conceptsCorrected + next.conceptsCorrected,
    conceptsRejected: prev.conceptsRejected + next.conceptsRejected,
    examplesCorrected: prev.examplesCorrected + next.examplesCorrected,
    examplesDropped: prev.examplesDropped + next.examplesDropped,
    prerequisiteEdgesDropped: prev.prerequisiteEdgesDropped + next.prerequisiteEdgesDropped,
    issues: [...next.issues, ...prev.issues].slice(0, 60),
  };
}

// ─── Default (real) implementations ─────────────────────────────

async function loadPdfLib() {
  try {
    return await import('pdf-lib');
  } catch {
    throw new Error('The PDF splitter is not installed yet. Stop the server, run "npm install", then start it again.');
  }
}

export async function splitPdf(file: IngestFile, sourceId: string, sourceOrder: number, title: string): Promise<{ chunks: Chunk[]; pages: number }> {
  const { size } = await fs.promises.stat(file.path);
  const { PDFDocument } = await loadPdfLib();
  const src = await PDFDocument.load(await fs.promises.readFile(file.path), { ignoreEncryption: true, updateMetadata: false });
  const pages = src.getPageCount();
  const base = { sourceId, sourceOrder, title };

  if (size <= MAX_CHUNK_BYTES && pages <= MAX_CHUNK_PAGES) {
    return { chunks: [{ ...base, file: file.path, fromPage: 1, toPage: pages, tmp: false }], pages };
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
    out.push({ ...base, file: p, fromPage: from, toPage: to, tmp: true });
  };
  for (let from = 1; from <= pages; from += MAX_CHUNK_PAGES) {
    await write(from, Math.min(pages, from + MAX_CHUNK_PAGES - 1));
  }
  return { chunks: out, pages };
}

async function withUploadedPdf<T>(apiKey: string, chunk: Chunk, fn: (part: unknown) => Promise<T>): Promise<T> {
  const ai = new GoogleGenAI({ apiKey, vertexai: false });
  let uploaded: any = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      uploaded = await ai.files.upload({ file: chunk.file, config: { mimeType: 'application/pdf', displayName: path.basename(chunk.file) } });
      break;
    } catch (e: any) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, Math.min(30_000, 5_000 * 2 ** attempt)));
    }
  }
  try {
    let f = uploaded;
    const until = Date.now() + 120_000;
    while (f.state === FileState.PROCESSING && Date.now() < until) {
      await new Promise(r => setTimeout(r, 2000));
      f = await ai.files.get({ name: uploaded.name! });
    }
    if (f.state === FileState.FAILED) throw new Error('Gemini could not process this part of the PDF');
    return await fn(createPartFromUri(f.uri!, f.mimeType || 'application/pdf'));
  } finally {
    if (uploaded?.name) ai.files.delete({ name: uploaded.name }).catch(() => {});
  }
}

function courseLine(ctx: CourseContext) {
  return `Board/curriculum: ${ctx.board}. Grade: ${ctx.gradeLevel} (learners aged about ${ctx.gradeLevel + 5}–${ctx.gradeLevel + 6}). Subject: ${ctx.subject}.`;
}

export function textbookPrompt(chunk: Chunk, ctx: CourseContext): string {
  return `You are a curriculum analyst and experienced teacher reading part of a school textbook.
${courseLine(ctx)}
Book: "${chunk.title}". This PDF is pages ${chunk.fromPage} to ${chunk.toPage} of the book.

Identify every CHAPTER that appears in these pages and the teachable CONCEPTS in each.
Ignore front matter, contents pages, answer keys, glossaries and indexes.
If these pages contain no teaching content, return {"chapters": []}.

Return ONLY JSON of this shape:
{
  "chapters": [
    {
      "number": 9,
      "title": "Chapter title exactly as printed",
      "statedObjectives": ["learning objectives/outcomes the BOOK lists for this chapter"],
      "statedExclusions": ["topics the BOOK explicitly says are not required at this level"],
      "statedExtensions": ["topics the BOOK marks as extension / challenge / optional"],
      "concepts": [
        {
          "label": "Short name of one learnable idea",
          "order": 1,
          "difficultyLevel": 2,
          "pages": [3, 5],
          "keyFacts": ["a statement the learner must understand, from the book's own explanation"],
          "workedExamples": [{"problem": "...", "solution": "the book's method, step by step", "answer": "final answer"}],
          "misconceptions": [{"belief": "what a learner wrongly believes", "triggerPattern": "when it shows up", "probeQuestion": "a question whose answer reveals the belief EVEN IF the learner's final answer is right", "correctionHint": "how to correct it"}],
          "prerequisites": [{"label": "idea the learner must already know (may be from an earlier grade)", "reason": "why it is needed", "checkQuestion": "one quick question that checks it"}]
        }
      ]
    }
  ]
}

Rules:
- "number" is the chapter number printed in the book, or null. Use the title exactly as printed.
- Concepts are ideas a learner can understand and be assessed on — NOT section headings like "Exercise 9A". 3 to 8 per chapter. "order" = teaching order within the chapter.
- difficultyLevel 1 (introductory) to 5 (extension), relative to this grade.
- "pages" = page numbers WITHIN THIS PDF PART (1 = its first page).
- workedExamples: copy the book's own worked examples (for non-mathematical subjects, a model question with a model answer). Do NOT invent examples; omit the field if the book has none for this concept.
- misconceptions: 2–4 per concept, specific to this content and plausible for this grade. Never generic ("does not understand the topic").
- prerequisites: 1–4 per concept, each with a checkQuestion.
- statedObjectives / statedExclusions / statedExtensions: ONLY what the book itself states. Do not infer them. Omit when the book says nothing.
- Omit any field that would be empty.`;
}

export function syllabusPrompt(chunk: Chunk, ctx: CourseContext): string {
  return `You are reading part of an OFFICIAL SYLLABUS / SPECIFICATION document.
${courseLine(ctx)}
Document: "${chunk.title}", pages ${chunk.fromPage}–${chunk.toPage}.

Extract the syllabus topics that apply to this grade and subject. Return ONLY JSON:
{
  "topics": [
    {
      "code": "topic/section code as printed, or omit",
      "title": "topic title as printed",
      "objectives": ["learning objectives / content statements as the document states them"],
      "excluded": ["content the document explicitly says is NOT required / not assessed"],
      "extension": ["content marked supplement / extended / higher tier / optional"]
    }
  ]
}
Rules: include only what the document states — never add your own topics or exclusions. Keep wording close to the document. If these pages contain no syllabus content for this grade and subject, return {"topics": []}.`;
}

export function structurePrompt(input: StructureInput): string {
  const { ctx } = input;
  const lines: string[] = [];
  lines.push(`You are structuring a published course for an adaptive AI tutor.
${courseLine(ctx)}

Your output drives three things in the tutor:
1. PREREQUISITES — before teaching a concept the tutor probes its direct prerequisites; if the learner is shown to be weak on one, it teaches that first.
2. CONCEPT TYPES — the tutor learns which teaching representations work for THIS learner on each concept type, and watches for a misconception confirmed on one concept recurring on sibling concepts of the same type. So a concept type must group concepts that share an underlying way of thinking or the same typical wrong rules. Use 3–10 types for a course; ids are short kebab-case (e.g. "similarity-and-scaling", "cell-transport", "causes-of-war").
3. SUBJECT MODE — "well_structured" (a verifiable answer + sound method: maths, sciences, programming, grammar), "interpretive" (claim → evidence → reasoning judged against a rubric: history, literature, essays), or "skill" (accurate production: languages, spelling, music theory). Current best guess: ${input.fallbackMode}.

CHAPTERS:`);
  for (const ch of input.chapters) lines.push(`  ${ch.chapterId} — ${ch.label}`);
  lines.push('\nCONCEPTS IN TEACHING ORDER (a prerequisite must come EARLIER in this list):');
  input.concepts.forEach((c, i) => {
    lines.push(`  [${i + 1}] ${c.id}  (chapter ${c.chapterId})  "${c.label}"${c.fixedType ? `  [type already fixed: ${c.fixedType}]` : ''}`);
    if (c.keyFacts.length) lines.push(`       facts: ${c.keyFacts.join(' | ').slice(0, 300)}`);
    if (c.extractedPrerequisites.length) lines.push(`       prerequisites the textbook implies: ${c.extractedPrerequisites.join(' | ')}`);
  });
  if (Object.keys(input.existingTypes).length) {
    lines.push('\nEXISTING CONCEPT TYPES (reuse these ids where they fit):');
    for (const [k, v] of Object.entries(input.existingTypes)) lines.push(`  ${k} — ${v}`);
  }
  if (input.syllabus.length) {
    lines.push('\nOFFICIAL SYLLABUS TOPICS (map each chapter to the topics it teaches; use the code if given, else the exact title):');
    for (const t of input.syllabus) lines.push(`  ${t.code ? t.code + ' ' : ''}${t.title}`);
  }
  lines.push(`
Return ONLY JSON:
{
  "subjectMode": "well_structured" | "interpretive" | "skill",
  "conceptTypes": [{"id": "kebab-case-id", "description": "what unites these concepts"}],
  "concepts": [
    {
      "conceptId": "exact id from the list",
      "conceptType": "one of your conceptTypes ids (or the fixed type if one is shown)",
      "prerequisites": [{"conceptId": "exact id of an EARLIER concept", "reason": "why it must be understood first", "matchesExtracted": "the textbook-implied prerequisite label this corresponds to, if any"}],
      "externalPrerequisites": ["textbook-implied prerequisite labels that are NOT taught anywhere in this course (earlier grades / other subjects), copied exactly"]
    }
  ]${input.syllabus.length ? `,
  "chapterScope": [{"chapterId": "exact chapter id", "syllabusRefs": ["syllabus topic code or exact title"], "gradeNote": "one sentence on what this grade covers vs later grades, only if the syllabus says so"}]` : ''}
}
Rules: list EVERY concept id exactly once. Prerequisites are DIRECT only (at most 3 per concept) and must point to earlier concepts. Do not invent ids.`);
  return lines.join('\n');
}

export function reviewPrompt(input: ReviewInput): string {
  const { ctx, mode } = input;
  const spec = SUBJECT_MODE_SPEC[mode];
  const levels = LADDER_LEVEL_NAMES[mode];
  const ageBand = ageBandFromGradeLevel(ctx.gradeLevel);
  const reps = Object.entries(REPRESENTATION_DESCRIPTIONS)
    .filter(([k]) => k !== 'prerequisite_review')
    .map(([k, v]) => `  ${k} — ${v}`).join('\n');
  const concepts = input.concepts.map((c) => ({
    conceptId: c.id,
    label: c.label,
    keyFacts: c.keyFacts,
    workedExamples: c.workedExamples,
    misconceptions: c.misconceptions,
  }));
  return `You are the quality reviewer for an AI tutor's course content. Nothing you approve is seen by a human before a learner hears it, so check it like an exam-board moderator.
${courseLine(ctx)} Learner age band: ${ageBand}.
Subject mode: ${spec.label}. "Correct" means: ${spec.correctnessMeans}
Chapter: ${input.chapterLabel}

For EACH concept below:
1. keyFacts — correct anything factually wrong or misleading for this grade; keep them short and in the book's terms. Return the final list.
2. workedExamples — work through EVERY example yourself, step by step, recomputing every number. For each return {"problem","solution","answer","status"} with status:
   "verified" = correct and complete as given;
   "corrected" = it had an error, gap, garbled text or inconsistent numbers and you fixed it (return the fixed version);
   "wrong_unfixable" = cannot be made correct without guessing (it will be dropped).
3. misconceptions — keep only ones that are specific and plausible for this grade; each probeQuestion must separate a learner who holds the belief from one who does not, even when their final answer is right; each correctionHint must be sound. Give each a short stable kebab-case "id" (e.g. "ssa-assumed-valid"). 2–4 per concept.
4. ladder — write items for each evidence-ladder level, phrased for this subject mode:
   L1 ${levels[0]} · L2 ${levels[1]} · L3 ${levels[2]} · L4 ${levels[3]}
   Each: {"level": 1-4, "id": "L1"|"L2"|"L3-A"|"L3-B"|"L4", "prompt": "what the tutor asks", "lookFor": "what a sound answer contains", "hints": [${HINT_RULE}]}.
   - L3 is written as a PARALLEL PAIR, two different problems of the same structure (a new context and new numbers each, neither one of the worked examples): "L3-A" is drawn as a picture for the learner to reason about, "L3-B" is asked as the quiz. They must not share their situation or numbers, and each must be solvable by the same reasoning. L4 is a new context again.
   - TEACH BEFORE TEST: every ladder item must be answerable by a learner who has learned ONLY this concept's keyFacts and workedExamples (plus ordinary knowledge for this grade). Never write an item that needs a fact the material does not contain. If you cannot write a sound item that respects this, omit that item and say why in "coverageGaps" — do not invent facts to fit it.
5. representations — 2–4 concrete ideas for teaching THIS concept, each with a strategy from:
${reps}
6. ${PRESENTATION_RULE}
7. verdict — "ok" (no changes needed), "corrected" (you changed something), or "reject" (not a teachable concept, or wrong beyond repair; give rejectReason). "notes": short list of what you changed.

CONCEPTS:
${JSON.stringify(concepts, null, 1)}

Return ONLY JSON:
{"concepts": [{"conceptId": "...", "verdict": "ok|corrected|reject", "rejectReason": "...", "keyFacts": [...], "workedExamples": [...], "misconceptions": [{"id","belief","triggerPattern","probeQuestion","correctionHint"}], "ladder": [...], "coverageGaps": [{"level": 1-4, "missing": "what the material never teaches"}], "representations": [{"strategy","idea"}], "presentation": {"photo": {"useful","scene","why"}, "spatial3d": {"useful","why"}}, "notes": [...]}]}
Return every conceptId exactly once.`;
}

let lastModel: string | undefined;

function defaultDeps(apiKey: string): IngestDeps {
  const call = async <T>(label: string, prompt: string, timeoutMs: number, parts?: unknown[]): Promise<T> => {
    const { data, model } = await generateJSON<T>({
      role: 'strong', call: label, apiKey, prompt, parts, timeoutMs, transientRetries: TRANSIENT_RETRIES,
    });
    lastModel = model;
    return data;
  };
  return {
    split: splitPdf,
    async extractTextbook(chunk, ctx) {
      const data = await withUploadedPdf(apiKey, chunk, (part) =>
        call<{ chapters?: ExtractedChapter[] }>('ingest.extract.textbook', textbookPrompt(chunk, ctx), EXTRACT_TIMEOUT_MS, [part]));
      const chapters = Array.isArray(data?.chapters) ? data.chapters : [];
      // Page refs come back relative to this chunk — make them absolute.
      for (const ch of chapters) for (const c of ch?.concepts || []) {
        if (Array.isArray(c.pages) && c.pages.length === 2) c.pages = [chunk.fromPage - 1 + Number(c.pages[0]), chunk.fromPage - 1 + Number(c.pages[1])];
      }
      return chapters;
    },
    async extractSyllabus(chunk, ctx) {
      const data = await withUploadedPdf(apiKey, chunk, (part) =>
        call<{ topics?: SyllabusTopic[] }>('ingest.extract.syllabus', syllabusPrompt(chunk, ctx), EXTRACT_TIMEOUT_MS, [part]));
      return Array.isArray(data?.topics) ? data.topics : [];
    },
    proposeStructure: (input) => call<StructureProposal>('ingest.structure', structurePrompt(input), STRUCTURE_TIMEOUT_MS),
    reviewChapter: (input) => call<VerificationProposal>('ingest.review', reviewPrompt(input), VERIFY_TIMEOUT_MS),
    loadExisting: (id) => getCurriculumAsync(id),
    save: (course) => saveCurriculumAsync(course),
    afterPublish: (course) => triggerPregenerationBackground(course, apiKey),
    modelName: () => lastModel,
  };
}

// ─── Background asset pre-generation ────────────────────────────
// Writes a snapshot of the published course to a temp file and hands it to
// scripts/pregenerate-assets.ts, which caches one lesson per CONCEPT ID
// (data/pregenerated/<conceptId>.json) and skips ones already cached.
// Passing the snapshot (rather than having the script read
// data/curricula.json) is what makes this work when Firestore is the store.
function triggerPregenerationBackground(course: CurriculumSubject, apiKey: string): void {
  if (process.env.DISABLE_PREGEN === 'true') return;
  try {
    const snapshot = path.join(os.tmpdir(), `pt-course-${course.id}-${Date.now()}.json`);
    fs.writeFileSync(snapshot, JSON.stringify([course]));
    console.log(`[Ingest] Launching background pre-generation for ${course.id}…`);
    const child = spawn('npx', ['tsx', 'scripts/pregenerate-assets.ts', '--curricula-file', snapshot], {
      env: { ...process.env, GEMINI_API_KEY: apiKey },
      cwd: process.cwd(),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    child.stdout?.on('data', (d: Buffer) => process.stdout.write(`[pregen] ${d}`));
    child.stderr?.on('data', (d: Buffer) => process.stderr.write(`[pregen] ${d}`));
    child.on('exit', (code: number | null) => {
      console.log(`[Ingest] Background pre-generation finished (exit ${code}).`);
      fs.promises.unlink(snapshot).catch(() => {});
    });
    child.unref();
  } catch (err: any) {
    console.warn('[Ingest] Could not spawn background pre-generation:', err?.message);
  }
}
