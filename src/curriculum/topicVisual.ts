/** Curated stills when Gemini image models are blocked. Never picsum (random desks / keyboards). */
export function topicFallbackImage(topic = '', prompt = ''): string {
  const t = `${topic} ${prompt}`.toLowerCase();
  const u = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1280&h=720`;
  if (/cell|mitosis|nucleus|organelle|cytoplasm/.test(t)) return u('photo-1576086213369-97a306d36557');
  if (/stomata|stoma|pore|vein/.test(t)) return u('photo-1530026405186-ed1f139313f8');
  if (/root|soil/.test(t)) return u('photo-1416879595882-3373a0480b5b');
  if (/photo|leaf|chlorophyll|sunlight|glucose|plant|carbon/.test(t)) return u('photo-1501004318641-b39e6451bec6');
  if (/triangle|pythagoras|ladder|hypotenuse/.test(t)) return '/scenes/ladder.jpg';
  return u('photo-1448375240586-882707db888b');
}

export function isJunkFallbackUrl(url?: string): boolean {
  if (!url) return true;
  return /picsum\.photos|loremflickr|placehold\.co|via\.placeholder/i.test(url);
}

export interface VisualRegion {
  label: string;
  x: number;
  y: number;
  zoom: number;
}

export interface ClipFrame {
  imageUrl: string;
  caption: string;
  seconds: number;
  zoom?: { x: number; y: number; scale: number };
}

export interface LessonClip {
  title: string;
  frames: ClipFrame[];
}

export function regionFor(label: string): VisualRegion {
  const t = label.toLowerCase();
  if (/stomat|pore|door|air|carbon/.test(t)) return { label: 'Tiny doors for air', x: 62, y: 56, zoom: 2.4 };
  if (/vein|xylem|phloem|sap/.test(t)) return { label: 'The sap highways', x: 38, y: 42, zoom: 1.9 };
  if (/chloro|green|sun|solar/.test(t)) return { label: 'Green solar panels', x: 48, y: 36, zoom: 1.7 };
  if (/root|soil|water/.test(t)) return { label: 'Roots drink water', x: 50, y: 78, zoom: 1.6 };
  if (/oxygen|bubble/.test(t)) return { label: 'Oxygen drifting out', x: 72, y: 28, zoom: 1.8 };
  return { label: label.slice(0, 40) || 'Look here', x: 50, y: 45, zoom: 1.8 };
}

function clipCaptions(script?: string): string[] {
  const fallback = [
    'Sunlight hits the green leaf.',
    'Water climbs up from the roots.',
    'Tiny doors let carbon dioxide in.',
    'Sugar is food. Oxygen goes out.',
  ];
  if (!script) return fallback;
  const parts = script
    .split(/[.!?]+/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 12 && s.length <= 86);
  return parts.length >= 2 ? parts.slice(0, 4) : fallback;
}

export function lessonClipFor(topic: string, script?: string): LessonClip {
  const captions = clipCaptions(script);
  return {
    title: `${topic} in 20 seconds`,
    frames: [
      { imageUrl: topicFallbackImage(topic, 'leaf sunlight'), caption: captions[0], seconds: 4, zoom: { x: 50, y: 38, scale: 1.2 } },
      { imageUrl: topicFallbackImage(topic, 'roots soil'), caption: captions[1] || captions[0], seconds: 4, zoom: { x: 50, y: 78, scale: 1.35 } },
      { imageUrl: topicFallbackImage(topic, 'stomata pores'), caption: captions[2] || captions[0], seconds: 4, zoom: { x: 62, y: 56, scale: 1.8 } },
      { imageUrl: topicFallbackImage(topic, 'leaf oxygen bubbles'), caption: captions[3] || captions[0], seconds: 4, zoom: { x: 48, y: 40, scale: 1.25 } },
    ],
  };
}

/** Prefer the pictures already on the canvas so the clip does not jump to a random still. */
export function lessonClipFromSeries(
  topic: string,
  series: Array<{ url: string; caption?: string }>,
  script?: string,
): LessonClip {
  const pics = series.filter(p => p.url && !isJunkFallbackUrl(p.url)).slice(-5);
  if (pics.length < 2) return lessonClipFor(topic, script);
  const captions = clipCaptions(script);
  return {
    title: `${topic} story`,
    frames: pics.map((p, i) => ({
      imageUrl: p.url,
      caption: p.caption || captions[i] || captions[0],
      seconds: 4,
      zoom: { x: 48 + i * 2, y: 40 + (i % 3) * 6, scale: 1.12 + i * 0.06 },
    })),
  };
}
