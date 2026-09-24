/**
 * Pre-generation script for curriculum topic assets.
 *
 * Usage:
 *   npm run pregen:first        → generates assets for the first topic only (test)
 *   npm run pregen              → generates assets for ALL curriculum topics
 *
 * What it generates per topic:
 *   - Full lesson data (lessonData) — diagram, chalk notes, quiz, explorer
 *   - 2D diagram variants for key sub-focus points (e.g. "equidistance property")
 *   - Real-world photo prompt + base64 image for the topic
 *
 * Output: data/pregenerated/{topicSlug}.json
 *
 * Cache contract: every key in the file is immutable once written.
 * Re-running the script skips any topic whose file already exists unless
 * you pass --force.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ path: '.env' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const DATA_DIR   = path.join(ROOT, 'data');
const PREGEN_DIR = path.join(DATA_DIR, 'pregenerated');
const CURRICULA  = path.join(DATA_DIR, 'curricula.json');

const FIRST_ONLY = process.argv.includes('--first-only');
const FORCE      = process.argv.includes('--force');

const MODEL_PRIMARY  = 'gemini-3.8-flash';
const MODEL_FALLBACK = ['gemini-3.1-flash-lite', 'gemini-flash-latest'];

// ─── helpers ────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function isRetryable(e: any): boolean {
  const msg = String(e?.message ?? e?.status ?? e?.code ?? '');
  return /503|502|429|overload|too many|resource.exhausted|rate.limit|quota|temporarily|high demand|unavailable/i.test(msg);
}

async function generateJson(ai: GoogleGenAI, prompt: string, label: string): Promise<any> {
  const models = [MODEL_PRIMARY, ...MODEL_FALLBACK];
  let lastErr: any;
  for (const model of models) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const r = await ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });
        const text = (r.text || '').replace(/```json\s*|\s*```/g, '').trim();
        if (!text) throw new Error('empty response');
        const parsed = JSON.parse(text);
        console.log(`  ✓ ${label} (${model})`);
        return parsed;
      } catch (e: any) {
        lastErr = e;
        if (/not found|not supported|404/i.test(String(e?.message))) break; // skip model
        if (isRetryable(e) && attempt < 4) {
          const wait = Math.min(60_000, 5_000 * 2 ** attempt);
          console.warn(`  ↻ ${label}: ${model} busy, retry in ${wait / 1000}s (attempt ${attempt + 1}/5)`);
          await sleep(wait);
          continue;
        }
        break;
      }
    }
  }
  throw lastErr || new Error(`${label}: no model returned data`);
}

async function getUnsplashPhoto(topic: string): Promise<string | null> {
  // Extract meaningful keywords from topic for Unsplash search
  const stopWords = new Set(['and', 'the', 'of', 'for', 'with', 'from', 'that', 'this', 'are', 'into', 'its']);
  const keywords = topic
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 4)
    .join(',');

  const url = `https://source.unsplash.com/800x600/?${encodeURIComponent(keywords + ',education,student')}`;
  try {
    // Follow redirect to capture the stable CDN URL
    const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (resp.ok && resp.url && resp.url !== url && resp.url.includes('unsplash.com')) {
      // Strip query params to get clean stable URL
      const cleanUrl = resp.url.split('?')[0];
      console.log(`  ✓ photo (unsplash fallback: ${cleanUrl.slice(0, 60)}...)`);
      return cleanUrl;
    }
  } catch (_) { /* network not available */ }
  return null;
}

