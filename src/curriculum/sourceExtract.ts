// Pull teachable text (or a media file Gemini can read) from a parent/kid source.
import fs from 'fs';
import path from 'path';
import { scrapeLesson, firecrawlMarkdown, hasFirecrawlKey, parseFile, canParseFile } from './firecrawl';

export { firecrawlMarkdown, hasFirecrawlKey };

export type SourceKind =
  | 'pdf' | 'epub' | 'image' | 'audio' | 'video' | 'text' | 'markdown'
  | 'html' | 'docx' | 'office' | 'sheet' | 'slides' | 'web' | 'youtube' | 'gdoc';

export interface ExtractedSource {
  kind: SourceKind;
  title: string;
  text: string;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|heic|bmp|svg)$/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|aac)$/i;
const VIDEO_EXT = /\.(mp4|mov|avi|webm)$/i;
const TEXT_EXT = /\.(txt|md|markdown|xml)$/i;
const HTML_EXT = /\.(html?|xhtml)$/i;

export function classifyFile(name: string, mime = ''): SourceKind | null {
  const m = mime.toLowerCase();
  if (m === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (m.includes('epub') || /\.epub$/i.test(name)) return 'epub';
  if (m.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
  if (m.startsWith('audio/') || AUDIO_EXT.test(name)) return 'audio';
  if (m.startsWith('video/') || VIDEO_EXT.test(name)) return 'video';
  if (m.includes('wordprocessingml') || /\.docx$/i.test(name)) return 'docx';
  if (/\.doc$/i.test(name) || m === 'application/msword' || /\.(rtf|odt)$/i.test(name)) return 'office';
  if (/\.(xlsx|csv)$/i.test(name) || m.includes('spreadsheet') || m === 'text/csv') return 'sheet';
  if (/\.pptx?$/i.test(name) || m.includes('presentation')) return 'slides';
  if (m === 'text/html' || HTML_EXT.test(name)) return 'html';
  if (m === 'text/markdown' || /\.(md|markdown)$/i.test(name)) return 'markdown';
  if (m.startsWith('text/') || TEXT_EXT.test(name)) return 'text';
  if (canParseFile(name)) return 'text';
  return null;
}

export function classifyUrl(url: string): 'youtube' | 'gdoc' | 'web' {
  if (youtubeId(url)) return 'youtube';
  if (googleDocId(url)) return 'gdoc';
  return 'web';
}

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./, '');
    if (host === 'youtu.be') return u.pathname.replace(/^\//, '').slice(0, 11) || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{11})/);
      return m?.[1] || null;
    }
  } catch { /* ignore */ }
  return null;
}

export function youtubeWatchUrl(id: string) {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function googleDocId(url: string): string | null {
  const m = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m?.[1] || null;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitText(text: string, max = 24000): string[] {
  const clean = text.replace(/\s+\n/g, '\n').trim();
  if (clean.length <= max) return clean ? [clean] : [];
  const parts: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(clean.length, i + max);
    if (end < clean.length) {
      const cut = clean.lastIndexOf('\n\n', end);
      if (cut > i + max * 0.6) end = cut;
    }
    parts.push(clean.slice(i, end).trim());
    i = end;
  }
  return parts.filter(Boolean);
}

async function loadZip() {
  try {
    const JSZip = (await import('jszip')).default;
    return JSZip;
  } catch {
    throw new Error('ZIP reader is not installed. Run "npm install" and restart.');
  }
}

async function extractEpub(filePath: string): Promise<string> {
  const JSZip = await loadZip();
  const zip = await JSZip.loadAsync(await fs.promises.readFile(filePath));
  const htmlNames = Object.keys(zip.files)
    .filter(n => /\.(xhtml|html|htm)$/i.test(n) && !zip.files[n].dir)
    .sort();
  const chunks: string[] = [];
  for (const name of htmlNames) {
    const raw = await zip.files[name].async('string');
    const text = htmlToText(raw);
    if (text.length > 40) chunks.push(text);
  }
  if (!chunks.length) throw new Error('That EPUB had no readable chapters');
  return chunks.join('\n\n');
}

async function extractDocx(filePath: string): Promise<string> {
  const JSZip = await loadZip();
  const zip = await JSZip.loadAsync(await fs.promises.readFile(filePath));
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('That Word file could not be read');
  const withBreaks = xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, ' ');
  const text = htmlToText(withBreaks);
  if (text.length < 20) throw new Error('That Word file had no readable text');
  return text;
}


