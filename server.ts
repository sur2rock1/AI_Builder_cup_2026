import express from 'express';
import http from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { LiveObserver } from './src/adaptive/liveObserver';
import { GoogleGenAI, Modality, Type, LiveServerMessage } from '@google/genai';
import { createDynamicLesson } from './src/utils/lessonGenerator';
import multer from 'multer';
import {
  getOrCreateLearner, getLearner, listLearners, ensureSubject,
  ensureConceptState, getConceptState, recordAttempt, addGlobalInsight,
  incrementSessionCount, startSession, getSession, updateSession, endSession,
  recordReasoningEvidence, getEvidenceLog,
} from './src/adaptive/learnerStore';
import { assessUnderstanding, selectNextStrategy } from './src/adaptive/assessmentEngine';
import {
  assessReasoningWithDeadline, misconceptionText, misconceptionCatalog,
  ReasoningAssessment, DeadlineResult,
} from './src/adaptive/reasoningAssessor';
import { MASTERY_THRESHOLD } from './src/adaptive/bkt';
import { liveConfigFor } from './src/live/liveConfig';
import { buildCurriculumIntelligenceContext } from './src/curriculum/curriculumIntelligence';
import { getCurriculum, listCurricula, preloadCurricula, nextUnmasteredConcept } from './src/curriculum/ingest';
import { startIngestJob, getJob } from './src/curriculum/pdfIngest';
import os from 'os';
import fs from 'fs';
import { AdaptiveSessionState, TeachingStrategy, CurriculumConcept } from './src/adaptive/learnerModel';
import { initFirebaseAdmin, admin } from './src/firebase/admin';


dotenv.config();
initFirebaseAdmin();
// Warm the curriculum cache from Firestore at startup
preloadCurricula().catch(err => console.warn('[Startup] Curriculum preload failed:', err?.message));

// ── Guard against Vite-internal WebSocket frame errors ──────────
// When Vite runs in middlewareMode, its bundled ws instance can emit
// uncaught errors for malformed HMR close frames (Node 18+).
// These are non-fatal and should not crash the server.
process.on('uncaughtException', (err: any) => {
  if (
    err?.code === 'WS_ERR_INVALID_CLOSE_CODE' ||
    err?.message?.includes('Invalid WebSocket frame') ||
    err?.message?.includes('WebSocket')
  ) {
    console.debug('[Server] Non-fatal WebSocket frame error suppressed:', err.message);
    return; // swallow and continue
  }
  // Re-throw anything genuinely unexpected
  console.error('[Server] Uncaught exception:', err);
  process.exit(1);
});


// ── Pre-generated asset cache ──────────────────────────────────────────────
const PREGEN_DIR = path.join(process.cwd(), 'data', 'pregenerated');

