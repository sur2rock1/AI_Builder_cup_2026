import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BlackboardState,
  BlackboardTab,
  TutorState,
  TranscriptEntry,
  ConnectionStatus,
  DynamicLessonData,
  ConceptNode,
} from './types';
import { AnimatedTutorCharacter } from './components/AnimatedTutorCharacter';
import { DynamicBlackboard } from './components/DynamicBlackboard';
import { TopicGradeSelector } from './components/TopicGradeSelector';
import { BottomBar } from './components/BottomBar';
import { AudioManager } from './utils/audio';
import { createDynamicLesson } from './utils/lessonGenerator';
import { Sparkles, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  // Topic and Grade State (No hardcoded predefined topic - set on the fly!)
  const [topic, setTopic] = useState('');
  const [grade, setGrade] = useState('Secondary 2 (Grade 8)');

  // Blackboard State
  const [blackboard, setBlackboard] = useState<BlackboardState>({
    activeTab: '2d',
    lessonData: null,
    isLoading: false,
    isGeneratingPhoto: false,
    highlightedNodeId: null,
    interactiveValues: {},
    selectedQuizOption: null,
    showQuizResult: false,
    customLiveNotes: [],
  });

  // Animated Tutor State
  const [tutorState, setTutorState] = useState<TutorState>({
    isSpeaking: false,
    mouthOpenness: 0,
    isBlinking: false,
    isNodding: false,
    eyebrowsRaised: false,
    name: 'Dr. Marcus Vance',
    title: 'Senior AI Educator',
  });

  // Voice & Transcripts State
  const [outputTranscript, setOutputTranscript] = useState<TranscriptEntry | null>({
    id: 'welcome-0',
    text: `Hello! I am Dr. Marcus Vance, your real-time AI tutor. What topic or concept would you like to explore today? Type any topic on the fly or click "Start Voice Lesson" to ask me directly!`,
    timestamp: Date.now(),
  });
  const [inputTranscript, setInputTranscript] = useState<TranscriptEntry | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [micLevel, setMicLevel] = useState(0);

  // Audio & WebSocket Refs
  const audioManagerRef = useRef<AudioManager | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Load / Generate Lesson Data on the Fly
  const loadLesson = useCallback(async (targetTopic: string, targetGrade: string, requestedTab?: BlackboardTab) => {
    if (!targetTopic.trim()) return;

    setBlackboard((prev) => ({
      ...prev,
      isLoading: true,
      selectedQuizOption: null,
      showQuizResult: false,
      customLiveNotes: [],
    }));

    try {
      // 1. Attempt fresh AI generation from server
      const res = await fetch('/api/generate-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: targetTopic, grade: targetGrade }),
      });

      const json = await res.json();

      let finalData: DynamicLessonData;
      if (json && json.data) {
        finalData = json.data;
      } else {
        // Fallback to intelligent local generator
        finalData = createDynamicLesson(targetTopic, targetGrade);
      }

      // Initialize interactive variables
      const initialVals: Record<string, number> = {};
      if (finalData.explorer?.variables) {
        finalData.explorer.variables.forEach((v) => {
          initialVals[v.id] = v.defaultValue;
        });
      }

      setBlackboard({
        activeTab: requestedTab || '2d',
        lessonData: finalData,
        isLoading: false,
        isGeneratingPhoto: false,
        highlightedNodeId: null,
        interactiveValues: initialVals,
        selectedQuizOption: null,
        showQuizResult: false,
        customLiveNotes: [],
      });

      setOutputTranscript({
        id: `topic-${Date.now()}`,
        text: `I have prepared a real-time interactive masterclass on "${finalData.topic}" for ${finalData.grade}. We have 2D schematics, a 3D spatial simulation, photorealistic observational visuals, chalkboard notes, and a challenge quiz ready!`,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('[App] Error fetching lesson, using local generator:', err);
      const fallbackData = createDynamicLesson(targetTopic, targetGrade);
      const initialVals: Record<string, number> = {};
      if (fallbackData.explorer?.variables) {
        fallbackData.explorer.variables.forEach((v) => {
          initialVals[v.id] = v.defaultValue;
        });
      }

      setBlackboard({
        activeTab: requestedTab || '2d',
        lessonData: fallbackData,
        isLoading: false,
        isGeneratingPhoto: false,
        highlightedNodeId: null,
        interactiveValues: initialVals,
        selectedQuizOption: null,
        showQuizResult: false,
        customLiveNotes: [],
      });
    }
  }, []);

  // Handle Changing / Launching Topic and Grade on the Fly
  const handleApplyTopicAndGrade = (newTopic: string, newGrade?: string) => {
    const selectedGrade = newGrade || grade;
    setTopic(newTopic);
    if (newGrade) setGrade(newGrade);

    // If currently connected in voice, disconnect to start fresh with new topic
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (audioManagerRef.current) {
      audioManagerRef.current.stop();
      audioManagerRef.current = null;
    }
    setConnectionStatus('disconnected');

    loadLesson(newTopic, selectedGrade);
  };

  // Generate Photo Visual on the Fly using AI
  const handleGeneratePhoto = async (customPrompt?: string) => {
    const activeTopic = topic || blackboard.lessonData?.topic || 'Science';
    setBlackboard((prev) => ({ ...prev, isGeneratingPhoto: true }));

    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: activeTopic,
          prompt: customPrompt,
        }),
      });

      const data = await res.json();
      if (data && data.imageUrl) {
        setBlackboard((prev) => {
          if (!prev.lessonData) return prev;
          return {
            ...prev,
            activeTab: 'photo',
            isGeneratingPhoto: false,
            lessonData: {
              ...prev.lessonData,
              photoVisual: {
                imageUrl: data.imageUrl,
                caption: data.caption || `Photographic Study: ${activeTopic}`,
                promptUsed: data.promptUsed || customPrompt || activeTopic,
                annotations: prev.lessonData.photoVisual?.annotations || [
                  { label: 'Key Observable Feature', description: `Empirical detail of ${activeTopic}`, x: 45, y: 50 },
                ],
              },
            },
          };
        });

        setOutputTranscript({
          id: `photo-${Date.now()}`,
          text: `I have generated a high-definition photorealistic visual for "${activeTopic}". Take a look at the photographic study on the blackboard!`,
          timestamp: Date.now(),
        });
      } else {
        setBlackboard((prev) => ({ ...prev, isGeneratingPhoto: false, activeTab: 'photo' }));
      }
    } catch (err) {
      console.error('[App] Error generating image:', err);
      setBlackboard((prev) => ({ ...prev, isGeneratingPhoto: false, activeTab: 'photo' }));
    }
  };

  // Lipsync & Audio Visualizer Animation Loop
  useEffect(() => {
    const updateLipsync = () => {
      if (audioManagerRef.current) {
        const outLevel = typeof audioManagerRef.current.getOutputLevel === 'function'
          ? audioManagerRef.current.getOutputLevel()
          : (typeof audioManagerRef.current.getOutputRMS === 'function' ? audioManagerRef.current.getOutputRMS() : 0);
        const clampedLevel = Math.min(1, outLevel * 2.8);

        setTutorState((prev) => ({
          ...prev,
          mouthOpenness: clampedLevel,
          isSpeaking: clampedLevel > 0.08,
          eyebrowsRaised: clampedLevel > 0.4,
        }));
      }
      animFrameRef.current = requestAnimationFrame(updateLipsync);
    };

    animFrameRef.current = requestAnimationFrame(updateLipsync);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Handle Tool Calls from Gemini Live Voice Model
  const handleToolCall = useCallback(
    (name: string, args: Record<string, any>) => {
      console.log(`[App] Handling Gemini Live tool call: ${name}`, args);

      switch (name) {
        case 'update_chalkboard_notes': {
          const bulletPoints = Array.isArray(args.bulletPoints) ? args.bulletPoints : [];
          const coreRule = args.coreRuleOrFormula || undefined;
          const title = args.title || undefined;

          setBlackboard((prev) => {
            if (!prev.lessonData) return prev;
            return {
              ...prev,
              activeTab: 'chalkboard',
              lessonData: {
                ...prev.lessonData,
                chalkNotes: {
                  ...prev.lessonData.chalkNotes,
                  title: title || prev.lessonData.chalkNotes.title,
                  bulletPoints:
                    bulletPoints.length > 0 ? bulletPoints : prev.lessonData.chalkNotes.bulletPoints,
                  coreRuleOrFormula: coreRule || prev.lessonData.chalkNotes.coreRuleOrFormula,
                },
              },
            };
          });
          break;
        }

        case 'write_live_note': {
          const note = args.note;
          if (note) {
            setBlackboard((prev) => ({
              ...prev,
              activeTab: 'chalkboard',
              customLiveNotes: [...prev.customLiveNotes, String(note)],
            }));
          }
          break;
        }

        case 'switch_board_view': {
          let tab = args.tab as BlackboardTab;
          if ((tab as any) === 'diagram') tab = '2d';
          if (['2d', '3d', 'photo', 'chalkboard', 'explorer', 'quiz'].includes(tab)) {
            setBlackboard((prev) => ({ ...prev, activeTab: tab }));
          }
          break;
        }

        case 'generate_photo_visual': {
          const prompt = args.prompt;
          handleGeneratePhoto(prompt);
          break;
        }

        case 'set_topic': {
          const newTopic = args.topic;
          const newGrade = args.grade;
          if (newTopic) {
            setTopic(newTopic);
            if (newGrade) setGrade(newGrade);
            loadLesson(newTopic, newGrade || grade);
          }
          break;
        }

        case 'highlight_concept': {
          const target = String(args.nodeIdOrName || '').toLowerCase();
          setBlackboard((prev) => {
            const matched = prev.lessonData?.diagram.nodes.find(
              (n) => n.id.toLowerCase().includes(target) || n.label.toLowerCase().includes(target)
            );
            return {
              ...prev,
              activeTab: '2d',
              highlightedNodeId: matched ? matched.id : null,
            };
          });
          break;
        }

        case 'pose_quiz': {
          const question = args.question;
          const options = args.options;
          const correctIndex = Number(args.correctIndex) || 0;
          const explanation = args.explanation || 'Review the core concept breakdown.';

          if (question && Array.isArray(options)) {
            setBlackboard((prev) => {
              if (!prev.lessonData) return prev;
              return {
                ...prev,
                activeTab: 'quiz',
                selectedQuizOption: null,
                showQuizResult: false,
                lessonData: {
                  ...prev.lessonData,
                  quiz: {
                    question,
                    options,
                    correctIndex,
                    explanation,
                  },
                },
              };
            });
          }
          break;
        }

        default:
          console.warn(`[App] Unhandled tool call: ${name}`);
      }
    },
    [grade, loadLesson]
  );

  // Start or Stop Live Voice Lesson
  const toggleVoiceLesson = async () => {
    if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
      // Stop session
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (audioManagerRef.current) {
        audioManagerRef.current.stop();
        audioManagerRef.current = null;
      }
      setConnectionStatus('disconnected');
      setMicLevel(0);
      setTutorState((prev) => ({ ...prev, isSpeaking: false, mouthOpenness: 0 }));
      return;
    }

    // Start session
    try {
      setConnectionStatus('connecting');

      // 1. Initialize Audio Manager
      const audioMgr = new AudioManager({
        onAudioInputChunk: (base64PCM) => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'audio_in', data: base64PCM }));
          }
        },
        onInputLevel: (level) => {
          setMicLevel(level);
        },
      });

      await audioMgr.start();
      audioManagerRef.current = audioMgr;

      // 2. Connect WebSocket to Gemini Live with topic and grade query params
      const activeTopic = topic || 'any topic the student asks for on the fly';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/live?topic=${encodeURIComponent(
        activeTopic
      )}&grade=${encodeURIComponent(grade)}`;

      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('[WebSocket] Connected to Gemini Live');
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'audio_out' && msg.data) {
            audioMgr.queueAudioChunk(msg.data);
          } else if (msg.type === 'output_transcript' && msg.text) {
            setOutputTranscript({
              id: `out-${Date.now()}`,
              text: msg.text,
              timestamp: Date.now(),
            });
          } else if (msg.type === 'input_transcript' && msg.text) {
            setInputTranscript({
              id: `in-${Date.now()}`,
              text: msg.text,
              timestamp: Date.now(),
            });
          } else if (msg.type === 'session_ready') {
            setConnectionStatus('connected');
          } else if (msg.type === 'interrupted') {
            audioMgr.flushPlayback();
          } else if (msg.type === 'tool_call') {
            handleToolCall(msg.name, msg.args);
          } else if (msg.type === 'error') {
            console.error('[WebSocket] Server reported error:', msg);
            setConnectionStatus('error');
          }
        } catch (parseErr) {
          console.error('[WebSocket] Message parsing error:', parseErr);
        }
      };

      socket.onerror = (err) => {
        console.error('[WebSocket] Socket error:', err);
        setConnectionStatus('error');
      };

      socket.onclose = () => {
        console.log('[WebSocket] Connection closed');
        setConnectionStatus('disconnected');
        setMicLevel(0);
      };
    } catch (err: any) {
      console.error('[App] Failed to start voice session:', err);
      setConnectionStatus('error');
    }
  };

  // Send a suggested question as student voice/text prompt
  const handleAskSuggestedQuestion = (questionText: string) => {
    setInputTranscript({
      id: `ask-${Date.now()}`,
      text: questionText,
      timestamp: Date.now(),
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', text: questionText }));
    } else {
      setOutputTranscript({
        id: `ans-${Date.now()}`,
        text: `Regarding "${questionText}": Notice how our dynamic 2D schematic, 3D spatial scene, and chalkboard lecture notes outline the underlying steps. Click "Start Voice Lesson" to discuss this with me live!`,
        timestamp: Date.now(),
      });
    }
  };

  // Handle Command / Ask from Blackboard
  const handleAskVisualOrCommand = (command: string) => {
    setInputTranscript({
      id: `cmd-${Date.now()}`,
      text: command,
      timestamp: Date.now(),
    });

    const lower = command.toLowerCase();

    // Check if user is asking for a new topic: e.g. "teach me about X" or "topic: X"
    if (lower.startsWith('teach me about ') || lower.startsWith('topic: ') || lower.startsWith('switch to ')) {
      const extractedTopic = command
        .replace(/^(teach me about|topic:|switch to)\s+/i, '')
        .trim();
      if (extractedTopic) {
        handleApplyTopicAndGrade(extractedTopic);
        return;
      }
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', text: command }));
    } else {
      if (lower.includes('3d')) {
        setBlackboard((prev) => ({ ...prev, activeTab: '3d' }));
        setOutputTranscript({
          id: `cmd-resp-${Date.now()}`,
          text: `Switched to 3D spatial visualization! You can rotate the 3D model 360° and inspect structural coordinates.`,
          timestamp: Date.now(),
        });
      } else if (lower.includes('photo') || lower.includes('picture')) {
        handleGeneratePhoto(command);
      } else if (lower.includes('2d') || lower.includes('diagram')) {
        setBlackboard((prev) => ({ ...prev, activeTab: '2d' }));
      } else if (lower.includes('chalk') || lower.includes('note')) {
        setBlackboard((prev) => ({ ...prev, activeTab: 'chalkboard' }));
      } else if (lower.includes('quiz')) {
        setBlackboard((prev) => ({ ...prev, activeTab: 'quiz' }));
      }
    }
  };

  return (
    <div
      id="app-root"
      className="w-screen h-screen flex flex-col bg-[#05110a] text-[#f2faf5] font-sans antialiased overflow-hidden select-none"
    >
      {/* GLOBAL TOP NAVIGATION */}
      <header
        id="top-nav-bar"
        className="h-14 w-full bg-[#071910] border-b border-[#1a3a27] px-4 flex items-center justify-between z-30 shadow-md"
      >
        {/* Brand & Identity */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-amber-400 p-0.5 flex items-center justify-center shadow-md">
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <div>
            <span className="text-sm font-bold tracking-wider text-white uppercase font-mono flex items-center gap-1.5">
              <span>AI Interactive Tutor</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                ON THE FLY
              </span>
            </span>
          </div>
        </div>

        {/* Center: Dynamic Topic & Grade Selector */}
        <TopicGradeSelector
          currentTopic={topic}
          currentGrade={grade}
          onApplyTopicAndGrade={handleApplyTopicAndGrade}
          isLoading={blackboard.isLoading}
        />

        {/* Right: Refresh Lesson / Voice Status */}
        <div className="flex items-center gap-2">
          {topic && (
            <button
              onClick={() => loadLesson(topic, grade)}
              disabled={blackboard.isLoading}
              title="Regenerate dynamic lesson"
              className="p-1.5 rounded-lg bg-[#0e271a] hover:bg-[#163a26] border border-[#204e33] text-[#86b59b] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${blackboard.isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </header>

      {/* MAIN WORKSPACE: Animated Tutor Character on left, Dynamic Blackboard on right */}
      <main id="main-workspace" className="flex-1 w-full flex flex-row overflow-hidden">
        {/* Left: Animated Vector Character Tutor */}
        <section
          id="animated-tutor-section"
          className="w-[30%] min-w-[280px] max-w-[380px] h-full flex flex-col"
        >
          <AnimatedTutorCharacter
            tutorState={tutorState}
            outputTranscript={outputTranscript}
            inputTranscript={inputTranscript}
            currentTopic={topic}
            currentGrade={grade}
          />
        </section>

        {/* Right: Dynamic Real-Time Blackboard Teaching Surface */}
        <section id="dynamic-blackboard-section" className="flex-1 h-full relative">
          <DynamicBlackboard
            blackboard={blackboard}
            onTabChange={(tab) => setBlackboard((prev) => ({ ...prev, activeTab: tab }))}
            onNodeClick={(node: ConceptNode) => {
              setBlackboard((prev) => ({
                ...prev,
                highlightedNodeId: prev.highlightedNodeId === node.id ? null : node.id,
              }));
              setOutputTranscript({
                id: `node-${Date.now()}`,
                text: `Looking at "${node.label}": ${node.details}`,
                timestamp: Date.now(),
              });
            }}
            onVariableChange={(varId, val) => {
              setBlackboard((prev) => ({
                ...prev,
                interactiveValues: {
                  ...prev.interactiveValues,
                  [varId]: val,
                },
              }));
            }}
            onQuizAnswer={(idx) => {
              setBlackboard((prev) => ({
                ...prev,
                selectedQuizOption: idx,
                showQuizResult: true,
              }));
            }}
            onAskSuggestedQuestion={handleAskSuggestedQuestion}
            onSetTopicOnTheFly={handleApplyTopicAndGrade}
            onAskVisualOrCommand={handleAskVisualOrCommand}
            onGeneratePhoto={handleGeneratePhoto}
          />
        </section>
      </main>

      {/* BOTTOM CONTROL BAR: Start/End Lesson & Audio Mic Status */}
      <BottomBar
        isLessonActive={connectionStatus === 'connected' || connectionStatus === 'connecting'}
        connectionStatus={connectionStatus}
        micLevel={micLevel}
        currentTopic={topic || 'Any Topic on the Fly'}
        onToggleLesson={toggleVoiceLesson}
      />
    </div>
  );
};

export default App;
