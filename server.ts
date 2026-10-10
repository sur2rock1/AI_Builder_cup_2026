import express from 'express';
import http from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { LiveObserver } from './src/adaptive/liveObserver';
import { GoogleGenAI, Modality, Type, LiveServerMessage } from '@google/genai';
import { studioAi } from './src/live/studioAi';
import { topicFallbackImage, isJunkFallbackUrl, lessonClipFor, regionFor } from './src/curriculum/topicVisual';
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
import {
  VoiceMode, liveConfigFor, classicSystemInstruction, adaptiveSystemInstruction,
  classicKickoff, adaptiveKickoff, CLASSIC_CROSS_CHECK,
} from './src/live/liveConfig';
import {
  CaptionBuffer, ensureLiveSession, persistCaptionTurns, endLiveSession,
  listSessionsForLearner, listTurns, getSession as getCaptionSession, recordShownMedia, lastLessonRecap,
} from './src/live/sessionCaptions';
import { nextUnmasteredConcept, renameCurriculum } from './src/curriculum/ingest';
import { getJob, publicJob } from './src/curriculum/extractShared';
import { startSourceIngestJob } from './src/curriculum/sourceIngest';
import { confirmAndGenerate } from './src/curriculum/programGenerate';
import { ensureExampleProgram, getProgramCurriculum, getSharedProgram, listEnrollments, listProgramsForLearner, listSharedCurricula, loadSharedProgram, writeSharedCurriculum, enrollLearner } from './src/curriculum/programStore';
import { boardPackFor } from './src/curriculum/boardPack';
import { classifyFile } from './src/curriculum/sourceExtract';
import os from 'os';
import fs from 'fs';
import net from 'net';
import { AdaptiveSessionState, TeachingStrategy, CurriculumConcept } from './src/adaptive/learnerModel';
import { initFirebaseAdmin, admin } from './src/firebase/admin';


dotenv.config();
initFirebaseAdmin();

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      fallback: true,
      message: 'Using local generator fallback (GEMINI_API_KEY not set)',
    });
  }

  try {
    const ai = studioAi(apiKey);

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
    const ai = studioAi(apiKey);
    let text = '';
    for (const modelName of ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest']) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });
        text = response.text || '';
        if (text) break;
      } catch (_) { continue; }
    }
    if (!text) return res.status(500).json({ error: 'Diagram generation failed' });
    const cleanText = text.replace(/```json\s*|\s*```/g, '').trim();
    const diagram = JSON.parse(cleanText);
    return res.json({ success: true, diagram });
  } catch (err: any) {
    console.error('[API /api/update-diagram] Error:', err?.message);
    return res.status(500).json({ error: 'Diagram generation failed' });
  }
});

async function generateLessonImage(topic: string, userPrompt?: string): Promise<{ imageUrl: string; promptUsed: string; generated: boolean }> {
  const imagePrompt =
    userPrompt ||
    `Photorealistic educational photo of ${topic}, a child would recognise this, sharp focus, natural light, no text overlay`;
  const fallback = topicFallbackImage(topic, imagePrompt);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { imageUrl: fallback, promptUsed: imagePrompt, generated: false };

  try {
    const ai = studioAi(apiKey);
    const imageCandidateModels = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image'];
    for (const imgModel of imageCandidateModels) {
      try {
        const imgResponse = await ai.models.generateContent({
          model: imgModel,
          contents: { parts: [{ text: imagePrompt }] },
          config: { imageConfig: { aspectRatio: '16:9' } },
        });
        const parts = imgResponse.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            return {
              imageUrl: `data:image/png;base64,${part.inlineData.data}`,
              promptUsed: imagePrompt,
              generated: true,
            };
          }
        }
      } catch (imgErr: any) {
        console.warn(`[generate-image] ${imgModel} failed:`, imgErr?.message);
      }
    }
  } catch (err: any) {
    console.warn('[generate-image] pipeline failed:', err?.message);
  }
  return { imageUrl: fallback, promptUsed: imagePrompt, generated: false };
}