/** Convert a topic name to the same slug used by pregenerate-assets.ts */
function slugifyTopic(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** Load pregenerated cache file for a topic, or return null if not found */
function loadPregen(topic: string): any | null {
  try {
    const file = path.join(PREGEN_DIR, `${slugifyTopic(topic)}.json`);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e: any) {
    console.warn(`[cache] Failed to read pregenerated file for "${topic}":`, e.message);
  }
  return null;
}

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;
// Cloud Run / Hosting terminate TLS and forward the original host/proto.
app.set('trust proxy', true);

// How long the voice model may be kept waiting for a diagnosis. The Live tool
// call blocks speech, so this is felt directly as silence by the child.
const ASSESS_BUDGET_MS = Number(process.env.ASSESS_BUDGET_MS) || 2500;

app.use(express.json());

// API health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

// Real-time Lesson Generation Endpoint: Uses Gemini 3.8 Flash to generate fresh lesson data for ANY topic & grade
app.post('/api/generate-lesson', async (req, res) => {
  const { topic, grade } = req.body;
  const targetTopic = topic || 'Photosynthesis';
  const targetGrade = grade || 'Middle School (Grade 6-8)';

  // ── Cache-first: serve pre-generated lesson if available ─────────────────
  const cached = loadPregen(targetTopic);
  if (cached?.lessonData) {
    // Merge with static fallback so every field is present.
    // The pregen AI generates: diagram, chalkNotes, quiz, overview, tagline.
    // The static fallback supplies: explorer (with calculateOutcome fn), scene3d,
    // photoVisual, suggestedQuestions, and any other UI-required fields.
    const staticBase = createDynamicLesson(targetTopic, targetGrade);
    const mergedData = { ...staticBase, ...cached.lessonData };
    console.log(`[API /api/generate-lesson] Cache HIT for "${targetTopic}" — serving merged pregenerated+static data`);
    return res.json({ success: true, data: mergedData, photoUrl: cached.photoUrl ?? null, source: 'pregenerated-cache' });
  }
  console.log(`[API /api/generate-lesson] Cache MISS for "${targetTopic}" — calling Gemini`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      fallback: true,
      message: 'Using local generator fallback (GEMINI_API_KEY not set)',
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });

    const prompt = `You are a master pedagogical curriculum designer. Generate a comprehensive, highly engaging, age-appropriate interactive lesson for a student in "${targetGrade}" on the topic "${targetTopic}".
Return a JSON object strictly following this JSON schema:
{
  "topic": "${targetTopic}",
  "grade": "${targetGrade}",
  "subject": "e.g. Biology, Physics, History, Literature, Computer Science, Earth Science, Mathematics",
  "tagline": "A punchy, inspiring 1-sentence subtitle for the lesson",
  "overview": "A rich, clear 2-sentence conceptual summary suitable for ${targetGrade}",
  "diagram": {
    "diagramType": "flow (or 'cycle' if the topic is a recurring loop like Calvin cycle, Krebs cycle, Water cycle, etc.)",
    "title": "Title of the concept diagram or cycle",
    "description": "Short explanation of the diagram",
    "nodes": [
      {
        "id": "node-1",
        "label": "Specific name of step/component (e.g. 'Photon Absorption', 'Water Photolysis' - NEVER 'Node 1')",
        "sublabel": "Subtitle or key formula/location",
        "category": "Classification (e.g. 'Light Reaction', 'Catalysis', 'Product')",
        "color": "emerald",
        "details": "1-2 sentences explaining this node clearly"
      }
    ],
    "connections": [
      { "from": "Name of Source Node", "to": "Name of Target Node", "label": "transformation or causal link" }
    ]
  },
  "chalkNotes": {
    "title": "Chalkboard Title",
    "subtitle": "Chalkboard subtitle",
    "coreRuleOrFormula": "The core governing law, mathematical formula, or central axiom",
    "bulletPoints": [
      "Key lecture point 1",
      "Key lecture point 2",
      "Key lecture point 3",
      "Key lecture point 4"
    ],
    "keyTakeaways": [
      "Crucial exam/conceptual takeaway 1",
      "Crucial exam/conceptual takeaway 2"
    ]
  },
  "explorer": {
    "title": "Interactive Simulator / Experiment Title",
    "description": "What the student is testing or exploring",
    "variables": [
      {
        "id": "var1",
        "name": "Variable 1 Name",
        "min": 1,
        "max": 100,
        "step": 1,
        "defaultValue": 50,
        "unit": "unit",
        "description": "What this variable controls"
      },
      {
        "id": "var2",
        "name": "Variable 2 Name",
        "min": 1,
        "max": 100,
        "step": 1,
        "defaultValue": 50,
        "unit": "unit",
        "description": "What this variable controls"
      }
    ],
    "outcomeLabel": "Resulting Metric Name",
    "outcomeFormulaString": "Formula or relation representing the outcome"
  },
  "quiz": {
    "question": "A thought-provoking conceptual multiple-choice question testing true understanding (not rote memorization)",
    "options": [
      "Option A",
      "Option B",
      "Option C",
      "Option D"
    ],
    "correctIndex": 1,
    "explanation": "Clear pedagogical explanation why that option is correct and why others are wrong",
    "hint": "A helpful guidance hint without giving away the answer"
  },
  "suggestedQuestions": [
    "Thoughtful question 1 a student might ask",
    "Thoughtful question 2",
    "Thoughtful question 3"
  ],
  "scene3d": {
    "sceneType": "orbit | molecule | geometry | network | dna | globe | particles",
    "title": "Short title for 3D model",
    "description": "1 sentence describing the 3D spatial simulation",
    "elements": [
      { "name": "Element name", "description": "Element description", "color": "#34d399" }
    ]
  },
  "photoVisual": {
    "caption": "Photographic / realistic observation caption",
    "promptUsed": "Detailed photographic visual prompt description",
    "annotations": [
      { "label": "Key element", "description": "What to observe here", "x": 40, "y": 50 }
    ]
  }
}

Ensure the content is scientifically/historically accurate, perfectly adapted to ${targetGrade}, and has 4 to 6 diagram nodes. Each diagram node MUST have a real, descriptive scientific or historical name (e.g., 'Photon Absorption', 'Water Photolysis', 'ATP Synthesis', 'Calvin Cycle', 'Glucose Synthesis') - NEVER generic names like 'Node 1', 'Node 2', 'Step 1', or 'Concept A'. For the node colors, choose from 'emerald', 'amber', 'sky', 'violet', 'rose', 'teal'. Choose the scene3d sceneType carefully based on whether it is astronomy/physics ('orbit'), chemistry/biology ('molecule' or 'dna'), history/geography ('globe'), mathematics ('geometry'), or engineering/computing ('network').`;

    const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let text = '';
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });
        text = response.text || '';
        if (text) break;
      } catch (modelErr: any) {
        lastError = modelErr;
        console.warn(`[API /api/generate-lesson] Model ${modelName} returned status ${modelErr?.status || modelErr?.code || 'error'}, trying next candidate...`);
      }
    }

    if (text) {
      const cleanText = text.replace(/```json\s*|\s*```/g, '').trim();
      const parsed = JSON.parse(cleanText);
      // Save to pregenerated cache for future requests
      try {
        if (!fs.existsSync(PREGEN_DIR)) fs.mkdirSync(PREGEN_DIR, { recursive: true });
        const cacheFile = path.join(PREGEN_DIR, `${slugifyTopic(targetTopic)}.json`);
        if (!fs.existsSync(cacheFile)) {
          const cacheEntry = {
            topic: targetTopic, grade: targetGrade,
            slug: slugifyTopic(targetTopic),
            generatedAt: new Date().toISOString(),
            lessonData: parsed,
            diagrams: { '__main__': parsed.diagram },
            photoUrl: null,
          };
          fs.writeFileSync(cacheFile, JSON.stringify(cacheEntry, null, 2), 'utf8');
          console.log(`[API /api/generate-lesson] Saved new lesson to cache: ${slugifyTopic(targetTopic)}.json`);
        }
      } catch (cacheErr: any) {
        console.warn('[API /api/generate-lesson] Cache save failed (non-fatal):', cacheErr.message);
      }
      return res.json({ success: true, data: parsed, source: 'gemini' });
    }

    console.warn('[API /api/generate-lesson] Models temporarily unavailable. Serving intelligent curriculum generator data.');
    const fallbackData = createDynamicLesson(targetTopic, targetGrade);
    return res.json({ success: true, data: fallbackData, source: 'intelligent-curriculum-engine' });
  } catch (err: any) {
    console.error('[API /api/generate-lesson] Error in lesson generation pipeline:', err?.message || err);
    const fallbackData = createDynamicLesson(targetTopic, targetGrade);
    return res.status(200).json({
      success: true,
      data: fallbackData,
      source: 'intelligent-curriculum-engine',
    });
  }
});

