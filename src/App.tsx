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
import { liveWebSocketUrl } from './utils/liveWs';
import { Sparkles, RefreshCw } from 'lucide-react';
import { LearnerProfilePanel } from './components/LearnerProfilePanel';
import { CurriculumUpload } from './components/CurriculumUpload';
import {
  LearnerProfileUI, AdaptiveSessionUI, AssessmentResultUI,
  CurriculumConceptUI,
} from './types';
import { LoginScreen, StudentProfile } from './components/LoginScreen';
import { SubjectSelector } from './components/SubjectSelector';
import { ParentPortal } from './components/ParentPortal';
import {
  TeachingCanvas, resolvePart, FigurePart, FigureSpec,
  StudentThinking, LiveAssessment, BoardNote,
} from './components/TeachingCanvas';

import type { LearnerSnapshot } from './adaptive/liveObserver';
import { ImmersiveStage, PresenterMedia } from './components/ImmersiveStage';
import { PanelMode } from './components/ScenePanel';
import { getScene, PYTHAGORAS_SCENES } from './scenes/pythagorasScenes';

// Which teaching surface to render.
//   'immersive' — presenter on a stage beside a real whiteboard (current)
//   'canvas'    — flat light teaching canvas
//   'legacy'    — the original six-tab blackboard
// Kept as a flag so there is always a working fallback close to the deadline.
type BoardSurface = 'immersive' | 'canvas' | 'legacy';
const BOARD_SURFACE: BoardSurface = 'immersive';

// Pre-generated presenter media. Drop files into /public/presenter/ and list
// them here — nothing is generated at runtime, so there is no added latency
// and no third-party avatar service sitting in the live path.
// Until these exist the stage renders a lit silhouette instead.
const PRESENTER: PresenterMedia = {
  // Produced by `npm run gen:assets`. Used only if the file exists.
  still: '/presenter/stage.jpg',
  // clips: {
  //   idle:        '/presenter/idle.mp4',
  //   talking:     '/presenter/talking.mp4',
  //   thinking:    '/presenter/thinking.mp4',
  //   pointing:    '/presenter/pointing.mp4',
  //   encouraging: '/presenter/encouraging.mp4',
  // },
};

