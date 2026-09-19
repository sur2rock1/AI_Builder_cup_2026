import React, { useEffect, useState, useRef } from 'react';
import { TutorState, TranscriptEntry } from '../types';
import { Volume2, Sparkles, User, GraduationCap, Mic, MicOff } from 'lucide-react';

interface AnimatedTutorProps {
  tutorState: TutorState;
  outputTranscript?: TranscriptEntry | null;
  inputTranscript?: TranscriptEntry | null;
  currentTopic?: string;
  currentGrade?: string;
}

export const AnimatedTutorCharacter: React.FC<AnimatedTutorProps> = ({
  tutorState,
  outputTranscript,
  inputTranscript,
  currentTopic = 'Any Topic',
  currentGrade = 'Grade 8',
}) => {
  const [localBlink, setLocalBlink] = useState(false);
  const [eyeLook, setEyeLook] = useState({ x: 0, y: 0 });
  const [showOutput, setShowOutput] = useState(false);
  const [showInput, setShowInput] = useState(false);

  // Track transcripts display
  useEffect(() => {
    if (outputTranscript?.text) {
      setShowOutput(true);
      const timer = setTimeout(() => setShowOutput(false), 12000);
      return () => clearTimeout(timer);
    }
  }, [outputTranscript?.timestamp, outputTranscript?.text]);

  useEffect(() => {
    if (inputTranscript?.text) {
      setShowInput(true);
      const timer = setTimeout(() => setShowInput(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [inputTranscript?.timestamp, inputTranscript?.text]);

  // Natural blinking cycle (blinks every ~3.5s)
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setLocalBlink(true);
      setTimeout(() => setLocalBlink(false), 180);
    }, 3500 + Math.random() * 1000);
    return () => clearInterval(blinkInterval);
  }, []);

  // Subtle wandering eye glance
  useEffect(() => {
    const glanceInterval = setInterval(() => {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 2.5;
      setEyeLook({
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
      });
    }, 2800);
    return () => clearInterval(glanceInterval);
  }, []);

  // Speech volume reactivity
  const openness = Math.min(1, Math.max(0, tutorState.mouthOpenness));
  const isSpeaking = tutorState.isSpeaking || openness > 0.05;
  const isBlinking = tutorState.isBlinking || localBlink;

  // Calculate mouth morph values
  const mouthHeight = Math.max(3, Math.round(openness * 24));
  const mouthWidth = Math.round(32 + openness * 8);

  return (
    <div
      id="animated-tutor-container"
      className="h-full flex flex-col justify-between items-center p-3 sm:p-4 bg-[#07170e] border-r border-[#193a27] text-[#f3f1e6] relative overflow-hidden select-none"
    >
      {/* Ambient Classroom Glow Beams */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#092214]/90 via-[#06140c]/95 to-[#040c07] pointer-events-none" />
      <div className="absolute -top-16 -left-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -top-8 -right-16 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

      {/* Tutor Identity Tag Header */}
      <div id="tutor-header" className="w-full text-center z-10 pt-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#112b1d] border border-[#235839] shadow-lg">
          <span
            className={`w-2 h-2 rounded-full ${
              isSpeaking ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
            }`}
          />
          <span className="text-xs tracking-wider uppercase font-bold text-[#e1f5eb]">
            {tutorState.name || 'Dr. Marcus Vance'}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 font-bold border border-amber-400/30">
            AI TUTOR
          </span>
        </div>
        <p className="text-[11px] text-[#86b59b] mt-1 font-sans flex items-center justify-center gap-1">
          <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
          <span>Interactive Mentor &bull; {currentGrade}</span>
        </p>
      </div>

      {/* THE ANIMATED VECTOR CHARACTER (100% Dynamic, Vector Art & Morphing SVG) */}
      <div
        id="tutor-avatar-stage"
        className="w-full flex-1 max-h-[380px] flex flex-col items-center justify-center my-auto z-10 relative"
      >
        {/* Dynamic Studio Aura Pulse */}
        <div
          className={`absolute w-56 h-56 rounded-full transition-all duration-300 pointer-events-none ${
            isSpeaking
              ? 'bg-amber-400/20 blur-3xl scale-110'
              : 'bg-emerald-500/15 blur-2xl scale-95'
          }`}
        />

        {/* Character Stage Card */}
        <div className="relative w-56 h-72 rounded-2xl overflow-hidden border-2 border-[#2b6b45] shadow-[0_12px_40px_rgba(0,0,0,0.8)] bg-gradient-to-b from-[#133022] to-[#0a1b12] flex items-center justify-center group">
          {/* Animated SVG Character */}
          <div
            className={`w-full h-full flex items-center justify-center transition-transform duration-300 ${
              isSpeaking ? 'animate-pulse' : ''
            }`}
            style={{
              transform: `translateY(${isSpeaking ? (tutorState.isNodding ? 3 : 1) : 0}px)`,
            }}
          >
            <svg
              viewBox="0 0 240 300"
              className="w-full h-full filter drop-shadow-lg"
            >
              <defs>
                <linearGradient id="skinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffd8b3" />
                  <stop offset="100%" stopColor="#f3be94" />
                </linearGradient>
                <linearGradient id="hairGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#3d261a" />
                  <stop offset="100%" stopColor="#24140b" />
                </linearGradient>
                <linearGradient id="jacketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#1e4632" />
                  <stop offset="100%" stopColor="#0e281b" />
                </linearGradient>
                <linearGradient id="shirtGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#f8fafc" />
                  <stop offset="100%" stopColor="#cbd5e1" />
                </linearGradient>
                <linearGradient id="tieGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#d97706" />
                </linearGradient>
                <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Background ambient halo */}
              <circle cx="120" cy="115" r="90" fill="#1b4731" opacity="0.4" />

              {/* Shoulders / Torso / Academic Attire */}
              <g id="char-torso">
                {/* Jacket Shoulders */}
                <path
                  d="M 40,240 Q 60,200 120,200 Q 180,200 200,240 L 210,310 L 30,310 Z"
                  fill="url(#jacketGrad)"
                  stroke="#153624"
                  strokeWidth="2"
                />
                {/* Inner Shirt Collar */}
                <polygon points="100,200 140,200 130,245 110,245" fill="url(#shirtGrad)" />
                {/* Tie */}
                <polygon points="116,210 124,210 127,270 120,285 113,270" fill="url(#tieGrad)" />
                {/* Jacket Lapels */}
                <polygon points="90,205 112,245 92,275 80,240" fill="#153725" />
                <polygon points="150,205 128,245 148,275 160,240" fill="#153725" />
              </g>

              {/* Neck */}
              <rect x="106" y="170" width="28" height="35" rx="8" fill="url(#skinGrad)" />
              <path d="M 106,190 Q 120,200 134,190" stroke="#d49f75" strokeWidth="2" fill="none" />

              {/* Head / Face */}
              <g id="char-head">
                {/* Ears */}
                <circle cx="68" cy="130" r="14" fill="url(#skinGrad)" stroke="#d49f75" strokeWidth="1.5" />
                <circle cx="172" cy="130" r="14" fill="url(#skinGrad)" stroke="#d49f75" strokeWidth="1.5" />

                {/* Face Oval */}
                <path
                  d="M 75,100 C 75,55 165,55 165,100 C 165,150 145,185 120,185 C 95,185 75,150 75,100 Z"
                  fill="url(#skinGrad)"
                  stroke="#cf996e"
                  strokeWidth="2"
                />

                {/* Hair (Styled Educator/Academic Hair) */}
                <path
                  d="M 66,95 C 66,45 85,25 120,25 C 155,25 174,45 174,95 C 168,78 152,65 120,68 C 92,65 72,78 66,95 Z"
                  fill="url(#hairGrad)"
                />
                <path
                  d="M 80,45 Q 120,30 160,45 Q 120,40 80,45"
                  fill="#4a2e20"
                />

                {/* Eyebrows */}
                <path
                  d={`M 88,${tutorState.eyebrowsRaised ? 88 : 92} Q 102,${tutorState.eyebrowsRaised ? 84 : 88} 112,${tutorState.eyebrowsRaised ? 88 : 92}`}
                  stroke="#382114"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                />
                <path
                  d={`M 128,${tutorState.eyebrowsRaised ? 88 : 92} Q 138,${tutorState.eyebrowsRaised ? 84 : 88} 152,${tutorState.eyebrowsRaised ? 88 : 92}`}
                  stroke="#382114"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  fill="none"
                />

                {/* Eyes & Blinking Mechanism */}
                {isBlinking ? (
                  // Closed eyelids when blinking
                  <g id="closed-eyes">
                    <path d="M 88,106 Q 101,112 112,106" stroke="#5a3825" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <path d="M 128,106 Q 139,112 152,106" stroke="#5a3825" strokeWidth="3" fill="none" strokeLinecap="round" />
                  </g>
                ) : (
                  // Open expressive eyes with pupil movement
                  <g id="open-eyes">
                    {/* Left Eye Whites */}
                    <ellipse cx="100" cy="106" rx="12" ry="8" fill="#ffffff" stroke="#c7a489" strokeWidth="1" />
                    {/* Left Iris & Pupil */}
                    <circle cx={100 + eyeLook.x} cy={106 + eyeLook.y} r="5.5" fill="#2d553b" />
                    <circle cx={100 + eyeLook.x} cy={106 + eyeLook.y} r="3" fill="#0f1d14" />
                    <circle cx={98 + eyeLook.x} cy={104 + eyeLook.y} r="1.5" fill="#ffffff" />

                    {/* Right Eye Whites */}
                    <ellipse cx="140" cy="106" rx="12" ry="8" fill="#ffffff" stroke="#c7a489" strokeWidth="1" />
                    {/* Right Iris & Pupil */}
                    <circle cx={140 + eyeLook.x} cy={106 + eyeLook.y} r="5.5" fill="#2d553b" />
                    <circle cx={140 + eyeLook.x} cy={106 + eyeLook.y} r="3" fill="#0f1d14" />
                    <circle cx={138 + eyeLook.x} cy={104 + eyeLook.y} r="1.5" fill="#ffffff" />
                  </g>
                )}

                {/* Glasses (Scholar Frames) */}
                <g id="glasses" stroke="#d97706" strokeWidth="2.5" fill="none">
                  {/* Left lens frame */}
                  <rect x="84" y="94" width="31" height="24" rx="7" fill="rgba(255,255,255,0.08)" stroke="#f59e0b" />
                  {/* Right lens frame */}
                  <rect x="125" y="94" width="31" height="24" rx="7" fill="rgba(255,255,255,0.08)" stroke="#f59e0b" />
                  {/* Bridge */}
                  <path d="M 115,102 Q 120,99 125,102" />
                  {/* Left temple piece */}
                  <line x1="84" y1="102" x2="68" y2="100" />
                  {/* Right temple piece */}
                  <line x1="156" y1="102" x2="172" y2="100" />
                </g>

                {/* Nose */}
                <path d="M 120,108 Q 123,124 121,130 Q 116,134 119,136 Q 124,136 126,134" stroke="#c48a60" strokeWidth="2" fill="none" strokeLinecap="round" />

                {/* Cheeks subtle warmth */}
                <ellipse cx="88" cy="128" rx="8" ry="4" fill="#f43f5e" opacity="0.18" />
                <ellipse cx="152" cy="128" rx="8" ry="4" fill="#f43f5e" opacity="0.18" />

                {/* DYNAMIC ANIMATED MOUTH (Mouth Openness & Lip Sync) */}
                <g id="dynamic-mouth">
                  {openness <= 0.05 ? (
                    // Resting friendly smile
                    <path
                      d="M 104,152 Q 120,163 136,152"
                      stroke="#8f3a3a"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      fill="none"
                    />
                  ) : (
                    // Open reactive talking mouth cavity
                    <>
                      {/* Inner oral cavity */}
                      <ellipse
                        cx="120"
                        cy={152 + mouthHeight * 0.2}
                        rx={mouthWidth * 0.45}
                        ry={mouthHeight * 0.55}
                        fill="#2c0c0d"
                        stroke="#6e2323"
                        strokeWidth="1.5"
                      />
                      {/* Upper teeth row */}
                      {openness > 0.12 && (
                        <path
                          d={`M ${120 - mouthWidth * 0.3},${152} Q 120,${154} ${120 + mouthWidth * 0.3},${152} Q 120,${156} ${120 - mouthWidth * 0.3},${152}`}
                          fill="#f8fafc"
                          opacity="0.9"
                        />
                      )}
                      {/* Tongue */}
                      {openness > 0.25 && (
                        <ellipse
                          cx="120"
                          cy={154 + mouthHeight * 0.4}
                          rx={mouthWidth * 0.25}
                          ry={mouthHeight * 0.25}
                          fill="#d9534f"
                          opacity="0.8"
                        />
                      )}
                      {/* Upper Lip contour */}
                      <path
                        d={`M ${120 - mouthWidth * 0.45},151 Q 120,${150} ${120 + mouthWidth * 0.45},151`}
                        stroke="#8f3a3a"
                        strokeWidth="3"
                        fill="none"
                        strokeLinecap="round"
                      />
                      {/* Lower Lip contour */}
                      <path
                        d={`M ${120 - mouthWidth * 0.45},152 Q 120,${153 + mouthHeight * 0.9} ${120 + mouthWidth * 0.45},152`}
                        stroke="#8f3a3a"
                        strokeWidth="3"
                        fill="none"
                        strokeLinecap="round"
                      />
                    </>
                  )}
                </g>
              </g>
            </svg>
          </div>

          {/* Live Audio Visualizer Banner Over Character Base */}
          {isSpeaking && (
            <div className="absolute bottom-2 inset-x-2 px-2.5 py-1 rounded-md bg-black/80 backdrop-blur-sm border border-amber-400/40 flex items-center justify-between text-[11px] text-amber-300 font-mono">
              <span className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>Dr. Marcus Talking</span>
              </span>
              <div className="flex items-center gap-0.5 h-3">
                <span
                  className="w-1 bg-amber-400 rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(4, openness * 16)}px` }}
                />
                <span
                  className="w-1 bg-amber-300 rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(6, openness * 20)}px` }}
                />
                <span
                  className="w-1 bg-amber-400 rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(4, openness * 14)}px` }}
                />
                <span
                  className="w-1 bg-amber-300 rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(5, openness * 18)}px` }}
                />
              </div>
            </div>
          )}

          {/* Teacher Badge */}
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] text-emerald-300 border border-emerald-500/30 font-mono flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            LIVE CHARACTER
          </div>
        </div>

        {/* Live Status Description */}
        <div className="mt-2.5 flex items-center gap-2 text-xs text-[#9ec4af]">
          {isSpeaking ? (
            <span className="flex items-center gap-1.5 text-amber-300 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              Explaining {currentTopic}...
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-400/90 font-medium">
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              Listening &bull; Speak or interrupt anytime
            </span>
          )}
        </div>
      </div>

      {/* Real-time Transcripts Area (Student Voice & Tutor Voice) */}
      <div
        id="tutor-transcripts-area"
        className="w-full flex flex-col gap-2 z-10 min-h-[140px] max-h-[220px] overflow-y-auto px-1"
      >
        {/* Student Voice Bubble */}
        {showInput && inputTranscript?.text && (
          <div className="w-full p-2.5 rounded-xl bg-[#14281f] border border-[#23583a] text-xs shadow-md animate-fadeIn">
            <div className="flex items-center gap-1.5 text-[#97e2b3] font-bold mb-1">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span>You ({currentGrade}):</span>
            </div>
            <p className="text-[#f1f7f3] italic font-sans leading-relaxed">
              &ldquo;{inputTranscript.text}&rdquo;
            </p>
          </div>
        )}

        {/* Tutor Voice Bubble */}
        {showOutput && outputTranscript?.text && (
          <div className="w-full p-2.5 rounded-xl bg-[#1a3827] border border-[#3b7e56] text-xs shadow-lg animate-fadeIn">
            <div className="flex items-center justify-between text-amber-300 font-bold mb-1">
              <span className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Dr. Marcus:</span>
              </span>
              <span className="text-[10px] text-[#86b59b] font-normal">Real-time</span>
            </div>
            <p className="text-[#ffffff] font-sans leading-relaxed">
              {outputTranscript.text}
            </p>
          </div>
        )}

        {!showInput && !showOutput && (
          <div className="w-full p-3 rounded-xl bg-[#102419]/70 border border-[#1b432a] text-center text-xs text-[#7aa58d]">
            <p>
              Click <strong className="text-emerald-300">Start Lesson</strong> below to start a live voice session on <strong className="text-amber-300">{currentTopic}</strong>. Dr. Marcus will speak, listen, and dynamically illustrate the concepts!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