// Real-time Diagram Update Endpoint — generates ONLY a fresh 2D diagram for the current teaching focus.
// Called by the update_diagram tool during a live voice session to update nodes without reloading the full lesson.
app.post('/api/update-diagram', async (req, res) => {
  const { topic, grade, focus } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'No API key' });

  // ── Cache-first: serve pre-generated diagram variant if available ─────────
  const cachedPregen = loadPregen(topic);
  if (cachedPregen?.diagrams) {
    const focusSlug = slugifyTopic(focus || topic);
    const cachedDiagram =
      cachedPregen.diagrams[focusSlug] ||
      cachedPregen.diagrams['__main__'] ||
      cachedPregen.lessonData?.diagram;
    if (cachedDiagram) {
      console.log(`[API /api/update-diagram] Cache HIT for "${topic}" focus="${focus || topic}" — serving pregenerated diagram`);
      return res.json({ success: true, diagram: cachedDiagram, source: 'pregenerated-cache' });
    }
  }
  console.log(`[API /api/update-diagram] Cache MISS for "${topic}" — calling Gemini`);

  const prompt = `You are an expert pedagogical diagram designer. Generate a concise 2D concept diagram specifically focused on: "${focus || topic}" for a student in "${grade || 'Secondary 2'}".

Return ONLY valid JSON matching this exact schema (no markdown fences):
{
  "diagramType": "flow",
  "title": "Concise title for this diagram view",
  "description": "One sentence explaining what this diagram shows",
  "nodes": [
    {
      "id": "node-1",
      "label": "Real descriptive name (e.g. 'Hypotenuse', 'Right Angle Vertex') — NEVER 'Node 1'",
      "sublabel": "Key formula, location, or subtitle",
      "category": "Classification label",
      "color": "emerald",
      "details": "1-2 clear sentences explaining this concept node"
    }
  ],
  "connections": [
    { "from": "Source Node Label", "to": "Target Node Label", "label": "relationship" }
  ]
}

Rules:
- 3 to 5 nodes maximum (optimised for screen space)
- Node colors from: emerald, amber, sky, violet, rose, teal
- Every node must have a real descriptive label — NEVER generic names
- Focus specifically on: "${focus || topic}"`;

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { headers: { 'User-Agent': 'aistudio-build' } } });
    let text = '';
    for (const modelName of ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest']) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });
        text = response.text || '';
        if (text) {
          console.log(`[API /api/update-diagram] Generated with ${modelName} for topic: "${focus || topic}"`);
          break;
        }
      } catch (modelErr: any) {
        console.warn(`[API /api/update-diagram] ${modelName} failed: ${modelErr?.message || modelErr?.status || 'unknown'}`);
        continue;
      }
    }
    if (text) {
      const cleanText = text.replace(/```json\s*|\s*```/g, '').trim();
      const diagram = JSON.parse(cleanText);
      return res.json({ success: true, diagram, source: 'gemini' });
    }
    // All AI models unavailable — serve topic-specific static fallback diagram
    console.warn(`[API /api/update-diagram] All models unavailable. Serving static fallback diagram for: "${topic}"`);
    const fallbackLesson = createDynamicLesson(topic, grade || 'Secondary 2');
    return res.json({ success: true, diagram: fallbackLesson.diagram, source: 'static-fallback' });
  } catch (err: any) {
    console.error('[API /api/update-diagram] Error:', err?.message);
    // Even on unexpected error, return a usable diagram rather than 500
    try {
      const fallbackLesson = createDynamicLesson(topic, grade || 'Secondary 2');
      return res.json({ success: true, diagram: fallbackLesson.diagram, source: 'static-fallback' });
    } catch {
      return res.status(500).json({ error: 'Diagram generation failed' });
    }
  }
});

// Real-time AI Image Generation Endpoint for Photos & Realistic Visuals
app.post('/api/generate-image', async (req, res) => {
  const { prompt: userPrompt, topic } = req.body || {};
  const imagePrompt =
    userPrompt ||
    `A high-resolution, photorealistic, scientific educational photo depicting ${topic || 'science subject'}, sharp focus, authentic natural lighting, realistic textures, macro/telephoto lens, no text overlays, cinematic clarity`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.json({
      success: true,
      imageUrl: `https://picsum.photos/seed/${encodeURIComponent(String(topic || 'education').toLowerCase())}/1280/720`,
      caption: `Visual Representation of ${topic || 'Topic'}`,
      promptUsed: imagePrompt,
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });

    // Try nano banana image generation with candidate models
    const imageCandidateModels = ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image'];
    let foundBase64: string | null = null;

    for (const imgModel of imageCandidateModels) {
      try {
        const imgResponse = await ai.models.generateContent({
          model: imgModel,
          contents: {
            parts: [{ text: imagePrompt }],
          },
          config: {
            imageConfig: {
              aspectRatio: '16:9',
            },
          },
        });

        const parts = imgResponse.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            foundBase64 = part.inlineData.data;
            break;
          }
        }
        if (foundBase64) break;
      } catch (imgErr: any) {
        console.warn(`[API /api/generate-image] Model ${imgModel} returned error, trying next candidate...`, imgErr?.message);
      }
    }

    if (foundBase64) {
      return res.json({
        success: true,
        imageUrl: `data:image/png;base64,${foundBase64}`,
        caption: `AI Generated Real-Time Photographic Study: ${topic || 'Subject'}`,
        promptUsed: imagePrompt,
      });
    }

    // If no inlineData returned, provide high-quality fallback
    return res.json({
      success: true,
      imageUrl: `https://picsum.photos/seed/${encodeURIComponent(String(topic || 'education').toLowerCase())}/1280/720`,
      caption: `Visual Study: ${topic || 'Topic'}`,
      promptUsed: imagePrompt,
    });
  } catch (err: any) {
    console.error('[API /api/generate-image] Image generation failed, using fallback:', err?.message);
    return res.json({
      success: true,
      imageUrl: `https://picsum.photos/seed/${encodeURIComponent(String(topic || 'education').toLowerCase())}/1280/720`,
      caption: `Visual Study: ${topic || 'Topic'}`,
      promptUsed: imagePrompt,
    });
  }
});

