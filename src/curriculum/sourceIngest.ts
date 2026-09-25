// Mixed-source curriculum ingest (authoring path, not a Live tool).
// Cloud Run / server.ts owns the job. Gemini turns extracted material into a graph.
import fs from 'fs';
import { GoogleGenAI, createPartFromUri, FileState } from '@google/genai';
import {
  IngestJob, IngestRequest, ChunkExtraction, SourceRef, createJob,
  generateWithFallback, parseExtractPayload, buildCurriculumPrompt,
  withRetry, bookName, ingestGemini, pickSuggestedTitle, cupAgeMeta, uniq, norm,
} from './extractShared';
import { splitPdf, extractPdfChunk } from './pdfIngest';
import {
  classifyFile, classifyUrl, extractFileText, extractUrl, extractYoutube, splitText,
  hasFirecrawlKey,
} from './sourceExtract';
import { parseFile, searchAndScrape } from './firecrawl';

const CONCURRENCY = 2;

export { getJob } from './extractShared';

export function startSourceIngestJob(req: IngestRequest): IngestJob {
  const job = createJob();
  runSourceJob(job, req).catch(err => {
    job.stage = 'error';
    job.error = String(err?.message || err);
    job.message = 'Failed';
    console.error('[Ingest] job failed:', err);
  }).finally(() => {
    for (const f of req.files) fs.promises.unlink(f.path).catch(() => {});
  });
  return job;
}

type Work =
  | { kind: 'pdf'; file: string; book: string; fromPage: number; toPage: number; tmp: boolean; rail: 'files' }
  | { kind: 'media'; path: string; name: string; mime: string; book: string; rail: 'files' }
  | { kind: 'youtube'; url: string; book: string; text: string; rail: 'internet' }
  | { kind: 'text'; book: string; text: string; hint: string; rail: 'files' | 'internet' };