app.post('/api/generate-image', async (req, res) => {
  const { prompt: userPrompt, topic, sessionId } = req.body || {};
  const result = await generateLessonImage(String(topic || 'science'), userPrompt);
  if (sessionId && !isJunkFallbackUrl(result.imageUrl)) {
    void recordShownMedia(String(sessionId), {
      kind: 'image',
      title: result.generated ? 'Generated picture' : 'Topic picture',
      prompt: result.promptUsed.slice(0, 400),
      ...(result.imageUrl.startsWith('http') ? { url: result.imageUrl } : {}),
    }).catch(() => {});
  }
  res.json({
    success: true,
    imageUrl: result.imageUrl,
    caption: result.generated ? `Picture: ${topic || 'lesson'}` : `Picture of ${topic || 'this idea'}`,
    promptUsed: result.promptUsed,
    generated: result.generated,
  });
});

// Generalized Tools for Gemini Live Interactive Voice Session
// Voice tools — restored verbatim from pythagoras-tutor-old (21 Sep).
const dynamicFunctionDeclarations = [
  {
    name: 'update_chalkboard_notes',
    description: 'Writes notes on the RIGHT of the lesson canvas. The picture on the left stays visible. Do NOT call switch_board_view after this.',
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
    description: 'Adds one short note beside the current picture. Do NOT call switch_board_view — notes and picture share the same canvas.',
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
      'RARE. The canvas already shows the picture AND the notes together. Do NOT call this with photo, chalkboard, 2d, video, or quiz — that hides the picture. Only use tab "3d" for a geometry model.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tab: {
          type: Type.STRING,
          enum: ['2d', '3d', 'photo', 'chalkboard', 'explorer', 'quiz', 'video'],
          description: 'The visual blackboard view tab to display',
        },
      },
      required: ['tab'],
    },
  },
  {
    name: 'generate_photo_visual',
    description: 'Adds a new picture to the left-hand series on the canvas (leaf, stomata, roots…). Notes stay on the right. Do NOT also call switch_board_view.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: { type: Type.STRING, description: 'Detailed prompt for the realistic photo or visual' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_video_visual',
    description: 'Play a short clip over the left picture. Do NOT call switch_board_view. Use when the child asks for a video, or when a moving story (sap rising, stomata opening) helps more than a still.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: { type: Type.STRING, description: 'What the clip should show, in child language' },
        title: { type: Type.STRING, description: 'Short title for the clip' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'focus_visual_region',
    description: 'Zoom and ring a part of the current picture while you explain (stomata, veins, roots, chlorophyll).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        label: { type: Type.STRING, description: 'What to name the zoom, e.g. Tiny doors for air' },
        x: { type: Type.NUMBER, description: 'Optional 0-100 x percent' },
        y: { type: Type.NUMBER, description: 'Optional 0-100 y percent' },
        zoom: { type: Type.NUMBER, description: 'Optional zoom 1.2-3' },
      },
      required: ['label'],
    },
  },
  {
    name: 'control_video',
    description: 'Play, pause, or step the clip if the child interrupts.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ['play', 'pause', 'next'] },
      },
      required: ['action'],
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
// Any subject — graph comes from that learner's Firestore program (seed file is fallback only).
function curriculumFor(subjectId: string) {
  return getProgramCurriculum(subjectId);
}

// MULTER for curriculum sources (PDF, EPUB, images, notes, audio…)
// ═══════════════════════════════════════════════════════════════
// Streams to a temp file instead of memory: a scanned textbook is 100+ MB.
const UPLOAD_DIR = path.join(os.tmpdir(), 'pt-uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 500 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ok = !!classifyFile(file.originalname, file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error(`"${file.originalname}" is not a supported source`));
  },
});