// Generalized Tools for Gemini Live Interactive Voice Session
// Voice tools — restored verbatim from pythagoras-tutor-old (21 Sep).
const dynamicFunctionDeclarations = [
  {
    name: 'update_chalkboard_notes',
    description: 'Writes or updates lecture notes, definitions, formulas, or bullet points on the digital chalkboard.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Title of the notes section' },
        bulletPoints: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Key bullet points or steps to write on the board',
        },
        coreRuleOrFormula: {
          type: Type.STRING,
          description: 'Optional core governing formula, law, or golden rule to highlight in golden chalk',
        },
      },
      required: ['bulletPoints'],
    },
  },
  {
    name: 'write_live_note',
    description: 'Appends an instant chalk bullet note to the board while actively explaining a specific detail.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        note: { type: Type.STRING, description: 'The exact short note or insight to write' },
      },
      required: ['note'],
    },
  },
  {
    name: 'switch_board_view',
    description:
      'Switches the digital blackboard view to focus the student on a specific visual mode requested by them or decided by you. Modes: 2d (schematic / concept diagram), 3d (interactive 3D spatial model), photo (photorealistic image / scientific camera visual), chalkboard (lecture notes), explorer (simulation sandbox), quiz (question).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tab: {
          type: Type.STRING,
          enum: ['2d', '3d', 'photo', 'chalkboard', 'explorer', 'quiz'],
          description: 'The visual blackboard view tab to display',
        },
      },
      required: ['tab'],
    },
  },
  {
    name: 'generate_photo_visual',
    description: 'Generates a new photorealistic image or visual study on the blackboard when requested by the student.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: { type: Type.STRING, description: 'Detailed prompt for the realistic photo or visual' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'set_topic',
    description: 'Switches or changes the learning topic on the fly to a new topic requested by the student.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, description: 'The new topic to teach on the fly' },
        grade: { type: Type.STRING, description: 'Optional grade level' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'highlight_concept',
    description: 'Highlights a specific concept node or term on the blackboard to draw student attention.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        nodeIdOrName: { type: Type.STRING, description: 'The node ID or title to highlight' },
      },
      required: ['nodeIdOrName'],
    },
  },
  {
    name: 'pose_quiz',
    description: 'Presents an interactive concept check question on the blackboard for the student to solve.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        question: { type: Type.STRING, description: 'The challenge question' },
        options: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Four multiple choice options',
        },
        correctIndex: { type: Type.NUMBER, description: '0-indexed correct option' },
        explanation: { type: Type.STRING, description: 'Why this answer is correct' },
      },
      required: ['question', 'options', 'correctIndex', 'explanation'],
    },
  },
];


// ═══════════════════════════════════════════════════════════════
// Any curriculum — looks up an uploaded textbook curriculum by id.
function curriculumFor(subjectId: string) {
  return getCurriculum(subjectId);
}

// MULTER for PDF uploads
// ═══════════════════════════════════════════════════════════════
// Streams to a temp file instead of memory: a scanned textbook is 100+ MB.
const UPLOAD_DIR = path.join(os.tmpdir(), 'pt-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 500 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(new Error(`"${file.originalname}" is not a PDF`));
  },
});

// GET /api/curricula — list all curricula (normalised for frontend)
app.get('/api/curricula', (_req, res) => {
  const all = listCurricula();
  // Return a lightweight version suitable for the subject selector
  const normalised = all.map(c => ({
    subjectId: c.id,
    label: c.label,
    grade: c.grade,
    source: c.source,
    conceptCount: c.concepts.length,
    concepts: c.concepts.map(con => ({
      id: con.id,
      label: con.label,
      typicalTeachingOrder: con.typicalTeachingOrder,
      prerequisites: con.prerequisites || [],
      chapter: con.chapter || null,
    })),
  }));
  res.json({ curricula: normalised });
});

// POST /api/curriculum/upload — one or more PDFs → background job.
// Accepts the new 'pdfs' field (multiple) and the old single 'pdf' field.
app.post('/api/curriculum/upload',
  upload.fields([{ name: 'pdfs', maxCount: 10 }, { name: 'pdf', maxCount: 1 }]),
  (req: any, res: any) => {
    const files: any[] = [...(req.files?.pdfs || []), ...(req.files?.pdf || [])];
    const cleanup = () => files.forEach(f => fs.promises.unlink(f.path).catch(() => {}));
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { cleanup(); return res.status(500).json({ error: 'GEMINI_API_KEY not set on the server' }); }
    if (!files.length) return res.status(400).json({ error: 'No PDF received' });
    const subjectLabel = String(req.body.subjectLabel || '').trim();
    const grade = String(req.body.grade || '').trim();
    // Derived from the subject name, so Book 2A and Book 2B land in the same subject.
    const subjectId = String(req.body.subjectId || subjectLabel).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!subjectLabel || !grade || !subjectId) { cleanup(); return res.status(400).json({ error: 'Subject name and grade are required' }); }

    const job = startIngestJob({
      apiKey, subjectId, subjectLabel, grade,
      files: files.map(f => ({ path: f.path, originalName: f.originalname })),
    });
    res.json({ success: true, jobId: job.id, subjectId });
  });

// GET /api/curriculum/jobs/:id — progress of an ingestion job.
app.get('/api/curriculum/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return (res as any).status(404).json({ error: 'Unknown job (the server may have restarted)' });
  res.json({ job });
});

// Errors on /api routes are always JSON. Without this, an oversized upload
// returned Express's HTML error page and the browser failed on "<!DOCTYPE".
app.use('/api', (err: any, _req: any, res: any, _next: any) => {
  const tooBig = err?.code === 'LIMIT_FILE_SIZE';
  const tooMany = err?.code === 'LIMIT_FILE_COUNT';
  res.status(tooBig ? 413 : 400).json({
    error: tooBig ? 'That file is over 500 MB.'
      : tooMany ? 'Upload at most 10 PDFs at a time.'
      : String(err?.message || 'Upload failed'),
  });
});