async function runSourceJob(job: IngestJob, req: IngestRequest) {
  const ai = ingestGemini(req.apiKey);
  const urls = (req.urls || []).map(u => u.trim()).filter(Boolean);
  const topic = String(req.topic || '').trim();
  const extractions: ChunkExtraction[] = [];
  const sourceNames: string[] = [];
  const sources: SourceRef[] = [];

  job.stage = 'collecting';
  job.message = 'Reading files and searching the web…';
  job.rails = {
    files: { message: req.files.length ? 'Opening files…' : 'No files', done: 0, total: req.files.length },
    internet: { message: topic || urls.length ? 'Searching…' : 'No topic or links', done: 0, total: (topic ? 1 : 0) + urls.length },
  };

  if ((urls.length || topic) && !hasFirecrawlKey()) {
    job.warnings.push('FIRECRAWL_API_KEY is not set, so web search uses a weaker fallback.');
  }

  const [fileWork, netWork] = await Promise.all([
    collectFiles(job, req, sourceNames, sources),
    collectInternet(job, req, topic, urls, sourceNames, sources),
  ]);
  const work = [...fileWork, ...netWork];

  if (!work.length) throw new Error('Nothing readable was found. ' + (job.warnings[0] || ''));

  job.stage = 'extracting';
  job.chunksTotal = work.length;
  job.chunksDone = 0;
  job.message = 'Turning sources into teachable ideas…';

  let next = 0;
  const worker = async () => {
    while (next < work.length) {
      const item = work[next++];
      job.message = item.kind === 'pdf'
        ? `Reading ${item.book}, pages ${item.fromPage}–${item.toPage}`
        : item.kind === 'media'
          ? `Reading ${item.name}`
          : item.kind === 'youtube'
            ? `Watching ${item.book}`
            : `Extracting concepts from ${item.book}`;
      try {
        if (item.kind === 'pdf') {
          extractions.push(await withRetry(() => extractPdfChunk(ai, item, req), 2));
        } else if (item.kind === 'media') {
          extractions.push(await withRetry(() => extractMedia(ai, item, req), 2));
        } else if (item.kind === 'youtube') {
          extractions.push(await withRetry(() => extractYoutubeVideo(ai, item, req), 2));
        } else {
          extractions.push(await withRetry(() => extractTextChunk(ai, item, req), 2));
        }
      } catch (e: any) {
        job.warnings.push(`${item.kind === 'text' ? item.book : (item as any).book || (item as any).name}: ${String(e?.message || e).slice(0, 140)}`);
      } finally {
        job.chunksDone++;
        if (item.kind === 'pdf' && item.tmp) fs.promises.unlink(item.file).catch(() => {});
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, worker));
  if (extractions.length === 0) throw new Error('No source could be turned into a lesson. ' + (job.warnings[0] || ''));

  job.stage = 'merging';
  job.message = 'Building a preview…';
  const suggested = pickSuggestedTitle(extractions, req.subjectLabel || topic || sourceNames[0] || 'New subject');
  const age = cupAgeMeta(req.grade);
  const topics = uniq(extractions.flatMap(e => e.chapters.map(c => c.title)), 12);
  const keyConcepts = uniq(extractions.flatMap(e => e.chapters.flatMap(c => c.concepts.map(x => x.label))), 16);
  const hasFile = sources.some(s => s.kind === 'file');
  const hasNet = sources.some(s => s.kind === 'url');
  const sourceType = hasFile && hasNet ? 'hybrid' : hasNet ? 'internet' : 'file';
  const conceptCount = keyConcepts.length || 1;
  const estimatedMinutes = Math.min(90, Math.max(age.sessionMinutes, conceptCount * Math.round(age.sessionMinutes / 2)));
  const rawText = extractions
    .flatMap(e => e.chapters.flatMap(c => [c.title, ...c.concepts.map(x => x.label)]))
    .join('\n');

  job.preview = {
    suggestedTitle: suggested,
    summary: `${suggested} — ${conceptCount} ideas from ${sources.length} source${sources.length === 1 ? '' : 's'}, shaped for ${req.learnerName || 'this learner'} (${age.ageGroupLabel}).`,
    topics, keyConcepts, sources, sourceType, estimatedMinutes,
    ageBand: age.band, ageGroupLabel: age.ageGroupLabel,
    grade: req.grade, learnerName: req.learnerName,
  };
  job.result = {
    subjectId: req.subjectId, label: suggested, suggestedLabel: suggested,
    chapterCount: topics.length, conceptCount, chapters: topics,
  };
  job.payload = {
    studentId: req.studentId || '',
    grade: req.grade,
    learnerName: req.learnerName,
    apiKey: req.apiKey,
    subjectId: req.subjectId,
    extractions,
    sourceNames: uniq(sourceNames, 20),
    sources,
    rawText,
  };
  job.stage = 'preview';
  job.message = 'Review the extract, then save to build the program.';
  console.log(`[Ingest] preview ${suggested} (${sourceType}) in ${Math.round((Date.now() - job.startedAt) / 1000)}s`);
}

async function collectFiles(
  job: IngestJob, req: IngestRequest, sourceNames: string[], sources: SourceRef[],
): Promise<Work[]> {
  const work: Work[] = [];
  const rail = job.rails!.files;
  if (!req.files.length) return work;
  for (const f of req.files) {
    const kind = classifyFile(f.originalName, f.mimeType);
    const book = bookName(f.originalName);
    rail.message = `Reading ${f.originalName}…`;
    if (!kind) {
      job.warnings.push(`${f.originalName} is not a supported file type.`);
      rail.done++;
      continue;
    }
    sourceNames.push(book);
    sources.push({ kind: 'file', label: f.originalName });
    try {
      if (kind === 'pdf') {
        const parsed = await parseFile(f.path, f.originalName);
        if (parsed.usedFirecrawl && parsed.text.length > 80) {
          splitText(parsed.text).forEach((text, i) => work.push({
            kind: 'text', book, text, rail: 'files',
            hint: `PDF "${parsed.title}"${i ? `, part ${i + 1}` : ''} parsed by Firecrawl.`,
          }));
        } else {
          const chunks = await splitPdf(f.path, book);
          work.push(...chunks.map(c => ({ kind: 'pdf' as const, rail: 'files' as const, ...c })));
        }
      } else if (kind === 'image' || kind === 'audio' || kind === 'video') {
        const mime = f.mimeType || (kind === 'image' ? 'image/jpeg' : kind === 'video' ? 'video/mp4' : 'audio/mpeg');
        work.push({ kind: 'media', path: f.path, name: f.originalName, mime, book, rail: 'files' });
      } else {
        const src = await extractFileText(f.path, f.originalName, f.mimeType);
        splitText(src.text).forEach((text, i) => work.push({
          kind: 'text', book, text, rail: 'files',
          hint: `${kind.toUpperCase()} file "${src.title}"${i ? `, part ${i + 1}` : ''}.`,
        }));
      }
    } catch (e: any) {
      job.warnings.push(`${f.originalName}: ${String(e?.message || e).slice(0, 160)}`);
    } finally {
      rail.done++;
    }
  }
  rail.message = work.length ? `Read ${rail.done} file${rail.done === 1 ? '' : 's'}` : 'No readable files';
  return work;
}

async function collectInternet(
  job: IngestJob, req: IngestRequest, topic: string, urls: string[],
  sourceNames: string[], sources: SourceRef[],
): Promise<Work[]> {
  const work: Work[] = [];
  const rail = job.rails!.internet;
  const seen = new Set<string>();

  const pushUrl = async (url: string, fromSearch = false) => {
    const key = norm(url);
    if (seen.has(key)) return;
    seen.add(key);
    rail.message = hasFirecrawlKey() ? `Reading ${url}…` : `Fetching ${url}…`;
    try {
      if (classifyUrl(url) === 'youtube') {
        const yt = await extractYoutube(url);
        sourceNames.push(yt.title.slice(0, 80));
        sources.push({ kind: 'url', label: yt.title.slice(0, 80), href: yt.url });
        work.push({ kind: 'youtube', url: yt.url, book: yt.title.slice(0, 80), text: yt.text, rail: 'internet' });
        return;
      }
      const src = await extractUrl(url);
      sourceNames.push(src.title.slice(0, 80));
      sources.push({ kind: 'url', label: src.title.slice(0, 80), href: url });
      splitText(src.text).forEach((text, i) => work.push({
        kind: 'text', book: src.title.slice(0, 80), text, rail: 'internet',
        hint: `${fromSearch ? 'Web search' : src.kind} ${url}${i ? `, part ${i + 1}` : ''}.`,
      }));
    } catch (e: any) {
      job.warnings.push(`${url}: ${String(e?.message || e).slice(0, 180)}`);
    } finally {
      rail.done++;
    }
  };

  const tasks: Promise<void>[] = [];
  if (topic) {
    rail.message = `Searching the web for “${topic}”…`;
    tasks.push((async () => {
      try {
        const lessons = await searchAndScrape(topic, req.grade, 4);
        rail.total += Math.max(0, lessons.length - 1);
        if (!lessons.length) {
          job.warnings.push(`No web lessons found for “${topic}”.`);
          rail.done++;
          return;
        }
        for (const lesson of lessons) {
          const key = norm(lesson.url);
          if (seen.has(key)) continue;
          seen.add(key);
          sourceNames.push(lesson.title.slice(0, 80) || topic);
          sources.push({ kind: 'url', label: lesson.title.slice(0, 80) || topic, href: lesson.url });
          splitText(lesson.text).forEach((text, i) => work.push({
            kind: 'text', book: lesson.title.slice(0, 80) || topic, text, rail: 'internet',
            hint: `Web search “${topic}” ${lesson.url}${i ? `, part ${i + 1}` : ''}.`,
          }));
        }
      } catch (e: any) {
        job.warnings.push(`Search: ${String(e?.message || e).slice(0, 160)}`);
      } finally {
        rail.done++;
      }
    })());
  }
  for (const url of urls) tasks.push(pushUrl(url));
  await Promise.all(tasks);
  rail.message = work.length ? `Found ${sources.filter(s => s.kind === 'url').length} web sources` : 'No web sources';
  return work;
}


async function extractTextChunk(
  ai: GoogleGenAI,
  item: { book: string; text: string; hint: string },
  req: IngestRequest,
): Promise<ChunkExtraction> {
  const prompt = buildCurriculumPrompt({
    book: item.book, grade: req.grade, subjectLabel: req.subjectLabel,
    learnerName: req.learnerName, sourceHint: item.hint,
  });
  const text = await generateWithFallback(ai, [`${prompt}\n\n--- SOURCE ---\n${item.text}`]);
  const parsed = parseExtractPayload(text);
  return { book: item.book, chapters: parsed.chapters, suggestedTitle: parsed.suggestedTitle };
}

async function extractMedia(
  ai: GoogleGenAI,
  item: { path: string; name: string; mime: string; book: string },
  req: IngestRequest,
): Promise<ChunkExtraction> {
  const uploaded = await ai.files.upload({ file: item.path, config: { mimeType: item.mime, displayName: item.name } });
  try {
    let f = uploaded;
    const until = Date.now() + 120_000;
    while (f.state === FileState.PROCESSING && Date.now() < until) {
      await new Promise(r => setTimeout(r, 2000));
      f = await ai.files.get({ name: uploaded.name! });
    }
    if (f.state === FileState.FAILED) throw new Error('Gemini could not process this file');
    const prompt = buildCurriculumPrompt({
      book: item.book, grade: req.grade, subjectLabel: req.subjectLabel,
      learnerName: req.learnerName,
      sourceHint: `This is an ${item.mime.startsWith('audio') ? 'audio clip' : 'image or worksheet'} named "${item.name}". Read every teachable idea on it.`,
    });
    const text = await generateWithFallback(ai, [prompt, createPartFromUri(f.uri!, f.mimeType || item.mime)]);
    const parsed = parseExtractPayload(text);
    return { book: item.book, chapters: parsed.chapters, suggestedTitle: parsed.suggestedTitle };
  } finally {
    if (uploaded.name) ai.files.delete({ name: uploaded.name }).catch(() => {});
  }
}

async function extractYoutubeVideo(
  ai: GoogleGenAI,
  item: { url: string; book: string; text: string },
  req: IngestRequest,
): Promise<ChunkExtraction> {
  const extra = item.text
    ? `\n\nFirecrawl / page extract (prefer this transcript and tutor notes):\n${item.text.slice(0, 18000)}`
    : '';
  const prompt = buildCurriculumPrompt({
    book: item.book, grade: req.grade, subjectLabel: req.subjectLabel,
    learnerName: req.learnerName,
    sourceHint: `This is a YouTube lesson: ${item.url}. Use the transcript and tutor notes below as the source of truth. Watch the video only to fill gaps.${extra}`,
  });
  try {
    const text = await generateWithFallback(ai, [
      prompt,
      { fileData: { fileUri: item.url, mimeType: 'video/mp4' } },
    ]);
    const parsed = parseExtractPayload(text);
    if (parsed.chapters.length) return { book: item.book, chapters: parsed.chapters, suggestedTitle: parsed.suggestedTitle };
  } catch (e) {
    console.warn('[Ingest] YouTube video part failed, using text context:', String((e as Error)?.message || e).slice(0, 160));
  }
  if (item.text.trim().length < 20) {
    throw new Error('Could not watch this YouTube video and it has no captions or description to read.');
  }
  return extractTextChunk(ai, {
    book: item.book, text: item.text,
    hint: `YouTube source ${item.url}. Use the title, description, and any captions.`,
  }, req);
}