async function generateImage(ai: GoogleGenAI, imagePrompt: string, topic: string): Promise<string | null> {
  const models = ['gemini-3.0-flash-preview-image-generation', 'imagen-3.0-generate-002'];
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r: any = await ai.models.generateContent({
          model,
          contents: imagePrompt,
          config: { responseModalities: ['TEXT', 'IMAGE'] } as any,
        });
        const parts = r?.candidates?.[0]?.content?.parts ?? [];
        for (const p of parts) {
          if (p.inlineData?.mimeType?.startsWith('image/')) {
            console.log(`  ✓ photo (${model})`);
            return `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
          }
        }
      } catch (e: any) {
        if (isRetryable(e) && attempt < 2) {
          await sleep(5_000 * 2 ** attempt);
          continue;
        }
        break;
      }
    }
  }
  // Gemini image models unavailable — try Unsplash
  const unsplash = await getUnsplashPhoto(topic);
  if (unsplash) return unsplash;
  console.warn('  ⚠ photo: all image sources unavailable — will use SVG fallback at runtime');
  return null;
}

// ─── per-topic asset prompts ──────────────────────────────────────────────────

function lessonPrompt(
  topic: string,
  grade: string,
  keyFacts: string[],
  misconceptions: string[],
  workedExamples: string[],
  misconceptionDetails: Array<{ belief: string; triggerPattern?: string; probeQuestion: string; correctionHint: string }>,
  prerequisiteDetails: Array<{ label: string; reason: string; checkQuestion: string }>,
): string {
  return `You are a master pedagogical curriculum designer. Generate a comprehensive, highly engaging, age-appropriate interactive lesson for a student in "${grade}" on the topic "${topic}".

Key facts from the curriculum:
${keyFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Common misconceptions to address:
${misconceptions.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Worked examples from the textbook (ground your quiz and worked example in these):
${workedExamples.length > 0 ? workedExamples.map((e, i) => `${i + 1}. ${e}`).join('\n') : '(none — invent a suitable worked example)'}

Detailed misconception probes (use these to craft quiz explanation and suggestedQuestions):
${misconceptionDetails.length > 0 ? misconceptionDetails.map((m, i) => `${i + 1}. BELIEF: ${m.belief}${m.triggerPattern ? ' | TRIGGER: ' + m.triggerPattern : ''} | PROBE: ${m.probeQuestion} | CORRECTION: ${m.correctionHint}`).join('\n') : '(none — derive from commonMisconceptions above)'}

Prerequisite knowledge to check (add diagnostic suggestedQuestions for these):
${prerequisiteDetails.length > 0 ? prerequisiteDetails.map((p, i) => `${i + 1}. ${p.label} — ${p.reason} (diagnostic: "${p.checkQuestion}")`).join('\n') : '(none provided)'}

Return a JSON object strictly following this schema:
{
  "topic": "${topic}",
  "grade": "${grade}",
  "subject": "Mathematics / Geometry",
  "tagline": "A punchy, inspiring 1-sentence subtitle",
  "overview": "A rich, clear 2-sentence conceptual summary for ${grade}",
  "diagram": {
    "diagramType": "flow",
    "title": "Title of the concept diagram",
    "description": "Short explanation of the diagram",
    "nodes": [
      { "id": "node-1", "label": "Specific descriptive name", "sublabel": "Key formula or location", "category": "Classification", "color": "emerald", "details": "1-2 sentences explaining this node" }
    ],
    "connections": [
      { "from": "Source Node Label", "to": "Target Node Label", "label": "causal link" }
    ]
  },
  "chalkNotes": {
    "title": "Chalkboard Title",
    "subtitle": "Chalkboard subtitle",
    "coreRuleOrFormula": "The core governing law or formula",
    "bulletPoints": ["Key point 1", "Key point 2", "Key point 3", "Key point 4"],
    "keyTakeaways": ["Crucial takeaway 1", "Crucial takeaway 2"]
  },
  "quiz": {
    "question": "A clear question testing the core concept",
    "options": ["Correct answer", "Plausible wrong answer 1", "Plausible wrong answer 2", "Plausible wrong answer 3"],
    "correctIndex": 0,
    "explanation": "Why the correct answer is right and the others are wrong"
  },
  "suggestedQuestions": [
    "A thoughtful question the student might ask (not already answered above)",
    "Another practical question",
    "A deeper conceptual question"
  ],
  "scene3d": {
    "sceneType": "geometry",
    "title": "Short 3D scene title",
    "description": "One sentence describing the 3D spatial simulation",
    "elements": [
      { "name": "Element name", "description": "Element description", "color": "#34d399" }
    ]
  },
  "photoVisual": {
    "caption": "What the photo shows",
    "promptUsed": "Detailed photographic prompt used to generate the real-world image",
    "annotations": [
      { "label": "Key element", "description": "What to observe here", "x": 40, "y": 50 }
    ]
  }
}

Rules:
- 4-6 nodes in the diagram, each with a REAL descriptive label (never "Node 1")
- Node colors from: emerald, amber, sky, violet, rose, teal
- The quiz question must test deep understanding, not just recall
- scene3d sceneType must be one of: orbit, molecule, geometry, network, dna, globe, particles
- photoVisual.promptUsed must be a rich, photorealistic image description suitable for image generation`;
}

function diagramFocusPrompt(topic: string, grade: string, focus: string): string {
  return `You are an expert pedagogical diagram designer. Generate a concise 2D concept diagram specifically focused on: "${focus}" within the topic "${topic}" for a student in "${grade}".

Return ONLY valid JSON (no markdown fences):
{
  "diagramType": "flow",
  "title": "Concise title for this diagram view",
  "description": "One sentence explaining what this diagram shows",
  "nodes": [
    { "id": "node-1", "label": "Real descriptive name", "sublabel": "Key formula or subtitle", "category": "Classification", "color": "emerald", "details": "1-2 clear sentences" }
  ],
  "connections": [
    { "from": "Source Node Label", "to": "Target Node Label", "label": "relationship" }
  ]
}

Rules:
- 3-5 nodes maximum (optimised for screen space)
- Node colors from: emerald, amber, sky, violet, rose, teal
- Every node must have a real descriptive label — NEVER generic names
- Focus specifically on: "${focus}"`;
}

function photoPrompt(topic: string): string {
  return `A high-resolution, photorealistic educational photograph depicting "${topic}" in a real-world context that makes the concept immediately clear to a school student. The image should show a practical, tangible example that a 13-14 year old would find relatable and interesting. Sharp focus, authentic natural lighting, no text overlays, cinematic clarity.`;
}

// ─── key focus points to pre-generate per topic category ──────────────────

function keyFocusPoints(topic: string): string[] {
  const lower = topic.toLowerCase();
  if (lower.includes('perpendicular') || lower.includes('bisect')) {
    return [
      'perpendicular bisector construction with compass and straightedge',
      'equidistance property: every point on the bisector is equidistant from both endpoints',
      'angle bisector dividing an angle into two equal halves',
      'locus of points equidistant from two fixed points',
    ];
  }
  if (lower.includes('congruence') || lower.includes('sss') || lower.includes('sas')) {
    return [
      'SSS congruence: three sides equal',
      'SAS congruence: two sides and included angle',
      'AAS congruence: two angles and a non-included side',
      'RHS congruence: right angle, hypotenuse, and a side',
    ];
  }
  if (lower.includes('similarity') || lower.includes('scale')) {
    return [
      'AA similarity test for triangles',
      'scale factor relationship between similar figures',
      'ratio of areas of similar figures',
      'ratio of volumes of similar solids',
    ];
  }
  if (lower.includes('circle') || lower.includes('chord') || lower.includes('tangent')) {
    return [
      'perpendicular from centre bisects a chord',
      'tangent is perpendicular to radius at point of contact',
      'angle at centre is twice angle at circumference',
      'angles in the same segment are equal',
    ];
  }
  // Generic: derive 3 focus points from topic name
  return [topic, `key properties of ${topic}`, `real-world applications of ${topic}`];
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌  GEMINI_API_KEY not set — cannot pre-generate assets.');
    process.exit(1);
  }

  if (!fs.existsSync(CURRICULA)) {
    console.error(`❌  Curriculum file not found: ${CURRICULA}`);
    process.exit(1);
  }

  fs.mkdirSync(PREGEN_DIR, { recursive: true });

  const curricula: any[] = JSON.parse(fs.readFileSync(CURRICULA, 'utf8'));
  const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });

  // Flatten all concepts across all curricula, sort by typicalTeachingOrder
  const allConcepts: Array<{ concept: any; grade: string; subjectId: string }> = [];
  for (const curr of curricula) {
    const sorted = [...(curr.concepts || [])].sort(
      (a, b) => (a.typicalTeachingOrder ?? 99) - (b.typicalTeachingOrder ?? 99)
    );
    for (const concept of sorted) {
      allConcepts.push({ concept, grade: curr.grade || 'Secondary 2 (Grade 8)', subjectId: curr.id });
    }
  }

  const targets = FIRST_ONLY ? allConcepts.slice(0, 1) : allConcepts;
  console.log(`\n🎓 Pre-generating assets for ${targets.length} topic(s)${FIRST_ONLY ? ' (first only — test mode)' : ''}...\n`);

  for (const { concept, grade } of targets) {
    const topic  = concept.label as string;
    const slug   = slugify(topic);
    const outFile = path.join(PREGEN_DIR, `${slug}.json`);

    if (!FORCE && fs.existsSync(outFile)) {
      console.log(`⏭  Skipping "${topic}" — already pre-generated (use --force to regenerate)`);
      continue;
    }

    console.log(`\n📚 Topic: "${topic}" (${grade})`);
    const startMs = Date.now();

    try {
      // ── 1. Full lesson data ──────────────────────────────────────────────
      console.log('  Generating lesson data...');
      const lessonData = await generateJson(
        ai,
        lessonPrompt(
          topic, grade,
          concept.keyFacts || [],
          concept.commonMisconceptions || [],
          concept.workedExamples || [],
          concept.misconceptionDetails || [],
          concept.prerequisiteDetails || [],
        ),
        'lessonData'
      );

      // ── 2. Diagram variants for key focus points ─────────────────────────
      console.log('  Generating diagram variants...');
      const focusPoints = keyFocusPoints(topic);
      const diagrams: Record<string, any> = {};

      // Main diagram is already in lessonData — store it as the default focus too
      diagrams['__main__'] = lessonData.diagram;

      for (const focus of focusPoints) {
        const focusSlug = slugify(focus);
        try {
          diagrams[focusSlug] = await generateJson(
            ai,
            diagramFocusPrompt(topic, grade, focus),
            `diagram:${focus.slice(0, 40)}`
          );
          // Small pause between calls to avoid rate limiting
          await sleep(1_500);
        } catch (e: any) {
          console.warn(`  ⚠ diagram variant "${focus}" failed: ${e.message} — skipping`);
        }
      }

      // ── 3. Real-world photo ───────────────────────────────────────────────
      console.log('  Generating real-world photo...');
      const photoUrl = await generateImage(ai, photoPrompt(topic), topic);

      // ── 4. Write output ───────────────────────────────────────────────────
      const output = {
        topic,
        grade,
        slug,
        generatedAt: new Date().toISOString(),
        lessonData,
        diagrams,   // keyed by focus-slug; "__main__" is the default
        photoUrl,   // base64 data URI or null
      };

      fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      console.log(`  ✅ Saved to ${path.relative(ROOT, outFile)} (${elapsed}s)\n`);

    } catch (e: any) {
      console.error(`  ❌ Failed: ${e.message}`);
    }
  }

  console.log('\n✨ Pre-generation complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