// ─── Learner endpoints ──────────────────────────────────────────
// On Cloud Run, prefer Firestore so profiles survive instance restarts and
// stay in sync with the earlier Functions-backed hosting deploy.
function useFirestoreLearners() {
  return process.env.USE_FIRESTORE_LEARNERS === 'true' || Boolean(process.env.K_SERVICE);
}

app.get('/api/learners', async (_req, res) => {
  try {
    if (useFirestoreLearners() && admin.apps.length) {
      const snap = await admin.firestore().collection('learners').get();
      const learners = snap.docs
        .map((d) => d.data())
        .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return res.json({ learners });
    }
    res.json({ learners: listLearners() });
  } catch (err: any) {
    console.error('[API /api/learners]', err);
    res.status(500).json({ error: err?.message || 'Failed to list learners' });
  }
});
app.get('/api/learners/:studentId', async (req, res) => {
  try {
    if (useFirestoreLearners() && admin.apps.length) {
      const doc = await admin.firestore().collection('learners').doc(req.params.studentId).get();
      if (!doc.exists) return (res as any).status(404).json({ error: 'Not found' });
      return res.json({ learner: doc.data() });
    }
    const l = getLearner(req.params.studentId);
    if (!l) return (res as any).status(404).json({ error: 'Not found' });
    res.json({ learner: l });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load learner' });
  }
});
app.post('/api/learners', async (req, res) => {
  try {
    const { studentId, name, grade } = req.body;
    if (!studentId || !name || !grade)
      return (res as any).status(400).json({ error: 'studentId, name, grade required' });

    if (useFirestoreLearners() && admin.apps.length) {
      const ref = admin.firestore().collection('learners').doc(String(studentId));
      const existing = await ref.get();
      const learner = existing.exists
        ? { ...(existing.data() as any), name: String(name), grade: String(grade), updatedAt: Date.now() }
        : {
            studentId: String(studentId),
            name: String(name),
            grade: String(grade),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            subjects: {},
            globalInsights: [],
          };
      await ref.set(learner, { merge: true });
      return res.json({ learner });
    }

    res.json({ learner: getOrCreateLearner(studentId, name, grade) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to create learner' });
  }
});

// ─── Adaptive session endpoints ─────────────────────────────────
app.post('/api/session/start', (req, res) => {
  const { studentId, name, grade, subjectId } = req.body;
  if (!studentId || !subjectId)
    return (res as any).status(400).json({ error: 'studentId and subjectId required' });
  const learner = getOrCreateLearner(studentId, name || 'Student', grade || 'Secondary 2 (Grade 8)');
  const curriculum = getCurriculum(subjectId);
  if (!curriculum) return (res as any).status(404).json({ error: 'Curriculum not found' });
  ensureSubject(studentId, subjectId, curriculum.label, curriculum.grade, curriculum.source);

  const masteredIds = Object.values(learner.subjects[subjectId]?.conceptStates || {})
    .filter(cs => cs.masteryScore >= 75).map(cs => cs.conceptId);
  const nextConcept = nextUnmasteredConcept(curriculum, masteredIds) || curriculum.concepts[0];
  ensureConceptState(studentId, subjectId, nextConcept.id, nextConcept.label);

  const sessionId = `session_${Date.now()}_${studentId}`;
  const session: AdaptiveSessionState = {
    sessionId, studentId, subjectId,
    currentConceptId: nextConcept.id,
    currentStrategy: 'direct_explanation',
    sessionStarted: Date.now(),
    interactionCount: 0,
    recentAttempts: [],
  };
  startSession(session);
  res.json({
    sessionId, learner, currentConcept: nextConcept,
    conceptState: getConceptState(studentId, subjectId, nextConcept.id),
    strategy: 'direct_explanation',
  });
});

app.get('/api/session/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return (res as any).status(404).json({ error: 'Session not found' });
  const learner = getLearner(session.studentId);
  const curriculum = getCurriculum(session.subjectId);
  const concept = curriculum?.concepts.find(c => c.id === session.currentConceptId);
  const conceptState = getConceptState(session.studentId, session.subjectId, session.currentConceptId);
  res.json({ session, learner, currentConcept: concept, conceptState });
});

app.post('/api/session/:sessionId/assess', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return (res as any).status(500).json({ error: 'No API key' });
  const session = getSession(req.params.sessionId);
  if (!session) return (res as any).status(404).json({ error: 'Session not found' });

  const { questionSummary, studentAnswer, correctAnswer, selectedOptionIndex, correctOptionIndex } = req.body;
  const isCorrect = selectedOptionIndex === correctOptionIndex;

  const curriculum = getCurriculum(session.subjectId);
  const concept = curriculum?.concepts.find(c => c.id === session.currentConceptId);
  if (!concept) return (res as any).status(404).json({ error: 'Concept not found' });
  const conceptState = getConceptState(session.studentId, session.subjectId, concept.id);
  if (!conceptState) return (res as any).status(404).json({ error: 'Concept state not found' });

  const assessment = await assessUnderstanding({
    concept, questionAsked: questionSummary, studentAnswer,
    correctAnswer, isCorrect, selectedOptionIndex, conceptState, apiKey,
  });

  const attempt = {
    timestamp: Date.now(), questionSummary, conceptTag: concept.id,
    selectedOption: selectedOptionIndex, correctOption: correctOptionIndex,
    isCorrect, understandingDepth: assessment.understandingDepth,
    misconceptionDetected: assessment.misconceptionDescription,
    strategyUsed: session.currentStrategy as TeachingStrategy,
    teachingNote: assessment.teachingNote,
  };
  recordAttempt(session.studentId, session.subjectId, concept.id, attempt, assessment);

  const nextStrategy = selectNextStrategy(conceptState, assessment);
  let nextConceptId = session.currentConceptId;
  let advancedToConcept = null;

  if (['advance','praise_and_continue'].includes(assessment.recommendedAction)) {
    const updated = getConceptState(session.studentId, session.subjectId, concept.id);
    if ((updated?.masteryScore || 0) >= 75) {
      const masteredIds = Object.values(
        getLearner(session.studentId)?.subjects?.[session.subjectId]?.conceptStates || {}
      ).filter(cs => cs.masteryScore >= 75).map(cs => cs.conceptId);
      const next = curriculum ? nextUnmasteredConcept(curriculum, masteredIds) : undefined;
      if (next && next.id !== session.currentConceptId) {
        nextConceptId = next.id; advancedToConcept = next;
        ensureConceptState(session.studentId, session.subjectId, next.id, next.label);
      }
    }
  }

  updateSession(session.sessionId, {
    currentConceptId: nextConceptId, currentStrategy: nextStrategy,
    interactionCount: session.interactionCount + 1,
    recentAttempts: [...session.recentAttempts.slice(-4), attempt],
    pendingStrategySwitch: assessment.recommendedAction === 'switch_strategy' ? nextStrategy : undefined,
    switchReason: assessment.recommendedAction === 'switch_strategy' ? assessment.teachingNote : undefined,
  });

  res.json({
    assessment, nextStrategy, advancedToConcept,
    updatedConceptState: getConceptState(session.studentId, session.subjectId, nextConceptId),
    learner: getLearner(session.studentId),
    session: getSession(session.sessionId),
  });
});