// GET /api/curricula — shared catalog (curricula/*) plus this household's enrollments.
app.get('/api/curricula', async (req, res) => {
  let extra: ReturnType<typeof getProgramCurriculum>[] = [];
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token && admin.apps.length) {
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      const role = await accountRole(decoded.uid);
      const household = role === 'parent' ? listLearners(decoded.uid, true) : listLearners(decoded.uid, false);
      await Promise.all(household.map(l => ensureExampleProgram(l.studentId, l.grade)));
      const householdPrograms = (await Promise.all(household.map(l => listProgramsForLearner(l.studentId)))).flat();
      await Promise.all(householdPrograms.map(p => writeSharedCurriculum(p)));
      const shared = await listSharedCurricula();
      extra = [...shared, ...householdPrograms].map(p => p.curriculum).filter(Boolean);
      const enrolledIds = new Set<string>();
      for (const l of household) {
        (await listEnrollments(l.studentId)).forEach(id => enrolledIds.add(id));
      }
      householdPrograms.forEach(p => { if (p.curriculum?.id) enrolledIds.add(p.curriculum.id); });
      (req as any)._enrolledIds = [...enrolledIds];
    } catch { /* empty list if token is bad */ }
  }
  const seen = new Set<string>();
  const unique = extra.flatMap(c => {
    if (!c?.id || seen.has(c.id)) return [];
    seen.add(c.id);
    return [c];
  });
  const normalised = unique.map(c => ({
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
  res.json({ curricula: normalised, enrolledIds: (req as any)._enrolledIds || [] });
});

function parseSourceUrls(body: any): string[] {
  const raw = body?.urls;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* newline / comma list */ }
    return raw.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

// POST /api/curriculum/upload — files + web/YouTube/Google Doc links → background job.
app.post('/api/curriculum/upload',
  upload.fields([
    { name: 'files', maxCount: 10 },
    { name: 'pdfs', maxCount: 10 },
    { name: 'pdf', maxCount: 1 },
  ]),
  async (req: any, res: any) => {
    const files: any[] = [...(req.files?.files || []), ...(req.files?.pdfs || []), ...(req.files?.pdf || [])];
    const cleanup = () => files.forEach(f => fs.promises.unlink(f.path).catch(() => {}));
    const user = await requireUser(req, res);
    if (!user) { cleanup(); return; }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { cleanup(); return res.status(500).json({ error: 'GEMINI_API_KEY not set on the server' }); }
    const urls = parseSourceUrls(req.body).filter(u => /^https?:\/\//i.test(u)).slice(0, 8);
    const topic = String(req.body.topic || '').trim().slice(0, 160);
    if (!files.length && !urls.length && !topic) {
      cleanup();
      return res.status(400).json({ error: 'Add a topic, a file, or a link' });
    }

    const role = await accountRole(user.uid);
    const wantedId = String(req.body.studentId || '').trim();
    const household = role === 'parent' ? listLearners(user.uid, true) : listLearners(user.uid, false);
    const learner = (wantedId && household.find(l => l.studentId === wantedId)) || household[0];
    const grade = String(learner?.grade || req.body.grade || '').trim();
    const learnerName = String(learner?.name || '').trim();
    if (!grade) { cleanup(); return res.status(400).json({ error: 'We need a learner profile (with grade) before extracting.' }); }

    const subjectLabel = String(req.body.subjectLabel || '').trim();
    const subjectId = `draft-${Date.now().toString(36)}`;

    const job = startSourceIngestJob({
      apiKey, subjectId, subjectLabel, grade, learnerName, topic, urls,
      studentId: learner?.studentId,
      files: files.map(f => ({ path: f.path, originalName: f.originalname, mimeType: f.mimetype })),
    });
    res.json({ success: true, jobId: job.id, subjectId, grade, learnerName });
  });

app.post('/api/curriculum/rename', async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const subjectId = String(req.body?.subjectId || '').trim();
    const label = String(req.body?.label || '').trim();
    if (!subjectId || !label) return (res as any).status(400).json({ error: 'subjectId and label required' });
    const curriculum = renameCurriculum(subjectId, label);
    if (!curriculum) return (res as any).status(404).json({ error: 'Subject not found' });
    res.json({ curriculum: { subjectId: curriculum.id, label: curriculum.label } });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not save the name' });
  }
});

// GET /api/curriculum/jobs/:id — progress of an ingestion job.
app.get('/api/curriculum/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return (res as any).status(404).json({ error: 'Unknown job (the server may have restarted)' });
  res.json({ job: publicJob(job) });
});

// POST /api/curriculum/confirm — write material, then generate the program.
app.post('/api/curriculum/confirm', async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const jobId = String(req.body?.jobId || '').trim();
    const label = String(req.body?.label || '').trim();
    const studentId = String(req.body?.studentId || '').trim();
    const job = getJob(jobId);
    if (!job) return (res as any).status(404).json({ error: 'Unknown job (the server may have restarted)' });
    if (job.stage !== 'preview') {
      return (res as any).status(400).json({ error: 'Wait for the preview before saving.' });
    }
    const role = await accountRole(user.uid);
    const household = role === 'parent' ? listLearners(user.uid, true) : listLearners(user.uid, false);
    const learner = (studentId && household.find(l => l.studentId === studentId)) || household[0];
    if (!learner) return (res as any).status(403).json({ error: 'That learner is not in your household.' });
    const program = await confirmAndGenerate(job, label, learner.studentId);
    res.json({
      program: job.program,
      curriculum: { subjectId: program.curriculum.id, label: program.curriculum.label },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not save the program' });
  }
});