async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'LumenCurriculum/1.0 (educational extract)', Accept: 'text/plain,text/html,application/xhtml+xml' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Could not fetch ${url} (${res.status})`);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const body = await res.text();
  if (ct.includes('html') || /<html/i.test(body.slice(0, 400))) return htmlToText(body);
  return body;
}

export interface YoutubeSource {
  id: string;
  url: string;
  title: string;
  text: string;
  hasCaptions: boolean;
}

function pickCaptionTrack(tracks: any[]): any | null {
  if (!Array.isArray(tracks) || !tracks.length) return null;
  const lang = (t: any) => String(t.languageCode || t.vssId || '').toLowerCase();
  return tracks.find(t => lang(t).startsWith('en') && !t.kind) ||
    tracks.find(t => lang(t).startsWith('en')) ||
    tracks[0];
}

async function captionsFromTracks(tracks: any[]): Promise<string> {
  const track = pickCaptionTrack(tracks);
  if (!track?.baseUrl) return '';
  const xml = await (await fetch(track.baseUrl + (track.baseUrl.includes('fmt=') ? '' : '&fmt=srv3'), {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })).text();
  return htmlToText(xml.replace(/<text[^>]*>/g, '\n'));
}

function playerFromHtml(html: string): any | null {
  const marker = 'ytInitialPlayerResponse';
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const eq = html.indexOf('{', i);
  if (eq < 0) return null;
  try {
    // The object is JSON-serialised into the page. Walk braces to the matching close.
    let depth = 0;
    for (let j = eq; j < html.length && j < eq + 2_000_000; j++) {
      const ch = html[j];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return JSON.parse(html.slice(eq, j + 1));
      }
    }
  } catch { /* ignore */ }
  return null;
}

async function innertubePlayer(id: string): Promise<any | null> {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20260101.00.00', hl: 'en', gl: 'US' } },
        videoId: id,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function tracksFromPlayer(player: any): any[] {
  return player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
}

function detailsFromPlayer(player: any): { title: string; description: string } {
  const d = player?.videoDetails || {};
  return {
    title: String(d.title || '').trim(),
    description: String(d.shortDescription || '').trim(),
  };
}

async function oembedTitle(url: string): Promise<string> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!res.ok) return '';
    const j: any = await res.json();
    return String(j.title || '').trim();
  } catch {
    return '';
  }
}

/** Firecrawl first (transcript + tutor notes). Captions/description only if Firecrawl misses. */
export async function extractYoutube(url: string): Promise<YoutubeSource> {
  const id = youtubeId(url);
  if (!id) throw new Error('Not a YouTube link');
  const watch = youtubeWatchUrl(id);

  const lesson = await scrapeLesson(watch);
  if (lesson.usedFirecrawl && lesson.text.length > 80) {
    return {
      id,
      url: watch,
      title: lesson.title || watch,
      text: lesson.text,
      hasCaptions: /## Transcript/i.test(lesson.markdown),
    };
  }

  const htmlRes = await fetch(watch, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept-Language': 'en-US,en' },
  });
  const html = await htmlRes.text();
  let player = playerFromHtml(html);
  if (!player) player = await innertubePlayer(id);

  let { title, description } = detailsFromPlayer(player);
  if (!title) {
    title = (html.match(/<title>([^<]+)<\/title>/i)?.[1] || '').replace(/\s*- YouTube\s*$/, '').trim();
  }
  if (!title) title = await oembedTitle(watch);

  let captions = await captionsFromTracks(tracksFromPlayer(player));
  if (captions.length < 40 && player) {
    const inner = await innertubePlayer(id);
    captions = await captionsFromTracks(tracksFromPlayer(inner));
    const extra = detailsFromPlayer(inner);
    title = title || extra.title;
    description = description || extra.description;
  }

  const parts: string[] = [];
  if (title) parts.push(title);
  if (captions.length > 40) parts.push(captions);
  else if (description) parts.push(description);
  if (lesson.text.length > 40) parts.push(lesson.text);

  return {
    id,
    url: watch,
    title: title || lesson.title || watch,
    text: parts.join('\n\n').trim(),
    hasCaptions: captions.length > 40,
  };
}

async function googleDocText(url: string): Promise<string> {
  const id = googleDocId(url);
  if (!id) throw new Error('Not a Google Doc link');
  const lesson = await scrapeLesson(url);
  if (lesson.text.length > 40) return lesson.text;
  try {
    const text = await fetchText(`https://docs.google.com/document/d/${id}/export?format=txt`);
    if (text.length > 40 && !/sign in|accounts\.google/i.test(text.slice(0, 200))) return text;
  } catch { /* private doc */ }
  throw new Error('That Google Doc is not readable. Set link sharing to “anyone with the link”, or export it as PDF / .docx.');
}

export async function extractFileText(filePath: string, originalName: string, mime?: string): Promise<ExtractedSource> {
  const kind = classifyFile(originalName, mime);
  if (!kind || kind === 'pdf' || kind === 'image' || kind === 'audio' || kind === 'video') {
    throw new Error(`Use the media path for ${originalName}`);
  }
  const parsed = await parseFile(filePath, originalName);
  if (parsed.usedFirecrawl && parsed.text.length > 40) {
    return { kind, title: parsed.title, text: parsed.text };
  }
  const title = path.basename(originalName);
  if (kind === 'epub') return { kind, title, text: await extractEpub(filePath) };
  if (kind === 'docx') return { kind, title, text: await extractDocx(filePath) };
  if (kind === 'office' || kind === 'sheet' || kind === 'slides') {
    throw new Error(`${originalName} could not be parsed. Try PDF or DOCX.`);
  }
  const raw = await fs.promises.readFile(filePath, 'utf-8');
  const text = kind === 'html' ? htmlToText(raw) : raw;
  if (text.trim().length < 20) throw new Error(`${originalName} had almost no text`);
  return { kind, title, text };
}

export async function extractUrl(url: string): Promise<ExtractedSource> {
  const kind = classifyUrl(url);
  if (kind === 'youtube') {
    const yt = await extractYoutube(url);
    return { kind, title: yt.title, text: yt.text };
  }
  if (kind === 'gdoc') {
    const text = await googleDocText(url);
    return { kind, title: url, text };
  }
  const lesson = await scrapeLesson(url);
  if (lesson.usedFirecrawl && lesson.text.length > 40) {
    return { kind: 'web', title: lesson.title || url, text: lesson.text };
  }
  return { kind: 'web', title: lesson.title || url, text: await fetchText(url) };
}

export const ACCEPTED_FILE_NOTE =
  'PDF, EPUB, Word, images, Markdown, TXT, HTML, or a short audio clip';