app.post('/api/session/:sessionId/end', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) { res.json({ ok: true }); return; }
  const durationMins = Math.round((Date.now() - session.sessionStarted) / 60000);
  incrementSessionCount(session.studentId, session.subjectId, durationMins);
  endSession(session.sessionId);
  res.json({ ok: true, durationMinutes: durationMins });
});

// GET learner context for voice tutor system prompt
app.get('/api/learner-context/:studentId/:subjectId', (req, res) => {
  const { studentId, subjectId } = req.params;
  const learner = getLearner(studentId);
  if (!learner) return (res as any).status(404).json({ error: 'Learner not found' });
  const subject = learner.subjects[subjectId];
  if (!subject) return res.json({ context: 'No prior learning history for this subject.' });

  const conceptSummaries = Object.values(subject.conceptStates)
    .sort((a, b) => b.lastVisited - a.lastVisited).slice(0, 10)
    .map(cs => {
      const lines = [`- ${cs.label}: mastery ${cs.masteryScore}/100 (${cs.masteryLevel})`];
      if (cs.confirmedMisconceptions.length)
        lines.push(`  CONFIRMED MISCONCEPTIONS: ${cs.confirmedMisconceptions.join('; ')}`);
      if (cs.effectiveStrategies.length)
        lines.push(`  EFFECTIVE STRATEGIES: ${cs.effectiveStrategies.join(', ')}`);
      if (cs.ineffectiveStrategies.length)
        lines.push(`  DID NOT HELP: ${cs.ineffectiveStrategies.join(', ')}`);
      return lines.join('\n');
    }).join('\n');

  const context = `LEARNER: ${learner.name} (${learner.grade})\nSessions: ${subject.sessionCount}, Minutes: ${subject.totalMinutes}\n\nCONCEPT MASTERY:\n${conceptSummaries || 'None yet'}\n\nINSIGHTS: ${learner.globalInsights.slice(-3).join(' | ') || 'None yet'}`;
  res.json({ context });
});

// ─── Voice session log ────────────────────────────────────────
// One file per session in logs/. Timings, tool calls, closes and what was said,
// so a "the tutor went quiet" report can be diagnosed from evidence.
// Local development only; the folder is git-ignored.
function openVoiceLog(topic: string) {
  const dir = path.join(process.cwd(), 'logs');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(dir, `voice-${stamp}.log`);
  const t0 = Date.now();
  // Buffered stream: a synchronous write per event would stall the same
  // event loop that relays audio between the browser and Gemini.
  const stream = fs.createWriteStream(file, { flags: 'a' });
  stream.on('error', () => {});
  const write = (line: string) => { stream.write(line + '\n'); };
  write(`# voice session ${new Date().toISOString()} topic="${topic}"`);
  return (event: string, data?: Record<string, any>) => {
    const t = ((Date.now() - t0) / 1000).toFixed(2).padStart(8);
    const body = data ? ' ' + JSON.stringify(data).slice(0, 400) : '';
    write(`${t}s  ${event}${body}`);
    if (!/^(tutor_said|child_said)$/.test(event)) console.log(`[voice] ${event}${body.slice(0, 160)}`);
  };
}

// WebSocket Server for Live API audio and events
const wss = new WebSocketServer({ noServer: true });
wss.on('error', (err) => {
  console.error('[WSS] Server error:', err.message);
});

// Only claim /ws/live. Leave every other upgrade alone so Vite HMR can
// handle its own WebSocket — stealing those connections causes a flood of
// "Invalid WebSocket frame: invalid status code" errors in the terminal.
server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname !== '/ws/live') return;
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } catch (upgradeErr) {
    console.warn('[Server] WebSocket upgrade error:', upgradeErr);
    try {
      socket.destroy();
    } catch (_) {}
  }
});

// Live transcripts arrive as `inputTranscription` / `outputTranscription`
// (@google/genai 2.x). They are forwarded as whole-turn subtitles and fed to
// the learner observer. Tool calls are logged as board events for context.
function observeMessage(message: LiveServerMessage, observer: LiveObserver | null, clientWs: WebSocket) {
  if (!observer) return;
  const sc: any = message.serverContent;
  const childText = sc?.inputTranscription?.text;
  const tutorText = sc?.outputTranscription?.text;
  if (childText) {
    observer.add('child', childText);
    clientWs.send(JSON.stringify({ type: 'input_transcript', text: observer.currentText('child') }));
  }
  if (tutorText) {
    observer.add('tutor', tutorText);
    clientWs.send(JSON.stringify({ type: 'output_transcript', text: observer.currentText('tutor') }));
  }
  for (const call of message.toolCall?.functionCalls || []) {
    const a: any = call.args || {};
    const detail = [a.title, a.note, a.text, a.question, a.topic, a.concept, a.tab,
      Array.isArray(a.bulletPoints) ? a.bulletPoints.join(' | ') : ''].filter(Boolean).join(' — ');
    observer.add('board', `${call.name}${detail ? ': ' + String(detail).slice(0, 300) : ''}`);
  }
  if (sc?.interrupted) observer.boundary();
  if (sc?.turnComplete) observer.exchangeDone();
}

wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
  // Parse query parameters for topic, grade, subjectId and conceptId
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const topic = url.searchParams.get('topic') || 'the requested subject';
  const grade = url.searchParams.get('grade') || 'the student level';
  const subjectId = url.searchParams.get('subjectId') || '';
  const conceptId = url.searchParams.get('conceptId') || '';

  // Build curriculum intelligence context if we have a subject and concept
  const curriculumCtx = (subjectId && conceptId)
    ? buildCurriculumIntelligenceContext(subjectId, conceptId)
    : null;

  if (curriculumCtx) {
    console.log(`[WebSocket] Curriculum intelligence loaded for ${subjectId}/${conceptId}`);
  }
  console.log(`[WebSocket] Live session started for Topic: "${topic}", Grade: "${grade}"`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('[WebSocket] GEMINI_API_KEY is missing');
    clientWs.send(
      JSON.stringify({
        type: 'error',
        code: 'API_KEY_MISSING',
        message: 'GEMINI_API_KEY is required for live voice interaction. Please configure it in AI Studio settings.',
      })
    );
    clientWs.close();
    return;
  }

  let liveSession: any = null;
  let observer: LiveObserver | null = null;
  let isClosed = false;

  const dynamicSystemInstruction = `You are "Dr. Marcus Vance", an inspiring, warm, and brilliant Senior Educator and AI Tutor teaching a student in ${grade} on the topic of "${topic}". You speak in a clear, encouraging, friendly mentor voice with genuine passion for learning.

PEDAGOGICAL RULES & REAL-TIME BLACKBOARD INTERACTION:
1. You have an interactive real-time digital blackboard right next to you that updates dynamically.
2. ON-THE-FLY VISUAL MODES: The student may ask you at any moment to view concepts in:
   - "2d" (2D interactive schematic / concept diagram): call switch_board_view with tab: '2d'
   - "3d" (interactive 3D spatial simulation / orbit / molecular / geometric model): call switch_board_view with tab: '3d'
   - "photo" / "picture" / "camera" (photorealistic observational visual): call switch_board_view with tab: 'photo' or call generate_photo_visual with a detailed prompt!
   - "notes" / "formulas" / "chalkboard": call switch_board_view with tab: 'chalkboard'
   - "simulator" / "experiment": call switch_board_view with tab: 'explorer'
   - "quiz" / "test": call switch_board_view with tab: 'quiz' or pose_quiz
3. TOPIC SWITCHING: If the student asks to learn a different topic (e.g. "Teach me about black holes now"), enthusiastically call set_topic with the new topic and immediately welcome them to it!
4. LIVE CHALKBOARD NOTES:
   - Call "update_chalkboard_notes" or "write_live_note" to put notes on the chalkboard so the student can follow along visually.
   - Call "highlight_concept" when pointing to a specific part of the diagram or system.
5. Teach in concise, dialogue-driven conversational turns (1–3 sentences maximum). Never give long uninterrupted monologues.
6. Encourage the student warmly, praise good questions, and tailor your vocabulary directly to a student in ${grade}.
7. CHOOSE THE RIGHT VIEW AS YOU TEACH, and switch as the explanation moves on (switch_board_view):
   - 'photo' = a real-world situation (e.g. a ladder against a wall) — when introducing an idea or linking it to real life.
   - '2d' = the clean shape — when naming parts or reasoning about the figure.
   - '3d' = the spatial model — when depth or turning the shape helps.
   - 'chalkboard' = step-by-step working, calculations, rules and definitions. Whenever you work something out step by step, write it with update_chalkboard_notes (one step per bullet) — the board switches to the chalkboard by itself.
   - When you give the student a problem to solve, ALWAYS write the problem on the chalkboard first (update_chalkboard_notes, title "Your turn", the question as the first bullet), then ask it. As the student tells you their working, write each of their steps with write_live_note.
8. NEVER GO QUIET BEFORE A BOARD ACTION. Before update_chalkboard_notes, pose_quiz or generate_photo_visual, first say one short natural phrase out loud — e.g. "Let me write that on the board for you…" or "Let's work through it step by step…" — then call the tool, then carry on explaining.
9. NEVER REPEAT WHAT YOU JUST WROTE. After calling update_chalkboard_notes or write_live_note, do NOT read the bullet points aloud — the student can already see them on the board. Continue with the NEXT thought, a question, or a new explanation. Saying the same sentence twice — whether before and after a tool call, or in two consecutive turns — is always wrong.
10. ONE IDEA PER TURN. Each spoken turn must introduce exactly one new idea or question. If you catch yourself about to say something you said in the last turn, say something different instead.
${curriculumCtx ? '\n\n' + curriculumCtx.systemPromptBlock : ''}`.trimEnd();

  try {
    // Force Gemini Developer API for Live. With GOOGLE_GENAI_USE_ENTERPRISE /
    // GOOGLE_CLOUD_PROJECT set, the SDK otherwise routes AQ.* AI Studio keys to
    // Vertex and closes immediately with a misleading "Invalid resource" error.
    const ai = new GoogleGenAI({
      apiKey,
      vertexai: false,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });

    // ── Learner panel side-channel (additive; never touches the voice session) ──
    observer = new LiveObserver(topic, grade, apiKey, (snap) => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.send(JSON.stringify({ type: 'learner_update', snapshot: snap }));
    });
    clientWs.on('close', () => observer?.close());

    const liveModel = process.env.LIVE_MODEL || 'gemini-3.8-live';
    liveSession = await ai.live.connect({
      model: liveModel,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: dynamicSystemInstruction,
        tools: [{ functionDeclarations: dynamicFunctionDeclarations }],
      },
      callbacks: {
        onopen: () => {
          console.log('[Gemini Live] Session connected', liveModel);
        },
        onmessage: (message: LiveServerMessage) => {
          if (isClosed || clientWs.readyState !== WebSocket.OPEN) return;

          // 1. Audio chunks from model
          const modelParts = message.serverContent?.modelTurn?.parts;
          if (modelParts && Array.isArray(modelParts)) {
            for (const part of modelParts) {
              if (part.inlineData?.data) {
                clientWs.send(
                  JSON.stringify({
                    type: 'audio_out',
                    data: part.inlineData.data,
                  })
                );
              }
              if (part.text) {
                clientWs.send(
                  JSON.stringify({
                    type: 'output_transcript',
                    text: part.text,
                  })
                );
              }
            }
          }

          // 2. Output and Input Transcriptions
          const outTrans = (message.serverContent as any)?.outputAudioTranscription?.text;
          if (outTrans) {
            clientWs.send(
              JSON.stringify({
                type: 'output_transcript',
                text: outTrans,
              })
            );
          }

          const inTrans = (message.serverContent as any)?.inputAudioTranscription?.text;
          if (inTrans) {
            clientWs.send(
              JSON.stringify({
                type: 'input_transcript',
                text: inTrans,
              })
            );
          }

          // 3. Barge-in / Interrupted
          if (message.serverContent?.interrupted) {
            clientWs.send(JSON.stringify({ type: 'interrupted' }));
          }

          // 4. Tool Calls
          const functionCalls = message.toolCall?.functionCalls;
          if (functionCalls && Array.isArray(functionCalls) && functionCalls.length > 0) {
            for (const call of functionCalls) {
              console.log(`[Tool Call] Executing: ${call.name}`, call.args);

              clientWs.send(
                JSON.stringify({
                  type: 'tool_call',
                  id: call.id,
                  name: call.name,
                  args: call.args || {},
                })
              );

              // Immediately respond with { result: "ok" } so tutor continues speaking
              try {
                if (liveSession) {
                  liveSession.sendToolResponse({
                    functionResponses: [
                      {
                        id: call.id,
                        name: call.name,
                        response: { result: 'ok' },
                      },
                    ],
                  });
                }
              } catch (respErr) {
                console.error('[Gemini Live] Error sending tool response:', respErr);
              }
            }
          }

          // 5. Learner panel side-channel — reads what already arrived, sends
          //    extra messages to the browser only. Cannot affect the voice.
          try { observeMessage(message, observer, clientWs); } catch (obsErr) {
            console.warn('[LiveObserver] ignored:', obsErr);
          }
        },
        onerror: (err: any) => {
          console.error('[Gemini Live] Session error:', err);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(
              JSON.stringify({
                type: 'error',
                code: 'LIVE_ERROR',
                message: err?.message || 'Gemini Live encountered an error',
              })
            );
          }
        },
        onclose: (ev: any) => {
          const reason = String(ev?.reason || '').trim();
          const code = ev?.code;
          console.log('[Gemini Live] Session closed', code, reason);
          if (clientWs.readyState === WebSocket.OPEN) {
            const credits = /credits? are depleted|prepayment|billing/i.test(reason);
            clientWs.send(
              JSON.stringify({
                type: 'error',
                code: credits ? 'CREDITS_DEPLETED' : 'LIVE_CLOSED',
                message: credits
                  ? 'Gemini Live credits are depleted. Top up billing at https://ai.studio/projects then retry voice.'
                  : reason || `Gemini Live closed (code ${code ?? 'unknown'})`,
              })
            );
            clientWs.send(JSON.stringify({ type: 'session_closed' }));
          }
        },
      },
    });

    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'session_ready' }));

      // Send initial turn welcoming the student to the topic
      try {
        liveSession.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [
                {
                  text: `The student has just entered the classroom to learn about "${topic}" at the ${grade} level. Greet them warmly as Dr. Marcus Vance, express excitement for exploring "${topic}", mention that you have prepared the digital blackboard, and ask what aspect they would like to explore first.`,
                },
              ],
            },
          ],
          turnComplete: true,
        });
      } catch (initErr) {
        console.error('[Gemini Live] Error sending initial turn:', initErr);
      }
    }
  } catch (err: any) {
    console.error('[WebSocket] Failed to initialize Gemini Live session:', err);
    clientWs.send(
      JSON.stringify({
        type: 'error',
        code: 'INITIALIZATION_FAILED',
        message: err?.message || 'Failed to start Live session',
      })
    );
    clientWs.close();
    return;
  }

  // Handle messages from client
  clientWs.on('message', (rawData) => {
    if (isClosed || !liveSession) return;

    try {
      const msg = JSON.parse(rawData.toString());

      if ((msg.type === 'audio' || msg.type === 'audio_in') && msg.data) {
        liveSession.sendRealtimeInput({
          audio: {
            data: msg.data,
            mimeType: 'audio/pcm;rate=16000',
          },
        });
      } else if (msg.type === 'text' && msg.text) {
        observer?.add('child', String(msg.text)); // side-channel only
        liveSession.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: msg.text }] }],
          turnComplete: true,
        });
      } else if (msg.type === 'tool_response') {
        console.log('[WebSocket] Tool execution confirmed:', msg.id);
      } else if (msg.type === 'close') {
        isClosed = true;
        clientWs.close();
      }
    } catch (parseErr) {
      console.error('[WebSocket] Failed to parse client message:', parseErr);
    }
  });

  clientWs.on('close', () => {
    isClosed = true;
    console.log('[WebSocket] Client disconnected');
    if (liveSession) {
      try {
        liveSession.close();
      } catch (closeErr) {
        console.error('[Gemini Live] Error closing session:', closeErr);
      }
    }
  });
});

async function startServer() {
  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    // Run HMR on its own port so it never shares the Live API upgrade path.
    const hmrPort = Number(process.env.HMR_PORT) || (PORT + 10000);
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { port: hmrPort, clientPort: hmrPort },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] AI Tutor backend running on http://localhost:${PORT}`);
  });
}

startServer();