// Errors on /api routes are always JSON. Without this, an oversized upload
// returned Express's HTML error page and the browser failed on "<!DOCTYPE".
app.use('/api', (err: any, _req: any, res: any, _next: any) => {
  const tooBig = err?.code === 'LIMIT_FILE_SIZE';
  const tooMany = err?.code === 'LIMIT_FILE_COUNT';
  res.status(tooBig ? 413 : 400).json({
    error: tooBig ? 'That file is over 500 MB.'
      : tooMany ? 'Upload at most 10 files at a time.'
      : String(err?.message || 'Upload failed'),
  });
});

// ─── Learner endpoints ──────────────────────────────────────────
// On Cloud Run, prefer Firestore so profiles survive instance restarts and
// stay in sync with the earlier Functions-backed hosting deploy.
function useFirestoreLearners() {
  return process.env.USE_FIRESTORE_LEARNERS === 'true' || Boolean(process.env.K_SERVICE);
}

async function requireUser(req: express.Request, res: express.Response): Promise<{ uid: string; email?: string } | null> {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ error: 'Sign in required' });
    return null;
  }
  if (!admin.apps.length) {
    res.status(503).json({ error: 'Auth is not configured on this server' });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    res.status(401).json({ error: 'Sign in required' });
    return null;
  }
}

function canSeeLearner(learner: { ownerUid?: string; parentUid?: string } | null | undefined, uid: string) {
  if (!learner) return false;
  if (learner.ownerUid && learner.ownerUid === uid) return true;
  if (learner.parentUid && learner.parentUid === uid) return true;
  if (!learner.ownerUid && !learner.parentUid) return false;
  return false;
}

async function accountRole(uid: string): Promise<'parent' | 'learner'> {
  if (admin.apps.length) {
    const doc = await admin.firestore().collection('users').doc(uid).get();
    const role = doc.data()?.role;
    if (role === 'parent' || role === 'learner') return role;
  }
  if (listLearners(uid, true).length > 0) return 'parent';
  return 'learner';
}

async function writeUserDoc(uid: string, data: Record<string, unknown>) {
  if (admin.apps.length) {
    await admin.firestore().collection('users').doc(uid).set(data, { merge: true });
  }
}

async function writeLearnerDoc(learner: Record<string, unknown>) {
  getOrCreateLearner(
    String(learner.studentId), String(learner.name), String(learner.grade),
    learner.ownerUid as string | undefined,
    learner.parentUid as string | undefined,
    learner.email as string | undefined,
  );
  if (admin.apps.length) {
    await admin.firestore().collection('learners').doc(String(learner.studentId)).set(learner, { merge: true });
  }
}

app.get('/api/me', async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const role = await accountRole(user.uid);
    res.json({ uid: user.uid, email: user.email || null, role });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load account' });
  }
});

