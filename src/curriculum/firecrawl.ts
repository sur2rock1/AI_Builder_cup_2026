// Firecrawl turns web / YouTube / Google Doc URLs into teachable text for ingest.
// Uses FIRECRAWL_API_KEY (v2 scrape, YouTube postprocessor + tutor query).

export interface FirecrawlLesson {
  url: string;
  title: string;
  markdown: string;
  summary: string;
  tutorNotes: string;
  text: string;
  usedFirecrawl: boolean;
}

const TEACH_QUERY =
  'Extract the actual lesson a tutor can teach a child. Include title, chapters or sections, key facts, worked examples, and the transcript or main explanation. Ignore ads, recommended videos, comments, sign-in prompts, and site chrome.';

function apiKey(): string {
  const raw = process.env.FIRECRAWL_API_KEY || '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

export function hasFirecrawlKey(): boolean {
  return apiKey().startsWith('fc-');
}

function pickDoc(json: any): any {
  return json?.data && typeof json.data === 'object' ? json.data : json;
}

function titleFrom(doc: any, fallback: string): string {
  const meta = doc?.metadata || {};
  const raw = String(meta.ogTitle || meta.title || doc?.title || '').trim();
  return raw.replace(/\s+-\s+YouTube\s*$/i, '').trim() || fallback;
}

/** Keep description + transcript; drop YouTube chrome and recommended videos. */
export function preferLessonMarkdown(md: string): string {
  if (!md) return '';
  const title = md.match(/^# .+$/m)?.[0] || '';
  const desc = md.match(/## Description\n[\s\S]+?(?=\n## |\n# [^\n]|$)/i)?.[0];
  const transcript = md.match(/## Transcript\n[\s\S]+/i)?.[0];
  if (desc || transcript) {
    return [title, desc, transcript].filter(Boolean).join('\n\n').trim();
  }
  const covered = md.match(/\*{0,3}\s*WHAT'S COVERED[\s\S]{80,8000}/i);
  if (covered) return [title, covered[0]].filter(Boolean).join('\n\n').trim();
  return md
    .replace(/Error 401[\s\S]{0,400}/g, '')
    .replace(/You're signed out[\s\S]{0,400}/g, '')
    .replace(/Up next[\s\S]*$/i, '')
    .trim();
}

function composeTeachable(parts: {
  title: string;
  summary: string;
  tutorNotes: string;
  markdown: string;
}): string {
  const body = preferLessonMarkdown(parts.markdown);
  const blocks: string[] = [];
  if (parts.title) blocks.push(`# ${parts.title}`);
  if (parts.summary) blocks.push(`## Summary\n${parts.summary}`);
  if (parts.tutorNotes) blocks.push(`## Lesson notes for the tutor\n${parts.tutorNotes}`);
  if (body) blocks.push(`## Source\n${body}`);
  return blocks.join('\n\n').trim();
}

async function scrapeV2(url: string, key: string, withQuery: boolean): Promise<any> {
  const formats: any[] = ['markdown', 'summary'];
  if (withQuery) {
    formats.push({ type: 'query', prompt: TEACH_QUERY, mode: 'freeform' });
  }
  const body: Record<string, unknown> = {
    url,
    formats,
    onlyMainContent: true,
    removeBase64Images: true,
    timeout: 90_000,
    maxAge: 0,
  };
  if (/\.pdf(\?|$)/i.test(url)) body.parsers = ['pdf'];

  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = String(json?.error || json?.message || res.status);
    const error = new Error(err) as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return json;
}

async function scrapeV1(url: string, key: string): Promise<any> {
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      onlyMainContent: true,
      timeout: 90_000,
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(json?.error || json?.message || res.status));
  return json;
}

/** Scrape one URL into tutor-ready text. Empty text if the key is missing or Firecrawl fails. */
export async function scrapeLesson(url: string): Promise<FirecrawlLesson> {
  const empty: FirecrawlLesson = {
    url, title: '', markdown: '', summary: '', tutorNotes: '', text: '', usedFirecrawl: false,
  };
  const key = apiKey();
  if (!key) return empty;

  try {
    let json: any;
    try {
      json = await scrapeV2(url, key, true);
    } catch (e: any) {
      if (e?.status === 400) json = await scrapeV2(url, key, false);
      else if (e?.status === 404) json = await scrapeV1(url, key);
      else throw e;
    }

    const doc = pickDoc(json);
    const markdown = String(doc.markdown || '').trim();
    const summary = String(doc.summary || '').trim();
    const tutorNotes = String(doc.answer || doc.query || '').trim();
    const title = titleFrom(doc, '');
    const text = composeTeachable({ title, summary, tutorNotes, markdown });
    if (text.length < 40) return empty;

    console.log(`[Ingest] Firecrawl ${url.slice(0, 80)} → ${text.length} chars` +
      (tutorNotes ? ' (tutor notes)' : '') +
      (/## Transcript/i.test(markdown) ? ' (transcript)' : ''));

    return { url, title, markdown, summary, tutorNotes, text, usedFirecrawl: true };
  } catch (e: any) {
    console.warn('[Ingest] Firecrawl failed:', String(e?.message || e).slice(0, 180));
    return empty;
  }
}

/** @deprecated use scrapeLesson */
export async function firecrawlMarkdown(url: string): Promise<string> {
  const lesson = await scrapeLesson(url);
  return lesson.text || lesson.markdown;
}

export interface SearchHit {
  url: string;
  title: string;
  description: string;
}

export interface ParsedFile {
  title: string;
  text: string;
  usedFirecrawl: boolean;
}

const PARSEABLE = /\.(pdf|docx?|rtf|odt|xlsx|csv|pptx?|html?|xhtml|md|markdown|txt|xml)$/i;

export function canParseFile(name: string): boolean {
  return PARSEABLE.test(name);
}

/** Parse a local document with Firecrawl. Empty if the key is missing or parse fails. */
export async function parseFile(filePath: string, originalName: string): Promise<ParsedFile> {
  const empty: ParsedFile = { title: originalName, text: '', usedFirecrawl: false };
  const key = apiKey();
  if (!key || !canParseFile(originalName)) return empty;
  try {
    const buf = await (await import('fs')).promises.readFile(filePath);
    const form = new FormData();
    form.append('file', new Blob([buf]), originalName);
    form.append('formats', JSON.stringify(['markdown', 'summary']));
    form.append('onlyMainContent', 'true');
    const res = await fetch('https://api.firecrawl.dev/v2/parse', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[Ingest] Firecrawl parse', res.status, String(json?.error || json?.message || '').slice(0, 160));
      return empty;
    }
    const doc = pickDoc(json);
    const markdown = String(doc.markdown || '').trim();
    const summary = String(doc.summary || '').trim();
    const title = titleFrom(doc, originalName);
    const text = composeTeachable({ title, summary, tutorNotes: '', markdown });
    if (text.length < 40) return empty;
    console.log(`[Ingest] Firecrawl parse ${originalName} → ${text.length} chars`);
    return { title, text, usedFirecrawl: true };
  } catch (e: any) {
    console.warn('[Ingest] Firecrawl parse failed:', String(e?.message || e).slice(0, 180));
    return empty;
  }
}

/** Search the web for an age-shaped topic. Does not scrape yet. */
export async function searchTopic(topic: string, grade: string, limit = 5): Promise<SearchHit[]> {
  const key = apiKey();
  if (!key || !topic.trim()) return [];
  const query = `${topic.trim()} lesson for ${grade} students`.slice(0, 200);
  try {
    const res = await fetch('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        limit,
        sources: [{ type: 'web' }],
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[Ingest] Firecrawl search', res.status, String(json?.error || json?.message || '').slice(0, 160));
      return [];
    }
    const rows = json?.data?.web || json?.data || json?.web || [];
    const hits: SearchHit[] = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      url: String(r.url || r.link || ''),
      title: String(r.title || r.url || ''),
      description: String(r.description || r.snippet || r.markdown || '').slice(0, 400),
    })).filter((h: SearchHit) => /^https?:\/\//i.test(h.url));
    console.log(`[Ingest] Firecrawl search "${query.slice(0, 60)}" → ${hits.length} hits`);
    return hits.slice(0, limit);
  } catch (e: any) {
    console.warn('[Ingest] Firecrawl search failed:', String(e?.message || e).slice(0, 180));
    return [];
  }
}

/** Search then scrape the top hits in parallel. */
export async function searchAndScrape(topic: string, grade: string, limit = 4): Promise<FirecrawlLesson[]> {
  const hits = await searchTopic(topic, grade, limit);
  if (!hits.length) return [];
  const lessons = await Promise.all(hits.map(h => scrapeLesson(h.url)));
  return lessons.filter(l => l.usedFirecrawl && l.text.length > 80);
}
