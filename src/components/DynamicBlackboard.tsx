import React, { useState } from 'react';
import {
  BlackboardState,
  DynamicLessonData,
  BlackboardTab,
  ConceptNode,
  GradeLevel,
} from '../types';
import {
  Sparkles,
  Layers,
  FileText,
  Sliders,
  HelpCircle,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Lightbulb,
  BookOpen,
  Play,
  RotateCcw,
  Zap,
  Box,
  Camera,
  Compass,
  Send,
  GraduationCap,
  Atom,
  Globe2,
  Dna,
} from 'lucide-react';
import { Interactive3DVisual } from './Interactive3DVisual';
import { PhotoRealisticVisual } from './PhotoRealisticVisual';
import { Interactive2DDiagram } from './Interactive2DDiagram';

interface DynamicBlackboardProps {
  blackboard: BlackboardState;
  onTabChange: (tab: BlackboardTab) => void;
  onNodeClick: (node: ConceptNode) => void;
  onVariableChange: (varId: string, val: number) => void;
  onQuizAnswer: (index: number) => void;
  onAskSuggestedQuestion?: (question: string) => void;
  onSetTopicOnTheFly?: (topic: string, grade?: string) => void;
  onAskVisualOrCommand?: (command: string) => void;
  onGeneratePhoto?: (customPrompt?: string) => void;
}

const INSPIRING_TOPICS = [
  { topic: 'Quantum Superposition & Qubits', grade: 'High School (Grade 9-12)', icon: Atom },
  { topic: 'DNA Replication & Double Helix', grade: 'Secondary 2 (Grade 8)', icon: Dna },
  { topic: 'Black Holes & Event Horizons', grade: 'College / Undergraduate', icon: Sparkles },
  { topic: 'The French Revolution & Bastille', grade: 'Middle School (Grade 6-8)', icon: Globe2 },
  { topic: 'Neural Networks & Backpropagation', grade: 'College / Undergraduate', icon: Zap },
  { topic: 'Plate Tectonics & Continental Drift', grade: 'Secondary 2 (Grade 8)', icon: Compass },
];