app.get('/api/learners', async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const role = await accountRole(user.uid);
    if (useFirestoreLearners() && admin.apps.length) {
      const field = role === 'parent' ? 'parentUid' : 'ownerUid';
      const snap = await admin.firestore().collection('learners').where(field, '==', user.uid).get();
      const learners = snap.docs
        .map((d) => d.data())
        .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return res.json({ learners, role });
    }
    res.json({ learners: listLearners(user.uid, role === 'parent'), role });
  } catch (err: any) {
    console.error('[API /api/learners]', err);
    res.status(500).json({ error: err?.message || 'Failed to list learners' });
  }
});
app.get('/api/learners/:studentId', async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (useFirestoreLearners() && admin.apps.length) {
      const doc = await admin.firestore().collection('learners').doc(req.params.studentId).get();
      if (!doc.exists) return (res as any).status(404).json({ error: 'Not found' });
      const learner = doc.data() as any;
      if (!canSeeLearner(learner, user.uid)) return (res as any).status(404).json({ error: 'Not found' });
      return res.json({ learner });
    }
    const l = getLearner(req.params.studentId);
    if (!canSeeLearner(l, user.uid)) return (res as any).status(404).json({ error: 'Not found' });
    res.json({ learner: l });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load learner' });
  }
});
app.post('/api/learners', async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (await accountRole(user.uid) === 'parent') {
      return (res as any).status(400).json({ error: 'Parents add a child with name, email and password so the child can sign in.' });
    }
    const { studentId, name, grade } = req.body;
    if (!studentId || !name || !grade)
      return (res as any).status(400).json({ error: 'studentId, name, grade required' });

    if (useFirestoreLearners() && admin.apps.length) {
      const ref = admin.firestore().collection('learners').doc(String(studentId));
      const existing = await ref.get();
      if (existing.exists && (existing.data() as any)?.ownerUid && (existing.data() as any).ownerUid !== user.uid) {
        return (res as any).status(403).json({ error: 'That profile belongs to another account' });
      }
      const learner = existing.exists
        ? { ...(existing.data() as any), name: String(name), grade: String(grade), ownerUid: user.uid, updatedAt: Date.now() }
        : {
            studentId: String(studentId),
            name: String(name),
            grade: String(grade),
            ownerUid: user.uid,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            subjects: {},
            globalInsights: [],
          };
      await ref.set(learner, { merge: true });
      return res.json({ learner });
    }

    res.json({ learner: getOrCreateLearner(studentId, name, grade, user.uid) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to create learner' });
  }
});