export const App: React.FC = () => {
  // ─── Navigation / screen state ───────────────────────────────
  type AppScreen = 'login' | 'subject-select' | 'tutor' | 'parent-portal';
  const [screen, setScreen] = useState<AppScreen>('login');
  const [loggedInStudent, setLoggedInStudent] = useState<StudentProfile | null>(null);

  // Topic and Grade State
  const [topic, setTopic] = useState('');
  const [grade, setGrade] = useState('Secondary 2 (Grade 8)');

  // ─── Adaptive learning state ──────────────────────────────────
  const [learnerProfile, setLearnerProfile] = useState<LearnerProfileUI | null>(null);
  const [adaptiveSession, setAdaptiveSession] = useState<AdaptiveSessionUI | null>(null);
  const [currentConcept, setCurrentConcept] = useState<CurriculumConceptUI | null>(null);
  const [lastAssessment, setLastAssessment] = useState<AssessmentResultUI | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [curriculaVersion, setCurriculaVersion] = useState(0);

  // ─── Live teaching state (new canvas) ────────────────────────
  const [figure, setFigure] = useState<FigureSpec>({ a: 4, b: 3, unknownSide: null });
  const [revealed, setRevealed] = useState<FigurePart[]>([]);
  const [focusPart, setFocusPart] = useState<FigurePart | null>(null);
  // Lesson opens on a real situation, then fades to the bare shape (concreteness fading).
  const [panelMode, setPanelMode] = useState<PanelMode>('real');
  // True while the server is checking an answer. Shown to the child so a short
  // pause reads as "he's thinking about what I said", not as a hang.
  const [tutorThinking, setTutorThinking] = useState(false);
  const thinkingTimerRef = useRef<number | null>(null);
  const setThinking = useCallback((on: boolean) => {
    if (thinkingTimerRef.current) { window.clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
    setTutorThinking(on);
    // Never let the indicator stick if a message is lost.
    if (on) thinkingTimerRef.current = window.setTimeout(() => setTutorThinking(false), 8000);
  }, []);
  const [sceneId, setSceneId] = useState<string>('ladder');
  const [studentThinking, setStudentThinking] = useState<StudentThinking | null>(null);
  const [liveAssessment, setLiveAssessment] = useState<LiveAssessment | null>(null);
  const [boardNote, setBoardNote] = useState<BoardNote | null>(null);
  const [liveMastery, setLiveMastery] = useState<number>(0);
  const [liveMisconceptions, setLiveMisconceptions] = useState<Array<{ id: string; text: string; status: string }>>([]);
  // Live learner picture from the server's observer (updated after every exchange).
  const [learnerSnap, setLearnerSnap] = useState<LearnerSnapshot | null>(null);

  const revealPart = useCallback((part: FigurePart | null) => {
    if (!part) return;
    setRevealed(prev => (prev.includes(part) ? prev : [...prev, part]));
    setFocusPart(part);
    // The spotlight is a moment, not a state. It fades so the board settles.
    window.setTimeout(() => setFocusPart(curr => (curr === part ? null : curr)), 6000);
  }, []);

  // ─── Blackboard State
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
    (name: string, args: Record<string, any>, serverResult?: Record<string, any>) => {
      console.log(`[App] Handling Gemini Live tool call: ${name}`, args, serverResult);

      switch (name) {
        // ─── New teaching canvas tools ────────────────────────
        case 'reveal_part': {
          setPanelMode(prev => (prev === '3d' ? 'shape' : prev));
          const list: string[] = Array.isArray(args.parts) && args.parts.length ? args.parts : args.part ? [args.part] : [];
          // One call, several parts: reveal them in order, a beat apart, so the
          // board keeps pace with the explanation without a tool call per word.
          list.forEach((p, i) => {
            const part = resolvePart(String(p)) || (p as FigurePart);
            window.setTimeout(() => revealPart(part), i * 1800);
          });
          break;
        }

        case 'set_figure': {
          if (args.scene && PYTHAGORAS_SCENES.some(sc => sc.id === args.scene)) {
            setSceneId(String(args.scene));
            setPanelMode('real');
          } else {
            setPanelMode(prev => (prev === '3d' ? 'shape' : prev));
          }
          const a = Number(args.a);
          const b = Number(args.b);
          if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
            setFigure({
              a, b,
              unitLabel: args.unitLabel ? String(args.unitLabel) : undefined,
              unknownSide: ['a', 'b', 'c'].includes(args.unknownSide) ? args.unknownSide : null,
            });
            // A new figure is a new question — clear the previous reasoning.
            setStudentThinking(null);
            setRevealed(prev => (prev.includes('triangle') ? prev : [...prev, 'triangle']));
          }
          break;
        }

        case 'show_student_thinking': {
          const verdict = ['sound', 'checking', 'breaks_down'].includes(args.verdict)
            ? args.verdict : 'checking';
          setStudentThinking({
            method: String(args.method || ''),
            faultyStep: args.faultyStep ? String(args.faultyStep) : undefined,
            verdict,
          });
          break;
        }

        case 'assess_child_reasoning': {
          if (serverResult && serverResult.result === 'checking') {
            const said = String(args.childReasoning || args.childAnswer || '');
            if (said) setStudentThinking({ method: said, verdict: 'checking' });
          }
          if (serverResult && serverResult.result === 'assessed') {
            setLiveAssessment(serverResult as LiveAssessment);
            if (serverResult.mastery?.after !== undefined) setLiveMastery(serverResult.mastery.after);
            if (Array.isArray(serverResult.misconceptions)) setLiveMisconceptions(serverResult.misconceptions);
            // Reflect the verdict onto the child's method already on the board.
            setStudentThinking(prev => {
              const summary = serverResult.reasoningSummary || prev?.method || '';
              if (!summary) return prev;
              const verdict: StudentThinking['verdict'] =
                serverResult.classification === 'clear_reasoning' ? 'sound'
                : serverResult.shouldProbe ? 'checking'
                : 'breaks_down';
              return { method: summary, faultyStep: serverResult.faultyStep || undefined, verdict };
            });
          }
          break;
        }

        case 'record_confusion_signal': {
          // Acknowledged on the server; nothing to draw. Never surfaced as a failure.
          break;
        }

        case 'update_chalkboard_notes': {
          const bulletPoints = Array.isArray(args.bulletPoints) ? args.bulletPoints : [];
          const coreRule = args.coreRuleOrFormula || undefined;
          const title = args.title || undefined;

          setBoardNote({ title, lines: bulletPoints.map(String), formula: coreRule });
          // Writing on the board: switch to the chalkboard, on a fresh page.
          setPanelMode('chalk');
          setBlackboard(prev => ({ ...prev, customLiveNotes: [] }));
          if (coreRule) revealPart('formula');

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
            setPanelMode('chalk');
          }
          break;
        }

        case 'switch_board_view': {
          let tab = args.tab as BlackboardTab;
          if ((tab as any) === 'diagram') tab = '2d';
          if (['2d', '3d', 'photo', 'chalkboard', 'explorer', 'quiz'].includes(tab)) {
            setBlackboard((prev) => ({ ...prev, activeTab: tab }));
          }
          // Six legacy tabs collapse onto three views: real world, shape, 3D.
          setPanelMode(tab === '3d' ? '3d' : tab === 'photo' ? 'real' : tab === 'chalkboard' ? 'chalk' : 'shape');
          break;
        }

        case 'generate_photo_visual': {
          setPanelMode('real');
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
          revealPart(resolvePart(target));
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

          // Put the question on the chalkboard so the child can see what to solve.
          // (Before, this only updated the old blackboard's quiz tab, which the
          // immersive stage never shows — the board looked frozen.) The answer
          // and explanation are NOT written: the child works it out.
          if (question) {
            const opts: string[] = Array.isArray(options) ? options.map(String).filter(Boolean) : [];
            setBoardNote({
              title: 'Your turn',
              lines: [`Question: ${question}`, ...opts.map((o, i) => `${'ABCDEFGH'[i] || i + 1})  ${o}`)],
            });
            setBlackboard(prev => ({ ...prev, customLiveNotes: [] }));
            setPanelMode('chalk');
          }

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

        case 'update_diagram': {
          const focus = String(args.focus || '');
          revealPart(resolvePart(focus));
          const currentTopic = topic;
          const currentGrade = grade;
          // Show 2D tab immediately with a loading indicator while we fetch
          setBlackboard((prev) => ({ ...prev, activeTab: '2d' }));
          // Async call to regenerate diagram — don't block the tool call response
          (async () => {
            try {
              const res = await fetch('/api/update-diagram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: currentTopic, grade: currentGrade, focus }),
              });
              const json = await res.json();
              if (json.success && json.diagram) {
                setBlackboard((prev) => {
                  if (!prev.lessonData) return prev;
                  return {
                    ...prev,
                    activeTab: '2d',
                    highlightedNodeId: null,
                    lessonData: {
                      ...prev.lessonData,
                      diagram: json.diagram,
                    },
                  };
                });
              }
            } catch (err) {
              console.warn('[update_diagram] Diagram update failed silently:', err);
            }
          })();
          break;
        }

        default:
          console.warn(`[App] Unhandled tool call: ${name}`);
      }
    },
    [grade, topic, loadLesson, revealPart]
  );

  // ─── Adaptive session handlers ─────────────────────────────
  const handleStartSession = async (studentId: string, name: string, grade: string, subjectId: string) => {
    try {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, name, grade, subjectId }),
      });
      const json = await res.json();
      if (json.sessionId) {
        setSessionId(json.sessionId);
        setLearnerProfile(json.learner);
        setAdaptiveSession(json.session || {
          sessionId: json.sessionId, studentId, subjectId,
          currentConceptId: json.currentConcept?.id,
          currentStrategy: 'direct_explanation',
          sessionStarted: Date.now(), interactionCount: 0, recentAttempts: [],
        });
        setCurrentConcept(json.currentConcept || null);
        // Panel stays closed — user can open it via the Profile button in the top nav
        // Load lesson for this concept
        if (json.currentConcept) loadLesson(json.currentConcept.label, grade);
        setOutputTranscript({
          id: `session-${Date.now()}`,
          text: `Welcome back, ${name}! Today we are working on "${json.currentConcept?.label}". I have tailored this session based on your learning history.`,
          timestamp: Date.now(),
        });
      }
    } catch (err) { console.error('[Session] Failed to start:', err); }
  };

  const handleAdaptiveQuizAnswer = async (selectedIdx: number) => {
    // First update UI normally
    setBlackboard(prev => ({ ...prev, selectedQuizOption: selectedIdx, showQuizResult: true }));

    if (!sessionId || !blackboard.lessonData) return;
    const quiz = blackboard.lessonData.quiz;
    if (!quiz) return;

    try {
      const res = await fetch(`/api/session/${sessionId}/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionSummary: quiz.question,
          studentAnswer: quiz.options[selectedIdx],
          correctAnswer: quiz.options[quiz.correctIndex],
          selectedOptionIndex: selectedIdx,
          correctOptionIndex: quiz.correctIndex,
        }),
      });
      const json = await res.json();
      if (json.assessment) {
        setLastAssessment(json.assessment);
        if (json.learner) setLearnerProfile(json.learner);
        if (json.session) setAdaptiveSession(json.session);
        if (json.advancedToConcept) {
          setCurrentConcept(json.advancedToConcept);
          setOutputTranscript({
            id: `advance-${Date.now()}`,
            text: `Excellent! You have shown solid understanding. Let us move on to "${json.advancedToConcept.label}".`,
            timestamp: Date.now(),
          });
        } else if (json.assessment.recommendedAction === 'switch_strategy') {
          setOutputTranscript({
            id: `switch-${Date.now()}`,
            text: `Good try! ${json.assessment.teachingNote} Let me explain this differently — using a ${json.nextStrategy?.replace(/_/g,' ')} approach.`,
            timestamp: Date.now(),
          });
        }
      }
    } catch (err) { console.error('[Assessment] Failed:', err); }
  };

  const handleCurriculumLoaded = (subjectId: string, label: string) => {
    setUploadModalOpen(false);
    setCurriculaVersion(v => v + 1);
    setOutputTranscript({
      id: `curriculum-${Date.now()}`,
      text: `Curriculum loaded: "${label}". You can now start an adaptive session on this topic.`,
      timestamp: Date.now(),
    });
  };

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
      const wsUrl = liveWebSocketUrl(activeTopic, grade);

      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('[WebSocket] Connected to Gemini Live', wsUrl);
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
          } else if (msg.type === 'learner_update' && msg.snapshot) {
            applyLearnerSnapshot(msg.snapshot as LearnerSnapshot);
          } else if (msg.type === 'session_ready') {
            setConnectionStatus('connected');
            setLearnerSnap(null); setLiveMastery(0); setLiveMisconceptions([]); setLiveAssessment(null);
          } else if (msg.type === 'interrupted') {
            audioMgr.flushPlayback();
          } else if (msg.type === 'tool_call') {
            handleToolCall(msg.name, msg.args);
          } else if (msg.type === 'error') {
            console.error('[WebSocket] Server reported error:', msg);
            setConnectionStatus('error');
            if (msg.message) {
              setOutputTranscript({
                id: `err-${Date.now()}`,
                text: String(msg.message),
                timestamp: Date.now(),
              });
            }
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

  // A confusion button is the child speaking. It goes into the conversation as
  // a real turn so the tutor responds to it, and it is never framed as a failure.
  const CONFUSION_PHRASES: Record<string, string> = {
    dont_understand:    "I don't understand this bit.",
    repeat_differently: 'Can you explain that a different way?',
    too_fast:           "That's going a bit too fast for me.",
    guessed:            'I should say — I guessed that one.',
  };

  // Everything on the learner panel comes from here once a session is running.
  const applyLearnerSnapshot = useCallback((snap: LearnerSnapshot) => {
    setLearnerSnap(snap);
    setLiveMastery(snap.understanding);
    setLiveMisconceptions(snap.misconceptions.map(m => ({ id: m.id, text: m.text, status: m.status })));
    setLiveAssessment(prev => ({
      ...(prev || { classification: 'observed', understandingDepth: snap.level, confidence: 'medium' as const }),
      understandingDepth: snap.level,
      concept: snap.concept,
      probeQuestion: snap.probeQuestion || null,
      mastery: { before: prev?.mastery?.after ?? 0, after: snap.understanding, derivation: 'live observer' },
      misconceptions: snap.misconceptions,
    }));
    if (snap.evidence) {
      const open = snap.misconceptions.some(m => m.status !== 'resolved' && m.evidence && snap.evidence.includes(m.evidence.slice(0, 20)));
      const sound = ['explains', 'applies', 'transfers'].includes(snap.level);
      setStudentThinking({ method: snap.evidence, verdict: open ? 'checking' : sound ? 'sound' : 'checking' });
    }
  }, []);

  const handleConfusion = useCallback((signal: string) => {
    const phrase = CONFUSION_PHRASES[signal] || CONFUSION_PHRASES.dont_understand;
    setInputTranscript({ id: `confusion-${Date.now()}`, text: phrase, timestamp: Date.now() });
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', text: phrase }));
    } else {
      setOutputTranscript({
        id: `confusion-ack-${Date.now()}`,
        text: "Good — telling me that is genuinely the most useful thing you can do. Start the voice lesson and I'll take it from there, slower.",
        timestamp: Date.now(),
      });
    }
  }, []);

  useEffect(() => {
    if (connectionStatus === 'connected') {
      setRevealed(prev => (prev.length ? prev : ['triangle', 'right-angle', 'leg-a', 'leg-b', 'hypotenuse', 'formula']));
    }
  }, [connectionStatus]);

  // ─── "Thinking" indicator ──────────────────────────────────────
  // Gap between the child finishing and the tutor's first word: show that the
  // tutor heard them, instead of a silent screen. Driven only by the mic level
  // and the tutor's own output level — the voice connection is not touched.
  const micRef = useRef(0);
  const tutorSpeakingRef = useRef(false);
  const tutorQuietSinceRef = useRef(0);
  useEffect(() => { micRef.current = micLevel; }, [micLevel]);
  useEffect(() => {
    tutorSpeakingRef.current = tutorState.isSpeaking;
    if (tutorState.isSpeaking) setThinking(false);
    else tutorQuietSinceRef.current = Date.now();
  }, [tutorState.isSpeaking, setThinking]);
  useEffect(() => {
    if (connectionStatus !== 'connected') { setThinking(false); return; }
    let speechMs = 0, quietMs = 0, heardChild = false;
    const iv = window.setInterval(() => {
      // While the tutor talks (and just after), the mic mostly hears the tutor.
      if (tutorSpeakingRef.current || Date.now() - tutorQuietSinceRef.current < 400) {
        speechMs = 0; quietMs = 0; heardChild = false; return;
      }
      if (micRef.current > 0.12) {
        speechMs += 100; quietMs = 0;
        if (speechMs >= 300) heardChild = true;
      } else {
        quietMs += 100;
        if (quietMs >= 300) speechMs = 0;
        if (heardChild && quietMs >= 600) { heardChild = false; setThinking(true); }
      }
    }, 100);
    return () => window.clearInterval(iv);
  }, [connectionStatus, setThinking]);

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

  // ─── Screen navigation handlers ─────────────────────────────
  const handleLogin = (profile: StudentProfile) => {
    setLoggedInStudent(profile);
    setGrade(profile.grade);
    setScreen('subject-select');
  };

  const handleSubjectConceptSelect = async (
    subjectId: string, subjectLabel: string,
    conceptId: string, conceptLabel: string, studentGrade: string
  ) => {
    if (!loggedInStudent) return;
    try {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: loggedInStudent.studentId,
          name: loggedInStudent.name,
          grade: studentGrade,
          subjectId,
        }),
      });
      const json = await res.json();
      if (json.sessionId) {
        setSessionId(json.sessionId);
        setLearnerProfile(json.learner);
        setAdaptiveSession(json.session || {
          sessionId: json.sessionId,
          studentId: loggedInStudent.studentId,
          subjectId,
          currentConceptId: conceptId,
          currentStrategy: 'direct_explanation',
          sessionStarted: Date.now(), interactionCount: 0, recentAttempts: [],
        });
        setCurrentConcept(json.currentConcept || null);
        // Panel stays closed — user can open it via the Profile button in the top nav

      }
    } catch (err) { console.error('[Session] Failed to start:', err); }
    setTopic(conceptLabel);
    setGrade(studentGrade);
    setScreen('tutor');
    loadLesson(conceptLabel, studentGrade);
    setOutputTranscript({
      id: `welcome-${Date.now()}`,
      text: `Hi ${loggedInStudent?.name || 'there'}! Today we are diving into "${conceptLabel}". I have prepared this session just for you — let's go!`,
      timestamp: Date.now(),
    });
  };

  // ─── Screen rendering ─────────────────────────────────────────
  if (screen === 'login') {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onParentPortal={() => setScreen('parent-portal')}
      />
    );
  }

  if (screen === 'parent-portal') {
    return (
      <>
        <ParentPortal
          onBack={() => setScreen(loggedInStudent ? 'subject-select' : 'login')}
          initialStudentId={loggedInStudent?.studentId}
        />
        <CurriculumUpload
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onCurriculumLoaded={handleCurriculumLoaded}
        />
      </>
    );
  }

  if (screen === 'subject-select' && loggedInStudent) {
    return (
      <>
        <SubjectSelector
          key={curriculaVersion}
          student={loggedInStudent as any}
          onSelectSubjectConcept={handleSubjectConceptSelect}
          onLogout={() => { setLoggedInStudent(null); setScreen('login'); }}
          onUploadCurriculum={() => setUploadModalOpen(true)}
          onParentPortal={() => setScreen('parent-portal')}
        />
        <CurriculumUpload
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onCurriculumLoaded={(sid, label) => { handleCurriculumLoaded(sid, label); setUploadModalOpen(false); }}
        />
      </>
    );
  }

  // ─── Main tutor screen ────────────────────────────────────────
  return (
    <div
      id="app-root"
      className={`w-screen h-screen flex flex-col font-sans antialiased overflow-hidden select-none ${
        BOARD_SURFACE === 'immersive' ? 'bg-[#0C0F16] text-white' : 'bg-[#F6F7F9] text-[#161A22]'
      }`}
    >
      {/* GLOBAL TOP NAVIGATION — immersive supplies its own single bar. */}
      {BOARD_SURFACE !== 'immersive' && (
      <header
        id="top-nav-bar"
        className={`h-14 w-full px-4 flex items-center justify-between z-30 ${
          BOARD_SURFACE === 'immersive'
            ? 'bg-[#0C0F16] border-b border-white/[0.07]'
            : 'bg-[#FFFFFF] border-b border-[#E3E6EC] shadow-md'
        }`}
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

        {/* Right: Student info + controls */}
        <div className="flex items-center gap-2">
          {loggedInStudent && (
            <button
              onClick={() => setScreen('subject-select')}
              className="p-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#F1F0FE] border border-[#DDE1E8] text-[#8A93A3] hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 px-2.5"
            >
              <span className="text-xs font-medium">← Subjects</span>
            </button>
          )}
          <button
            onClick={() => setProfilePanelOpen(p => !p)}
            title="Learner profile"
            className="p-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#F1F0FE] border border-[#DDE1E8] text-[#8A93A3] hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 px-2.5"
          >
            <span className="text-xs font-medium">👤 {loggedInStudent?.name || 'Profile'}</span>
          </button>
          {topic && (
            <button
              onClick={() => loadLesson(topic, grade)}
              disabled={blackboard.isLoading}
              title="Regenerate dynamic lesson"
              className="p-1.5 rounded-lg bg-[#FFFFFF] hover:bg-[#F1F0FE] border border-[#DDE1E8] text-[#8A93A3] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${blackboard.isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </header>
      )}

      {/* MAIN WORKSPACE */}
      <main id="main-workspace" className="flex-1 w-full flex flex-row overflow-hidden min-h-0">
        {/* Left: Animated Vector Character Tutor — only for the non-immersive surfaces,
            since the immersive stage carries its own presenter. */}
        {BOARD_SURFACE !== 'immersive' && (
        <section
          id="animated-tutor-section"
          className="w-[30%] min-w-[280px] max-w-[380px] h-full flex flex-col min-h-0"
        >
          <AnimatedTutorCharacter
            tutorState={tutorState}
            outputTranscript={outputTranscript}
            inputTranscript={inputTranscript}
            currentTopic={topic}
            currentGrade={grade}
          />
        </section>
        )}

        {/* Right: Teaching surface */}
        <section id="dynamic-blackboard-section" className="flex-1 h-full relative min-h-0">
          {BOARD_SURFACE === 'immersive' ? (
            <ImmersiveStage
              conceptLabel={liveAssessment?.concept?.label || currentConcept?.label || topic || 'Your lesson'}
              subject={blackboard.lessonData?.subject || 'Maths'}
              grade={grade}
              figure={figure}
              revealed={revealed}
              focusPart={focusPart}
              studentThinking={studentThinking}
              assessment={liveAssessment}
              notes={boardNote}
              liveNotes={blackboard.customLiveNotes}
              masteryScore={liveMastery}
              misconceptions={liveMisconceptions}
              isLessonActive={connectionStatus === 'connected' || connectionStatus === 'reconnecting'}
              isSpeaking={tutorState.isSpeaking}
              isThinking={tutorThinking}
              learner={learnerSnap}
              mouthOpenness={tutorState.mouthOpenness}
              micLevel={micLevel}
              panelMode={panelMode}
              scene={getScene(sceneId)}
              scene3d={blackboard.lessonData?.scene3d}
              tutorLine={outputTranscript?.text}
              presenter={PRESENTER}
              studentName={loggedInStudent?.name}
              onChangeTopic={() => setScreen('subject-select')}
              onOpenProfile={() => setProfilePanelOpen(p => !p)}
              onPanelModeChange={setPanelMode}
              onConfusion={handleConfusion}
              onToggleLesson={toggleVoiceLesson}
            />
          ) : BOARD_SURFACE === 'canvas' ? (
            <TeachingCanvas
              topic={topic || 'Your lesson'}
              conceptLabel={liveAssessment?.concept?.label || currentConcept?.label || topic}
              figure={figure}
              revealed={revealed}
              focusPart={focusPart}
              studentThinking={studentThinking}
              assessment={liveAssessment}
              notes={boardNote}
              masteryScore={liveMastery}
              misconceptions={liveMisconceptions}
              isLessonActive={connectionStatus === 'connected'}
              onConfusion={handleConfusion}
            />
          ) : (
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
              if (sessionId) {
                handleAdaptiveQuizAnswer(idx);
              } else {
                setBlackboard((prev) => ({
                  ...prev,
                  selectedQuizOption: idx,
                  showQuizResult: true,
                }));
              }
            }}
            onAskSuggestedQuestion={handleAskSuggestedQuestion}
            onSetTopicOnTheFly={handleApplyTopicAndGrade}
            onAskVisualOrCommand={handleAskVisualOrCommand}
            onGeneratePhoto={handleGeneratePhoto}
          />
          )}
        </section>
      </main>

      {/* ADAPTIVE COMPONENTS */}
      <LearnerProfilePanel
        hideTab={BOARD_SURFACE === 'immersive'}
        learner={learnerProfile}
        session={adaptiveSession}
        currentConcept={currentConcept}
        lastAssessment={lastAssessment}
        onStartSession={handleStartSession}
        onAssessQuiz={handleAdaptiveQuizAnswer as any}
        sessionId={sessionId}
        isVisible={profilePanelOpen}
        onToggle={() => setProfilePanelOpen(p => !p)}
      />
      <CurriculumUpload
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onCurriculumLoaded={handleCurriculumLoaded}
      />

      {/* BOTTOM CONTROL BAR — immersive stage supplies its own, so skip it there. */}
      {BOARD_SURFACE !== 'immersive' && (
      <BottomBar
        isLessonActive={connectionStatus === 'connected' || connectionStatus === 'connecting'}
        connectionStatus={connectionStatus}
        micLevel={micLevel}
        currentTopic={topic || 'Any Topic on the Fly'}
        onToggleLesson={toggleVoiceLesson}
      />
      )}
    </div>
  );
};

export default App;