export const DynamicBlackboard: React.FC<DynamicBlackboardProps> = ({
  blackboard,
  onTabChange,
  onNodeClick,
  onVariableChange,
  onQuizAnswer,
  onAskSuggestedQuestion,
  onSetTopicOnTheFly,
  onAskVisualOrCommand,
  onGeneratePhoto,
}) => {
  const {
    activeTab,
    lessonData,
    isLoading,
    isGeneratingPhoto,
    highlightedNodeId,
    interactiveValues,
    selectedQuizOption,
    showQuizResult,
    customLiveNotes,
  } = blackboard;

  const [inputTopic, setInputTopic] = useState('');
  const [inputGrade, setInputGrade] = useState<string>('Secondary 2 (Grade 8)');
  const [askCommand, setAskCommand] = useState('');

  // Handle on-the-fly launcher submission
  const handleLaunchTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputTopic.trim() || !onSetTopicOnTheFly) return;
    onSetTopicOnTheFly(inputTopic.trim(), inputGrade);
  };

  // Handle in-lesson visual or command submission
  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!askCommand.trim()) return;
    const cmd = askCommand.trim().toLowerCase();

    // Direct mode triggers
    if (cmd.includes('3d') || cmd.includes('three d') || cmd.includes('spatial')) {
      onTabChange('3d');
    } else if (cmd.includes('photo') || cmd.includes('picture') || cmd.includes('image') || cmd.includes('real')) {
      onTabChange('photo');
      if (cmd.length > 8 && onGeneratePhoto) {
        onGeneratePhoto(askCommand.trim());
      }
    } else if (cmd.includes('2d') || cmd.includes('diagram') || cmd.includes('flow')) {
      onTabChange('2d');
    } else if (cmd.includes('chalk') || cmd.includes('note')) {
      onTabChange('chalkboard');
    } else if (cmd.includes('quiz') || cmd.includes('test')) {
      onTabChange('quiz');
    } else if (cmd.includes('sim') || cmd.includes('sandbox') || cmd.includes('explore')) {
      onTabChange('explorer');
    }

    if (onAskVisualOrCommand) {
      onAskVisualOrCommand(askCommand.trim());
    }
    setAskCommand('');
  };

  // 1. LOADING STATE
  if (isLoading) {
    return (
      <div
        id="blackboard-loading"
        className="w-full h-full flex flex-col items-center justify-center bg-[#071910] text-[#e8f5ee] p-8 border-l border-[#1b3d2b] relative overflow-hidden select-none"
      >
        <div className="absolute inset-0 bg-[radial-gradient(#1f4a33_1px,transparent_1px)] [background-size:24px_24px] opacity-30 pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-amber-400 p-0.5 shadow-2xl mb-5 animate-spin">
            <div className="w-full h-full bg-[#071910] rounded-2xl flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-amber-300" />
            </div>
          </div>
          <h2 className="text-xl font-bold font-serif text-[#f2faf5] mb-2 tracking-wide">
            AI Tutor Synthesizing Fresh Lesson...
          </h2>
          <p className="text-xs text-[#8ab69e] leading-relaxed">
            Constructing 2D diagrams, 3D spatial models, photorealistic observational studies, chalk lecture notes, and simulations on the fly.
          </p>
        </div>
      </div>
    );
  }

  // 2. NO TOPIC YET -> ON-THE-FLY TOPIC LAUNCHER CANVAS
  if (!lessonData) {
    return (
      <div
        id="blackboard-launcher"
        className="w-full h-full flex flex-col items-center justify-center bg-[#071910] text-[#e8f5ee] p-6 sm:p-10 border-l border-[#1b3d2b] relative overflow-y-auto select-none"
      >
        <div className="absolute inset-0 bg-[radial-gradient(#1e4d35_1px,transparent_1px)] [background-size:24px_24px] opacity-35 pointer-events-none" />
        <div className="relative z-10 max-w-2xl w-full flex flex-col items-center text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0e2a1b] border border-[#23583a] text-xs font-mono text-amber-300 mb-4 shadow-sm">
            <GraduationCap className="w-4 h-4 text-emerald-400" />
            <span>AI CLASSROOM &bull; TOPIC ON THE FLY</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-bold font-serif text-white tracking-wide mb-3">
            What would you like Dr. Vance to teach you?
          </h1>
          <p className="text-xs sm:text-sm text-[#9ec4af] max-w-lg mb-6 leading-relaxed">
            Enter any subject or topic on the fly. Dr. Vance will generate real-time 2D diagrams, 3D interactive models, photographic visuals, and chalk notes.
          </p>

          {/* Topic Input Form */}
          <form
            onSubmit={handleLaunchTopic}
            className="w-full p-2 bg-[#092215]/95 border-2 border-[#204e33] rounded-2xl shadow-2xl backdrop-blur-md mb-6 flex flex-col sm:flex-row items-center gap-2"
          >
            <input
              type="text"
              value={inputTopic}
              onChange={(e) => setInputTopic(e.target.value)}
              placeholder="Enter ANY topic (e.g. Black Holes, Photosynthesis, French Revolution)..."
              className="w-full sm:flex-1 px-4 py-3 text-sm rounded-xl bg-[#06180e] border border-[#1b3d29] text-white placeholder-[#5e8b72] focus:outline-none focus:border-amber-400"
            />
            <select
              value={inputGrade}
              onChange={(e) => setInputGrade(e.target.value)}
              className="px-3 py-3 text-xs rounded-xl bg-[#06180e] border border-[#1b3d29] text-[#a1d6b9] focus:outline-none focus:border-amber-400 font-semibold cursor-pointer"
            >
              <option value="Elementary (Grade 3-5)">Grade 3-5 (Elementary)</option>
              <option value="Middle School (Grade 6-8)">Grade 6-8 (Middle School)</option>
              <option value="Secondary 2 (Grade 8)">Grade 8 (Secondary 2)</option>
              <option value="High School (Grade 9-12)">Grade 9-12 (High School)</option>
              <option value="College / Undergraduate">College / Undergraduate</option>
              <option value="Beginner / Self-Learner">Self-Learner / General</option>
            </select>
            <button
              type="submit"
              disabled={!inputTopic.trim()}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-amber-400 text-black font-bold text-sm flex items-center justify-center gap-2 hover:opacity-95 transition-opacity disabled:opacity-40 cursor-pointer shadow-lg"
            >
              <Sparkles className="w-4 h-4" />
              <span>Teach Me</span>
            </button>
          </form>

          {/* Quick Inspirations */}
          <div className="w-full text-left">
            <span className="text-[11px] uppercase tracking-wider font-mono font-bold text-[#6f9d83] block mb-2">
              Or pick an instant concept to explore:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {INSPIRING_TOPICS.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (onSetTopicOnTheFly) onSetTopicOnTheFly(item.topic, item.grade);
                    }}
                    className="p-3 rounded-xl bg-[#0a2316] hover:bg-[#103421] border border-[#1b432a] hover:border-emerald-400 text-left transition-all group cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 group-hover:bg-emerald-500/20">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white group-hover:text-amber-300 block">
                          {item.topic}
                        </span>
                        <span className="text-[10px] text-[#7aa58d]">{item.grade}</span>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-[#5e8b72] group-hover:text-amber-300 transform group-hover:translate-x-0.5 transition-transform" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. ACTIVE LESSON STATE
  const { topic, grade, subject, tagline, overview, diagram, chalkNotes, explorer, quiz, suggestedQuestions } =
    lessonData;

  // Normalized tab value ('diagram' is treated as '2d')
  const currentTab: BlackboardTab = activeTab === ('diagram' as any) ? '2d' : activeTab;

  return (
    <div
      id="dynamic-blackboard-container"
      className="w-full h-full flex flex-col bg-[#071910] text-[#f4faf6] relative overflow-hidden select-none border-l border-[#193a27]"
    >
      {/* Chalkboard Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e4d35_1px,transparent_1px)] [background-size:28px_28px] opacity-35 pointer-events-none" />
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-500" />

      {/* TOP HEADER BAR: Topic Name, Grade, and Dynamic View Tabs */}
      <header
        id="lesson-top-bar"
        className="w-full px-4 py-2 bg-[#092215]/95 backdrop-blur-md border-b border-[#1b432a] flex flex-wrap items-center justify-between gap-2.5 z-20"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {subject}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-semibold bg-[#122e1e] text-[#86b59b] border border-[#235839]">
                {grade}
              </span>
            </div>
            <h1 className="text-base sm:text-lg font-bold font-serif text-[#ffffff] tracking-wide mt-0.5 flex items-center gap-1.5">
              <span>{topic}</span>
              <span className="text-xs font-sans font-normal text-[#9ec4af] hidden md:inline">
                &mdash; {tagline}
              </span>
            </h1>
          </div>
        </div>

        {/* Dynamic Blackboard Tabs for 2D, 3D, Photo, Chalkboard, Sandbox, Quiz */}
        <nav className="flex items-center gap-1 bg-[#0e2a1b] p-1 rounded-xl border border-[#23583a] shadow-inner flex-wrap">
          {/* 2D Diagram */}
          <button
            onClick={() => onTabChange('2d')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              currentTab === '2d'
                ? 'bg-emerald-500 text-black font-bold shadow-md'
                : 'text-[#9ec4af] hover:text-[#f4faf6] hover:bg-[#143825]'
            }`}
            title="2D Interactive Concept Diagram"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2D Diagram</span>
          </button>

          {/* 3D Spatial Model */}
          <button
            onClick={() => onTabChange('3d')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              currentTab === '3d'
                ? 'bg-emerald-400 text-black font-bold shadow-md'
                : 'text-[#9ec4af] hover:text-[#f4faf6] hover:bg-[#143825]'
            }`}
            title="3D Interactive Spatial Scene"
          >
            <Box className="w-3.5 h-3.5 text-amber-300" />
            <span>3D Spatial</span>
          </button>

          {/* Photo / Realistic Visual */}
          <button
            onClick={() => onTabChange('photo')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              currentTab === 'photo'
                ? 'bg-amber-400 text-black font-bold shadow-md'
                : 'text-[#9ec4af] hover:text-[#f4faf6] hover:bg-[#143825]'
            }`}
            title="AI Photorealistic Observational Study"
          >
            <Camera className="w-3.5 h-3.5 text-amber-300" />
            <span>Photo Visual</span>
          </button>

          {/* Chalkboard Notes */}
          <button
            onClick={() => onTabChange('chalkboard')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              currentTab === 'chalkboard'
                ? 'bg-amber-300 text-black font-bold shadow-md'
                : 'text-[#9ec4af] hover:text-[#f4faf6] hover:bg-[#143825]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Chalk Notes</span>
          </button>

          {/* Experiment Sandbox */}
          {explorer && (
            <button
              onClick={() => onTabChange('explorer')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                currentTab === 'explorer'
                  ? 'bg-sky-400 text-black font-bold shadow-md'
                  : 'text-[#9ec4af] hover:text-[#f4faf6] hover:bg-[#143825]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Sandbox</span>
            </button>
          )}

          {/* Challenge Quiz */}
          {quiz && (
            <button
              onClick={() => onTabChange('quiz')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                currentTab === 'quiz'
                  ? 'bg-rose-400 text-black font-bold shadow-md'
                  : 'text-[#9ec4af] hover:text-[#f4faf6] hover:bg-[#143825]'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Quiz</span>
            </button>
          )}
        </nav>
      </header>

      {/* QUICK COMMAND / ASK BAR: Ask tutor or request 2D, 3D, Photo, Notes on the fly */}
      <div className="w-full px-4 py-1.5 bg-[#061a0f] border-b border-[#1b432a] flex flex-wrap items-center justify-between gap-2 z-20">
        <form onSubmit={handleCommandSubmit} className="flex-1 flex items-center gap-2 max-w-xl">
          <span className="text-[10px] uppercase font-mono font-bold text-amber-400 hidden sm:inline">
            ON THE FLY:
          </span>
          <input
            type="text"
            value={askCommand}
            onChange={(e) => setAskCommand(e.target.value)}
            placeholder="Ask Dr. Vance or command: e.g. 'Show in 3D', 'Photo of...', 'Switch topic to...'"
            className="flex-1 px-3 py-1 text-xs rounded-xl bg-[#0a2717] border border-[#1e4e32] text-white placeholder-[#5e8b72] focus:outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={!askCommand.trim()}
            className="px-2.5 py-1 rounded-xl bg-[#143d26] hover:bg-[#1a4f32] text-amber-300 font-semibold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40 transition-colors"
          >
            <Send className="w-3 h-3" />
            <span>Send</span>
          </button>
        </form>

        {/* Quick Mode Chips */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onTabChange('2d')}
            className="px-2 py-0.5 rounded-md bg-[#0a2316] hover:bg-[#113823] border border-[#1f4a32] text-[11px] text-[#9fc7b1] hover:text-white cursor-pointer"
          >
            📐 2D Flow
          </button>
          <button
            onClick={() => onTabChange('3d')}
            className="px-2 py-0.5 rounded-md bg-[#0a2316] hover:bg-[#113823] border border-[#1f4a32] text-[11px] text-[#9fc7b1] hover:text-white cursor-pointer"
          >
            🧊 3D Scene
          </button>
          <button
            onClick={() => onTabChange('photo')}
            className="px-2 py-0.5 rounded-md bg-[#0a2316] hover:bg-[#113823] border border-[#1f4a32] text-[11px] text-[#9fc7b1] hover:text-white cursor-pointer"
          >
            📷 Photo Visual
          </button>
        </div>
      </div>

      {/* MAIN VIEWPORT: Render 2D, 3D, Photo, Chalk Notes, Explorer, or Quiz */}
      <main className="flex-1 w-full overflow-y-auto p-4 sm:p-6 z-10">
        {/* ============================================================ */}
        {/* TAB 1: 2D CONCEPT DIAGRAM */}
        {/* ============================================================ */}
        {currentTab === '2d' && (
          <div id="view-diagram" className="w-full animate-fadeIn">
            <Interactive2DDiagram
              diagram={diagram}
              overview={overview}
              highlightedNodeId={highlightedNodeId}
              onNodeClick={onNodeClick}
              onAskTutor={onAskSuggestedQuestion}
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: 3D INTERACTIVE SPATIAL SCENE */}
        {/* ============================================================ */}
        {currentTab === '3d' && (
          <div id="view-3d" className="w-full h-[580px] rounded-3xl overflow-hidden border-2 border-[#204e33] shadow-2xl animate-fadeIn relative">
            <Interactive3DVisual
              sceneData={lessonData.scene3d}
              topic={topic}
              subject={subject}
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: PHOTO / REALISTIC VISUAL */}
        {/* ============================================================ */}
        {currentTab === 'photo' && (
          <div id="view-photo" className="w-full h-[580px] rounded-3xl overflow-hidden border-2 border-[#204e33] shadow-2xl animate-fadeIn relative">
            <PhotoRealisticVisual
              topic={topic}
              grade={grade}
              photoData={lessonData.photoVisual}
              isLoadingPhoto={isGeneratingPhoto}
              onGeneratePhoto={onGeneratePhoto || (() => {})}
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: CHALKBOARD NOTES */}
        {/* ============================================================ */}
        {currentTab === 'chalkboard' && (
          <div id="view-chalkboard" className="w-full flex flex-col gap-6 animate-fadeIn max-w-4xl mx-auto">
            <div className="relative p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#0b2417] to-[#06160e] border-4 border-[#2b583f] shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-[#f2faf5]">
              <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

              {/* Chalk Title Header */}
              <div className="border-b-2 border-dashed border-[#3e7557] pb-4 mb-6 text-center">
                <span className="text-xs tracking-widest uppercase font-mono text-emerald-300">
                  CHALKBOARD LECTURE NOTES &bull; {grade}
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold font-serif text-[#ffffff] tracking-wider mt-1 text-shadow">
                  {chalkNotes.title || topic}
                </h2>
                {chalkNotes.subtitle && (
                  <p className="text-sm text-[#a4d4bc] italic mt-1 font-serif">
                    &ldquo;{chalkNotes.subtitle}&rdquo;
                  </p>
                )}
              </div>

              {/* Core Rule / Formula Callout Box (Golden Chalk) */}
              {chalkNotes.coreRuleOrFormula && (
                <div className="p-4 sm:p-5 rounded-2xl bg-[#133522] border-2 border-amber-400/80 shadow-lg mb-6 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider font-bold text-amber-300 flex items-center gap-1.5 mb-1">
                      <Lightbulb className="w-4 h-4 text-amber-400" />
                      <span>Fundamental Law / Formula / Core Rule:</span>
                    </span>
                    <p className="text-lg sm:text-xl font-mono font-bold text-amber-200 tracking-wide">
                      {chalkNotes.coreRuleOrFormula}
                    </p>
                  </div>
                </div>
              )}

              {/* Detailed Bullet Points */}
              <div className="space-y-3 mb-6">
                <h4 className="text-xs uppercase tracking-wider font-bold text-emerald-300 font-mono">
                  Lecture Breakdown &amp; Concepts:
                </h4>
                {chalkNotes.bulletPoints.map((point, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 rounded-xl bg-[#0f2c1c]/70 border border-[#204e33]"
                  >
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5 border border-emerald-500/40">
                      {index + 1}
                    </span>
                    <p className="text-sm sm:text-base text-[#e8f7ee] font-sans leading-relaxed">
                      {point}
                    </p>
                  </div>
                ))}
              </div>

              {/* Real-time Live Notes Written by AI Tutor During Speech */}
              {customLiveNotes && customLiveNotes.length > 0 && (
                <div className="mt-6 pt-4 border-t-2 border-dashed border-[#2d6244]">
                  <h4 className="text-xs uppercase tracking-wider font-bold text-amber-300 font-mono mb-3 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                    <span>Live Notes Written by Dr. Marcus in Session:</span>
                  </h4>
                  <div className="space-y-2">
                    {customLiveNotes.map((note, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-[#143d26] border border-amber-400/50 text-amber-100 font-mono text-sm animate-fadeIn"
                      >
                        &bull; {note}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Takeaways */}
              {chalkNotes.keyTakeaways && chalkNotes.keyTakeaways.length > 0 && (
                <div className="mt-6 pt-4 border-t border-[#23583a]">
                  <h4 className="text-xs uppercase tracking-wider font-bold text-[#8ab69e] font-mono mb-2">
                    Key Exam / Mastery Takeaways:
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {chalkNotes.keyTakeaways.map((takeaway, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-[#0e2719] border border-[#1d472e] text-xs text-[#a7d8be] flex items-center gap-2"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{takeaway}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 5: SIMULATION SANDBOX */}
        {/* ============================================================ */}
        {currentTab === 'explorer' && explorer && (
          <div id="view-explorer" className="w-full flex flex-col gap-6 animate-fadeIn max-w-4xl mx-auto">
            <div className="p-6 rounded-2xl bg-[#0b2417] border-2 border-[#205135] shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-[#1b432a]">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    INTERACTIVE SIMULATION
                  </span>
                  <h3 className="text-xl font-bold font-serif text-[#ffffff] mt-1">
                    {explorer.title}
                  </h3>
                  <p className="text-xs text-[#9ec4af] mt-0.5">
                    {explorer.description}
                  </p>
                </div>
                {explorer.outcomeFormulaString && (
                  <div className="p-2.5 rounded-xl bg-[#112d1e] border border-[#286341] text-right font-mono text-xs text-amber-300">
                    <span className="text-[10px] text-[#86b59b] block font-sans">Formula Model</span>
                    {explorer.outcomeFormulaString}
                  </div>
                )}
              </div>

              {/* Dynamic Interactive Sliders */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {explorer.variables.map((variable) => {
                  const val = interactiveValues[variable.id] ?? variable.defaultValue;
                  return (
                    <div
                      key={variable.id}
                      className="p-4 rounded-xl bg-[#0e2a1b] border border-[#1d4b30] flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-[#f0faf4]">
                          {variable.name}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-[#163d27] border border-[#23583a] text-xs font-mono font-bold text-amber-300">
                          {val} {variable.unit}
                        </span>
                      </div>

                      <p className="text-[11px] text-[#8ab69e] mb-3 leading-relaxed">
                        {variable.description}
                      </p>

                      <input
                        type="range"
                        min={variable.min}
                        max={variable.max}
                        step={variable.step}
                        value={val}
                        onChange={(e) => onVariableChange(variable.id, parseFloat(e.target.value))}
                        className="w-full accent-emerald-400 bg-[#06180e] h-2 rounded-lg cursor-pointer"
                      />

                      <div className="flex justify-between text-[10px] font-mono text-[#6e9b82] mt-1">
                        <span>
                          {variable.min} {variable.unit}
                        </span>
                        <span>
                          {variable.max} {variable.unit}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Live Outcome Box */}
              {(() => {
                const outcome = explorer.calculateOutcome
                  ? explorer.calculateOutcome(interactiveValues)
                  : { valueText: 'Active', explanation: 'System in equilibrium', status: 'optimal' as const };

                return (
                  <div className="p-5 rounded-xl bg-gradient-to-r from-[#113421] to-[#0e2c1c] border-2 border-emerald-500/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-emerald-300">
                        {explorer.outcomeLabel}
                      </span>
                      <h4 className="text-2xl font-bold font-mono text-white mt-0.5">
                        {outcome.valueText}
                      </h4>
                      <p className="text-xs text-[#b0d8c2] mt-1">{outcome.explanation}</p>
                    </div>
                    <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold font-mono uppercase">
                      Status: {outcome.status}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 6: CONCEPT QUIZ */}
        {/* ============================================================ */}
        {currentTab === 'quiz' && quiz && (
          <div id="view-quiz" className="w-full flex flex-col gap-6 animate-fadeIn max-w-3xl mx-auto">
            <div className="p-6 sm:p-8 rounded-3xl bg-[#092215] border-2 border-[#1f4e34] shadow-2xl">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center font-bold text-sm">
                  ?
                </span>
                <div>
                  <span className="text-[10px] uppercase font-mono font-bold text-rose-300">
                    CONCEPT MASTERY CHALLENGE
                  </span>
                  <h3 className="text-sm font-semibold text-[#a0c8b2]">
                    Test your understanding of {topic}
                  </h3>
                </div>
              </div>

              {/* Question */}
              <h4 className="text-lg sm:text-xl font-bold font-serif text-white mb-6 leading-relaxed">
                {quiz.question}
              </h4>

              {/* Options */}
              <div className="space-y-3 mb-6">
                {quiz.options.map((option, idx) => {
                  const isSelected = selectedQuizOption === idx;
                  const isCorrect = idx === quiz.correctIndex;

                  let btnStyle =
                    'bg-[#0e2a1b] border-[#1d4c30] text-[#e8f7ee] hover:bg-[#143d26] hover:border-emerald-400';

                  if (showQuizResult) {
                    if (isCorrect) {
                      btnStyle = 'bg-emerald-950/80 border-emerald-400 text-emerald-200 ring-2 ring-emerald-400';
                    } else if (isSelected && !isCorrect) {
                      btnStyle = 'bg-rose-950/80 border-rose-400 text-rose-200 ring-2 ring-rose-400';
                    }
                  } else if (isSelected) {
                    btnStyle = 'bg-amber-950/60 border-amber-400 text-amber-200 ring-2 ring-amber-400';
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => onQuizAnswer(idx)}
                      disabled={showQuizResult}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${btnStyle}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-[#06180e] border border-[#23583a] text-xs font-mono font-bold text-amber-300 flex items-center justify-center shrink-0">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="text-sm sm:text-base">{option}</span>
                      </div>
                      {showQuizResult && isCorrect && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      )}
                      {showQuizResult && isSelected && !isCorrect && (
                        <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Explanation Box */}
              {showQuizResult && (
                <div
                  className={`p-4 rounded-2xl border-2 animate-fadeIn ${
                    selectedQuizOption === quiz.correctIndex
                      ? 'bg-emerald-950/40 border-emerald-400/80 text-emerald-100'
                      : 'bg-amber-950/40 border-amber-400/80 text-amber-100'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Lightbulb className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold uppercase tracking-wider font-mono">
                      Pedagogical Explanation:
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm leading-relaxed">{quiz.explanation}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* FOOTER: Thoughtful Suggested Questions to ask Dr. Vance */}
      {suggestedQuestions && suggestedQuestions.length > 0 && (
        <footer className="w-full px-4 py-2 bg-[#061a0f]/90 border-t border-[#1b432a] flex items-center gap-2 overflow-x-auto z-20">
          <span className="text-[10px] uppercase font-mono font-bold text-[#6f9d83] shrink-0">
            Ask Dr. Vance:
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {suggestedQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => onAskSuggestedQuestion && onAskSuggestedQuestion(q)}
                className="px-2.5 py-1 rounded-lg bg-[#0c2718] hover:bg-[#123823] border border-[#1e4e32] text-xs text-[#a2cbba] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                &ldquo;{q}&rdquo;
              </button>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
};