app.post('/api/household/children', async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (await accountRole(user.uid) !== 'parent') {
      return (res as any).status(403).json({ error: 'Only a parent can create a child login' });
    }
    const { name, grade, email, password } = req.body || {};
    if (!name || !grade || !email || !password)
      return (res as any).status(400).json({ error: 'name, grade, email and password are required' });
    if (String(password).length < 6)
      return (res as any).status(400).json({ error: 'Child password needs at least 6 characters' });

    let child;
    try {
      child = await admin.auth().createUser({
        email: String(email).trim(),
        password: String(password),
        displayName: String(name).trim(),
        emailVerified: true,
      });
    } catch (err: any) {
      if (err?.code === 'auth/email-already-exists') {
        return (res as any).status(409).json({ error: 'That email already has an account' });
      }
      throw err;
    }

    await writeUserDoc(child.uid, {
      email: String(email).trim(),
      displayName: String(name).trim(),
      role: 'learner',
      parentUid: user.uid,
      createdAt: Date.now(),
    });

    const studentId = `student_${String(name).toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    const learner = {
      studentId,
      name: String(name).trim(),
      grade: String(grade),
      email: String(email).trim(),
      ownerUid: child.uid,
      parentUid: user.uid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      subjects: {},
      globalInsights: [],
    };
    await writeLearnerDoc(learner);
    res.json({ learner });
  } catch (err: any) {
    console.error('[API /api/household/children]', err);
    res.status(500).json({ error: err?.message || 'Failed to create child login' });
  }
});

// ─── Adaptive session endpoints ─────────────────────────────────
app.post('/api/session/start', async (req, res) => {
  const { studentId, name, grade, subjectId } = req.body;
  if (!studentId || !subjectId)
    return (res as any).status(400).json({ error: 'studentId and subjectId required' });
  const learner = getOrCreateLearner(studentId, name || 'Student', grade || 'Secondary 2 (Grade 8)');
  const shared = await loadSharedProgram(subjectId);
  const curriculum = shared?.curriculum || curriculumFor(subjectId);
  if (!curriculum) return (res as any).status(404).json({ error: 'Curriculum not found' });
  if (shared) void enrollLearner(studentId, curriculum.id, shared.programId);
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
  const curriculum = curriculumFor(session.subjectId);
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

  const curriculum = curriculumFor(session.subjectId);
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

app.get('/api/sessions', async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const studentId = String(req.query.studentId || '').trim();
    if (!studentId) return (res as any).status(400).json({ error: 'studentId required' });
    const role = await accountRole(user.uid);
    const household = role === 'parent' ? listLearners(user.uid, true) : listLearners(user.uid, false);
    if (!household.some(l => l.studentId === studentId)) {
      return (res as any).status(403).json({ error: 'That learner is not in your household.' });
    }
    const sessions = await listSessionsForLearner(studentId);
    res.json({
      sessions: sessions.slice(0, 20).map(s => ({
        sessionId: s.sessionId, learnerId: s.learnerId, topic: s.topic, grade: s.grade,
        intent: s.intent, status: s.status, startedAt: s.startedAt, endedAt: s.endedAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to list sessions' });
  }
});

app.get('/api/sessions/:sessionId/turns', async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const sessionId = String(req.params.sessionId || '').trim();
    const stored = getCaptionSession(sessionId);
    const turns = await listTurns(sessionId);
    const learnerId = stored?.learnerId || (await listSessionsLookupLearner(sessionId));
    if (!learnerId) return (res as any).status(404).json({ error: 'Session not found' });
    const role = await accountRole(user.uid);
    const household = role === 'parent' ? listLearners(user.uid, true) : listLearners(user.uid, false);
    if (!household.some(l => l.studentId === learnerId)) {
      return (res as any).status(403).json({ error: 'That lesson is not in your household.' });
    }
    res.json({ sessionId, turns });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load captions' });
  }
});

async function listSessionsLookupLearner(sessionId: string): Promise<string | null> {
  try {
    const doc = await admin.firestore().collection('sessions').doc(sessionId).get();
    return String(doc.data()?.learnerId || '') || null;
  } catch {
    return null;
  }
}

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
function observeMessage(
  message: LiveServerMessage,
  observer: LiveObserver | null,
  clientWs: WebSocket,
  captions?: { sessionId: string; buf: CaptionBuffer } | null,
) {
  if (!observer) return;
  const sc: any = message.serverContent;
  const childText = sc?.inputTranscription?.text;
  const tutorText = sc?.outputTranscription?.text;
  if (childText) {
    observer.add('child', childText);
    captions?.buf.add('child', childText);
    clientWs.send(JSON.stringify({ type: 'input_transcript', text: observer.currentText('child') }));
  }
  if (tutorText) {
    observer.add('tutor', tutorText);
    captions?.buf.add('tutor', tutorText);
    clientWs.send(JSON.stringify({ type: 'output_transcript', text: observer.currentText('tutor') }));
  }
  for (const call of message.toolCall?.functionCalls || []) {
    const a: any = call.args || {};
    const detail = [a.title, a.note, a.text, a.question, a.topic, a.concept, a.tab,
      Array.isArray(a.bulletPoints) ? a.bulletPoints.join(' | ') : ''].filter(Boolean).join(' — ');
    observer.add('board', `${call.name}${detail ? ': ' + String(detail).slice(0, 300) : ''}`);
    if (captions && (call.name === 'generate_photo_visual' || call.name === 'switch_board_view' || call.name === 'update_chalkboard_notes' || call.name === 'generate_video_visual' || call.name === 'focus_visual_region')) {
      const media: { kind: string; title?: string; prompt?: string } = { kind: String(call.name) };
      const title = String(a.title || a.tab || '').trim();
      const prompt = String(a.prompt || a.focus || detail || '').trim().slice(0, 400);
      if (title) media.title = title;
      if (prompt) media.prompt = prompt;
      void recordShownMedia(captions.sessionId, media).catch(() => {});
    }
  }
  if (sc?.interrupted) observer.boundary();
  if (sc?.turnComplete) {
    const parts = captions?.buf.flush() || [];
    if (captions && parts.length) {
      void persistCaptionTurns(captions.sessionId, parts).catch(() => {});
    }
    observer.exchangeDone();
  }
}

wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
  // Parse query parameters for topic and grade
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const topic = url.searchParams.get('topic') || 'the requested subject';
  const grade = url.searchParams.get('grade') || 'the student level';
  const studentId = String(url.searchParams.get('studentId') || '').trim();
  const liveSessionId = String(url.searchParams.get('sessionId') || '').trim()
    || `live_${Date.now().toString(36)}`;
  const intent = String(url.searchParams.get('intent') || 'learn').trim();
  const subjectId = String(url.searchParams.get('subjectId') || '').trim();
  const sharedProgram = subjectId ? await loadSharedProgram(subjectId) : getSharedProgram(subjectId);
  if (studentId && sharedProgram?.curriculum?.id) {
    void enrollLearner(studentId, sharedProgram.curriculum.id, sharedProgram.programId);
  }
  const lessonPack = (sharedProgram?.boardPack?.length ? sharedProgram.boardPack : boardPackFor(topic)) as string[];
  const mediaPrompts = (sharedProgram?.multimediaContent || [])
    .filter(m => m.kind === 'image' || m.kind === 'infographic')
    .map(m => m.prompt)
    .filter(Boolean)
    .slice(0, 4);
  const lessonOutline = (sharedProgram?.lessons || []).slice(0, 6).map((l, i) =>
    `${i + 1}. ${l.title}${l.breakdown?.length ? ' — ' + l.breakdown.slice(0, 3).join('; ') : ''}`
  ).join('\n');
  const hasModel = lessonPack.includes('model');
  const hasPhoto = lessonPack.includes('photo');
  const hasDiagram = lessonPack.includes('diagram');
  const hasChalk = lessonPack.includes('chalk');
  const hasVideo = lessonPack.includes('video');
  const videoScript = (sharedProgram?.multimediaContent || []).find(m => m.kind === 'videoScript')?.prompt || '';
  const recap = studentId ? await lastLessonRecap(studentId, topic, liveSessionId) : '';
  const captionBuf = new CaptionBuffer();
  const captions = studentId ? { sessionId: liveSessionId, buf: captionBuf } : null;
  if (captions) {
    void ensureLiveSession({
      sessionId: liveSessionId, learnerId: studentId, topic, grade, intent, subjectId,
    }).catch(() => {});
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

  const dynamicSystemInstruction = `You are "Lumen", an inspiring, warm, and brilliant Senior Educator and AI Tutor teaching a student in ${grade} on the topic of "${topic}". You speak in a clear, encouraging, friendly mentor voice with genuine passion for learning.

LANGUAGE: Speak and write ONLY in English. Do not switch to Spanish or any other language, even if last-session notes or recap contain another language. Follow the child only if they clearly speak that language in THIS turn. Board notes stay English.

PEDAGOGICAL RULES & REAL-TIME BLACKBOARD INTERACTION:
1. You have an interactive real-time digital blackboard right next to you that updates dynamically.
2. AVAILABLE BOARD SURFACES FOR THIS LESSON: ${lessonPack.join(', ') || 'photo, chalk'}.
   ONE CANVAS. Picture series on the LEFT, chalkboard notes on the RIGHT, always together. Never hide one to show the other.
   ${hasPhoto ? "- New picture / diagram: call generate_photo_visual only. It is added to the series. Do NOT call switch_board_view." : ''}
   ${hasDiagram ? "- A labelled diagram is just another generate_photo_visual (ask for a simple labelled diagram). Do NOT switch to 2d." : ''}
   ${hasModel ? "- 3d / model: only for geometry. switch_board_view({tab:'3d'}) is the only allowed switch." : '- Do NOT offer Shape or 3D. Those are for geometry lessons only.'}
   ${hasChalk ? "- Notes: call update_chalkboard_notes or write_live_note. They appear beside the picture. Do NOT call switch_board_view." : ''}
   ${hasVideo ? "- video: call generate_video_visual only. It plays as a short story using the pictures already on the left. Do NOT switch_board_view. Pause with control_video if they interrupt." : ''}
   - NEVER call switch_board_view with photo, chalkboard, 2d, explorer, or quiz. That flips the canvas and the child loses the picture.
   - quiz: pose_quiz only after a real answer or a worked example — never after "ok" / "yeah". The question is written on the notes rail.
3. TOPIC SWITCHING: If the student asks to learn a different topic, enthusiastically call set_topic and keep teaching.
4. ZOOM THE PICTURE: When naming a part of a leaf/cell/shape, call focus_visual_region({label}) so the left picture zooms that part (stomata, veins, roots, chlorophyll).
5. Teach in beats. One idea = a few spoken sentences plus one canvas action (new picture, zoom, or notes). If they say "ok" — keep teaching, do not quiz.
6. Encourage the student warmly and tailor vocabulary to ${grade}.
7. ${hasVideo ? 'VIDEO: If they say they want a video, you MUST call generate_video_visual immediately. Do not assign it as homework. Keep explaining in English while the clip plays on the left.' : ''}
8. NEVER GO QUIET BEFORE A CANVAS ACTION. Say one short phrase, call the tool, keep explaining. Picture and notes stay side by side.
9. ${CLASSIC_CROSS_CHECK}
10. VISUALS: If the child asks for a picture you MUST call generate_photo_visual (and only that). Never say you showed a picture unless you called the tool. Keep earlier pictures in the series — do not replace the story, add the next frame.
Ready picture prompts: ${mediaPrompts.join(' | ') || 'invent a concrete photo the child would recognise'}.
${videoScript ? `Ready video outline: ${videoScript.slice(0, 280)}` : ''}
${recap ? `\nLAST TIME WITH THIS CHILD:\n${recap}\nOpen by recapping that in two sentences and asking whether to continue from there. Do not restart the whole lesson.` : ''}

${lessonOutline ? `TEACH THIS PROGRAM IN ORDER (do not skip to a quiz):\n${lessonOutline}` : ''}`;

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

              const args = { ...(call.args as Record<string, unknown> || {}) };
              if (call.name === 'generate_photo_visual') {
                args.generating = true;
              }
              if (call.name === 'generate_video_visual') {
                args.clip = lessonClipFor(topic, String(args.prompt || videoScript || ''));
                args.title = args.title || (args.clip as { title?: string }).title;
              }
              if (call.name === 'focus_visual_region' && args.label) {
                Object.assign(args, regionFor(String(args.label)));
              }
              clientWs.send(
                JSON.stringify({
                  type: 'tool_call',
                  id: call.id,
                  name: call.name,
                  args,
                })
              );
              if (call.name === 'generate_photo_visual') {
                const prompt = String(args.prompt || '');
                void generateLessonImage(topic, prompt).then(result => {
                  if (clientWs.readyState !== WebSocket.OPEN) return;
                  clientWs.send(JSON.stringify({
                    type: 'visual_ready',
                    imageUrl: result.imageUrl,
                    prompt: result.promptUsed,
                    generated: result.generated,
                  }));
                }).catch(() => {});
              }

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
          try { observeMessage(message, observer, clientWs, captions); } catch (obsErr) {
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
      clientWs.send(JSON.stringify({ type: 'session_ready', boardPack: lessonPack, mediaPrompts }));

      // Send initial turn welcoming the student to the topic
      try {
        liveSession.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [
                {
                  text: recap
                    ? `The same child is back for "${topic}". LAST TIME: ${recap.slice(0, 500)} Speak English only. Greet them by name in one sentence, recap what you already covered in two English sentences, and ask if they want to continue from there or replay the picture. Do not restart from "what is photosynthesis". Do not quiz yet. If they ask for a picture or video, call the matching tool.`
                    : `The student has just entered to learn "${topic}" at ${grade}. Speak English only. Greet in one sentence. If a first picture helps, call generate_photo_visual only — do not switch_board_view. Write the first idea on the notes with update_chalkboard_notes. Then teach. Do not quiz yet.`,
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
    if (captions) {
      const leftover = captions.buf.flush();
      if (leftover.length) void persistCaptionTurns(captions.sessionId, leftover).catch(() => {});
      void endLiveSession(captions.sessionId, 'abandoned').catch(() => {});
    }
    if (liveSession) {
      try {
        liveSession.close();
      } catch (closeErr) {
        console.error('[Gemini Live] Error closing session:', closeErr);
      }
    }
  });
});

function isLocalhostPortTaken(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const tester = net.createServer();
    tester.once('error', () => resolve(true));
    tester.once('listening', () => tester.close(() => resolve(false)));
    tester.listen(port, '127.0.0.1');
  });
}

function lanIPv4(): string | null {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const info of list || []) {
      if (info.family === 'IPv4' && !info.internal) return info.address;
    }
  }
  return null;
}

async function pickListenPort(preferred: number): Promise<number> {
  // Cloud Run / explicit PORT always wins.
  if (process.env.PORT) return preferred;
  if (!(await isLocalhostPortTaken(preferred))) return preferred;
  const fallback = preferred === 3000 ? 3100 : preferred + 1;
  console.warn(`[Server] localhost:${preferred} is already taken (another app on 127.0.0.1). Using ${fallback}.`);
  return fallback;
}

async function startServer() {
  const port = await pickListenPort(PORT);

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    // Run HMR on its own port so it never shares the Live API upgrade path.
    const hmrPort = Number(process.env.HMR_PORT) || (port + 10000);
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

  server.listen(port, '0.0.0.0', () => {
    const lan = lanIPv4();
    console.log(`[Server] Lumen UI → http://localhost:${port}`);
    if (lan) console.log(`[Server] On this machine’s network → http://${lan}:${port}`);
    void listSharedCurricula().then(list => {
      console.log(`[Curricula] Shared catalog hydrated: ${list.length}`);
    }).catch(() => {});
  });
}

startServer();
