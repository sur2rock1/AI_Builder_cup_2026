import express from 'express';
import http from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, Type, LiveServerMessage } from '@google/genai';
import { createDynamicLesson } from './src/utils/lessonGenerator';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = 3000;

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

// WebSocket Server for Live API audio and events
const wss = new WebSocketServer({ noServer: true });

// Fallback WebSocket server for Vite HMR / browser client keepalive
const fallbackWss = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols: Set<string>) => {
    if (protocols.has('vite-hmr')) return 'vite-hmr';
    const first = Array.from(protocols)[0];
    return first || false;
  },
});
fallbackWss.on('connection', (ws) => {
  try {
    ws.send(JSON.stringify({ type: 'connected' }));
  } catch (_) {}
  ws.on('message', () => {});
});

server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/ws/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      fallbackWss.handleUpgrade(request, socket, head, (ws) => {
        fallbackWss.emit('connection', ws, request);
      });
    }
  } catch (upgradeErr) {
    console.warn('[Server] WebSocket upgrade error:', upgradeErr);
    try {
      socket.destroy();
    } catch (_) {}
  }
});

wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
  // Parse query parameters for topic and grade
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const topic = url.searchParams.get('topic') || 'the requested subject';
  const grade = url.searchParams.get('grade') || 'the student level';

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
6. Encourage the student warmly, praise good questions, and tailor your vocabulary directly to a student in ${grade}.`;

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });

    liveSession = await ai.live.connect({
      model: 'gemini-3.8-live',
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
          console.log('[Gemini Live] Session connected');
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
        onclose: () => {
          console.log('[Gemini Live] Session closed');
          if (clientWs.readyState === WebSocket.OPEN) {
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
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { server },
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
